import type { User } from '@supabase/supabase-js';
import { createNutritionDaysState, nutritionCatalog, nutritionDays } from '../data/nutrition';
import {
  calculateNutritionForServing,
  createLoggedFoodStateItem,
  getCatalogFoodDetails,
  getCatalogFoodDetailsMap,
  resolvePreferredServingSelection,
  withSingleServingOption,
} from './nutrition/catalog';
import { getRecipeDetails, getUserFoodDetails } from './nutrition/user-items';
import { supabase, supabaseConfigError } from './supabase';
import type {
  NutritionCanonicalNutrientCode,
  NutritionCatalogStateItem,
  NutritionDay,
  NutritionDayId,
  NutritionFoodItem,
  NutritionFoodSource,
  NutritionLogEntryKind,
  NutritionLogSource,
  NutritionMealId,
  NutritionNutrientValues,
  NutritionShortcutItem,
} from '../types';
import type { Enums, Json, Tables, TablesInsert, TablesUpdate } from '../types/database.types';

type FoodRow = Tables<'foods'>;
type FoodFavoriteRow = Tables<'food_favorites'>;
type FoodLogRow = Tables<'food_logs'>;
type GoalRow = Tables<'nutrition_goals'>;
type MealType = Enums<'meal_type'>;

interface ShortcutRpcRow {
  reference_key: string;
  entry_type: NutritionLogEntryKind;
  catalog_food_id: string | null;
  food_id: string | null;
  user_food_id: string | null;
  recipe_id: string | null;
  catalog_serving_id: string | null;
  user_food_serving_id: string | null;
  food_name: string | null;
  food_brand: string | null;
  food_source: string;
  serving_label: string | null;
  serving_quantity: number;
  effective_grams: number | null;
  calories_per_serving: number;
  protein_per_serving_g: number;
  carbs_per_serving_g: number;
  fat_per_serving_g: number;
  fiber_per_serving_g: number;
  sodium_mg_per_serving: number;
  last_logged_at: string;
  log_count: number;
  meal_match_count?: number | null;
  history_score?: number | null;
  go_to_score?: number | null;
}

export interface NutritionLoadResult {
  catalog: NutritionCatalogStateItem[];
  days: NutritionDay[];
  userId: string;
}

export interface NutritionPersonalizedSections {
  favorites: NutritionShortcutItem[];
  goTos: NutritionShortcutItem[];
  recents: NutritionShortcutItem[];
}

interface CreateFoodLogInput {
  dayId: NutritionDayId;
  item: NutritionCatalogStateItem;
  loggedFrom: NutritionLogSource;
  mealId: NutritionMealId;
  note?: string;
  servings: number;
  userId: string;
}

interface UpdateFoodLogInput {
  item: NutritionCatalogStateItem;
  logId: string;
  loggedFrom: NutritionLogSource;
  mealId: NutritionMealId;
  note?: string;
  servings: number;
}

const DAY_IDS: NutritionDayId[] = ['yesterday', 'today', 'tomorrow'];
const STORAGE_PRECISION = 4;
const DEFAULT_FAVORITES_LIMIT = 12;
const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_HISTORY_LIMIT = 8;
const DEFAULT_GO_TO_LIMIT = 8;
const SNAPSHOT_NUTRIENT_CODES: NutritionCanonicalNutrientCode[] = [
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

const DAY_OFFSETS: Record<NutritionDayId, number> = {
  yesterday: -1,
  today: 0,
  tomorrow: 1,
};

const MEAL_ID_TO_DB: Record<NutritionMealId, MealType> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snack',
};

const DB_TO_MEAL_ID: Record<MealType, NutritionMealId> = {
  Breakfast: 'breakfast',
  Lunch: 'lunch',
  Dinner: 'dinner',
  Snack: 'snacks',
};

const MEAL_LOG_HOURS: Record<NutritionMealId, number> = {
  breakfast: 8,
  lunch: 12,
  dinner: 18,
  snacks: 20,
};

const REQUIRED_LOG_NUTRIENTS: NutritionCanonicalNutrientCode[] = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'fat',
  'fiber',
  'sodium',
];

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

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDateForDayId(dayId: NutritionDayId, baseDate = new Date()) {
  const targetDate = new Date(baseDate);
  targetDate.setHours(0, 0, 0, 0);
  targetDate.setDate(targetDate.getDate() + DAY_OFFSETS[dayId]);
  return targetDate;
}

function getGoalDateForDayId(dayId: NutritionDayId, baseDate = new Date()) {
  return formatLocalDate(getDateForDayId(dayId, baseDate));
}

