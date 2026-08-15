import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  USDA_CANONICAL_NUTRIENTS,
} from './usda-import/config.mjs';
import {
  createDbPool,
  createDryRunReferenceData,
  loadReferenceData,
  writeImportBatch,
} from './usda-import/db.mjs';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_PROGRESS_EVERY = 250;
const DEFAULT_IMPORT_PROFILE = 'philfct_authorized_v1';
const SUPPORTED_FORMATS = new Set(['json', 'jsonl', 'ndjson', 'csv']);
const FOOD_TYPE_VALUES = new Set(['common', 'ingredient', 'restaurant', 'branded']);
const VERIFICATION_LEVEL_VALUES = new Set([
  'research',
  'verified',
  'manufacturer',
  'community',
  'unknown',
]);

function assertEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseIntegerFlag(name, value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected ${name} to be a positive integer, received "${value}".`);
  }

  return parsed;
}

function printHelp() {
  console.log(
    [
      'PhilFCT importer options:',
      '  --input=/absolute/or/relative/path/to/authorized-export.json',
      '  --format=json|jsonl|ndjson|csv',
      '  --batch-size=<number>',
      '  --progress-every=<number>',
      '  --dry-run',
      '',
      'Accepted normalized food shape:',
      '  source_food_id, name, description?, food_type?, verification_level?, country_code?,',
      '  base_amount?, base_unit?, metadata?, nutrients, servings?, aliases?',
      '',
      'Important:',
      '  This importer is only for an authorized PhilFCT/FNRI export file.',
      '  It will not scrape the public website or bulk-copy unlicensed online data.',
    ].join('\n'),
  );
}

function parseOptions(argv) {
  const options = {
    inputPath: null,
    format: null,
    batchSize: DEFAULT_BATCH_SIZE,
    progressEvery: DEFAULT_PROGRESS_EVERY,
    dryRun: false,
  };

  for (const argument of argv) {
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (argument === '--help') {
      printHelp();
      process.exit(0);
    }

    const [flag, rawValue] = argument.split('=');

    if (!rawValue) {
      throw new Error(`Expected ${argument} to use the format --flag=value.`);
    }

    if (flag === '--input') {
      options.inputPath = path.resolve(process.cwd(), rawValue);
      continue;
    }

    if (flag === '--format') {
      const format = rawValue.trim().toLowerCase();

      if (!SUPPORTED_FORMATS.has(format)) {
        throw new Error(`Unsupported format "${rawValue}".`);
      }

      options.format = format;
      continue;
    }

    if (flag === '--batch-size') {
      options.batchSize = parseIntegerFlag('--batch-size', rawValue);
      continue;
    }

    if (flag === '--progress-every') {
      options.progressEvery = parseIntegerFlag('--progress-every', rawValue);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.inputPath) {
    throw new Error(
      'No authorized PhilFCT export file was provided. Use --input=/path/to/file. The importer scaffold is ready, but it will not scrape the public website.',
    );
  }

  if (!options.format) {
    const extension = path.extname(options.inputPath).replace(/^\./, '').toLowerCase();
    const inferredFormat = extension === 'ndjson' ? 'ndjson' : extension;

    if (!SUPPORTED_FORMATS.has(inferredFormat)) {
      throw new Error(
        `Unable to infer format for ${options.inputPath}. Provide --format=json|jsonl|ndjson|csv.`,
      );
    }

    options.format = inferredFormat;
  }

  return options;
}

function normalizeNullableText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundCompleteness(value) {
  return Number(value.toFixed(4));
}

function normalizeCountryCode(value) {
  const trimmed = normalizeNullableText(value);

  if (!trimmed) {
    return 'PH';
  }

  if (!/^[A-Za-z]{2,3}$/.test(trimmed)) {
    throw new Error(`Invalid country code "${trimmed}".`);
  }

  return trimmed.toUpperCase();
}

function normalizeFoodType(value) {
  const normalized = normalizeNullableText(value)?.toLowerCase() ?? 'common';

  if (!FOOD_TYPE_VALUES.has(normalized)) {
    throw new Error(`Unsupported food_type "${value}".`);
  }

  return normalized;
}

function normalizeVerificationLevel(value) {
  const normalized = normalizeNullableText(value)?.toLowerCase() ?? 'research';

  if (!VERIFICATION_LEVEL_VALUES.has(normalized)) {
    throw new Error(`Unsupported verification_level "${value}".`);
  }

  return normalized;
}

function normalizeBaseUnit(value) {
  const normalized = normalizeNullableText(value)?.toLowerCase() ?? 'g';

  if (!['g', 'ml'].includes(normalized)) {
    throw new Error(`Unsupported base_unit "${value}". Expected "g" or "ml".`);
  }

  return normalized;
}

function normalizeCanonicalNutrientMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected nutrients to be an object keyed by canonical nutrient code.');
  }

  return value;
}

function parseJsonLikeField(value) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  return JSON.parse(value);
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let index = 0;
  let insideQuotes = false;

  while (index < line.length) {
    const character = line[index];

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 2;
        continue;
      }

      insideQuotes = !insideQuotes;
      index += 1;
      continue;
    }

    if (character === ',' && !insideQuotes) {
      cells.push(current);
      current = '';
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);

    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? '']),
    );
  });
}

async function loadAuthorizedFoods(options) {
  let rawContent;

  try {
    rawContent = await fs.readFile(options.inputPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read authorized PhilFCT export at ${options.inputPath}: ${error.message}`,
    );
  }

  if (options.format === 'json') {
    const parsed = JSON.parse(rawContent);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed?.foods)) {
      return parsed.foods;
    }

    throw new Error(
      'PhilFCT JSON input must be an array or an object with a top-level "foods" array.',
    );
  }

  if (options.format === 'jsonl' || options.format === 'ndjson') {
    return rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  if (options.format === 'csv') {
    return parseCsv(rawContent).map((row) => ({
      ...row,
      metadata: parseJsonLikeField(row.metadata),
      nutrients: parseJsonLikeField(row.nutrients ?? row.nutrients_json),
      servings: parseJsonLikeField(row.servings ?? row.servings_json),
      aliases: parseJsonLikeField(row.aliases ?? row.aliases_json),
    }));
  }

  throw new Error(`Unsupported format "${options.format}".`);
}

