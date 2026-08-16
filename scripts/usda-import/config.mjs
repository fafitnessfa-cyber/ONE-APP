import path from 'node:path';
import process from 'node:process';

export const USDA_DOWNLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.USDA_DOWNLOAD_DIR ?? 'tmp/usda',
);

export const USDA_DEFAULT_DATASET_ORDER = ['foundation', 'fndds'];
export const USDA_SUPPORTED_DATASET_ORDER = ['foundation', 'fndds', 'branded'];

const USDA_DATASET_DEFINITIONS = {
  foundation: {
    key: 'foundation',
    displayName: 'USDA Foundation Foods',
    sourceCode: 'USDA_FOUNDATION',
    releaseId: '2026-04-30',
    downloadUrl:
      'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip',
    zipFileName: 'FoodData_Central_foundation_food_json_2026-04-30.zip',
    jsonFileName: 'FoodData_Central_foundation_food_json_2026-04-30.json',
    rootKey: 'FoundationFoods',
    enabled: true,
    foodType: 'ingredient',
    verificationLevel: 'research',
  },
  fndds: {
    key: 'fndds',
    displayName: 'USDA FNDDS',
    sourceCode: 'USDA_FNDDS',
    releaseId: '2024-10-31',
    downloadUrl:
      'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    zipFileName: 'FoodData_Central_survey_food_json_2024-10-31.zip',
    jsonFileName: 'surveyDownload.json',
    rootKey: 'SurveyFoods',
    enabled: true,
    foodType: 'common',
    verificationLevel: 'research',
  },
  branded: {
    key: 'branded',
    displayName: 'USDA Branded Foods',
    sourceCode: 'USDA_BRANDED',
    releaseId: '2026-04-30',
    downloadUrl:
      'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2026-04-30.zip',
    zipFileName: 'FoodData_Central_branded_food_json_2026-04-30.zip',
    jsonFileName: 'FoodData_Central_branded_food_json_2026-04-30.json',
    rootKey: 'BrandedFoods',
    enabled: true,
    foodType: 'branded',
    verificationLevel: 'manufacturer',
  },
};

export const USDA_IMPORT_MODES = {
  test: {
    key: 'test',
    description: 'Curated 32-food regression sample.',
    defaultLimit: 32,
    importProfile: 'usda_test_sample_v1',
    defaultDatasets: USDA_DEFAULT_DATASET_ORDER,
  },
  pilot: {
    key: 'pilot',
    description: 'Deterministic multi-thousand-food USDA pilot.',
    defaultLimit: 5000,
    importProfile: 'usda_pilot_v1',
    defaultDatasets: USDA_DEFAULT_DATASET_ORDER,
  },
  common: {
    key: 'common',
    description: 'Full Foundation + FNDDS USDA common-food import.',
    defaultLimit: null,
    importProfile: 'usda_common_v1',
    defaultDatasets: USDA_DEFAULT_DATASET_ORDER,
  },
  'branded-pilot': {
    key: 'branded-pilot',
    description: 'Deterministic 2,000-food USDA branded pilot.',
    defaultLimit: 2000,
    importProfile: 'usda_branded_pilot_v1',
    defaultDatasets: ['branded'],
  },
  'branded-expanded': {
    key: 'branded-expanded',
    description: 'Deterministic 100,000-food USDA branded expansion.',
    defaultLimit: 100000,
    importProfile: 'usda_branded_expanded_v1',
    defaultDatasets: ['branded'],
  },
};

export const USDA_CANONICAL_NUTRIENTS = [
  { code: 'energy_kcal', usdaIds: [1008, 2048, 2047] },
  { code: 'protein', usdaIds: [1003] },
  { code: 'carbohydrate', usdaIds: [1005] },
  { code: 'fat', usdaIds: [1004] },
  { code: 'fiber', usdaIds: [1079] },
  { code: 'sugars', usdaIds: [2000] },
  { code: 'sodium', usdaIds: [1093] },
  { code: 'potassium', usdaIds: [1092] },
  { code: 'calcium', usdaIds: [1087] },
  { code: 'iron', usdaIds: [1089] },
  { code: 'vitamin_c', usdaIds: [1162] },
  { code: 'vitamin_d', usdaIds: [1114] },
  { code: 'saturated_fat', usdaIds: [1258] },
  { code: 'cholesterol', usdaIds: [1253] },
];

