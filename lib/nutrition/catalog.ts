import { supabase, supabaseConfigError } from '../supabase';
import { normalizeBarcodeInput } from './barcode-core';
import type { Json, Tables } from '../../types/database.types';
import type {
  NutritionCanonicalNutrientCode,
  NutritionCatalogItem,
  NutritionCatalogStateItem,
  NutritionFoodItem,
  NutritionFoodSource,
  NutritionNutrientValues,
  NutritionServingOption,
} from '../../types';

type CatalogFoodRow = Tables<'catalog_foods'>;
type FoodSourceRow = Pick<Tables<'food_sources'>, 'id' | 'code'>;
type FoodNutrientAmountRow = Pick<
  Tables<'food_nutrients'>,
  'food_id' | 'nutrient_id' | 'amount'
>;
type FoodServingRow = Tables<'food_servings'>;
type NutrientRow = Tables<'nutrients'>;

export interface NutritionCalculatedServing {
  selectedServing: NutritionServingOption;
  quantity: number;
  effectiveGrams: number | null;
  nutrientValuesPerServing: NutritionNutrientValues;
  nutrientTotals: NutritionNutrientValues;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatsPerServing: number;
  fiberPerServing?: number;
  sodiumMgPerServing?: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  sodiumMg?: number;
}

export type NutritionBarcodeLookupStatus =
  | 'found'
  | 'imported'
  | 'not_found'
  | 'incomplete'
  | 'invalid_barcode'
  | 'external_error';

export interface NutritionBarcodeLookupResult {
  status: NutritionBarcodeLookupStatus;
  lookupPath: string;
  item?: NutritionCatalogStateItem;
  message?: string;
  normalizedBarcode?: string;
  productName?: string;
  brandName?: string;
  sourceCode?: string;
}

interface BarcodeLookupRpcRow {
  status: NutritionBarcodeLookupStatus;
  lookup_path: string | null;
  food_id: string | null;
  source_code: string | null;
  normalized_barcode: string | null;
  product_name: string | null;
  brand_name: string | null;
  message: string | null;
}

const MIN_REMOTE_QUERY_LENGTH = 2;
const DEFAULT_RESULT_LIMIT = 6;
const STORAGE_PRECISION = 4;
const BARCODE_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

const CANONICAL_NUTRIENT_CODES: NutritionCanonicalNutrientCode[] = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'fat',
  'fiber',
  'sugars',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'vitamin_c',
  'vitamin_d',
  'saturated_fat',
  'cholesterol',
];

const searchResultCache = new Map<string, NutritionCatalogStateItem[]>();
const inFlightSearches = new Map<string, Promise<NutritionCatalogStateItem[]>>();
const catalogDetailCache = new Map<string, NutritionCatalogStateItem>();
const barcodeLookupCache = new Map<
  string,
  {
    expiresAt: number;
    result: NutritionBarcodeLookupResult;
  }
>();

let canonicalNutrientRowsPromise: Promise<NutrientRow[]> | null = null;
let foodSourceRowsPromise: Promise<FoodSourceRow[]> | null = null;

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      supabaseConfigError ??
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return supabase;
}

function toFiniteNumber(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeNullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSearchQuery(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function roundToStorageNumber(value: number) {
  return Number(value.toFixed(STORAGE_PRECISION));
}

function normalizeStoredNutrientValues(value: Json | null | undefined) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return undefined;
  }

  const normalizedValues: NutritionNutrientValues = {};

  CANONICAL_NUTRIENT_CODES.forEach((code) => {
    const numericValue = toFiniteNumber(value[code]);

    if (numericValue == null) {
      return;
    }

    normalizedValues[code] = roundToStorageNumber(numericValue);
  });

  return Object.keys(normalizedValues).length > 0 ? normalizedValues : undefined;
}

