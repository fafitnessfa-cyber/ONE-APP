import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const TEST_DATE = 'Sunday, August 9, 2026';
const TEST_TIMESTAMP = '2026-08-09T09:00:00.000Z';

const CUSTOM_FOOD_NAME = 'Test Protein Shake';
const RECIPE_NAME = 'Test Chicken Rice';
const LEGACY_FOOD_NAME = 'Test Legacy Delete Fixture';
const DELETE_FIXTURE_NOTE = 'delete-fixture';

const RECIPE_FIXTURE_NAMES = {
  chicken:
    'Chicken breast, baked, broiled, or roasted, skin not eaten, from raw',
  rice: 'Rice, white, cooked, no added fat',
  oliveOil: 'Olive oil',
};

const REQUIRED_CODES = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'fat',
  'fiber',
  'sodium',
];

function assertEnv() {
  const missing = [
    ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
    ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', SUPABASE_PUBLISHABLE_KEY],
    ['SUPABASE_DB_URL', SUPABASE_DB_URL],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map(([name]) => name).join(', ')}`,
    );
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual, expected, message, epsilon = 0.0001) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}. Expected ${expected}, received ${actual}`);
  }
}

function round4(value) {
  return Number(Number(value).toFixed(4));
}

function calculateScaledTotals(values, ratio) {
  const scaled = {};

  for (const [code, amount] of Object.entries(values)) {
    if (amount == null) {
      continue;
    }

    scaled[code] = round4(Number(amount) * ratio);
  }

  return scaled;
}

function addNutrientTotals(left, right) {
  const total = { ...left };

  for (const [code, amount] of Object.entries(right)) {
    total[code] = round4((total[code] ?? 0) + Number(amount));
  }

  return total;
}

function canonicalSnapshot(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([code]) => REQUIRED_CODES.includes(code) || values[code] != null),
  );
}

async function createAnonSession(label) {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw new Error(`${label}: anonymous sign-in failed: ${error.message}`);
  }

  assertCondition(data.user?.id, `${label}: missing user id`);

  return {
    client,
    userId: data.user.id,
  };
}

