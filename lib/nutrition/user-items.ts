import type { Json, Tables } from '../../types/database.types';
import type {
  NutritionCanonicalNutrientCode,
  NutritionCatalogStateItem,
  NutritionNutrientValues,
  NutritionServingOption,
} from '../../types';
import { supabase, supabaseConfigError } from '../supabase';
import {
  applyServingSelection,
  calculateNutritionForServing,
  resolvePreferredServingSelection,
} from './catalog';

type NutrientRow = Tables<'nutrients'>;
type RecipeIngredientRow = Tables<'recipe_ingredients'>;
type RecipeRow = Tables<'recipes'>;
type UserFoodNutrientRow = Tables<'user_food_nutrients'>;
type UserFoodRow = Tables<'user_foods'>;
type UserFoodServingRow = Tables<'user_food_servings'>;

export interface CustomFoodServingDraft {
  id?: string;
  servingName: string;
  quantity: number;
  gramWeight?: number | null;
  milliliterVolume?: number | null;
  householdUnit?: string | null;
  isDefault: boolean;
  sortOrder: number;
}

export interface CustomFoodDraft {
  id?: string;
  name: string;
  brandName: string;
  description: string;
  baseAmount: number;
  baseUnit: 'g' | 'ml';
  nutrientValues: NutritionNutrientValues;
  servings: CustomFoodServingDraft[];
}

export interface RecipeIngredientDraft {
  id?: string;
  position: number;
  item: NutritionCatalogStateItem;
  quantity: number;
  effectiveGrams: number | null;
  nutrientTotals: NutritionNutrientValues;
}

export interface RecipeDraft {
  id?: string;
  name: string;
  description: string;
  finalWeightG: number;
  servingCount?: number | null;
  ingredients: RecipeIngredientDraft[];
  totalNutrientValues: NutritionNutrientValues;
}

const STORAGE_PRECISION = 4;
const MIN_SEARCH_LENGTH = 2;
const DEFAULT_RESULT_LIMIT = 8;
const REQUIRED_NUTRIENT_CODES: NutritionCanonicalNutrientCode[] = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'fat',
];
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

const userFoodDetailCache = new Map<string, NutritionCatalogStateItem>();
const recipeDetailCache = new Map<string, NutritionCatalogStateItem>();

let canonicalNutrientRowsPromise: Promise<NutrientRow[]> | null = null;

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

function roundToStorageNumber(value: number) {
  return Number(value.toFixed(STORAGE_PRECISION));
}

function normalizeNullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSearchQuery(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeNutrientValues(values: unknown) {
  const normalizedValues: NutritionNutrientValues = {};

  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return normalizedValues;
  }

  CANONICAL_NUTRIENT_CODES.forEach((code) => {
    const numericValue = toFiniteNumber(
      (values as Partial<Record<NutritionCanonicalNutrientCode, unknown>>)[code],
    );

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

function mergeNutrientValues(
  left: NutritionNutrientValues,
  right: NutritionNutrientValues,
) {
  const mergedValues: NutritionNutrientValues = { ...left };

  CANONICAL_NUTRIENT_CODES.forEach((code) => {
    const nextValue = toFiniteNumber(right[code]);

    if (nextValue == null) {
      return;
    }

    const currentValue = toFiniteNumber(mergedValues[code]) ?? 0;
    mergedValues[code] = roundToStorageNumber(currentValue + nextValue);
  });

  return mergedValues;
}

function isUuid(value: string | null | undefined) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function toJsonObject(values: NutritionNutrientValues): Json {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => toFiniteNumber(value) != null),
  ) as Json;
}

function getPerServingNutrientValues(values: NutritionNutrientValues) {
  return {
    caloriesPerServing: toFiniteNumber(values.energy_kcal) ?? 0,
    proteinPerServing: toFiniteNumber(values.protein) ?? 0,
    carbsPerServing: toFiniteNumber(values.carbohydrate) ?? 0,
    fatsPerServing: toFiniteNumber(values.fat) ?? 0,
    fiberPerServing: toFiniteNumber(values.fiber) ?? undefined,
    sodiumMgPerServing: toFiniteNumber(values.sodium) ?? undefined,
  };
}

function createBaseServingOption(
  id: string,
  baseAmount: number,
  baseUnit: string,
  label?: string,
): NutritionServingOption {
  const normalizedBaseUnit = baseUnit.toLowerCase();

  return {
    id,
    label: label ?? `${baseAmount} ${baseUnit}`,
    quantity: baseAmount,
    gramWeight: normalizedBaseUnit === 'g' ? baseAmount : null,
    milliliterVolume: normalizedBaseUnit === 'ml' ? baseAmount : null,
    householdUnit: baseUnit,
    isDefault: true,
    isSupported: normalizedBaseUnit === 'g' || normalizedBaseUnit === 'ml',
  };
}

function getSearchScore(
  query: string,
  {
    name,
    brand,
    description,
  }: {
    name: string;
    brand?: string;
    description?: string;
  },
) {
  const normalizedQuery = normalizeSearchQuery(query);
  const normalizedName = normalizeSearchQuery(name);
  const normalizedBrand = normalizeSearchQuery(brand ?? '');
  const normalizedDescription = normalizeSearchQuery(description ?? '');

  if (!normalizedQuery) {
    return 0;
  }

  if (normalizedName === normalizedQuery) {
    return 200;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 150;
  }

  if (normalizedBrand === normalizedQuery) {
    return 120;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 90;
  }

  if (normalizedBrand.includes(normalizedQuery)) {
    return 70;
  }

  if (normalizedDescription.includes(normalizedQuery)) {
    return 40;
  }

  return 0;
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

function mapNutrientsByFoodId(
  rows: UserFoodNutrientRow[],
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

    const numericAmount = toFiniteNumber(row.amount);

    if (numericAmount == null) {
      return;
    }

    const currentValues = nutrientsByFoodId.get(row.user_food_id) ?? {};
    currentValues[code] = roundToStorageNumber(numericAmount);
    nutrientsByFoodId.set(row.user_food_id, currentValues);
  });

  return nutrientsByFoodId;
}

function mapServingsByFoodId(rows: UserFoodServingRow[]) {
  const servingsByFoodId = new Map<string, NutritionServingOption[]>();

  rows.forEach((row) => {
    const currentRows = servingsByFoodId.get(row.user_food_id) ?? [];
    currentRows.push({
      id: row.id,
      label: row.serving_name,
      quantity: toFiniteNumber(row.quantity) ?? 1,
      gramWeight: toFiniteNumber(row.gram_weight),
      milliliterVolume: toFiniteNumber(row.milliliter_volume),
      householdUnit: normalizeNullableText(row.household_unit) ?? row.serving_name,
      isDefault: row.is_default,
      isSupported: true,
    });
    servingsByFoodId.set(row.user_food_id, currentRows);
  });

  return servingsByFoodId;
}

function mapUserFoodRowToItem(
  row: UserFoodRow,
  nutrientValues: NutritionNutrientValues,
  servingOptions: NutritionServingOption[],
) {
  const baseAmount = toFiniteNumber(row.base_amount) ?? 100;
  const baseUnit = normalizeNullableText(row.base_unit) ?? 'g';
  const baseServing = createBaseServingOption(
    `${row.id}-base-serving`,
    baseAmount,
    baseUnit,
  );
  const normalizedServings =
    servingOptions.length > 0
      ? servingOptions
          .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
          .map((serving) => ({
            ...serving,
            isSupported:
              serving.gramWeight != null ||
              serving.milliliterVolume != null ||
              serving.householdUnit?.toLowerCase() === baseUnit.toLowerCase(),
          }))
      : [baseServing];
  const defaultServing =
    normalizedServings.find((serving) => serving.isDefault) ??
    normalizedServings.find(
      (serving) => normalizeSearchQuery(serving.label) === normalizeSearchQuery(baseServing.label),
    ) ??
    normalizedServings[0];
  const perServing = getPerServingNutrientValues(nutrientValues);

  return applyServingSelection(
    {
      id: row.id,
      name: row.name,
      brand: normalizeNullableText(row.brand_name),
      description: normalizeNullableText(row.description),
      servingLabel: defaultServing.label,
      caloriesPerServing: perServing.caloriesPerServing,
      proteinPerServing: perServing.proteinPerServing,
      carbsPerServing: perServing.carbsPerServing,
      fatsPerServing: perServing.fatsPerServing,
      fiberPerServing: perServing.fiberPerServing,
      sodiumMgPerServing: perServing.sodiumMgPerServing,
      defaultServings: 1,
      source: 'custom',
      keywords: [],
      userFoodId: row.id,
      userFoodServingId: defaultServing.id,
      baseAmount,
      baseUnit,
      nutrientValues,
      servingOptions: normalizedServings,
      selectedServingId: defaultServing.id,
      effectiveGrams: defaultServing.gramWeight ?? null,
    },
    defaultServing.id,
  );
}