function getCatalogItemSource(
  food: Pick<CatalogFoodRow, 'food_type'>,
  sourceCode?: string,
): NutritionFoodSource {
  if (food.food_type === 'branded') {
    return 'branded';
  }

  if (
    sourceCode === 'USDA_FOUNDATION' ||
    sourceCode === 'USDA_FNDDS' ||
    sourceCode === 'USDA_BRANDED'
  ) {
    return sourceCode === 'USDA_BRANDED' ? 'branded' : 'usda';
  }

  if (sourceCode === 'OPEN_FOOD_FACTS') {
    return 'branded';
  }

  return 'usda';
}

function clearCatalogSearchCaches() {
  searchResultCache.clear();
  inFlightSearches.clear();
}

function buildBarcodeLookupCacheKey(
  normalizedBarcode: string,
  countryCode?: string | null,
) {
  return `${normalizedBarcode}::${normalizeNullableText(countryCode)?.toUpperCase() ?? ''}`;
}

function getCachedBarcodeLookupResult(cacheKey: string) {
  const cachedEntry = barcodeLookupCache.get(cacheKey);

  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    barcodeLookupCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.result;
}

function setCachedBarcodeLookupResult(
  cacheKey: string,
  result: NutritionBarcodeLookupResult,
) {
  if (result.status !== 'not_found' && result.status !== 'incomplete') {
    barcodeLookupCache.delete(cacheKey);
    return;
  }

  barcodeLookupCache.set(cacheKey, {
    expiresAt: Date.now() + BARCODE_NEGATIVE_CACHE_TTL_MS,
    result,
  });
}

async function ensureCatalogLookupUser() {
  const client = assertSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (session?.user) {
    return session.user;
  }

  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('Supabase did not return an authenticated user.');
  }

  return data.user;
}

function getCanonicalPerServingValues(
  item: Pick<
    NutritionCatalogStateItem | NutritionFoodItem,
    | 'caloriesPerServing'
    | 'proteinPerServing'
    | 'carbsPerServing'
    | 'fatsPerServing'
    | 'fiberPerServing'
    | 'sodiumMgPerServing'
    | 'nutrientValues'
  >,
) {
  const nutrientValues: NutritionNutrientValues = {
    ...(item.nutrientValues ?? {}),
  };

  nutrientValues.energy_kcal =
    nutrientValues.energy_kcal ?? roundToStorageNumber(item.caloriesPerServing);
  nutrientValues.protein =
    nutrientValues.protein ?? roundToStorageNumber(item.proteinPerServing);
  nutrientValues.carbohydrate =
    nutrientValues.carbohydrate ?? roundToStorageNumber(item.carbsPerServing);
  nutrientValues.fat = nutrientValues.fat ?? roundToStorageNumber(item.fatsPerServing);

  if (item.fiberPerServing != null) {
    nutrientValues.fiber =
      nutrientValues.fiber ?? roundToStorageNumber(item.fiberPerServing);
  }

  if (item.sodiumMgPerServing != null) {
    nutrientValues.sodium =
      nutrientValues.sodium ?? roundToStorageNumber(item.sodiumMgPerServing);
  }

  return nutrientValues;
}

function normalizeNutrientValues(values: NutritionNutrientValues) {
  const normalizedValues: NutritionNutrientValues = {};

  CANONICAL_NUTRIENT_CODES.forEach((code) => {
    const numericValue = toFiniteNumber(values[code]);

    if (numericValue == null) {
      return;
    }

    normalizedValues[code] = roundToStorageNumber(numericValue);
  });

  return normalizedValues;
}

function scaleNutrientValues(values: NutritionNutrientValues, factor: number) {
  const scaledValues: NutritionNutrientValues = {};

  CANONICAL_NUTRIENT_CODES.forEach((code) => {
    const numericValue = toFiniteNumber(values[code]);

    if (numericValue == null) {
      return;
    }

    scaledValues[code] = roundToStorageNumber(numericValue * factor);
  });

  return scaledValues;
}

function getBaseMeasurement(item: Pick<NutritionCatalogStateItem, 'baseAmount' | 'baseUnit'>) {
  const baseAmount = toFiniteNumber(item.baseAmount);
  const baseUnit = normalizeNullableText(item.baseUnit)?.toLowerCase();

  if (!baseAmount || baseAmount <= 0 || !baseUnit) {
    return null;
  }

  return {
    baseAmount,
    baseUnit,
  };
}