function getLogTimestampForDay(dayId: NutritionDayId, mealId: NutritionMealId) {
  const targetDate = getDateForDayId(dayId);
  targetDate.setHours(MEAL_LOG_HOURS[mealId], 0, 0, 0);
  return targetDate.toISOString();
}

function getNutritionWindow() {
  const yesterday = getDateForDayId('yesterday');
  const dayAfterTomorrow = getDateForDayId('tomorrow');
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  return {
    startIso: yesterday.toISOString(),
    endIso: dayAfterTomorrow.toISOString(),
  };
}

function normalizeFoodSource(source: string | null | undefined): NutritionFoodSource {
  if (
    source === 'usda' ||
    source === 'branded' ||
    source === 'nutritionix' ||
    source === 'saved' ||
    source === 'recipe' ||
    source === 'custom'
  ) {
    return source;
  }

  return 'usda';
}

function normalizeLoggedFrom(source: string | null | undefined): NutritionLogSource {
  if (
    source === 'search' ||
    source === 'barcode' ||
    source === 'saved' ||
    source === 'recipe' ||
    source === 'suggested'
  ) {
    return source;
  }

  return 'search';
}

function resolveLogEntryKind({
  catalogFoodId,
  foodId,
  recipeId,
  userFoodId,
  value,
}: {
  catalogFoodId?: string | null;
  foodId?: string | null;
  recipeId?: string | null;
  userFoodId?: string | null;
  value?: string | null;
}): NutritionLogEntryKind {
  if (
    value === 'legacy' ||
    value === 'catalog' ||
    value === 'user_food' ||
    value === 'recipe'
  ) {
    return value;
  }

  if (recipeId) {
    return 'recipe';
  }

  if (userFoodId) {
    return 'user_food';
  }

  if (catalogFoodId) {
    return 'catalog';
  }

  if (foodId) {
    return 'legacy';
  }

  return 'legacy';
}

function isUuid(value: string | null | undefined) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function normalizeSnapshotNutrients(value: Json | null | undefined) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return {} satisfies NutritionNutrientValues;
  }

  const nutrients: NutritionNutrientValues = {};

  SNAPSHOT_NUTRIENT_CODES.forEach((code) => {
    const numericValue = toFiniteNumber(value[code]);

    if (numericValue == null) {
      return;
    }

    nutrients[code] = roundToStorageNumber(numericValue);
  });

  return nutrients;
}

function buildPerServingNutrientValues(
  totalNutrients: NutritionNutrientValues,
  servingQuantity: number,
  row: Pick<
    FoodLogRow,
    | 'calories_per_serving'
    | 'protein_per_serving_g'
    | 'carbs_per_serving_g'
    | 'fat_per_serving_g'
    | 'fiber_per_serving_g'
    | 'sodium_mg_per_serving'
  >,
) {
  const perServingValues: NutritionNutrientValues = {};

  SNAPSHOT_NUTRIENT_CODES.forEach((code) => {
    const totalValue = toFiniteNumber(totalNutrients[code]);

    if (totalValue == null) {
      return;
    }

    perServingValues[code] = roundToStorageNumber(totalValue / servingQuantity);
  });

  perServingValues.energy_kcal =
    perServingValues.energy_kcal ?? roundToStorageNumber(row.calories_per_serving);
  perServingValues.protein =
    perServingValues.protein ?? roundToStorageNumber(row.protein_per_serving_g);
  perServingValues.carbohydrate =
    perServingValues.carbohydrate ?? roundToStorageNumber(row.carbs_per_serving_g);
  perServingValues.fat =
    perServingValues.fat ?? roundToStorageNumber(row.fat_per_serving_g);
  perServingValues.fiber =
    perServingValues.fiber ?? roundToStorageNumber(row.fiber_per_serving_g);
  perServingValues.sodium =
    perServingValues.sodium ?? roundToStorageNumber(row.sodium_mg_per_serving);

  return perServingValues;
}

export function createFavoriteConfigKey(
  catalogFoodId: string,
  catalogServingId: string | null | undefined,
  servingQuantity: number,
) {
  return [
    catalogFoodId,
    catalogServingId ?? 'default-serving',
    roundToStorageNumber(servingQuantity).toFixed(STORAGE_PRECISION),
  ].join('::');
}