async function loadUserFoodItems(
  userFoodIds: string[],
  { includeInactive = false }: { includeInactive?: boolean } = {},
) {
  const uniqueFoodIds = [...new Set(userFoodIds.filter(Boolean))];

  if (uniqueFoodIds.length === 0) {
    return new Map<string, NutritionCatalogStateItem>();
  }

  const uncachedFoodIds = includeInactive
    ? uniqueFoodIds
    : uniqueFoodIds.filter((foodId) => !userFoodDetailCache.has(foodId));

  if (uncachedFoodIds.length > 0) {
    const client = assertSupabase();
    const canonicalNutrientRows = await loadCanonicalNutrientRows();
    const nutrientIds = canonicalNutrientRows.map((row) => row.id);
    let foodsQuery = client.from('user_foods').select('*').in('id', uncachedFoodIds);

    if (!includeInactive) {
      foodsQuery = foodsQuery.eq('is_active', true);
    }

    const [
      { data: foods, error: foodsError },
      { data: nutrientRows, error: nutrientRowsError },
      { data: servingRows, error: servingRowsError },
    ] = await Promise.all([
      foodsQuery,
      client
        .from('user_food_nutrients')
        .select('*')
        .in('user_food_id', uncachedFoodIds)
        .in('nutrient_id', nutrientIds),
      client
        .from('user_food_servings')
        .select('*')
        .in('user_food_id', uncachedFoodIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    if (foodsError) {
      throw foodsError;
    }

    if (nutrientRowsError) {
      throw nutrientRowsError;
    }

    if (servingRowsError) {
      throw servingRowsError;
    }

    const nutrientsByFoodId = mapNutrientsByFoodId(
      nutrientRows ?? [],
      canonicalNutrientRows,
    );
    const servingsByFoodId = mapServingsByFoodId(servingRows ?? []);

    (foods ?? []).forEach((row) => {
      const detail = mapUserFoodRowToItem(
        row,
        nutrientsByFoodId.get(row.id) ?? {},
        servingsByFoodId.get(row.id) ?? [],
      );
      userFoodDetailCache.set(row.id, detail);
    });
  }

  return new Map(
    uniqueFoodIds.flatMap((foodId) => {
      const detail = userFoodDetailCache.get(foodId);
      return detail ? [[foodId, detail] as const] : [];
    }),
  );
}

function buildRecipeSummaryItem(row: RecipeRow) {
  const totalNutrientValues = normalizeNutrientValues(row.total_nutrients);
  const per100Factor = row.final_weight_g > 0 ? 100 / row.final_weight_g : 1;
  const per100NutrientValues = scaleNutrientValues(totalNutrientValues, per100Factor);
  const per100Macros = getPerServingNutrientValues(per100NutrientValues);
  const servingOptions: NutritionServingOption[] = [
    {
      id: `${row.id}:100g`,
      label: '100 g',
      quantity: 100,
      gramWeight: 100,
      milliliterVolume: null,
      householdUnit: 'g',
      isDefault: row.serving_count == null,
      isSupported: true,
    },
  ];

  if ((row.serving_count ?? 0) > 0) {
    servingOptions.unshift({
      id: `${row.id}:serving`,
      label: '1 serving',
      quantity: 1,
      gramWeight: roundToStorageNumber(row.final_weight_g / row.serving_count!),
      milliliterVolume: null,
      householdUnit: 'serving',
      isDefault: true,
      isSupported: true,
    });
  }

  const defaultServing = servingOptions.find((serving) => serving.isDefault) ?? servingOptions[0];

  return applyServingSelection(
    {
      id: row.id,
      recipeId: row.id,
      name: row.name,
      brand: undefined,
      description: normalizeNullableText(row.description),
      servingLabel: defaultServing.label,
      caloriesPerServing: per100Macros.caloriesPerServing,
      proteinPerServing: per100Macros.proteinPerServing,
      carbsPerServing: per100Macros.carbsPerServing,
      fatsPerServing: per100Macros.fatsPerServing,
      fiberPerServing: per100Macros.fiberPerServing,
      sodiumMgPerServing: per100Macros.sodiumMgPerServing,
      defaultServings: 1,
      source: 'recipe',
      keywords: [],
      baseAmount: 100,
      baseUnit: 'g',
      nutrientValues: per100NutrientValues,
      servingOptions,
      selectedServingId: defaultServing.id,
      effectiveGrams: defaultServing.gramWeight ?? null,
    },
    defaultServing.id,
  );
}

async function loadRecipeItems(
  recipeIds: string[],
  { includeInactive = false }: { includeInactive?: boolean } = {},
) {
  const uniqueRecipeIds = [...new Set(recipeIds.filter(Boolean))];

  if (uniqueRecipeIds.length === 0) {
    return new Map<string, NutritionCatalogStateItem>();
  }

  const uncachedRecipeIds = includeInactive
    ? uniqueRecipeIds
    : uniqueRecipeIds.filter((recipeId) => !recipeDetailCache.has(recipeId));

  if (uncachedRecipeIds.length > 0) {
    const client = assertSupabase();
    let query = client.from('recipes').select('*').in('id', uncachedRecipeIds);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    (data ?? []).forEach((row) => {
      recipeDetailCache.set(row.id, buildRecipeSummaryItem(row));
    });
  }

  return new Map(
    uniqueRecipeIds.flatMap((recipeId) => {
      const detail = recipeDetailCache.get(recipeId);
      return detail ? [[recipeId, detail] as const] : [];
    }),
  );
}

function withSyntheticGramServing(
  item: NutritionCatalogStateItem,
  {
    label,
    gramWeight,
  }: {
    label: string;
    gramWeight: number;
  },
) {
  const syntheticServing: NutritionServingOption = {
    id: `${item.id}:${normalizeSearchQuery(label)}:${gramWeight}`,
    label,
    quantity: 1,
    gramWeight,
    milliliterVolume: null,
    householdUnit: label,
    isDefault: false,
    isSupported: true,
  };

  return applyServingSelection(
    {
      ...item,
      servingOptions: [
        syntheticServing,
        ...(item.servingOptions ?? []).filter((serving) => serving.id !== syntheticServing.id),
      ],
    },
    syntheticServing.id,
  );
}

function resolveRecipeIngredientItem(
  baseItem: NutritionCatalogStateItem,
  ingredient: RecipeIngredientRow,
) {
  const preferredServingId =
    ingredient.catalog_serving_id ?? ingredient.user_food_serving_id ?? undefined;

  if (
    preferredServingId &&
    baseItem.servingOptions?.some((serving) => serving.id === preferredServingId)
  ) {
    return applyServingSelection(baseItem, preferredServingId);
  }

  const labelMatch = baseItem.servingOptions?.find(
    (serving) =>
      normalizeSearchQuery(serving.label) === normalizeSearchQuery(ingredient.serving_label),
  );

  if (labelMatch) {
    return applyServingSelection(baseItem, labelMatch.id);
  }

  if ((ingredient.effective_grams ?? 0) > 0 && ingredient.quantity > 0) {
    return withSyntheticGramServing(baseItem, {
      label: ingredient.serving_label,
      gramWeight: roundToStorageNumber(ingredient.effective_grams! / ingredient.quantity),
    });
  }

  return resolvePreferredServingSelection(baseItem);
}

function buildRecipeIngredientDraft(
  item: NutritionCatalogStateItem,
  quantity: number,
  options?: {
    id?: string;
    position?: number;
  },
): RecipeIngredientDraft {
  const calculation = calculateNutritionForServing(item, item.selectedServingId, quantity);

  if (!calculation) {
    throw new Error('The selected ingredient serving cannot be converted safely.');
  }

  return {
    id: options?.id,
    position: options?.position ?? 0,
    item: applyServingSelection(item, calculation.selectedServing.id),
    quantity: calculation.quantity,
    effectiveGrams: calculation.effectiveGrams,
    nutrientTotals: calculation.nutrientTotals,
  };
}

export function recalculateRecipeIngredientDraft(
  ingredient: Pick<RecipeIngredientDraft, 'id' | 'position'>,
  item: NutritionCatalogStateItem,
  quantity: number,
) {
  return buildRecipeIngredientDraft(item, quantity, ingredient);
}

export function getRecipeDraftTotals(
  ingredients: RecipeIngredientDraft[],
): NutritionNutrientValues {
  return ingredients.reduce(
    (totalValues, ingredient) =>
      mergeNutrientValues(totalValues, ingredient.nutrientTotals),
    {},
  );
}

export function buildRecipeDraftSummaryItem(
  draft: Pick<
    RecipeDraft,
    'id' | 'name' | 'description' | 'finalWeightG' | 'servingCount' | 'totalNutrientValues'
  >,
) {
  return buildRecipeSummaryItem({
    id: draft.id ?? `recipe-draft-${draft.name}`,
    created_at: '',
    description: normalizeNullableText(draft.description) ?? null,
    final_weight_g: draft.finalWeightG,
    is_active: true,
    name: draft.name,
    serving_count: draft.servingCount ?? null,
    total_nutrients: toJsonObject(draft.totalNutrientValues),
    updated_at: '',
    user_id: '',
  });
}

function clearUserFoodCache(foodId?: string) {
  if (foodId) {
    userFoodDetailCache.delete(foodId);
    return;
  }

  userFoodDetailCache.clear();
}

function clearRecipeCache(recipeId?: string) {
  if (recipeId) {
    recipeDetailCache.delete(recipeId);
    return;
  }

  recipeDetailCache.clear();
}

export async function getUserFoodDetails(
  userFoodId: string,
  options?: { includeInactive?: boolean },
) {
  const itemsById = await loadUserFoodItems([userFoodId], options);
  const item = itemsById.get(userFoodId);

  if (!item) {
    throw new Error('The selected custom food could not be loaded.');
  }

  return item;
}

export async function getUserFoodDetailsMap(
  userFoodIds: string[],
  options?: { includeInactive?: boolean },
) {
  return loadUserFoodItems(userFoodIds, options);
}

export async function getRecipeDetails(
  recipeId: string,
  options?: { includeInactive?: boolean },
) {
  const itemsById = await loadRecipeItems([recipeId], options);
  const item = itemsById.get(recipeId);

  if (!item) {
    throw new Error('The selected recipe could not be loaded.');
  }

  return item;
}

export async function searchUserFoods(
  query: string,
  resultLimit = DEFAULT_RESULT_LIMIT,
) {
  const normalizedQuery = normalizeSearchQuery(query);

  if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
    return [] as NutritionCatalogStateItem[];
  }

  const client = assertSupabase();
  const { data, error } = await client
    .from('user_foods')
    .select('id, name, brand_name, description')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rankedRows = (data ?? [])
    .map((row) => ({
      id: row.id,
      score: getSearchScore(normalizedQuery, {
        name: row.name,
        brand: row.brand_name ?? undefined,
        description: row.description ?? undefined,
      }),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, resultLimit);

  const itemsById = await loadUserFoodItems(
    rankedRows.map((row) => row.id),
    { includeInactive: false },
  );

  return rankedRows.flatMap((row) => {
    const item = itemsById.get(row.id);
    return item ? [item] : [];
  });
}

export async function searchOwnedFoodsAndRecipes(
  query: string,
  resultLimit = DEFAULT_RESULT_LIMIT,
) {
  const normalizedQuery = normalizeSearchQuery(query);

  if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
    return [] as NutritionCatalogStateItem[];
  }

  const client = assertSupabase();
  const [{ data: userFoodRows, error: userFoodsError }, { data: recipeRows, error: recipesError }] =
    await Promise.all([
      client
        .from('user_foods')
        .select('id, name, brand_name, description')
        .eq('is_active', true)
        .order('updated_at', { ascending: false }),
      client
        .from('recipes')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false }),
    ]);

  if (userFoodsError) {
    throw userFoodsError;
  }

  if (recipesError) {
    throw recipesError;
  }

  const rankedFoods = (userFoodRows ?? []).map((row) => ({
    kind: 'user_food' as const,
    id: row.id,
    score: getSearchScore(normalizedQuery, {
      name: row.name,
      brand: row.brand_name ?? undefined,
      description: row.description ?? undefined,
    }),
  }));
  const rankedRecipes = (recipeRows ?? []).map((row) => ({
    kind: 'recipe' as const,
    id: row.id,
    score: getSearchScore(normalizedQuery, {
      name: row.name,
      description: row.description ?? undefined,
    }),
  }));
  const rankedItems = [...rankedFoods, ...rankedRecipes]
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, resultLimit);
  const userFoodIds = rankedItems
    .filter((row) => row.kind === 'user_food')
    .map((row) => row.id);
  const recipeIds = rankedItems
    .filter((row) => row.kind === 'recipe')
    .map((row) => row.id);
  const [userFoodDetails, recipeDetails] = await Promise.all([
    loadUserFoodItems(userFoodIds, { includeInactive: false }),
    loadRecipeItems(recipeIds, { includeInactive: false }),
  ]);

  return rankedItems.flatMap((row) => {
    const item =
      row.kind === 'user_food'
        ? userFoodDetails.get(row.id)
        : recipeDetails.get(row.id);
    return item ? [item] : [];
  });
}