function createFallbackBaseServing(food: Pick<CatalogFoodRow, 'id' | 'base_amount' | 'base_unit'>) {
  const baseAmount = toFiniteNumber(food.base_amount) ?? 100;
  const baseUnit = normalizeNullableText(food.base_unit) ?? 'g';
  const normalizedBaseUnit = baseUnit.toLowerCase();

  return {
    id: `${food.id}-base-serving`,
    label: `${baseAmount} ${baseUnit}`,
    quantity: baseAmount,
    gramWeight: normalizedBaseUnit === 'g' ? baseAmount : null,
    milliliterVolume: normalizedBaseUnit === 'ml' ? baseAmount : null,
    householdUnit: baseUnit,
    isDefault: true,
    isSupported: normalizedBaseUnit === 'g' || normalizedBaseUnit === 'ml',
  } satisfies NutritionServingOption;
}

function getServingScale(
  item: Pick<NutritionCatalogStateItem, 'baseAmount' | 'baseUnit'>,
  serving: Pick<
    NutritionServingOption,
    'gramWeight' | 'milliliterVolume' | 'quantity' | 'householdUnit'
  >,
) {
  const baseMeasurement = getBaseMeasurement(item);

  if (!baseMeasurement) {
    return 1;
  }

  const gramWeight = toFiniteNumber(serving.gramWeight);

  if (baseMeasurement.baseUnit === 'g' && gramWeight && gramWeight > 0) {
    return gramWeight / baseMeasurement.baseAmount;
  }

  const milliliterVolume = toFiniteNumber(serving.milliliterVolume);

  if (
    baseMeasurement.baseUnit === 'ml' &&
    milliliterVolume &&
    milliliterVolume > 0
  ) {
    return milliliterVolume / baseMeasurement.baseAmount;
  }

  const householdUnit = normalizeNullableText(serving.householdUnit)?.toLowerCase();
  const quantity = toFiniteNumber(serving.quantity);

  if (
    householdUnit &&
    quantity &&
    quantity > 0 &&
    householdUnit === baseMeasurement.baseUnit
  ) {
    return quantity / baseMeasurement.baseAmount;
  }

  return null;
}

function isServingSupported(
  item: Pick<NutritionCatalogStateItem, 'baseAmount' | 'baseUnit'>,
  serving: NutritionServingOption,
) {
  if (serving.nutrientValues) {
    return true;
  }

  return getServingScale(item, serving) != null;
}

function buildSingleServingOption(
  item: NutritionCatalogItem,
  options?: {
    gramWeight?: number | null;
    selectedServingId?: string;
    nutrientValues?: NutritionNutrientValues;
  },
) {
  const nutrientValues = normalizeNutrientValues(
    options?.nutrientValues ?? getCanonicalPerServingValues(item),
  );
  const selectedServingId = options?.selectedServingId ?? `${item.id}-serving`;

  return {
    id: selectedServingId,
    label: item.servingLabel,
    quantity: 1,
    gramWeight: toFiniteNumber(options?.gramWeight),
    milliliterVolume: null,
    householdUnit: item.servingLabel,
    isDefault: true,
    isSupported: true,
    nutrientValues,
  } satisfies NutritionServingOption;
}

export function withSingleServingOption(
  item: NutritionCatalogItem,
  options?: {
    baseAmount?: number | null;
    baseUnit?: string | null;
    catalogFoodId?: string;
    databaseId?: string;
    userFoodId?: string;
    userFoodServingId?: string | null;
    recipeId?: string;
    gramWeight?: number | null;
    selectedServingId?: string;
    nutrientValues?: NutritionNutrientValues;
    effectiveGrams?: number | null;
  },
): NutritionCatalogStateItem {
  const singleServingOption = buildSingleServingOption(item, {
    gramWeight: options?.gramWeight,
    selectedServingId: options?.selectedServingId,
    nutrientValues: options?.nutrientValues,
  });

  return {
    ...item,
    baseAmount: options?.baseAmount ?? null,
    baseUnit: options?.baseUnit ?? null,
    catalogFoodId: options?.catalogFoodId,
    databaseId: options?.databaseId,
    userFoodId: options?.userFoodId,
    userFoodServingId: options?.userFoodServingId ?? null,
    recipeId: options?.recipeId,
    effectiveGrams:
      options?.effectiveGrams ??
      toFiniteNumber(options?.gramWeight) ??
      null,
    nutrientValues:
      options?.nutrientValues ?? getCanonicalPerServingValues(item),
    selectedServingId: singleServingOption.id,
    servingOptions: [singleServingOption],
  };
}