function buildBaseServing(baseAmount, baseUnit) {
  return {
    sourceServingId: null,
    servingName: `${baseAmount} ${baseUnit}`,
    quantity: baseAmount,
    gramWeight: baseUnit === 'g' ? baseAmount : null,
    milliliterVolume: baseUnit === 'ml' ? baseAmount : null,
    householdUnit: baseUnit,
    isDefault: true,
    nutrientValues: null,
  };
}

function normalizeAliasRows(inputAliases) {
  const aliases = Array.isArray(inputAliases) ? inputAliases : [];
  const seen = new Set();
  const rows = [];

  for (const alias of aliases) {
    const aliasText =
      typeof alias === 'string'
        ? normalizeNullableText(alias)
        : normalizeNullableText(alias?.alias);

    if (!aliasText) {
      continue;
    }

    const languageCode =
      typeof alias === 'string'
        ? 'fil'
        : normalizeNullableText(alias?.language_code ?? alias?.languageCode);
    const aliasType =
      typeof alias === 'string'
        ? 'local_name'
        : normalizeNullableText(alias?.alias_type ?? alias?.aliasType) ?? 'local_name';
    const dedupeKey = `${aliasText.toLowerCase()}|${languageCode ?? ''}|${aliasType}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    rows.push({
      alias: aliasText,
      languageCode,
      aliasType,
    });
  }

  return rows;
}

function normalizeServingRows(inputServings, baseAmount, baseUnit) {
  const servings = Array.isArray(inputServings) ? inputServings : [];
  const rows = [];
  const seen = new Set();
  const baseServing = buildBaseServing(baseAmount, baseUnit);

  rows.push(baseServing);
  seen.add(`default:${baseServing.servingName.toLowerCase()}`);

  for (const serving of servings) {
    const servingName = normalizeNullableText(serving?.serving_name ?? serving?.servingName);
    const quantity = toFiniteNumber(serving?.quantity);
    const gramWeight = toFiniteNumber(serving?.gram_weight ?? serving?.gramWeight);
    const milliliterVolume = toFiniteNumber(
      serving?.milliliter_volume ?? serving?.milliliterVolume,
    );
    const householdUnit = normalizeNullableText(
      serving?.household_unit ?? serving?.householdUnit,
    );
    const isDefault = Boolean(serving?.is_default ?? serving?.isDefault);
    const sourceServingId = normalizeNullableText(
      serving?.source_serving_id ?? serving?.sourceServingId,
    );
    const nutrientValues = parseJsonLikeField(
      serving?.nutrient_values ?? serving?.nutrientValues,
    );

    if (!servingName || quantity == null || quantity <= 0) {
      continue;
    }

    if (gramWeight == null && milliliterVolume == null && householdUnit == null) {
      continue;
    }

    const dedupeKey = sourceServingId ?? `${servingName.toLowerCase()}|${quantity}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    rows.push({
      sourceServingId,
      servingName,
      quantity,
      gramWeight,
      milliliterVolume,
      householdUnit,
      isDefault,
      nutrientValues:
        nutrientValues && typeof nutrientValues === 'object' && !Array.isArray(nutrientValues)
          ? nutrientValues
          : null,
    });
  }

  const defaultRows = rows.filter((row) => row.isDefault);

  if (defaultRows.length > 1) {
    return rows.map((row, index) => ({
      ...row,
      isDefault: index === 0,
    }));
  }

  return rows;
}