export async function saveCustomFoodDefinition(draft: CustomFoodDraft) {
  const client = assertSupabase();
  const nutrientValues = normalizeNutrientValues(draft.nutrientValues);

  REQUIRED_NUTRIENT_CODES.forEach((code) => {
    if (toFiniteNumber(nutrientValues[code]) == null) {
      throw new Error('Calories, protein, carbohydrate, and fat are required.');
    }
  });

  const cleanedServings = draft.servings
    .map((serving, index) => ({
      id: isUuid(serving.id) ? serving.id : undefined,
      serving_name: serving.servingName.trim(),
      quantity: roundToStorageNumber(serving.quantity),
      gram_weight:
        serving.gramWeight == null ? null : roundToStorageNumber(serving.gramWeight),
      milliliter_volume:
        serving.milliliterVolume == null
          ? null
          : roundToStorageNumber(serving.milliliterVolume),
      household_unit: normalizeNullableText(serving.householdUnit) ?? serving.servingName.trim(),
      is_default: serving.isDefault,
      sort_order: index,
    }))
    .filter((serving) => serving.serving_name.length > 0);

  const { data, error } = await client.rpc('save_user_food', {
    food_id: draft.id ?? undefined,
    food_name: draft.name.trim(),
    brand_name: normalizeNullableText(draft.brandName) ?? undefined,
    description: normalizeNullableText(draft.description) ?? undefined,
    base_amount: roundToStorageNumber(draft.baseAmount),
    base_unit: draft.baseUnit,
    nutrient_values: toJsonObject(nutrientValues),
    servings: cleanedServings as unknown as Json,
  });

  if (error) {
    throw error;
  }

  clearUserFoodCache(draft.id);
  return data;
}