function choosePreferredServing(
  item: Pick<NutritionCatalogStateItem, 'baseAmount' | 'baseUnit'>,
  servings: NutritionServingOption[],
  food: Pick<CatalogFoodRow, 'id' | 'base_amount' | 'base_unit'>,
) {
  if (servings.length === 0) {
    return createFallbackBaseServing(food);
  }

  const supportedServings = servings.filter((serving) => isServingSupported(item, serving));
  const candidateServings = supportedServings.length > 0 ? supportedServings : servings;

  return (
    candidateServings.find((serving) => serving.isDefault) ??
    candidateServings.find(
      (serving) => serving.label.trim().toLowerCase() === '100 g',
    ) ??
    candidateServings[0]
  );
}

function findPreferredServingOption(
  item: Pick<NutritionCatalogStateItem, 'baseAmount' | 'baseUnit' | 'servingOptions'>,
  preferredServingId?: string | null,
) {
  const servingOptions = item.servingOptions ?? [];

  if (servingOptions.length === 0) {
    return null;
  }

  const supportedServings = servingOptions.filter(
    (serving) => serving.isSupported !== false,
  );
  const candidateServings = supportedServings.length > 0 ? supportedServings : servingOptions;

  if (preferredServingId) {
    const exactServing = candidateServings.find((serving) => serving.id === preferredServingId);

    if (exactServing) {
      return exactServing;
    }
  }

  return (
    candidateServings.find((serving) => serving.isDefault) ??
    candidateServings.find(
      (serving) => serving.label.trim().toLowerCase() === '100 g',
    ) ??
    candidateServings[0]
  );
}

function getSelectedServingOption(
  item: NutritionCatalogStateItem,
  servingId?: string,
) {
  const availableServings = item.servingOptions ?? [];

  if (availableServings.length === 0) {
    return null;
  }

  return (
    availableServings.find(
      (serving) => serving.id === (servingId ?? item.selectedServingId),
    ) ??
    availableServings.find((serving) => serving.isDefault) ??
    availableServings[0]
  );
}

function getPerServingNutrientValues(
  item: NutritionCatalogStateItem,
  serving: NutritionServingOption,
) {
  if (serving.nutrientValues) {
    return normalizeNutrientValues(serving.nutrientValues);
  }

  if (!item.nutrientValues) {
    return null;
  }

  const baseMeasurement = getBaseMeasurement(item);

  if (!baseMeasurement) {
    return normalizeNutrientValues(item.nutrientValues);
  }

  const scale = getServingScale(item, serving);

  if (scale == null) {
    return null;
  }

  return scaleNutrientValues(item.nutrientValues, scale);
}

