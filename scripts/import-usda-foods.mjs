import process from 'node:process';
import {
  USDA_IMPORT_MODES,
  USDA_TEST_SAMPLE,
  buildDatasetConfigs,
} from './usda-import/config.mjs';
import { parseCliOptions } from './usda-import/cli.mjs';
import {
  createDbPool,
  createDryRunReferenceData,
  deactivateMissingSourceFoods,
  loadReferenceData,
  writeImportBatch,
} from './usda-import/db.mjs';
import { ensureDatasetFiles, iterateDatasetFoods } from './usda-import/datasets.mjs';
import { FoodValidationError, normalizeUsdaFood } from './usda-import/normalize.mjs';
import { buildExpandedBrandedSelection } from './usda-import/selection.mjs';
import {
  buildFinalSummary,
  createImportStats,
  logDatasetStart,
  logFinalSummary,
  logProgress,
  markDatasetComplete,
  recordBatchWrite,
  recordFoodAccepted,
  recordFoodError,
  recordFoodParsed,
  recordFoodSkipped,
  updatePeakMemory,
} from './usda-import/reporting.mjs';

const SAFE_FOOD_ERROR_LIMIT = 25;
const NON_FATAL_VALIDATION_CODES = new Set([
  'missing_core_macros',
  'unsupported_base_unit',
]);

function hasReachedLimit(options, acceptedFoods) {
  return options.limit != null && acceptedFoods >= options.limit;
}

function assertEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildTestSelection(options) {
  const datasetKeys = new Set(options.datasets);
  const selectedSampleFoods = USDA_TEST_SAMPLE.filter((item) =>
    datasetKeys.has(item.datasetKey),
  ).slice(0, options.limit);
  const sampleByDataset = new Map();

  for (const item of selectedSampleFoods) {
    const foodsForDataset = sampleByDataset.get(item.datasetKey) ?? new Map();
    foodsForDataset.set(item.fdcId, item);
    sampleByDataset.set(item.datasetKey, foodsForDataset);
  }

  return {
    expectedCount: selectedSampleFoods.length,
    expectedKeys: new Set(
      selectedSampleFoods.map((item) => `${item.datasetKey}:${item.fdcId}`),
    ),
    getSelection(datasetKey, fdcId) {
      return sampleByDataset.get(datasetKey)?.get(fdcId) ?? null;
    },
  };
}

function buildSampleMembershipSet() {
  return new Set(USDA_TEST_SAMPLE.map((item) => `${item.datasetKey}:${item.fdcId}`));
}

function shouldSelectFood(options, testSelection, acceptedFoods, datasetKey, fdcId) {
  if (options.mode === 'test') {
    return testSelection.getSelection(datasetKey, fdcId);
  }

  if (options.mode === 'branded-expanded') {
    return testSelection.selectedByFdcId?.get(fdcId) ?? null;
  }

  return hasReachedLimit(options, acceptedFoods) ? null : {};
}

async function flushBatch(client, batch, stats, options, reason) {
  if (!batch.length) {
    return;
  }

  const foods = batch.splice(0, batch.length);

  if (options.dryRun) {
    recordBatchWrite(stats, foods, {
      batchReason: reason,
      writtenFoods: foods.length,
      writtenNutrients: foods.reduce(
        (sum, item) => sum + item.nutrientRows.length,
        0,
      ),
      writtenServings: foods.reduce(
        (sum, item) => sum + item.servingRows.length,
        0,
      ),
      writtenBarcodes: foods.reduce(
        (sum, item) => sum + (item.barcodeRows?.length ?? 0),
        0,
      ),
      dryRun: true,
    });
    return;
  }

  const result = await writeImportBatch(client, foods);
  recordBatchWrite(stats, foods, {
    batchReason: reason,
    ...result,
    dryRun: false,
  });
}