async function createPgClient() {
  const client = new PgClient({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function loadCatalogFixture(pgClient, name) {
  const foodResult = await pgClient.query(
    `
      select id, name, brand_name, base_amount, base_unit
      from public.catalog_foods
      where name = $1
      limit 1
    `,
    [name],
  );
  const food = foodResult.rows[0];
  assertCondition(food, `Catalog food not found: ${name}`);

  const servingResult = await pgClient.query(
    `
      select id, serving_name, quantity, gram_weight
      from public.food_servings
      where food_id = $1
        and serving_name = '100 g'
      limit 1
    `,
    [food.id],
  );
  const serving = servingResult.rows[0];
  assertCondition(serving, `100 g serving missing for ${name}`);

  const nutrientResult = await pgClient.query(
    `
      select n.code, fn.amount
      from public.food_nutrients fn
      join public.nutrients n
        on n.id = fn.nutrient_id
      where fn.food_id = $1
        and n.code = any($2::text[])
    `,
    [food.id, REQUIRED_CODES],
  );

  const nutrientValues = Object.fromEntries(
    nutrientResult.rows.map((row) => [row.code, Number(row.amount)]),
  );

  return {
    id: food.id,
    name: food.name,
    brandName: food.brand_name,
    servingId: serving.id,
    servingLabel: serving.serving_name,
    servingQuantity: Number(serving.quantity),
    gramWeight: Number(serving.gram_weight),
    nutrientValues,
  };
}

async function createLegacyFoodFixture(pgClient, userId) {
  const result = await pgClient.query(
    `
      insert into public.foods (
        name,
        brand,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        fiber_g,
        sodium_mg,
        serving_label,
        serving_grams,
        default_servings,
        source,
        is_public,
        created_by,
        keywords,
        suggested_meal_ids,
        featured_in_barcode_preview
      )
      values (
        $1,
        'Fixture',
        111,
        10,
        8,
        3,
        1,
        90,
        '1 serving',
        75,
        1,
        'saved',
        false,
        $2,
        '{}'::text[],
        '{}'::text[],
        false
      )
      returning id, name, brand, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, serving_label, serving_grams
    `,
    [LEGACY_FOOD_NAME, userId],
  );

  return result.rows[0];
}

async function deleteFoodLogStrict(client, logId) {
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
    throw new Error(`Delete failed for log ${logId}`);
  }
}

async function cleanupPublicData(pgClient, userIds) {
  await pgClient.query(`delete from public.food_logs where user_id = any($1::uuid[])`, [userIds]);
  await pgClient.query(`delete from public.food_favorites where user_id = any($1::uuid[])`, [userIds]);
  await pgClient.query(`delete from public.recipe_ingredients where recipe_id in (select id from public.recipes where user_id = any($1::uuid[]))`, [userIds]);
  await pgClient.query(`delete from public.recipes where user_id = any($1::uuid[])`, [userIds]);
  await pgClient.query(`delete from public.user_food_nutrients where user_food_id in (select id from public.user_foods where user_id = any($1::uuid[]))`, [userIds]);
  await pgClient.query(`delete from public.user_food_servings where user_food_id in (select id from public.user_foods where user_id = any($1::uuid[]))`, [userIds]);
  await pgClient.query(`delete from public.user_foods where user_id = any($1::uuid[])`, [userIds]);
  await pgClient.query(`delete from public.nutrition_goals where user_id = any($1::uuid[])`, [userIds]);
  await pgClient.query(`delete from public.foods where created_by = any($1::uuid[]) or name = $2`, [userIds, LEGACY_FOOD_NAME]);
}

async function ensureUserBCannotMutate(clientB, userFoodId, recipeId) {
  const { data: userFoodRows, error: userFoodReadError } = await clientB
    .from('user_foods')
    .select('id')
    .eq('id', userFoodId);

  if (userFoodReadError) {
    throw userFoodReadError;
  }

  assertCondition((userFoodRows ?? []).length === 0, 'User B should not read user A custom foods');

  const { data: recipeRows, error: recipeReadError } = await clientB
    .from('recipes')
    .select('id')
    .eq('id', recipeId);

  if (recipeReadError) {
    throw recipeReadError;
  }

  assertCondition((recipeRows ?? []).length === 0, 'User B should not read user A recipes');

  const { data: ingredientRows, error: ingredientReadError } = await clientB
    .from('recipe_ingredients')
    .select('id')
    .eq('recipe_id', recipeId);

  if (ingredientReadError) {
    throw ingredientReadError;
  }

  assertCondition((ingredientRows ?? []).length === 0, 'User B should not read user A recipe ingredients');

  const archiveFood = await clientB.rpc('archive_user_food', {
    target_food_id: userFoodId,
  });
  assertCondition(archiveFood.error, 'User B should not archive user A custom foods');

  const archiveRecipe = await clientB.rpc('archive_recipe', {
    target_recipe_id: recipeId,
  });
  assertCondition(archiveRecipe.error, 'User B should not archive user A recipes');
}

async function main() {
  assertEnv();

  const pgClient = await createPgClient();
  const userA = await createAnonSession('User A');
  const userB = await createAnonSession('User B');
  const userIds = [userA.userId, userB.userId];

  try {
    await cleanupPublicData(pgClient, userIds);

    const initialCustomFoodId = await userA.client.rpc('save_user_food', {
      food_name: CUSTOM_FOOD_NAME,
      brand_name: 'Fixture',
      description: 'Verification custom food',
      base_amount: 100,
      base_unit: 'g',
      nutrient_values: {
        energy_kcal: 400,
        protein: 70,
        carbohydrate: 15,
        fat: 8,
      },
      servings: [
        {
          serving_name: '100 g',
          quantity: 100,
          gram_weight: 100,
          household_unit: 'g',
          is_default: true,
        },
        {
          serving_name: '1 scoop',
          quantity: 1,
          gram_weight: 32,
          household_unit: 'scoop',
          is_default: false,
        },
      ],
    });

    if (initialCustomFoodId.error) {
      throw initialCustomFoodId.error;
    }

    const userFoodId = initialCustomFoodId.data;
    const customBaseValues = {
      energy_kcal: 400,
      protein: 70,
      carbohydrate: 15,
      fat: 8,
    };
    const customScoopRatio = 32 / 100;
    const customScoopValues = calculateScaledTotals(customBaseValues, customScoopRatio);

    const customInitialLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: null,
        catalog_food_id: null,
        user_food_id: userFoodId,
        recipe_id: null,
        meal: 'Breakfast',
        note: 'custom-initial',
        logged_at: TEST_TIMESTAMP,
        logged_from: 'search',
        catalog_serving_id: null,
        user_food_serving_id: null,
        servings: 1,
        serving_quantity: 1,
        effective_grams: 32,
        calories: customScoopValues.energy_kcal,
        protein_g: customScoopValues.protein,
        carbs_g: customScoopValues.carbohydrate,
        fat_g: customScoopValues.fat,
        fiber_g: 0,
        food_name: CUSTOM_FOOD_NAME,
        food_brand: 'Fixture',
        serving_label: '1 scoop',
        food_source: 'custom',
        calories_per_serving: customScoopValues.energy_kcal,
        protein_per_serving_g: customScoopValues.protein,
        carbs_per_serving_g: customScoopValues.carbohydrate,
        fat_per_serving_g: customScoopValues.fat,
        fiber_per_serving_g: 0,
        sodium_mg_per_serving: 0,
        nutrients_snapshot: canonicalSnapshot(customScoopValues),
      })
      .select('*')
      .single();

    if (customInitialLog.error) {
      throw customInitialLog.error;
    }

    assertNear(customInitialLog.data.calories, 128, 'Initial custom food scoop calories should match the saved snapshot');
    assertNear(customInitialLog.data.protein_g, 22.4, 'Initial custom food scoop protein should match the saved snapshot');

    const updatedCustomFood = await userA.client.rpc('save_user_food', {
      food_id: userFoodId,
      food_name: CUSTOM_FOOD_NAME,
      brand_name: 'Fixture',
      description: 'Verification custom food',
      base_amount: 100,
      base_unit: 'g',
      nutrient_values: {
        energy_kcal: 420,
        protein: 70,
        carbohydrate: 15,
        fat: 8,
      },
      servings: [
        {
          serving_name: '100 g',
          quantity: 100,
          gram_weight: 100,
          household_unit: 'g',
          is_default: true,
        },
        {
          serving_name: '1 scoop',
          quantity: 1,
          gram_weight: 32,
          household_unit: 'scoop',
          is_default: false,
        },
      ],
    });

    if (updatedCustomFood.error) {
      throw updatedCustomFood.error;
    }

    const updatedCustomScoopValues = calculateScaledTotals(
      {
        energy_kcal: 420,
        protein: 70,
        carbohydrate: 15,
        fat: 8,
      },
      customScoopRatio,
    );

    const customUpdatedLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: null,
        catalog_food_id: null,
        user_food_id: userFoodId,
        recipe_id: null,
        meal: 'Breakfast',
        note: 'custom-updated',
        logged_at: '2026-08-09T09:05:00.000Z',
        logged_from: 'search',
        servings: 1,
        serving_quantity: 1,
        effective_grams: 32,
        calories: updatedCustomScoopValues.energy_kcal,
        protein_g: updatedCustomScoopValues.protein,
        carbs_g: updatedCustomScoopValues.carbohydrate,
        fat_g: updatedCustomScoopValues.fat,
        fiber_g: 0,
        food_name: CUSTOM_FOOD_NAME,
        food_brand: 'Fixture',
        serving_label: '1 scoop',
        food_source: 'custom',
        calories_per_serving: updatedCustomScoopValues.energy_kcal,
        protein_per_serving_g: updatedCustomScoopValues.protein,
        carbs_per_serving_g: updatedCustomScoopValues.carbohydrate,
        fat_per_serving_g: updatedCustomScoopValues.fat,
        fiber_per_serving_g: 0,
        sodium_mg_per_serving: 0,
        nutrients_snapshot: canonicalSnapshot(updatedCustomScoopValues),
      })
      .select('*')
      .single();

    if (customUpdatedLog.error) {
      throw customUpdatedLog.error;
    }

    assertNear(customInitialLog.data.calories, 128, 'Old custom food log should remain unchanged after definition edit');
    assertNear(customUpdatedLog.data.calories, 134.4, 'New custom food log should use updated custom food calories');

    const chicken = await loadCatalogFixture(pgClient, RECIPE_FIXTURE_NAMES.chicken);
    const rice = await loadCatalogFixture(pgClient, RECIPE_FIXTURE_NAMES.rice);
    const oliveOil = await loadCatalogFixture(pgClient, RECIPE_FIXTURE_NAMES.oliveOil);

    const initialRecipeIngredients = [
      {
        fixture: chicken,
        quantity: 2,
        effectiveGrams: 200,
      },
      {
        fixture: rice,
        quantity: 3,
        effectiveGrams: 300,
      },
      {
        fixture: oliveOil,
        quantity: 0.1,
        effectiveGrams: 10,
      },
    ];

    const initialRecipeTotals = initialRecipeIngredients.reduce((total, ingredient) => {
      return addNutrientTotals(
        total,
        calculateScaledTotals(ingredient.fixture.nutrientValues, ingredient.quantity),
      );
    }, {});

    const initialRecipe = await userA.client.rpc('save_recipe', {
      recipe_name: RECIPE_NAME,
      description: 'Verification recipe',
      final_weight_g: 450,
      total_nutrients: canonicalSnapshot(initialRecipeTotals),
      ingredients: initialRecipeIngredients.map((ingredient, index) => ({
        position: index,
        catalog_food_id: ingredient.fixture.id,
        user_food_id: null,
        catalog_serving_id: ingredient.fixture.servingId,
        user_food_serving_id: null,
        serving_label: ingredient.fixture.servingLabel,
        quantity: ingredient.quantity,
        effective_grams: ingredient.effectiveGrams,
      })),
    });

    if (initialRecipe.error) {
      throw initialRecipe.error;
    }

    const recipeId = initialRecipe.data;

    const initialRecipePortionValues = calculateScaledTotals(initialRecipeTotals, 225 / 450);
    const recipeInitialLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: null,
        catalog_food_id: null,
        user_food_id: null,
        recipe_id: recipeId,
        meal: 'Lunch',
        note: 'recipe-initial',
        logged_at: '2026-08-09T12:00:00.000Z',
        logged_from: 'recipe',
        servings: 2.25,
        serving_quantity: 2.25,
        effective_grams: 225,
        calories: initialRecipePortionValues.energy_kcal,
        protein_g: initialRecipePortionValues.protein,
        carbs_g: initialRecipePortionValues.carbohydrate,
        fat_g: initialRecipePortionValues.fat,
        fiber_g: initialRecipePortionValues.fiber ?? 0,
        food_name: RECIPE_NAME,
        food_brand: null,
        serving_label: '100 g',
        food_source: 'recipe',
        calories_per_serving: round4((initialRecipeTotals.energy_kcal ?? 0) / 4.5),
        protein_per_serving_g: round4((initialRecipeTotals.protein ?? 0) / 4.5),
        carbs_per_serving_g: round4((initialRecipeTotals.carbohydrate ?? 0) / 4.5),
        fat_per_serving_g: round4((initialRecipeTotals.fat ?? 0) / 4.5),
        fiber_per_serving_g: round4((initialRecipeTotals.fiber ?? 0) / 4.5),
        sodium_mg_per_serving: round4((initialRecipeTotals.sodium ?? 0) / 4.5),
        nutrients_snapshot: canonicalSnapshot(initialRecipePortionValues),
      })
      .select('*')
      .single();

    if (recipeInitialLog.error) {
      throw recipeInitialLog.error;
    }

    const updatedRecipeIngredients = [
      initialRecipeIngredients[0],
      initialRecipeIngredients[1],
      {
        fixture: oliveOil,
        quantity: 0.2,
        effectiveGrams: 20,
      },
    ];
    const updatedRecipeTotals = updatedRecipeIngredients.reduce((total, ingredient) => {
      return addNutrientTotals(
        total,
        calculateScaledTotals(ingredient.fixture.nutrientValues, ingredient.quantity),
      );
    }, {});

    const updatedRecipe = await userA.client.rpc('save_recipe', {
      recipe_id: recipeId,
      recipe_name: RECIPE_NAME,
      description: 'Verification recipe',
      final_weight_g: 600,
      serving_count: 3,
      total_nutrients: canonicalSnapshot(updatedRecipeTotals),
      ingredients: updatedRecipeIngredients.map((ingredient, index) => ({
        position: index,
        catalog_food_id: ingredient.fixture.id,
        user_food_id: null,
        catalog_serving_id: ingredient.fixture.servingId,
        user_food_serving_id: null,
        serving_label: ingredient.fixture.servingLabel,
        quantity: ingredient.quantity,
        effective_grams: ingredient.effectiveGrams,
      })),
    });

    if (updatedRecipe.error) {
      throw updatedRecipe.error;
    }

    const updatedRecipeServingValues = calculateScaledTotals(updatedRecipeTotals, 300 / 600);
    const recipeUpdatedLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: null,
        catalog_food_id: null,
        user_food_id: null,
        recipe_id: recipeId,
        meal: 'Lunch',
        note: 'recipe-updated',
        logged_at: '2026-08-09T12:05:00.000Z',
        logged_from: 'recipe',
        servings: 1.5,
        serving_quantity: 1.5,
        effective_grams: 300,
        calories: updatedRecipeServingValues.energy_kcal,
        protein_g: updatedRecipeServingValues.protein,
        carbs_g: updatedRecipeServingValues.carbohydrate,
        fat_g: updatedRecipeServingValues.fat,
        fiber_g: updatedRecipeServingValues.fiber ?? 0,
        food_name: RECIPE_NAME,
        food_brand: null,
        serving_label: '1 serving',
        food_source: 'recipe',
        calories_per_serving: round4((updatedRecipeTotals.energy_kcal ?? 0) / 3),
        protein_per_serving_g: round4((updatedRecipeTotals.protein ?? 0) / 3),
        carbs_per_serving_g: round4((updatedRecipeTotals.carbohydrate ?? 0) / 3),
        fat_per_serving_g: round4((updatedRecipeTotals.fat ?? 0) / 3),
        fiber_per_serving_g: round4((updatedRecipeTotals.fiber ?? 0) / 3),
        sodium_mg_per_serving: round4((updatedRecipeTotals.sodium ?? 0) / 3),
        nutrients_snapshot: canonicalSnapshot(updatedRecipeServingValues),
      })
      .select('*')
      .single();

    if (recipeUpdatedLog.error) {
      throw recipeUpdatedLog.error;
    }

    assertNear(recipeInitialLog.data.calories, initialRecipePortionValues.energy_kcal, 'Old recipe log should match the original 225 g snapshot');
    assertNear(recipeUpdatedLog.data.effective_grams, 300, 'Updated recipe serving-count log should equal 300 g for 1.5 servings');
    assertCondition(
      recipeUpdatedLog.data.calories !== recipeInitialLog.data.calories,
      'Updated recipe log should reflect the edited recipe definition',
    );

    await ensureUserBCannotMutate(userB.client, userFoodId, recipeId);

    const legacyFood = await createLegacyFoodFixture(pgClient, userA.userId);
    const legacyDeleteLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: legacyFood.id,
        catalog_food_id: null,
        user_food_id: null,
        recipe_id: null,
        meal: 'Snack',
        note: DELETE_FIXTURE_NOTE,
        logged_at: '2026-08-09T18:00:00.000Z',
        logged_from: 'saved',
        servings: 1,
        serving_quantity: 1,
        effective_grams: legacyFood.serving_grams,
        calories: legacyFood.calories,
        protein_g: legacyFood.protein_g,
        carbs_g: legacyFood.carbs_g,
        fat_g: legacyFood.fat_g,
        fiber_g: legacyFood.fiber_g,
        food_name: legacyFood.name,
        food_brand: legacyFood.brand,
        serving_label: legacyFood.serving_label,
        food_source: 'saved',
        calories_per_serving: legacyFood.calories,
        protein_per_serving_g: legacyFood.protein_g,
        carbs_per_serving_g: legacyFood.carbs_g,
        fat_per_serving_g: legacyFood.fat_g,
        fiber_per_serving_g: legacyFood.fiber_g,
        sodium_mg_per_serving: legacyFood.sodium_mg,
        nutrients_snapshot: canonicalSnapshot({
          energy_kcal: legacyFood.calories,
          protein: legacyFood.protein_g,
          carbohydrate: legacyFood.carbs_g,
          fat: legacyFood.fat_g,
          fiber: legacyFood.fiber_g,
          sodium: legacyFood.sodium_mg,
        }),
      })
      .select('*')
      .single();

    if (legacyDeleteLog.error) {
      throw legacyDeleteLog.error;
    }

    const catalogDeleteLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: null,
        catalog_food_id: chicken.id,
        user_food_id: null,
        recipe_id: null,
        meal: 'Snack',
        note: DELETE_FIXTURE_NOTE,
        logged_at: '2026-08-09T18:01:00.000Z',
        logged_from: 'search',
        catalog_serving_id: chicken.servingId,
        servings: 1,
        serving_quantity: 1,
        effective_grams: 100,
        calories: chicken.nutrientValues.energy_kcal,
        protein_g: chicken.nutrientValues.protein,
        carbs_g: chicken.nutrientValues.carbohydrate,
        fat_g: chicken.nutrientValues.fat,
        fiber_g: chicken.nutrientValues.fiber ?? 0,
        food_name: chicken.name,
        food_brand: chicken.brandName,
        serving_label: '100 g',
        food_source: 'usda',
        calories_per_serving: chicken.nutrientValues.energy_kcal,
        protein_per_serving_g: chicken.nutrientValues.protein,
        carbs_per_serving_g: chicken.nutrientValues.carbohydrate,
        fat_per_serving_g: chicken.nutrientValues.fat,
        fiber_per_serving_g: chicken.nutrientValues.fiber ?? 0,
        sodium_mg_per_serving: chicken.nutrientValues.sodium ?? 0,
        nutrients_snapshot: canonicalSnapshot(chicken.nutrientValues),
      })
      .select('*')
      .single();

    if (catalogDeleteLog.error) {
      throw catalogDeleteLog.error;
    }

    const customDeleteLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: null,
        catalog_food_id: null,
        user_food_id: userFoodId,
        recipe_id: null,
        meal: 'Snack',
        note: DELETE_FIXTURE_NOTE,
        logged_at: '2026-08-09T18:02:00.000Z',
        logged_from: 'search',
        servings: 1,
        serving_quantity: 1,
        effective_grams: 32,
        calories: updatedCustomScoopValues.energy_kcal,
        protein_g: updatedCustomScoopValues.protein,
        carbs_g: updatedCustomScoopValues.carbohydrate,
        fat_g: updatedCustomScoopValues.fat,
        fiber_g: 0,
        food_name: CUSTOM_FOOD_NAME,
        food_brand: 'Fixture',
        serving_label: '1 scoop',
        food_source: 'custom',
        calories_per_serving: updatedCustomScoopValues.energy_kcal,
        protein_per_serving_g: updatedCustomScoopValues.protein,
        carbs_per_serving_g: updatedCustomScoopValues.carbohydrate,
        fat_per_serving_g: updatedCustomScoopValues.fat,
        fiber_per_serving_g: 0,
        sodium_mg_per_serving: 0,
        nutrients_snapshot: canonicalSnapshot(updatedCustomScoopValues),
      })
      .select('*')
      .single();

    if (customDeleteLog.error) {
      throw customDeleteLog.error;
    }

    const recipeDeleteLog = await userA.client
      .from('food_logs')
      .insert({
        user_id: userA.userId,
        food_id: null,
        catalog_food_id: null,
        user_food_id: null,
        recipe_id: recipeId,
        meal: 'Snack',
        note: DELETE_FIXTURE_NOTE,
        logged_at: '2026-08-09T18:03:00.000Z',
        logged_from: 'recipe',
        servings: 1,
        serving_quantity: 1,
        effective_grams: 200,
        calories: round4((updatedRecipeTotals.energy_kcal ?? 0) / 3),
        protein_g: round4((updatedRecipeTotals.protein ?? 0) / 3),
        carbs_g: round4((updatedRecipeTotals.carbohydrate ?? 0) / 3),
        fat_g: round4((updatedRecipeTotals.fat ?? 0) / 3),
        fiber_g: round4((updatedRecipeTotals.fiber ?? 0) / 3),
        food_name: RECIPE_NAME,
        food_brand: null,
        serving_label: '1 serving',
        food_source: 'recipe',
        calories_per_serving: round4((updatedRecipeTotals.energy_kcal ?? 0) / 3),
        protein_per_serving_g: round4((updatedRecipeTotals.protein ?? 0) / 3),
        carbs_per_serving_g: round4((updatedRecipeTotals.carbohydrate ?? 0) / 3),
        fat_per_serving_g: round4((updatedRecipeTotals.fat ?? 0) / 3),
        fiber_per_serving_g: round4((updatedRecipeTotals.fiber ?? 0) / 3),
        sodium_mg_per_serving: round4((updatedRecipeTotals.sodium ?? 0) / 3),
        nutrients_snapshot: canonicalSnapshot(updatedRecipeServingValues),
      })
      .select('*')
      .single();

    if (recipeDeleteLog.error) {
      throw recipeDeleteLog.error;
    }

    const deleteTotalBefore = await pgClient.query(
      `
        select coalesce(sum(calories), 0) as calories
        from public.food_logs
        where user_id = $1
          and note = $2
      `,
      [userA.userId, DELETE_FIXTURE_NOTE],
    );

    const totalFixtureCaloriesBefore = Number(deleteTotalBefore.rows[0].calories);

    await deleteFoodLogStrict(userA.client, legacyDeleteLog.data.id);
    await deleteFoodLogStrict(userA.client, catalogDeleteLog.data.id);
    await deleteFoodLogStrict(userA.client, customDeleteLog.data.id);
    await deleteFoodLogStrict(userA.client, recipeDeleteLog.data.id);

    const deleteTotalAfter = await pgClient.query(
      `
        select coalesce(sum(calories), 0) as calories
        from public.food_logs
        where user_id = $1
          and note = $2
      `,
      [userA.userId, DELETE_FIXTURE_NOTE],
    );

    assertNear(Number(deleteTotalAfter.rows[0].calories), 0, 'Delete fixtures should be removed entirely');
    assertCondition(totalFixtureCaloriesBefore > 0, 'Delete fixtures should contribute calories before deletion');

    const result = {
      testDate: TEST_DATE,
      users: {
        userA: userA.userId,
        userB: userB.userId,
      },
      customFood: {
        userFoodId,
        initialScoopCalories: customInitialLog.data.calories,
        updatedScoopCalories: customUpdatedLog.data.calories,
      },
      recipe: {
        recipeId,
        initial225gCalories: recipeInitialLog.data.calories,
        updatedServingCalories: recipeUpdatedLog.data.calories,
        updatedServingEffectiveGrams: recipeUpdatedLog.data.effective_grams,
      },
      deletes: {
        totalFixtureCaloriesBefore,
        totalFixtureCaloriesAfter: Number(deleteTotalAfter.rows[0].calories),
      },
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await cleanupPublicData(pgClient, userIds);
    await pgClient.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