export function calculateNutritionForServing(
  item: NutritionCatalogStateItem,
  servingId: string | undefined,
  quantity: number,
): NutritionCalculatedServing | null {
  const selectedServing = getSelectedServingOption(item, servingId);
  const normalizedQuantity = toFiniteNumber(quantity);

  if (!selectedServing || !normalizedQuantity || normalizedQuantity <= 0) {
    return null;
  }

  const perServingValues = getPerServingNutrientValues(item, selectedServing);

  if (!perServingValues) {
    return null;
  }

  const nutrientTotals = scaleNutrientValues(perServingValues, normalizedQuantity);
  const effectiveGrams =
    selectedServing.gramWeight == null
      ? null
      : roundToStorageNumber(selectedServing.gramWeight * normalizedQuantity);

  return {
    selectedServing,
    quantity: roundToStorageNumber(normalizedQuantity),
    effectiveGrams,
    nutrientValuesPerServing: perServingValues,
    nutrientTotals,
    caloriesPerServing: perServingValues.energy_kcal ?? 0,
    proteinPerServing: perServingValues.protein ?? 0,
    carbsPerServing: perServingValues.carbohydrate ?? 0,
    fatsPerServing: perServingValues.fat ?? 0,
    fiberPerServing: perServingValues.fiber,
    sodiumMgPerServing: perServingValues.sodium,
    calories: nutrientTotals.energy_kcal ?? 0,
    protein: nutrientTotals.protein ?? 0,
    carbs: nutrientTotals.carbohydrate ?? 0,
    fats: nutrientTotals.fat ?? 0,
    fiber: nutrientTotals.fiber,
    sodiumMg: nutrientTotals.sodium,
  };
}

export function applyServingSelection(
  item: NutritionCatalogStateItem,
  servingId: string,
): NutritionCatalogStateItem {
  const selectedServing = getSelectedServingOption(item, servingId);

  if (!selectedServing) {
    return item;
  }

  const calculation = calculateNutritionForServing(item, servingId, 1);

  if (!calculation) {
    return {
      ...item,
      selectedServingId: servingId,
      servingLabel: selectedServing.label,
      effectiveGrams: toFiniteNumber(selectedServing.gramWeight),
    };
  }

  return {
    ...item,
    selectedServingId: selectedServing.id,
    servingLabel: selectedServing.label,
    effectiveGrams: calculation.effectiveGrams,
    caloriesPerServing: calculation.caloriesPerServing,
    proteinPerServing: calculation.proteinPerServing,
    carbsPerServing: calculation.carbsPerServing,
    fatsPerServing: calculation.fatsPerServing,
    fiberPerServing: calculation.fiberPerServing,
    sodiumMgPerServing: calculation.sodiumMgPerServing,
  };
}

export function resolvePreferredServingSelection(
  item: NutritionCatalogStateItem,
  preferredServingId?: string | null,
) {
  const preferredServing = findPreferredServingOption(item, preferredServingId);

  if (!preferredServing) {
    return item;
  }

  return applyServingSelection(item, preferredServing.id);
}

export function createLoggedFoodStateItem(item: NutritionFoodItem) {
  const perServingGramWeight =
    item.effectiveGrams != null && item.servings > 0
      ? roundToStorageNumber(item.effectiveGrams / item.servings)
      : null;
  const selectedServingId =
    item.catalogServingId ??
    item.userFoodServingId ??
    item.selectedServingId ??
    `${item.id}-snapshot-serving`;

  return withSingleServingOption(
    {
      id: item.catalogItemId,
      name: item.name,
      brand: item.brand,
      servingLabel: item.servingLabel,
      caloriesPerServing: item.caloriesPerServing,
      proteinPerServing: item.proteinPerServing,
      carbsPerServing: item.carbsPerServing,
      fatsPerServing: item.fatsPerServing,
      fiberPerServing: item.fiberPerServing,
      sodiumMgPerServing: item.sodiumMgPerServing,
      defaultServings: 1,
      source: item.source,
      keywords: [],
    },
    {
      catalogFoodId: item.catalogFoodId ?? undefined,
      databaseId: item.legacyFoodId ?? undefined,
      userFoodId: item.userFoodId ?? undefined,
      userFoodServingId: item.userFoodServingId ?? undefined,
      recipeId: item.recipeId ?? undefined,
      gramWeight: perServingGramWeight,
      selectedServingId,
      nutrientValues: getCanonicalPerServingValues(item),
      effectiveGrams: perServingGramWeight,
    },
  );
}

