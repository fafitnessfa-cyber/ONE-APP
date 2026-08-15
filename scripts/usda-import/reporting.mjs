function bytesToMegabytes(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(1));
}

function createDatasetStats(dataset) {
  return {
    key: dataset.key,
    name: dataset.displayName,
    releaseId: dataset.releaseId,
    parsedFoods: 0,
    acceptedFoods: 0,
    skippedFoods: 0,
    writtenFoods: 0,
    nutrientRows: 0,
    servingRows: 0,
    barcodeRows: 0,
    skippedInvalidNutrients: 0,
    skippedInvalidServings: 0,
    foodsWithNoCanonicalNutrients: 0,
    foodsWithOnlyBaseServing: 0,
    foodsWithHouseholdServing: 0,
    foodsWithBarcode: 0,
    status: 'pending',
  };
}

export function createImportStats(options, datasets) {
  return {
    options,
    startedAt: Date.now(),
    peakRssBytes: process.memoryUsage().rss,
    overall: {
      parsedFoods: 0,
      acceptedFoods: 0,
      skippedFoods: 0,
      writtenFoods: 0,
      nutrientRows: 0,
      servingRows: 0,
      barcodeRows: 0,
      skippedInvalidNutrients: 0,
      skippedInvalidServings: 0,
      foodsWithNoCanonicalNutrients: 0,
      foodsWithOnlyBaseServing: 0,
      foodsWithBarcode: 0,
      foodErrors: 0,
      databaseBatches: 0,
    },
    mode: {
      test: {
        matchedKeys: new Set(),
      },
    },
    datasets: Object.fromEntries(datasets.map((dataset) => [dataset.key, createDatasetStats(dataset)])),
    errorSamples: [],
    nextProgressAt: options.progressEvery,
  };
}

export function updatePeakMemory(stats) {
  stats.peakRssBytes = Math.max(stats.peakRssBytes, process.memoryUsage().rss);
}

export function logDatasetStart(stats, dataset) {
  stats.datasets[dataset.key].status = 'in_progress';
  console.log(`[dataset] ${dataset.displayName} ${dataset.releaseId} started`);
}

export function markDatasetComplete(stats, datasetKey) {
  stats.datasets[datasetKey].status = 'completed';
}

export function recordFoodParsed(stats, datasetKey) {
  stats.overall.parsedFoods += 1;
  stats.datasets[datasetKey].parsedFoods += 1;
}

export function recordFoodAccepted(stats, datasetKey, food) {
  stats.overall.acceptedFoods += 1;
  stats.overall.nutrientRows += food.nutrientRows.length;
  stats.overall.servingRows += food.servingRows.length;
  stats.overall.barcodeRows += food.barcodeRows.length;
  stats.overall.skippedInvalidNutrients += food.stats.skippedInvalidNutrients;
  stats.overall.skippedInvalidServings += food.stats.skippedInvalidServings;
  stats.overall.foodsWithNoCanonicalNutrients += food.stats.hasNoCanonicalNutrients ? 1 : 0;
  stats.overall.foodsWithOnlyBaseServing += food.stats.onlyBaseServing ? 1 : 0;
  stats.overall.foodsWithBarcode += food.stats.hasBarcode ? 1 : 0;

  const datasetStats = stats.datasets[datasetKey];
  datasetStats.acceptedFoods += 1;
  datasetStats.nutrientRows += food.nutrientRows.length;
  datasetStats.servingRows += food.servingRows.length;
  datasetStats.barcodeRows += food.barcodeRows.length;
  datasetStats.skippedInvalidNutrients += food.stats.skippedInvalidNutrients;
  datasetStats.skippedInvalidServings += food.stats.skippedInvalidServings;
  datasetStats.foodsWithNoCanonicalNutrients += food.stats.hasNoCanonicalNutrients ? 1 : 0;
  datasetStats.foodsWithOnlyBaseServing += food.stats.onlyBaseServing ? 1 : 0;
  datasetStats.foodsWithHouseholdServing += food.stats.hasHouseholdServing ? 1 : 0;
  datasetStats.foodsWithBarcode += food.stats.hasBarcode ? 1 : 0;
}

export function recordFoodSkipped(stats, datasetKey) {
  stats.overall.skippedFoods += 1;
  stats.datasets[datasetKey].skippedFoods += 1;
}