export async function archiveCustomFoodDefinition(userFoodId: string) {
  const client = assertSupabase();
  const { error } = await client.rpc('archive_user_food', {
    target_food_id: userFoodId,
  });

  if (error) {
    throw error;
  }

  clearUserFoodCache(userFoodId);
}

export async function loadRecipeDefinition(recipeId: string) {
  const client = assertSupabase();
  const [{ data: recipeRows, error: recipeError }, { data: ingredientRows, error: ingredientsError }] =
    await Promise.all([
      client.from('recipes').select('*').eq('id', recipeId).limit(1),
      client
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

  if (recipeError) {
    throw recipeError;
  }

  if (ingredientsError) {
    throw ingredientsError;
  }

  const recipe = (recipeRows ?? [])[0];

  if (!recipe) {
    throw new Error('The selected recipe could not be loaded.');
  }

  const recipeIngredients = ingredientRows ?? [];
  const catalogFoodIds = recipeIngredients.flatMap((ingredient) =>
    ingredient.catalog_food_id ? [ingredient.catalog_food_id] : [],
  );
  const userFoodIds = recipeIngredients.flatMap((ingredient) =>
    ingredient.user_food_id ? [ingredient.user_food_id] : [],
  );
  const [catalogDetails, userFoodDetails] = await Promise.all([
    import('./catalog').then(({ getCatalogFoodDetailsMap }) =>
      getCatalogFoodDetailsMap(catalogFoodIds),
    ),
    loadUserFoodItems(userFoodIds, { includeInactive: true }),
  ]);
  const ingredients = recipeIngredients.map((ingredient) => {
    const item =
      ingredient.catalog_food_id != null
        ? catalogDetails.get(ingredient.catalog_food_id)
        : ingredient.user_food_id != null
        ? userFoodDetails.get(ingredient.user_food_id)
        : null;

    if (!item) {
      throw new Error('A recipe ingredient could not be loaded.');
    }

    return buildRecipeIngredientDraft(
      resolveRecipeIngredientItem(item, ingredient),
      ingredient.quantity,
      {
        id: ingredient.id,
        position: ingredient.position,
      },
    );
  });

  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description ?? '',
    finalWeightG: recipe.final_weight_g,
    servingCount: recipe.serving_count ?? null,
    ingredients,
    totalNutrientValues: getRecipeDraftTotals(ingredients),
  } satisfies RecipeDraft;
}

export async function saveRecipeDefinition(draft: RecipeDraft) {
  const client = assertSupabase();
  const totalNutrientValues = normalizeNutrientValues(
    draft.totalNutrientValues ?? getRecipeDraftTotals(draft.ingredients),
  );

  REQUIRED_NUTRIENT_CODES.forEach((code) => {
    if (toFiniteNumber(totalNutrientValues[code]) == null) {
      throw new Error('Recipe calories, protein, carbohydrate, and fat totals are required.');
    }
  });

  const ingredients = draft.ingredients.map((ingredient, index) => {
    const recalculatedIngredient = buildRecipeIngredientDraft(
      ingredient.item,
      ingredient.quantity,
      {
        id: ingredient.id,
        position: index,
      },
    );

    return {
      id: isUuid(recalculatedIngredient.id) ? recalculatedIngredient.id : undefined,
      position: index,
      catalog_food_id: recalculatedIngredient.item.catalogFoodId ?? null,
      user_food_id: recalculatedIngredient.item.userFoodId ?? null,
      catalog_serving_id:
        recalculatedIngredient.item.catalogFoodId &&
        isUuid(recalculatedIngredient.item.selectedServingId)
          ? recalculatedIngredient.item.selectedServingId
          : null,
      user_food_serving_id:
        recalculatedIngredient.item.userFoodId &&
        isUuid(recalculatedIngredient.item.selectedServingId)
          ? recalculatedIngredient.item.selectedServingId
          : null,
      serving_label: recalculatedIngredient.item.servingLabel,
      quantity: recalculatedIngredient.quantity,
      effective_grams: recalculatedIngredient.effectiveGrams,
    };
  });

  const { data, error } = await client.rpc('save_recipe', {
    recipe_id: draft.id ?? undefined,
    recipe_name: draft.name.trim(),
    description: normalizeNullableText(draft.description) ?? undefined,
    final_weight_g: roundToStorageNumber(draft.finalWeightG),
    serving_count:
      draft.servingCount == null ? undefined : roundToStorageNumber(draft.servingCount),
    total_nutrients: toJsonObject(totalNutrientValues),
    ingredients: ingredients as unknown as Json,
  });

  if (error) {
    throw error;
  }

  clearRecipeCache(draft.id);
  return data;
}

export async function archiveRecipeDefinition(recipeId: string) {
  const client = assertSupabase();
  const { error } = await client.rpc('archive_recipe', {
    target_recipe_id: recipeId,
  });

  if (error) {
    throw error;
  }

  clearRecipeCache(recipeId);
}