export function mergeLoggedFoodIntoCatalogItem(
  loggedItem: NutritionFoodItem,
  currentCatalogItem: NutritionCatalogStateItem,
) {
  const savedServingId = loggedItem.catalogServingId ?? loggedItem.selectedServingId;

  if (
    savedServingId &&
    currentCatalogItem.servingOptions?.some((serving) => serving.id === savedServingId)
  ) {
    return applyServingSelection(currentCatalogItem, savedServingId);
  }

  const snapshotServingId = savedServingId ?? `${loggedItem.id}-snapshot-serving`;
  const perServingGramWeight =
    loggedItem.effectiveGrams != null && loggedItem.servings > 0
      ? roundToStorageNumber(loggedItem.effectiveGrams / loggedItem.servings)
      : null;
  const snapshotServing: NutritionServingOption = {
    id: snapshotServingId,
    label: loggedItem.servingLabel,
    quantity: 1,
    gramWeight: perServingGramWeight,
    milliliterVolume: null,
    householdUnit: loggedItem.servingLabel,
    isDefault: false,
    isSupported: true,
    nutrientValues: getCanonicalPerServingValues(loggedItem),
  };
  const servingOptions = [
    snapshotServing,
    ...(currentCatalogItem.servingOptions ?? []).filter(
      (serving) => serving.id !== snapshotServing.id,
    ),
  ];

  return applyServingSelection(
    {
      ...currentCatalogItem,
      servingOptions,
    },
    snapshotServing.id,
  );
}

async function loadCanonicalNutrientRows() {
  if (!canonicalNutrientRowsPromise) {
    canonicalNutrientRowsPromise = (async () => {
      const client = assertSupabase();
      const { data, error } = await client
        .from('nutrients')
        .select('*')
        .in('code', CANONICAL_NUTRIENT_CODES);

      if (error) {
        canonicalNutrientRowsPromise = null;
        throw error;
      }

      return data ?? [];
    })();
  }

  return canonicalNutrientRowsPromise;
}

async function loadFoodSourceRows() {
  if (!foodSourceRowsPromise) {
    foodSourceRowsPromise = (async () => {
      const client = assertSupabase();
      const { data, error } = await client
        .from('food_sources')
        .select('id, code');

      if (error) {
        foodSourceRowsPromise = null;
        throw error;
      }

      return (data ?? []) as FoodSourceRow[];
    })();
  }

  return foodSourceRowsPromise;
}

function mapServingsByFoodId(rows: FoodServingRow[]) {
  const servingsByFoodId = new Map<string, NutritionServingOption[]>();

  rows.forEach((row) => {
    const existingServings = servingsByFoodId.get(row.food_id) ?? [];

    existingServings.push({
      id: row.id,
      label: row.serving_name,
      quantity: toFiniteNumber(row.quantity) ?? 1,
      gramWeight: toFiniteNumber(row.gram_weight),
      milliliterVolume: toFiniteNumber(row.milliliter_volume),
      householdUnit: normalizeNullableText(row.household_unit) ?? null,
      isDefault: row.is_default,
      nutrientValues: normalizeStoredNutrientValues(row.nutrient_values),
    });

    servingsByFoodId.set(row.food_id, existingServings);
  });

  return servingsByFoodId;
}

function mapNutrientsByFoodId(
  rows: FoodNutrientAmountRow[],
  nutrientRows: NutrientRow[],
) {
  const nutrientCodeById = new Map(
    nutrientRows.map((row) => [row.id, row.code as NutritionCanonicalNutrientCode]),
  );
  const nutrientsByFoodId = new Map<string, NutritionNutrientValues>();

  rows.forEach((row) => {
    const code = nutrientCodeById.get(row.nutrient_id);

    if (!code) {
      return;
    }

    const existingValues = nutrientsByFoodId.get(row.food_id) ?? {};
    const numericAmount = toFiniteNumber(row.amount);

    if (numericAmount == null) {
      return;
    }

    existingValues[code] = numericAmount;
    nutrientsByFoodId.set(row.food_id, existingValues);
  });

  return nutrientsByFoodId;
}