function createShortcutSnapshotItem(
  row: Pick<
    ShortcutRpcRow,
    | 'reference_key'
    | 'catalog_food_id'
    | 'food_id'
    | 'user_food_id'
    | 'recipe_id'
    | 'catalog_serving_id'
    | 'user_food_serving_id'
    | 'food_name'
    | 'food_brand'
    | 'food_source'
    | 'serving_label'
    | 'serving_quantity'
    | 'effective_grams'
    | 'calories_per_serving'
    | 'protein_per_serving_g'
    | 'carbs_per_serving_g'
    | 'fat_per_serving_g'
    | 'fiber_per_serving_g'
    | 'sodium_mg_per_serving'
  >,
) {
  const servingQuantity = toFiniteNumber(row.serving_quantity) ?? 1;
  const perServingGramWeight =
    row.effective_grams != null && servingQuantity > 0
      ? roundToStorageNumber(row.effective_grams / servingQuantity)
      : null;

  return withSingleServingOption(
    {
      id:
        row.recipe_id ??
        row.user_food_id ??
        row.catalog_food_id ??
        row.food_id ??
        row.reference_key,
      name: row.food_name ?? 'Unknown Food',
      brand: row.food_brand ?? undefined,
      servingLabel: row.serving_label ?? '1 serving',
      caloriesPerServing: row.calories_per_serving,
      proteinPerServing: row.protein_per_serving_g,
      carbsPerServing: row.carbs_per_serving_g,
      fatsPerServing: row.fat_per_serving_g,
      fiberPerServing: row.fiber_per_serving_g,
      sodiumMgPerServing: row.sodium_mg_per_serving,
      defaultServings: servingQuantity,
      source: normalizeFoodSource(row.food_source),
      keywords: [],
    },
    {
      catalogFoodId: row.catalog_food_id ?? undefined,
      databaseId:
        row.catalog_food_id || row.user_food_id || row.recipe_id
          ? undefined
          : row.food_id ?? undefined,
      userFoodId: row.user_food_id ?? undefined,
      userFoodServingId: row.user_food_serving_id ?? undefined,
      recipeId: row.recipe_id ?? undefined,
      gramWeight: perServingGramWeight,
      selectedServingId:
        row.catalog_serving_id ??
        row.user_food_serving_id ??
        `${row.recipe_id ?? row.user_food_id ?? row.catalog_food_id ?? row.food_id ?? row.reference_key}-shortcut-serving`,
      nutrientValues: {
        energy_kcal: row.calories_per_serving,
        protein: row.protein_per_serving_g,
        carbohydrate: row.carbs_per_serving_g,
        fat: row.fat_per_serving_g,
        fiber: row.fiber_per_serving_g,
        sodium: row.sodium_mg_per_serving,
      },
      effectiveGrams: perServingGramWeight,
    },
  );
}

function mapShortcutRowToItem(
  row: ShortcutRpcRow,
  kind: NutritionShortcutItem['kind'],
): NutritionShortcutItem {
  return {
    id: row.reference_key,
    kind,
    item: createShortcutSnapshotItem(row),
    entryType: resolveLogEntryKind({
      value: row.entry_type,
      catalogFoodId: row.catalog_food_id,
      foodId: row.food_id,
      userFoodId: row.user_food_id,
      recipeId: row.recipe_id,
    }),
    lastLoggedAt: row.last_logged_at,
    logCount: row.log_count,
    mealMatchCount:
      row.meal_match_count == null ? undefined : row.meal_match_count,
    score: row.history_score ?? row.go_to_score ?? undefined,
  };
}

function mapFoodRowToCatalogItem(row: FoodRow): NutritionCatalogStateItem {
  return withSingleServingOption(
    {
      id: row.slug ?? row.id,
      name: row.name,
      brand: row.brand ?? undefined,
      servingLabel: row.serving_label,
      caloriesPerServing: row.calories,
      proteinPerServing: row.protein_g,
      carbsPerServing: row.carbs_g,
      fatsPerServing: row.fat_g,
      fiberPerServing: row.fiber_g,
      sodiumMgPerServing: row.sodium_mg,
      defaultServings: row.default_servings,
      source: normalizeFoodSource(row.source),
      keywords: row.keywords,
      suggestedMealIds: row.suggested_meal_ids as NutritionMealId[],
    },
    {
      databaseId: row.id,
      gramWeight: row.serving_grams,
    },
  );
}