export function recordFoodError(
  stats,
  datasetKey,
  fdcId,
  error,
  options = {},
) {
  if (options.countAsError !== false) {
    stats.overall.foodErrors += 1;
  }

  if (stats.errorSamples.length < 20) {
    stats.errorSamples.push({
      datasetKey,
      fdcId: fdcId ?? null,
      code: error.code ?? 'error',
      message: error.message,
    });
  }

  console.warn(
    `[skip] dataset=${datasetKey} fdcId=${fdcId ?? 'unknown'} reason=${error.code ?? 'error'} message=${error.message}`,
  );
}

export function recordBatchWrite(stats, foods, result) {
  stats.overall.databaseBatches += 1;
  stats.overall.writtenFoods += result.writtenFoods;

  for (const food of foods) {
    stats.datasets[food.datasetKey].writtenFoods += 1;
  }

  const modeLabel = result.dryRun ? 'dry-run' : 'write';
  console.log(
    `[batch] ${modeLabel} reason=${result.batchReason} foods=${result.writtenFoods} nutrients=${result.writtenNutrients} servings=${result.writtenServings} barcodes=${result.writtenBarcodes ?? 0}`,
  );
}

export function logProgress(stats, dataset, options, { force = false } = {}) {
  if (!force && stats.overall.parsedFoods < stats.nextProgressAt) {
    return;
  }

  const elapsedSeconds = Number(((Date.now() - stats.startedAt) / 1000).toFixed(1));
  const datasetStats = stats.datasets[dataset.key];

  console.log(
    `[progress] dataset=${dataset.key} parsed=${datasetStats.parsedFoods} accepted=${datasetStats.acceptedFoods} skipped=${datasetStats.skippedFoods} written=${datasetStats.writtenFoods} nutrients=${datasetStats.nutrientRows} servings=${datasetStats.servingRows} elapsed_s=${elapsedSeconds} peak_rss_mb=${bytesToMegabytes(stats.peakRssBytes)}`,
  );

  if (!force) {
    stats.nextProgressAt += options.progressEvery;
  }
}

export function buildFinalSummary(stats) {
  const elapsedSeconds = Number(((Date.now() - stats.startedAt) / 1000).toFixed(2));
  const datasetBreakdown = Object.values(stats.datasets).map((dataset) => ({
    key: dataset.key,
    releaseId: dataset.releaseId,
    parsedFoods: dataset.parsedFoods,
    acceptedFoods: dataset.acceptedFoods,
    skippedFoods: dataset.skippedFoods,
    writtenFoods: dataset.writtenFoods,
    nutrientRows: dataset.nutrientRows,
    servingRows: dataset.servingRows,
    barcodeRows: dataset.barcodeRows,
    foodsWithNoCanonicalNutrients: dataset.foodsWithNoCanonicalNutrients,
    foodsWithOnlyBaseServing: dataset.foodsWithOnlyBaseServing,
    foodsWithHouseholdServing: dataset.foodsWithHouseholdServing,
    foodsWithBarcode: dataset.foodsWithBarcode,
    skippedInvalidNutrients: dataset.skippedInvalidNutrients,
    skippedInvalidServings: dataset.skippedInvalidServings,
    status: dataset.status,
  }));

  return {
    mode: stats.options.mode,
    importProfile: stats.options.importProfile,
    dryRun: stats.options.dryRun,
    selectedDatasets: stats.options.datasets,
    requestedLimit: stats.options.limit,
    batchSize: stats.options.batchSize,
    overall: {
      parsedFoods: stats.overall.parsedFoods,
      acceptedFoods: stats.overall.acceptedFoods,
      skippedFoods: stats.overall.skippedFoods,
      writtenFoods: stats.overall.writtenFoods,
      nutrientRows: stats.overall.nutrientRows,
      servingRows: stats.overall.servingRows,
      barcodeRows: stats.overall.barcodeRows,
      skippedInvalidNutrients: stats.overall.skippedInvalidNutrients,
      skippedInvalidServings: stats.overall.skippedInvalidServings,
      foodsWithNoCanonicalNutrients: stats.overall.foodsWithNoCanonicalNutrients,
      foodsWithOnlyBaseServing: stats.overall.foodsWithOnlyBaseServing,
      foodsWithBarcode: stats.overall.foodsWithBarcode,
      foodErrors: stats.overall.foodErrors,
      databaseBatches: stats.overall.databaseBatches,
      elapsedSeconds,
      peakRssMb: bytesToMegabytes(stats.peakRssBytes),
    },
    datasetBreakdown,
    errorSamples: stats.errorSamples,
  };
}

export function logFinalSummary(summary) {
  console.log(JSON.stringify(summary, null, 2));
}
