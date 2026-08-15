import {
  USDA_DEFAULT_DATASET_ORDER,
  USDA_SUPPORTED_DATASET_ORDER,
} from './config.mjs';

const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_PROGRESS_EVERY = 500;

function parseIntegerFlag(name, value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected ${name} to be a positive integer, received "${value}".`);
  }

  return parsed;
}

function normalizeDatasetList(value) {
  return [...new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function printHelp(importModes) {
  const modeLines = Object.values(importModes).map(
    (mode) => `  - ${mode.key}: ${mode.description}`,
  );
  const modeOptions = Object.keys(importModes).join('|');

  console.log(
    [
      'USDA importer options:',
      ...modeLines,
      '',
      'Flags:',
      `  --mode=${modeOptions}`,
      `  --datasets=${USDA_SUPPORTED_DATASET_ORDER.join(',')}`,
      '  --limit=<number>',
      '  --batch-size=<number>',
      '  --progress-every=<number>',
      '  --dry-run',
      '  --help',
    ].join('\n'),
  );
}

export function parseCliOptions(argv, importModes) {
  const options = {
    mode: 'test',
    datasets: null,
    limit: null,
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
      printHelp(importModes);
      process.exit(0);
    }

    const [flag, rawValue] = argument.split('=');

    if (!rawValue) {
      throw new Error(`Expected ${argument} to use the format --flag=value.`);
    }

    if (flag === '--mode') {
      if (!importModes[rawValue]) {
        throw new Error(`Unsupported import mode "${rawValue}".`);
      }

      options.mode = rawValue;
      continue;
    }

    if (flag === '--datasets') {
      options.datasets = normalizeDatasetList(rawValue);
      continue;
    }

    if (flag === '--limit') {
      options.limit = parseIntegerFlag('--limit', rawValue);
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

  const modeConfig = importModes[options.mode];
  const datasets =
    options.datasets ??
    modeConfig.defaultDatasets ??
    USDA_DEFAULT_DATASET_ORDER;
  const limit = options.limit ?? modeConfig.defaultLimit;

  return {
    ...options,
    datasets,
    limit,
    importProfile: modeConfig.importProfile,
  };
}