function mapFoodLogRowToItem(
  row: FoodLogRow,
  catalogByDatabaseId: Map<string, NutritionCatalogStateItem>,
): NutritionFoodItem {
  const catalogItem = row.food_id ? catalogByDatabaseId.get(row.food_id) : undefined;
  const servingQuantity = toFiniteNumber(row.serving_quantity) ?? row.servings;
  const totalNutrients = normalizeSnapshotNutrients(row.nutrients_snapshot);
  const perServingNutrientValues = buildPerServingNutrientValues(
    totalNutrients,
    servingQuantity > 0 ? servingQuantity : 1,
    row,
  );

  return {
    id: row.id,
    catalogItemId:
      row.recipe_id ??
      row.user_food_id ??
      row.catalog_food_id ??
      catalogItem?.catalogFoodId ??
      catalogItem?.id ??
      row.food_id ??
      row.id,
    entryType: resolveLogEntryKind({
      catalogFoodId: row.catalog_food_id,
      foodId: row.food_id,
      userFoodId: row.user_food_id,
      recipeId: row.recipe_id,
    }),
    legacyFoodId: row.food_id ?? null,
    catalogFoodId: row.catalog_food_id ?? null,
    catalogServingId: row.catalog_serving_id ?? null,
    userFoodId: row.user_food_id ?? null,
    userFoodServingId: row.user_food_serving_id ?? null,
    recipeId: row.recipe_id ?? null,
    selectedServingId: row.catalog_serving_id ?? row.user_food_serving_id ?? undefined,
    name: row.food_name ?? catalogItem?.name ?? 'Unknown Food',
    brand: row.food_brand ?? catalogItem?.brand,
    servingLabel: row.serving_label ?? catalogItem?.servingLabel ?? '1 serving',
    caloriesPerServing: row.calories_per_serving,
    proteinPerServing: row.protein_per_serving_g,
    carbsPerServing: row.carbs_per_serving_g,
    fatsPerServing: row.fat_per_serving_g,
    fiberPerServing: row.fiber_per_serving_g,
    sodiumMgPerServing: row.sodium_mg_per_serving,
    source: normalizeFoodSource(row.food_source),
    loggedFrom: normalizeLoggedFrom(row.logged_from),
    servings: servingQuantity,
    servingQuantity,
    effectiveGrams: row.effective_grams,
    nutrientValues: perServingNutrientValues,
  };
}

function ensureCatalogItemServingOptions(
  item: NutritionCatalogStateItem,
): NutritionCatalogStateItem {
  if (item.servingOptions?.length) {
    return item;
  }

  return withSingleServingOption(item);
}

function ensureCatalogServingOptions(items: NutritionCatalogStateItem[]) {
  return items.map(ensureCatalogItemServingOptions);
}

function buildEmptyRemoteDays(): NutritionDay[] {
  return createNutritionDaysState().map((day) => ({
    ...day,
    meals: day.meals.map((meal) => ({
      ...meal,
      items: [] as NutritionFoodItem[],
    })),
  }));
}

function buildFoodLogSnapshotFields(
  item: NutritionCatalogStateItem,
  servings: number,
): Pick<
  TablesInsert<'food_logs'>,
  | 'catalog_serving_id'
  | 'user_food_serving_id'
  | 'servings'
  | 'serving_quantity'
  | 'effective_grams'
  | 'calories'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g'
  | 'fiber_g'
  | 'food_name'
  | 'food_brand'
  | 'serving_label'
  | 'food_source'
  | 'calories_per_serving'
  | 'protein_per_serving_g'
  | 'carbs_per_serving_g'
  | 'fat_per_serving_g'
  | 'fiber_per_serving_g'
  | 'sodium_mg_per_serving'
  | 'nutrients_snapshot'
> {
  const calculation = calculateNutritionForServing(
    item,
    item.selectedServingId,
    servings,
  );

  if (!calculation) {
    throw new Error('The selected serving cannot be converted safely.');
  }

  if (
    (item.catalogFoodId || item.userFoodId || item.recipeId) &&
    REQUIRED_LOG_NUTRIENTS.some(
      (code) => calculation.nutrientValuesPerServing[code] == null,
    )
  ) {
    throw new Error('This food is missing the nutrient data required for logging.');
  }

  return {
    catalog_serving_id:
      item.catalogFoodId && isUuid(calculation.selectedServing.id)
        ? calculation.selectedServing.id
        : null,
    user_food_serving_id:
      item.userFoodId && isUuid(calculation.selectedServing.id)
        ? calculation.selectedServing.id
        : null,
    servings: calculation.quantity,
    serving_quantity: calculation.quantity,
    effective_grams: calculation.effectiveGrams,
    calories: calculation.calories,
    protein_g: calculation.protein,
    carbs_g: calculation.carbs,
    fat_g: calculation.fats,
    fiber_g: calculation.fiber ?? 0,
    food_name: item.name,
    food_brand: item.brand ?? null,
    serving_label: calculation.selectedServing.label,
    food_source: item.source,
    calories_per_serving: calculation.caloriesPerServing,
    protein_per_serving_g: calculation.proteinPerServing,
    carbs_per_serving_g: calculation.carbsPerServing,
    fat_per_serving_g: calculation.fatsPerServing,
    fiber_per_serving_g: calculation.fiberPerServing ?? 0,
    sodium_mg_per_serving: calculation.sodiumMgPerServing ?? 0,
    nutrients_snapshot: calculation.nutrientTotals as Json,
  };
}