async function loadCatalogFoodItems(foodIds: string[]) {
  const uniqueFoodIds = [...new Set(foodIds.filter(Boolean))];
  const uncachedFoodIds = uniqueFoodIds.filter((foodId) => !catalogDetailCache.has(foodId));

  if (uncachedFoodIds.length > 0) {
    const client = assertSupabase();
    const [canonicalNutrientRows, sourceRows] = await Promise.all([
      loadCanonicalNutrientRows(),
      loadFoodSourceRows(),
    ]);
    const canonicalNutrientIds = canonicalNutrientRows.map((row) => row.id);
    const sourceCodeById = new Map(sourceRows.map((row) => [row.id, row.code]));

    const [
      { data: foods, error: foodsError },
      { data: servings, error: servingsError },
      { data: nutrients, error: nutrientsError },
    ] = await Promise.all([
      client
        .from('catalog_foods')
        .select(
          'id, source_id, source_food_id, food_type, name, description, brand_name, base_amount, base_unit',
        )
        .in('id', uncachedFoodIds),
      client
        .from('food_servings')
        .select('*')
        .in('food_id', uncachedFoodIds)
        .order('is_default', { ascending: false })
        .order('serving_name', { ascending: true }),
      client
        .from('food_nutrients')
        .select('food_id, nutrient_id, amount')
        .in('food_id', uncachedFoodIds)
        .in('nutrient_id', canonicalNutrientIds),
    ]);

    if (foodsError) {
      throw foodsError;
    }

    if (servingsError) {
      throw servingsError;
    }

    if (nutrientsError) {
      throw nutrientsError;
    }

    const servingsByFoodId = mapServingsByFoodId(servings ?? []);
    const nutrientsByFoodId = mapNutrientsByFoodId(
      nutrients ?? [],
      canonicalNutrientRows,
    );

    (foods ?? []).forEach((food) => {
      const sourceCode = sourceCodeById.get(food.source_id ?? '');
      const baseItem: NutritionCatalogStateItem = {
        id: food.id,
        catalogFoodId: food.id,
        catalogSourceCode: sourceCode,
        name: food.name,
        brand: normalizeNullableText(food.brand_name),
        description: normalizeNullableText(food.description),
        servingLabel: '1 serving',
        caloriesPerServing: 0,
        proteinPerServing: 0,
        carbsPerServing: 0,
        fatsPerServing: 0,
        fiberPerServing: undefined,
        sodiumMgPerServing: undefined,
        defaultServings: 1,
        source: getCatalogItemSource(food, sourceCode),
        keywords: [],
        baseAmount: toFiniteNumber(food.base_amount),
        baseUnit: normalizeNullableText(food.base_unit) ?? null,
        effectiveGrams: null,
        nutrientValues: nutrientsByFoodId.get(food.id) ?? {},
        servingOptions: [],
      };
      const rawServingOptions = servingsByFoodId.get(food.id) ?? [
        createFallbackBaseServing(food),
      ];
      const servingOptions = rawServingOptions.map((serving) => ({
        ...serving,
        isSupported: isServingSupported(baseItem, serving),
      }));
      const selectedServing = choosePreferredServing(baseItem, servingOptions, food);

      catalogDetailCache.set(
        food.id,
        applyServingSelection(
          {
            ...baseItem,
            selectedServingId: selectedServing.id,
            servingOptions,
          },
          selectedServing.id,
        ),
      );
    });
  }

  return new Map(
    uniqueFoodIds.flatMap((foodId) => {
      const item = catalogDetailCache.get(foodId);
      return item ? [[foodId, item] as const] : [];
    }),
  );
}

export async function searchCatalogFoods(
  query: string,
  resultLimit = DEFAULT_RESULT_LIMIT,
) {
  const normalizedQuery = normalizeSearchQuery(query);

  if (normalizedQuery.length < MIN_REMOTE_QUERY_LENGTH) {
    return [];
  }

  const cacheKey = `${normalizedQuery.toLowerCase()}::${resultLimit}`;
  const cachedResults = searchResultCache.get(cacheKey);

  if (cachedResults) {
    return cachedResults;
  }

  const inFlightSearch = inFlightSearches.get(cacheKey);

  if (inFlightSearch) {
    return inFlightSearch;
  }

  const searchPromise = (async () => {
    const client = assertSupabase();
    const { data, error } = await client.rpc('search_catalog_foods', {
      search_query: normalizedQuery,
      result_limit: resultLimit,
    });

    if (error) {
      throw error;
    }

    const orderedFoodIds = [...new Set((data ?? []).map((row) => row.food_id))];
    const catalogItemsByFoodId = await loadCatalogFoodItems(orderedFoodIds);
    const results = orderedFoodIds.flatMap((foodId) => {
      const item = catalogItemsByFoodId.get(foodId);
      return item ? [item] : [];
    });

    searchResultCache.set(cacheKey, results);
    return results;
  })();

  inFlightSearches.set(cacheKey, searchPromise);

  try {
    return await searchPromise;
  } finally {
    inFlightSearches.delete(cacheKey);
  }
}