function normalizeNutrientRows(inputNutrients, nutrientIdByCode) {
  const nutrients = normalizeCanonicalNutrientMap(inputNutrients);
  const nutrientRows = [];

  for (const nutrient of USDA_CANONICAL_NUTRIENTS) {
    const rawValue = nutrients[nutrient.code];
    const amount = toFiniteNumber(rawValue);

    if (amount == null || amount < 0) {
      continue;
    }

    nutrientRows.push({
      nutrientId: nutrientIdByCode.get(nutrient.code),
      amount,
      dataOrigin: 'Authorized PhilFCT export',
    });
  }

  return nutrientRows;
}

function normalizeAuthorizedFood(inputFood, referenceData, options) {
  const sourceFoodId = normalizeNullableText(
    inputFood?.source_food_id ?? inputFood?.sourceFoodId ?? inputFood?.food_code,
  );
  const name = normalizeNullableText(inputFood?.name ?? inputFood?.food_name);

  if (!sourceFoodId) {
    throw new Error('Authorized PhilFCT row is missing source_food_id.');
  }

  if (!name) {
    throw new Error(`Authorized PhilFCT row ${sourceFoodId} is missing name.`);
  }

  const sourceId = referenceData.sourceIdByCode.get('PHILFCT');

  if (!sourceId) {
    throw new Error('Missing PHILFCT source row in food_sources.');
  }

  const baseAmount = toFiniteNumber(inputFood?.base_amount ?? inputFood?.baseAmount) ?? 100;
  const baseUnit = normalizeBaseUnit(inputFood?.base_unit ?? inputFood?.baseUnit);
  const nutrientRows = normalizeNutrientRows(inputFood?.nutrients, referenceData.nutrientIdByCode);
  const aliasRows = normalizeAliasRows(inputFood?.aliases);
  const servingRows = normalizeServingRows(inputFood?.servings, baseAmount, baseUnit);
  const metadata = parseJsonLikeField(inputFood?.metadata) ?? {};
  const countryCode = normalizeCountryCode(inputFood?.country_code ?? inputFood?.countryCode);

  return {
    datasetKey: 'philfct',
    catalogFood: {
      source_id: sourceId,
      source_food_id: sourceFoodId,
      food_type: normalizeFoodType(inputFood?.food_type ?? inputFood?.foodType),
      name,
      description: normalizeNullableText(inputFood?.description),
      brand_name: null,
      country_code: countryCode,
      verification_level: normalizeVerificationLevel(
        inputFood?.verification_level ?? inputFood?.verificationLevel,
      ),
      data_completeness: roundCompleteness(
        nutrientRows.length / USDA_CANONICAL_NUTRIENTS.length,
      ),
      base_amount: baseAmount,
      base_unit: baseUnit,
      is_active: true,
      metadata: {
        importProfile: DEFAULT_IMPORT_PROFILE,
        importProfiles: [DEFAULT_IMPORT_PROFILE],
        lastImportProfile: DEFAULT_IMPORT_PROFILE,
        philfct: {
          importSource: 'authorized_export',
          inputFormat: options.format,
          inputFileName: path.basename(options.inputPath),
          sourceFoodId,
          aliasCount: aliasRows.length,
          servingCount: servingRows.length,
        },
        ...metadata,
      },
    },
    nutrientRows,
    servingRows,
    barcodeRows: [],
    aliasRows,
  };
}