function buildDaysFromRemoteState(
  catalog: NutritionCatalogStateItem[],
  goals: GoalRow[],
  logs: FoodLogRow[],
) {
  const days = buildEmptyRemoteDays();
  const dayById = new Map(days.map((day) => [day.id, day]));
  const goalDateToDayId = new Map(
    DAY_IDS.map((dayId) => [getGoalDateForDayId(dayId), dayId]),
  );
  const catalogByDatabaseId = new Map(
    catalog
      .filter((item) => item.databaseId)
      .map((item) => [item.databaseId!, item]),
  );

  goals.forEach((goal) => {
    const dayId = goalDateToDayId.get(goal.goal_date);

    if (!dayId) {
      return;
    }

    const day = dayById.get(dayId);

    if (!day) {
      return;
    }

    day.baseGoal = goal.calories_target;
    day.exerciseCalories = goal.exercise_calories;
    day.hydrationLiters = goal.hydration_consumed_liters;
    day.hydrationGoalLiters = goal.hydration_target_ml / 1000;
    day.macroGoals = {
      protein: goal.protein_target_g,
      carbs: goal.carbs_target_g,
      fats: goal.fat_target_g,
    };
  });

  logs.forEach((log) => {
    const dayId = goalDateToDayId.get(formatLocalDate(new Date(log.logged_at)));

    if (!dayId) {
      return;
    }

    const day = dayById.get(dayId);

    if (!day) {
      return;
    }

    const mealId = DB_TO_MEAL_ID[log.meal];
    const meal = day.meals.find((currentMeal) => currentMeal.id === mealId);

    if (!meal) {
      return;
    }

    meal.items.push(mapFoodLogRowToItem(log, catalogByDatabaseId));
  });

  return days;
}

async function fetchCatalog() {
  const client = assertSupabase();
  const { data, error } = await client
    .from('foods')
    .select('*')
    .not('slug', 'is', null)
    .order('name');

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFoodRowToCatalogItem);
}

async function bootstrapUserNutritionState(
  userId: User['id'],
  catalog: NutritionCatalogStateItem[],
) {
  const client = assertSupabase();
  const goalDates = DAY_IDS.map((dayId) => getGoalDateForDayId(dayId));

  const { data: existingGoals, error: goalsError } = await client
    .from('nutrition_goals')
    .select('goal_date')
    .eq('user_id', userId)
    .in('goal_date', goalDates);

  if (goalsError) {
    throw goalsError;
  }

  const existingGoalDates = new Set((existingGoals ?? []).map((goal) => goal.goal_date));
  const missingDayTemplates = nutritionDays.filter(
    (day) => !existingGoalDates.has(getGoalDateForDayId(day.id)),
  );

  if (missingDayTemplates.length === 0) {
    return;
  }

  const goalInserts: TablesInsert<'nutrition_goals'>[] = missingDayTemplates.map((day) => ({
    user_id: userId,
    goal_date: getGoalDateForDayId(day.id),
    calories_target: day.baseGoal,
    protein_target_g: day.macroGoals.protein,
    carbs_target_g: day.macroGoals.carbs,
    fat_target_g: day.macroGoals.fats,
    hydration_target_ml: Math.round(day.hydrationGoalLiters * 1000),
    hydration_consumed_liters: day.hydrationLiters,
    exercise_calories: day.exerciseCalories,
  }));

  const { error: insertGoalsError } = await client
    .from('nutrition_goals')
    .insert(goalInserts);

  if (insertGoalsError) {
    throw insertGoalsError;
  }

  const catalogBySlug = new Map(catalog.map((item) => [item.id, item]));

  const foodLogInserts = missingDayTemplates.flatMap((day) =>
    day.meals.flatMap((meal) =>
      meal.items.flatMap((item) => {
        const catalogItem = catalogBySlug.get(item.catalogItemId);

        if (!catalogItem?.databaseId) {
          return [];
        }

        return [
          {
            user_id: userId,
            food_id: catalogItem.databaseId,
            catalog_food_id: null,
            meal: MEAL_ID_TO_DB[meal.id],
            note: null,
            logged_at: getLogTimestampForDay(day.id, meal.id),
            logged_from: item.loggedFrom,
            ...buildFoodLogSnapshotFields(
              createLoggedFoodStateItem(item),
              item.servingQuantity,
            ),
          } satisfies TablesInsert<'food_logs'>,
        ];
      }),
    ),
  );

  if (foodLogInserts.length === 0) {
    return;
  }

  const { error: logsError } = await client.from('food_logs').insert(foodLogInserts);

  if (logsError) {
    throw logsError;
  }
}