export async function lookupFoodByBarcode(
  rawBarcode: string,
  options?: {
    barcodeType?: string | null;
    countryCode?: string | null;
  },
): Promise<NutritionBarcodeLookupResult> {
  const normalizedBarcode = normalizeBarcodeInput(rawBarcode, {
    hintType: options?.barcodeType,
  });

  if (!normalizedBarcode.ok) {
    return {
      status: 'invalid_barcode',
      lookupPath: 'validation',
      normalizedBarcode: normalizedBarcode.cleanedDigits || undefined,
      message: normalizedBarcode.message,
    };
  }

  const cacheKey = buildBarcodeLookupCacheKey(
    normalizedBarcode.normalizedBarcode,
    options?.countryCode,
  );
  const cachedResult = getCachedBarcodeLookupResult(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  await ensureCatalogLookupUser();

  const client = assertSupabase();
  const { data, error } = await client.rpc('lookup_food_barcode', {
    raw_barcode: rawBarcode,
    input_normalized_barcode: normalizedBarcode.normalizedBarcode,
    requested_country_code:
      normalizeNullableText(options?.countryCode)?.toUpperCase() ?? undefined,
  });

  if (error) {
    throw error;
  }

  const responseRow = ((data ?? []) as unknown as BarcodeLookupRpcRow[])[0];

  if (!responseRow) {
    return {
      status: 'external_error',
      lookupPath: 'lookup',
      normalizedBarcode: normalizedBarcode.normalizedBarcode,
      message: 'The packaged-food lookup did not return a result.',
    };
  }

  if (
    (responseRow.status === 'found' || responseRow.status === 'imported') &&
    responseRow.food_id
  ) {
    barcodeLookupCache.delete(cacheKey);

    if (responseRow.status === 'imported') {
      clearCatalogSearchCaches();
    }

    return {
      status: responseRow.status,
      lookupPath: responseRow.lookup_path ?? 'lookup',
      normalizedBarcode:
        responseRow.normalized_barcode ?? normalizedBarcode.normalizedBarcode,
      productName: responseRow.product_name ?? undefined,
      brandName: responseRow.brand_name ?? undefined,
      sourceCode: responseRow.source_code ?? undefined,
      item: await getCatalogFoodDetails(responseRow.food_id),
      message: responseRow.message ?? undefined,
    };
  }

  const result = {
    status: responseRow.status,
    lookupPath: responseRow.lookup_path ?? 'lookup',
    normalizedBarcode:
      responseRow.normalized_barcode ?? normalizedBarcode.normalizedBarcode,
    productName: responseRow.product_name ?? undefined,
    brandName: responseRow.brand_name ?? undefined,
    sourceCode: responseRow.source_code ?? undefined,
    message: responseRow.message ?? undefined,
  };

  setCachedBarcodeLookupResult(cacheKey, result);
  return result;
}

export async function getCatalogFoodDetails(foodId: string) {
  const cachedDetail = catalogDetailCache.get(foodId);

  if (cachedDetail) {
    return cachedDetail;
  }

  const catalogItemsByFoodId = await loadCatalogFoodItems([foodId]);
  const detail = catalogItemsByFoodId.get(foodId);

  if (!detail) {
    throw new Error('The selected food could not be loaded.');
  }

  return detail;
}

export async function getCatalogFoodDetailsMap(foodIds: string[]) {
  return loadCatalogFoodItems(foodIds);
}