export const USDA_TEST_SAMPLE = [
  { datasetKey: 'foundation', fdcId: 2646170, label: 'chicken breast raw' },
  { datasetKey: 'foundation', fdcId: 2646171, label: 'chicken thigh raw' },
  { datasetKey: 'foundation', fdcId: 2512381, label: 'white rice raw' },
  { datasetKey: 'foundation', fdcId: 2512380, label: 'brown rice raw' },
  { datasetKey: 'foundation', fdcId: 323604, label: 'egg raw' },
  { datasetKey: 'foundation', fdcId: 1105314, label: 'banana raw foundation' },
  { datasetKey: 'foundation', fdcId: 1750340, label: 'apple raw foundation' },
  { datasetKey: 'foundation', fdcId: 2346396, label: 'oats rolled' },
  { datasetKey: 'foundation', fdcId: 746782, label: 'milk whole foundation' },
  {
    datasetKey: 'foundation',
    fdcId: 2259793,
    label: 'yogurt plain whole milk foundation',
  },
  { datasetKey: 'foundation', fdcId: 2346401, label: 'potato russet raw' },
  { datasetKey: 'foundation', fdcId: 747447, label: 'broccoli raw' },
  { datasetKey: 'foundation', fdcId: 2684440, label: 'salmon raw foundation' },
  { datasetKey: 'foundation', fdcId: 334194, label: 'tuna canned foundation' },
  {
    datasetKey: 'foundation',
    fdcId: 2514743,
    label: 'ground beef 90 10 raw',
  },
  {
    datasetKey: 'foundation',
    fdcId: 2262072,
    label: 'peanut butter creamy foundation',
  },
  {
    datasetKey: 'fndds',
    fdcId: 2705956,
    label: 'chicken breast roasted survey',
  },
  {
    datasetKey: 'fndds',
    fdcId: 2706030,
    label: 'chicken thigh roasted survey',
  },
  { datasetKey: 'fndds', fdcId: 2708403, label: 'white rice cooked survey' },
  { datasetKey: 'fndds', fdcId: 2708409, label: 'brown rice cooked survey' },
  { datasetKey: 'fndds', fdcId: 2707154, label: 'egg boiled survey' },
  { datasetKey: 'fndds', fdcId: 2709224, label: 'banana raw survey' },
  { datasetKey: 'fndds', fdcId: 2709215, label: 'apple raw survey' },
  { datasetKey: 'fndds', fdcId: 2708381, label: 'oatmeal cooked survey' },
  { datasetKey: 'fndds', fdcId: 2705385, label: 'milk whole survey' },
  {
    datasetKey: 'fndds',
    fdcId: 2705418,
    label: 'yogurt whole milk plain survey',
  },
  { datasetKey: 'fndds', fdcId: 2707598, label: 'bread white survey' },
  { datasetKey: 'fndds', fdcId: 2709384, label: 'potato baked survey' },
  { datasetKey: 'fndds', fdcId: 2706286, label: 'salmon baked survey' },
  { datasetKey: 'fndds', fdcId: 2706311, label: 'tuna canned survey' },
  { datasetKey: 'fndds', fdcId: 2707537, label: 'peanut butter survey' },
  { datasetKey: 'fndds', fdcId: 2710186, label: 'olive oil survey' },
];

export function buildDatasetConfigs(datasetKeys) {
  const requestedKeys = datasetKeys?.length ? datasetKeys : USDA_DEFAULT_DATASET_ORDER;

  return requestedKeys.map((datasetKey) => {
    const definition = USDA_DATASET_DEFINITIONS[datasetKey];

    if (!definition) {
      throw new Error(`Unsupported USDA dataset "${datasetKey}".`);
    }

    if (!definition.enabled) {
      throw new Error(`USDA dataset "${datasetKey}" is disabled in the release manifest.`);
    }

    const extractDir = path.join(USDA_DOWNLOAD_DIR, definition.key);

    return {
      ...definition,
      extractDir,
      zipPath: path.join(USDA_DOWNLOAD_DIR, definition.zipFileName),
      jsonPath: path.join(extractDir, definition.jsonFileName),
    };
  });
}