async function fetchGoalsAndLogs(userId: User['id']) {
  const client = assertSupabase();
  const goalDates = DAY_IDS.map((dayId) => getGoalDateForDayId(dayId));
  const { startIso, endIso } = getNutritionWindow();

  const [{ data: goals, error: goalsError }, { data: logs, error: logsError }] =
    await Promise.all([
      client
        .from('nutrition_goals')
        .select('*')
        .eq('user_id', userId)
        .in('goal_date', goalDates),
      client
        .from('food_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startIso)
        .lt('logged_at', endIso)
        .order('logged_at'),
    ]);

  if (goalsError) {
    throw goalsError;
  }

  if (logsError) {
    throw logsError;
  }

  return {
    goals: goals ?? [],
    logs: logs ?? [],
  };
}

async function findExistingFavorite(
  catalogFoodId: string,
  catalogServingId: string | null,
  servingQuantity: number,
) {
  const client = assertSupabase();
  let query = client
    .from('food_favorites')
    .select('*')
    .eq('catalog_food_id', catalogFoodId)
    .eq('serving_quantity', roundToStorageNumber(servingQuantity))
    .limit(1);

  query = catalogServingId
    ? query.eq('catalog_serving_id', catalogServingId)
    : query.is('catalog_serving_id', null);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? [])[0] ?? null;
}

async function getNextFavoriteSortOrder() {
  const client = assertSupabase();
  const { data, error } = await client
    .from('food_favorites')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0]?.sort_order ?? -1) + 1;
}

function mapFavoriteRowToShortcut(
  row: FoodFavoriteRow,
  detail: NutritionCatalogStateItem,
): NutritionShortcutItem {
  const resolvedItem = resolvePreferredServingSelection(detail, row.catalog_serving_id);
  const defaultServings = roundToStorageNumber(row.serving_quantity);
  const selectedServingId =
    resolvedItem.selectedServingId ?? row.catalog_serving_id ?? undefined;

  return {
    id: row.id,
    kind: 'favorite',
    favoriteId: row.id,
    favoriteConfigKey: createFavoriteConfigKey(
      row.catalog_food_id,
      selectedServingId,
      defaultServings,
    ),
    entryType: 'catalog',
    item: {
      ...resolvedItem,
      name: row.display_name ?? resolvedItem.name,
      defaultServings,
    },
  };
}

async function runShortcutRpc<TRow extends ShortcutRpcRow>(
  functionName: 'get_recent_foods' | 'search_food_history' | 'get_food_go_tos',
  args: Record<string, unknown>,
) {
  const client = assertSupabase();
  const { data, error } = await client.rpc(functionName, args);

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown) as TRow[];
}