async function runImport() {
  const options = parseCliOptions(process.argv.slice(2), USDA_IMPORT_MODES);
  const datasets = buildDatasetConfigs(options.datasets);
  const stats = createImportStats(options, datasets);
  const defaultSelection = buildTestSelection(options);
  const sampleMembership = buildSampleMembershipSet();
  const modeConfig = USDA_IMPORT_MODES[options.mode];
  const batch = [];
  let pool = null;
  let client = null;
  let referenceData = createDryRunReferenceData(datasets);
  let selectionSummary = null;
  let activeSelection = defaultSelection;

  await ensureDatasetFiles(datasets);

  if (options.mode === 'branded-expanded') {
    const brandedDataset = datasets.find((dataset) => dataset.key === 'branded');

    if (!brandedDataset) {
      throw new Error('Branded expansion mode requires the branded USDA dataset.');
    }

    const expandedSelection = await buildExpandedBrandedSelection({
      dataset: brandedDataset,
      limit: options.limit,
      normalizeFood: normalizeUsdaFood,
      referenceData: createDryRunReferenceData([brandedDataset]),
      importProfile: modeConfig.importProfile,
      importMode: options.mode,
      iterateFoods: iterateDatasetFoods,
    });

    activeSelection = expandedSelection;
    selectionSummary = expandedSelection.summary;
  }

  if (!options.dryRun) {
    pool = createDbPool(assertEnv('SUPABASE_DB_URL'));
    client = await pool.connect();
    referenceData = await loadReferenceData(client, datasets);
  }

  try {
    for (const dataset of datasets) {
      logDatasetStart(stats, dataset);

      for await (const food of iterateDatasetFoods(dataset)) {
        updatePeakMemory(stats);
        recordFoodParsed(stats, dataset.key);

        if (
          options.mode !== 'test' &&
          hasReachedLimit(options, stats.overall.acceptedFoods)
        ) {
          break;
        }

        if (!food || typeof food !== 'object') {
          recordFoodSkipped(stats, dataset.key);
          continue;
        }

        const selection = shouldSelectFood(
          options,
          activeSelection,
          stats.overall.acceptedFoods,
          dataset.key,
          food?.fdcId,
        );

        if (!selection) {
          continue;
        }

        const foodKey = Number.isInteger(food?.fdcId)
          ? `${dataset.key}:${food.fdcId}`
          : `${dataset.key}:unknown`;

        try {
          const normalizedFood = normalizeUsdaFood({
            dataset,
            food,
            importProfile: modeConfig.importProfile,
            importProfiles: sampleMembership.has(foodKey)
              ? ['usda_test_sample_v1', modeConfig.importProfile]
              : [modeConfig.importProfile],
            importMode: options.mode,
            importLabel: selection.label ?? null,
            selectionMetadata: selection.selectionMetadata ?? null,
            nutrientIdByCode: referenceData.nutrientIdByCode,
            sourceIdByCode: referenceData.sourceIdByCode,
          });

          if (options.mode === 'test') {
            stats.mode.test.matchedKeys.add(foodKey);
          }

          recordFoodAccepted(stats, dataset.key, normalizedFood);
          batch.push(normalizedFood);

          if (batch.length >= options.batchSize) {
            await flushBatch(client, batch, stats, options, 'batch-size');
            logProgress(stats, dataset, options);
          }
        } catch (error) {
          recordFoodSkipped(stats, dataset.key, error);

          if (options.mode === 'test') {
            stats.mode.test.matchedKeys.add(foodKey);
          }

          if (
            error instanceof FoodValidationError ||
            error instanceof RangeError ||
            error instanceof TypeError
          ) {
            const countAsError = !(
              error instanceof FoodValidationError &&
              NON_FATAL_VALIDATION_CODES.has(error.code ?? '')
            );

            recordFoodError(stats, dataset.key, food?.fdcId, error, {
              countAsError,
            });

            if (countAsError && stats.overall.foodErrors > SAFE_FOOD_ERROR_LIMIT) {
              throw new Error(
                `Aborting import after ${stats.overall.foodErrors} per-food errors. Last error: ${error.message}`,
              );
            }

            continue;
          }

          throw error;
        }

        if (hasReachedLimit(options, stats.overall.acceptedFoods)) {
          break;
        }
      }

      await flushBatch(client, batch, stats, options, `${dataset.key}-complete`);
      markDatasetComplete(stats, dataset.key);
      logProgress(stats, dataset, options, { force: true });

      if (hasReachedLimit(options, stats.overall.acceptedFoods)) {
        break;
      }
    }

    if (!options.dryRun && options.mode === 'branded-expanded') {
      const brandedDataset = datasets.find((dataset) => dataset.key === 'branded');

      await deactivateMissingSourceFoods(client, {
        sourceId: referenceData.sourceIdByCode.get(brandedDataset.sourceCode),
        activeImportProfile: modeConfig.importProfile,
        releaseId: brandedDataset.releaseId,
      });
    }

    if (options.mode === 'test') {
      const missingKeys = [...defaultSelection.expectedKeys].filter(
        (key) => !stats.mode.test.matchedKeys.has(key),
      );

      if (missingKeys.length) {
        throw new Error(
          `Missing requested USDA test sample foods: ${missingKeys.join(', ')}`,
        );
      }
    }

    updatePeakMemory(stats);

    const summary = buildFinalSummary(stats);

    if (selectionSummary) {
      summary.expandedSelection = selectionSummary;
    }

    logFinalSummary(summary);
  } finally {
    client?.release();
    await pool?.end();
  }
}

runImport().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