function createSummary(options) {
  return {
    inputPath: options.inputPath,
    inputFormat: options.format,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    progressEvery: options.progressEvery,
    startedAt: Date.now(),
    parsedFoods: 0,
    acceptedFoods: 0,
    writtenFoods: 0,
    writtenNutrients: 0,
    writtenServings: 0,
    writtenAliases: 0,
    errors: [],
  };
}

function maybeLogProgress(summary, { force = false } = {}) {
  if (!force && summary.parsedFoods % summary.progressEvery !== 0) {
    return;
  }

  const elapsedSeconds = Number(((Date.now() - summary.startedAt) / 1000).toFixed(1));

  console.log(
    `[philfct] parsed=${summary.parsedFoods} accepted=${summary.acceptedFoods} written=${summary.writtenFoods} nutrients=${summary.writtenNutrients} servings=${summary.writtenServings} aliases=${summary.writtenAliases} elapsed_s=${elapsedSeconds}`,
  );
}

async function flushBatch(client, batch, summary, options) {
  if (!batch.length) {
    return;
  }

  const foods = batch.splice(0, batch.length);

  if (options.dryRun) {
    summary.writtenFoods += foods.length;
    summary.writtenNutrients += foods.reduce(
      (sum, food) => sum + food.nutrientRows.length,
      0,
    );
    summary.writtenServings += foods.reduce(
      (sum, food) => sum + food.servingRows.length,
      0,
    );
    summary.writtenAliases += foods.reduce(
      (sum, food) => sum + (food.aliasRows?.length ?? 0),
      0,
    );
    return;
  }

  const result = await writeImportBatch(client, foods, { replaceAliases: true });
  summary.writtenFoods += result.writtenFoods;
  summary.writtenNutrients += result.writtenNutrients;
  summary.writtenServings += result.writtenServings;
  summary.writtenAliases += result.writtenAliases ?? 0;
}

async function run() {
  const options = parseOptions(process.argv.slice(2));
  const authorizedFoods = await loadAuthorizedFoods(options);
  const summary = createSummary(options);
  const datasetLike = [{ sourceCode: 'PHILFCT' }];
  let pool = null;
  let client = null;
  let referenceData = createDryRunReferenceData(datasetLike);
  const batch = [];

  if (!options.dryRun) {
    pool = createDbPool(assertEnv('SUPABASE_DB_URL'));
    client = await pool.connect();
    referenceData = await loadReferenceData(client, datasetLike);
  }

  try {
    for (const inputFood of authorizedFoods) {
      summary.parsedFoods += 1;

      try {
        const normalizedFood = normalizeAuthorizedFood(
          inputFood,
          referenceData,
          options,
        );
        summary.acceptedFoods += 1;
        batch.push(normalizedFood);

        if (batch.length >= options.batchSize) {
          await flushBatch(client, batch, summary, options);
        }
      } catch (error) {
        if (summary.errors.length < 20) {
          summary.errors.push({
            sourceFoodId:
              inputFood?.source_food_id ??
              inputFood?.sourceFoodId ??
              inputFood?.food_code ??
              null,
            message: error.message,
          });
        }
      }

      maybeLogProgress(summary);
    }

    await flushBatch(client, batch, summary, options);
    maybeLogProgress(summary, { force: true });

    console.log(
      JSON.stringify(
        {
          ...summary,
          elapsedSeconds: Number(((Date.now() - summary.startedAt) / 1000).toFixed(2)),
        },
        null,
        2,
      ),
    );
  } finally {
    client?.release?.();
    await pool?.end?.();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