export async function ensureNutritionUser() {
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

export async function loadNutritionState(): Promise<NutritionLoadResult> {
  const user = await ensureNutritionUser();
  const remoteCatalog = await fetchCatalog();
  const catalog = ensureCatalogServingOptions(
    remoteCatalog.length > 0 ? remoteCatalog : nutritionCatalog,
  );

  if (remoteCatalog.length > 0) {
    await bootstrapUserNutritionState(user.id, remoteCatalog);
  }

  const { goals, logs } = await fetchGoalsAndLogs(user.id);

  return {
    userId: user.id,
    catalog,
    days: buildDaysFromRemoteState(catalog, goals, logs),
  };
}

export async function createRemoteFoodLog({
  dayId,
  item,
  loggedFrom,
  mealId,
  note,
  servings,
  userId,
}: CreateFoodLogInput) {
  const client = assertSupabase();

  if (!item.databaseId && !item.catalogFoodId && !item.userFoodId && !item.recipeId) {
    throw new Error('This food is not available in the Nutrition database yet.');
  }

  const payload: TablesInsert<'food_logs'> = {
    user_id: userId,
    food_id: item.databaseId ?? null,
    catalog_food_id: item.catalogFoodId ?? null,
    user_food_id: item.userFoodId ?? null,
    recipe_id: item.recipeId ?? null,
    meal: MEAL_ID_TO_DB[mealId],
    note: note ?? null,
    logged_at:
      dayId === 'today' ? new Date().toISOString() : getLogTimestampForDay(dayId, mealId),
    logged_from: loggedFrom,
    ...buildFoodLogSnapshotFields(item, servings),
  };

  const { data, error } = await client
    .from('food_logs')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapFoodLogRowToItem(
    data,
    item.databaseId ? new Map([[item.databaseId, item]]) : new Map(),
  );
}

export async function updateRemoteFoodLog({
  item,
  logId,
  loggedFrom,
  mealId,
  note,
  servings,
}: UpdateFoodLogInput) {
  const client = assertSupabase();
  const payload: TablesUpdate<'food_logs'> = {
    meal: MEAL_ID_TO_DB[mealId],
    note: note ?? null,
    logged_from: loggedFrom,
    ...buildFoodLogSnapshotFields(item, servings),
  };

  const { data, error } = await client
    .from('food_logs')
    .update(payload)
    .eq('id', logId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateRemoteFoodLogServings(
  item: NutritionFoodItem,
  servings: number,
) {
  const client = assertSupabase();
  const payload: TablesUpdate<'food_logs'> = {
    logged_from: item.loggedFrom,
    ...buildFoodLogSnapshotFields(createLoggedFoodStateItem(item), servings),
  };
  const { error } = await client.from('food_logs').update(payload).eq('id', item.id);

  if (error) {
    throw error;
  }
}

export async function deleteRemoteFoodLog(logId: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('food_logs')
    .delete()
    .eq('id', logId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error('The logged food could not be removed.');
  }
}

export async function updateRemoteHydration(
  userId: User['id'],
  dayId: NutritionDayId,
  hydrationLiters: number,
) {
  const client = assertSupabase();
  const goalDate = getGoalDateForDayId(dayId);
  const templateDay = nutritionDays.find((day) => day.id === dayId);

  const { error } = await client.from('nutrition_goals').upsert(
    {
      user_id: userId,
      goal_date: goalDate,
      calories_target: templateDay?.baseGoal ?? 1600,
      protein_target_g: templateDay?.macroGoals.protein ?? 160,
      carbs_target_g: templateDay?.macroGoals.carbs ?? 160,
      fat_target_g: templateDay?.macroGoals.fats ?? 60,
      hydration_target_ml: Math.round((templateDay?.hydrationGoalLiters ?? 3.5) * 1000),
      hydration_consumed_liters: hydrationLiters,
      exercise_calories: templateDay?.exerciseCalories ?? 0,
    },
    { onConflict: 'user_id,goal_date' },
  );

  if (error) {
    throw error;
  }
}

export async function addFoodFavorite(
  item: NutritionCatalogStateItem,
  servings: number,
) {
  await ensureNutritionUser();

  if (!item.catalogFoodId) {
    throw new Error('Only catalog foods can be favorited right now.');
  }

  const calculation = calculateNutritionForServing(
    item,
    item.selectedServingId,
    servings,
  );

  if (!calculation) {
    throw new Error(
      'The selected serving cannot be converted to the catalog base unit safely.',
    );
  }

  const catalogServingId =
    isUuid(calculation.selectedServing.id) ? calculation.selectedServing.id : null;
  const servingQuantity = roundToStorageNumber(calculation.quantity);
  const existingFavorite = await findExistingFavorite(
    item.catalogFoodId,
    catalogServingId,
    servingQuantity,
  );

  if (existingFavorite) {
    return {
      favoriteId: existingFavorite.id,
      favoriteConfigKey: createFavoriteConfigKey(
        existingFavorite.catalog_food_id,
        existingFavorite.catalog_serving_id,
        existingFavorite.serving_quantity,
      ),
    };
  }

  const client = assertSupabase();
  const user = await ensureNutritionUser();
  const nextSortOrder = await getNextFavoriteSortOrder();
  const payload: TablesInsert<'food_favorites'> = {
    user_id: user.id,
    catalog_food_id: item.catalogFoodId,
    catalog_serving_id: catalogServingId,
    serving_label: calculation.selectedServing.label,
    serving_quantity: servingQuantity,
    effective_grams: calculation.effectiveGrams,
    display_name: null,
    sort_order: nextSortOrder,
  };

  const { data, error } = await client
    .from('food_favorites')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    favoriteId: data.id,
    favoriteConfigKey: createFavoriteConfigKey(
      data.catalog_food_id,
      data.catalog_serving_id,
      data.serving_quantity,
    ),
  };
}

export async function removeFoodFavorite(favoriteId: string) {
  await ensureNutritionUser();
  const client = assertSupabase();
  const { error } = await client.from('food_favorites').delete().eq('id', favoriteId);

  if (error) {
    throw error;
  }
}

export async function getFavoriteFoods(limit = DEFAULT_FAVORITES_LIMIT) {
  await ensureNutritionUser();
  const client = assertSupabase();
  const { data, error } = await client
    .from('food_favorites')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const favoriteRows = (data ?? []) as FoodFavoriteRow[];
  const detailsByFoodId = await getCatalogFoodDetailsMap(
    favoriteRows.map((row) => row.catalog_food_id),
  );

  return favoriteRows.flatMap((row) => {
    const detail = detailsByFoodId.get(row.catalog_food_id);
    return detail ? [mapFavoriteRowToShortcut(row, detail)] : [];
  });
}

export async function getRecentFoods(limit = DEFAULT_RECENT_LIMIT) {
  await ensureNutritionUser();
  const rows = await runShortcutRpc<ShortcutRpcRow>('get_recent_foods', {
    result_limit: limit,
  });

  return rows.map((row) => mapShortcutRowToItem(row, 'recent'));
}

export async function searchFoodHistory(
  query: string,
  limit = DEFAULT_HISTORY_LIMIT,
) {
  await ensureNutritionUser();

  if (query.trim().length < 2) {
    return [] as NutritionShortcutItem[];
  }

  const rows = await runShortcutRpc<ShortcutRpcRow>('search_food_history', {
    search_query: query,
    result_limit: limit,
  });

  return rows.map((row) => mapShortcutRowToItem(row, 'history'));
}

export async function getFoodGoTos(
  mealId: NutritionMealId,
  limit = DEFAULT_GO_TO_LIMIT,
) {
  await ensureNutritionUser();
  const rows = await runShortcutRpc<ShortcutRpcRow>('get_food_go_tos', {
    meal_context: MEAL_ID_TO_DB[mealId],
    result_limit: limit,
  });

  return rows.map((row) => mapShortcutRowToItem(row, 'go_to'));
}

export async function loadPersonalizedFoodSections(
  mealId: NutritionMealId,
): Promise<NutritionPersonalizedSections> {
  const [favorites, goTos, recents] = await Promise.all([
    getFavoriteFoods(),
    getFoodGoTos(mealId),
    getRecentFoods(),
  ]);

  return {
    favorites,
    goTos,
    recents,
  };
}

export async function resolveShortcutForLogging(shortcut: NutritionShortcutItem) {
  if (shortcut.entryType === 'legacy') {
    return shortcut.item;
  }

  if (shortcut.entryType === 'catalog' && shortcut.item.catalogFoodId) {
    const detail = await getCatalogFoodDetails(shortcut.item.catalogFoodId);
    const preferredItem = resolvePreferredServingSelection(
      detail,
      shortcut.item.selectedServingId,
    );

    return {
      ...preferredItem,
      defaultServings: shortcut.item.defaultServings,
    };
  }

  if (shortcut.entryType === 'user_food' && shortcut.item.userFoodId) {
    const detail = await getUserFoodDetails(shortcut.item.userFoodId);
    const preferredItem = resolvePreferredServingSelection(
      detail,
      shortcut.item.selectedServingId,
    );

    return {
      ...preferredItem,
      defaultServings: shortcut.item.defaultServings,
    };
  }

  if (shortcut.entryType === 'recipe' && shortcut.item.recipeId) {
    const detail = await getRecipeDetails(shortcut.item.recipeId);
    const exactMatch = shortcut.item.selectedServingId
      ? detail.servingOptions?.find(
          (serving) => serving.id === shortcut.item.selectedServingId,
        )
      : undefined;
    const labelMatch = detail.servingOptions?.find(
      (serving) =>
        serving.label.trim().toLowerCase() ===
        shortcut.item.servingLabel.trim().toLowerCase(),
    );
    const preferredItem = resolvePreferredServingSelection(
      detail,
      exactMatch?.id ?? labelMatch?.id ?? detail.selectedServingId,
    );

    return {
      ...preferredItem,
      defaultServings: shortcut.item.defaultServings,
    };
  }

  return {
    ...shortcut.item,
  };
}
