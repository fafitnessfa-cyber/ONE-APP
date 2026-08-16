import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const TEST_DATE = 'Sunday, August 9, 2026';

const FOOD_FIXTURES = {
  banana: {
    name: 'Banana, raw',
    initialServing: '1 banana',
    updatedServing: '100 g',
    initialQuantity: 1,
    secondQuantity: 2,
    finalQuantity: 1.5,
    meal: 'Breakfast',
  },
  rice: {
    name: 'Rice, white, cooked, no added fat',
    initialServing: '1 cup, cooked',
    updatedServing: '100 g',
    initialQuantity: 1,
    finalQuantity: 1.5,
    meal: 'Lunch',
  },
  chicken: {
    name: 'Chicken breast, baked, broiled, or roasted, skin not eaten, from raw',
    initialServing: '100 g',
    updatedServing: '100 g',
    initialQuantity: 1,
    finalQuantity: 1.5,
    meal: 'Dinner',
  },
  egg: {
    name: 'Egg, whole, boiled or poached',
    initialServing: '1 egg',
    initialQuantity: 1,
    meal: 'Snack',
  },
} ;

const CANONICAL_CODES = [
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

function assertEnv() {
  const missing = [
    ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
    ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', SUPABASE_PUBLISHABLE_KEY],
    ['SUPABASE_DB_URL', SUPABASE_DB_URL],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing
        .map(([name]) => name)
        .join(', ')}`,
    );
  }
}

function round4(value) {
  return Number(value.toFixed(4));
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

async function createAnonSession(label) {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw new Error(`${label}: anonymous sign-in failed: ${error.message}`);
  }

  assertCondition(data.user?.id, `${label}: missing anonymous user id`);

  return {
    client,
    userId: data.user.id,
  };
}

async function fetchFoodDetail(client, foodName) {
  const { data: foods, error: foodError } = await client
    .from('catalog_foods')
    .select('id, name, brand_name, base_amount, base_unit')
    .eq('name', foodName)
    .limit(1);

  if (foodError) {
    throw new Error(`Unable to load ${foodName}: ${foodError.message}`);
  }

  const food = foods?.[0];
  assertCondition(food, `Catalog food not found: ${foodName}`);

  const { data: servings, error: servingError } = await client
    .from('food_servings')
    .select('id, serving_name, quantity, gram_weight, milliliter_volume, household_unit, is_default')
    .eq('food_id', food.id)
    .order('is_default', { ascending: false })
    .order('serving_name', { ascending: true });

  if (servingError) {
    throw new Error(`Unable to load servings for ${foodName}: ${servingError.message}`);
  }

  const { data: nutrientRows, error: nutrientError } = await client
    .from('food_nutrients')
    .select('amount, nutrients!inner(code)')
    .eq('food_id', food.id)
    .in('nutrients.code', CANONICAL_CODES);

  if (nutrientError) {
    throw new Error(`Unable to load nutrients for ${foodName}: ${nutrientError.message}`);
  }

  const nutrientValues = {};

  for (const row of nutrientRows ?? []) {
    nutrientValues[row.nutrients.code] = Number(row.amount);
  }

  return {
    food,
    servings: servings ?? [],
    nutrientValues,
  };
}

function findServing(detail, servingName) {
  const serving = detail.servings.find((item) => item.serving_name === servingName);
  assertCondition(
    serving,
    `Serving "${servingName}" not found for ${detail.food.name}`,
  );
  return serving;
}

function calculateSnapshot(detail, serving, quantity) {
  const baseAmount = Number(detail.food.base_amount);
  const baseUnit = String(detail.food.base_unit).trim().toLowerCase();
  let scale = null;

  if (serving.gram_weight != null && baseUnit === 'g') {
    scale = Number(serving.gram_weight) / baseAmount;
  } else if (serving.milliliter_volume != null && baseUnit === 'ml') {
    scale = Number(serving.milliliter_volume) / baseAmount;
  } else if (
    serving.household_unit &&
    String(serving.household_unit).trim().toLowerCase() === baseUnit
  ) {
    scale = Number(serving.quantity) / baseAmount;
  }

  assertCondition(
    scale != null,
    `Serving "${serving.serving_name}" cannot be converted safely for ${detail.food.name}`,
  );

  const perServingNutrients = {};

  for (const code of CANONICAL_CODES) {
    const rawValue = detail.nutrientValues[code];

    if (rawValue == null) {
      continue;
    }

    perServingNutrients[code] = round4(rawValue * scale);
  }

  const totalNutrients = {};

  for (const code of Object.keys(perServingNutrients)) {
    totalNutrients[code] = round4(perServingNutrients[code] * quantity);
  }

  return {
    quantity: round4(quantity),
    effectiveGrams:
      serving.gram_weight == null ? null : round4(Number(serving.gram_weight) * quantity),
    perServingNutrients,
    totalNutrients,
    payload: {
      food_id: null,
      catalog_food_id: detail.food.id,
      catalog_serving_id: serving.id,
      servings: round4(quantity),
      serving_quantity: round4(quantity),
      effective_grams:
        serving.gram_weight == null ? null : round4(Number(serving.gram_weight) * quantity),
      calories: totalNutrients.energy_kcal ?? 0,
      protein_g: totalNutrients.protein ?? 0,
      carbs_g: totalNutrients.carbohydrate ?? 0,
      fat_g: totalNutrients.fat ?? 0,
      fiber_g: totalNutrients.fiber ?? 0,
      logged_from: 'search',
      food_name: detail.food.name,
      food_brand: detail.food.brand_name,
      serving_label: serving.serving_name,
      food_source: 'usda',
      calories_per_serving: perServingNutrients.energy_kcal ?? 0,
      protein_per_serving_g: perServingNutrients.protein ?? 0,
      carbs_per_serving_g: perServingNutrients.carbohydrate ?? 0,
      fat_per_serving_g: perServingNutrients.fat ?? 0,
      fiber_per_serving_g: perServingNutrients.fiber ?? 0,
      sodium_mg_per_serving: perServingNutrients.sodium ?? 0,
      nutrients_snapshot: totalNutrients,
    },
  };
}

async function insertCatalogLog(client, userId, detail, serving, quantity, meal) {
  const snapshot = calculateSnapshot(detail, serving, quantity);
  const payload = {
    user_id: userId,
    meal,
    logged_at: new Date().toISOString(),
    note: null,
    ...snapshot.payload,
  };
  const { data, error } = await client
    .from('food_logs')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Insert failed for ${detail.food.name}: ${error.message}`);
  }

  return {
    snapshot,
    row: data,
  };
}

async function updateCatalogLog(client, logId, detail, serving, quantity, meal) {
  const snapshot = calculateSnapshot(detail, serving, quantity);
  const { data, error } = await client
    .from('food_logs')
    .update({
      meal,
      note: null,
      logged_from: 'search',
      ...snapshot.payload,
    })
    .eq('id', logId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Update failed for ${detail.food.name}: ${error.message}`);
  }

  return {
    snapshot,
    row: data,
  };
}

async function fetchLog(client, logId) {
  const { data, error } = await client
    .from('food_logs')
    .select('*')
    .eq('id', logId)
    .single();

  if (error) {
    throw new Error(`Unable to fetch log ${logId}: ${error.message}`);
  }

  return data;
}

function assertRowMatchesSnapshot(row, snapshot, label) {
  assertNear(row.servings, snapshot.quantity, `${label}: servings mismatch`);
  assertNear(
    row.serving_quantity,
    snapshot.quantity,
    `${label}: serving_quantity mismatch`,
  );

  if (snapshot.effectiveGrams == null) {
    assertCondition(
      row.effective_grams == null,
      `${label}: effective_grams should be null`,
    );
  } else {
    assertNear(
      row.effective_grams,
      snapshot.effectiveGrams,
      `${label}: effective_grams mismatch`,
    );
  }

  assertNear(row.calories, snapshot.payload.calories, `${label}: calories mismatch`);
  assertNear(row.protein_g, snapshot.payload.protein_g, `${label}: protein mismatch`);
  assertNear(row.carbs_g, snapshot.payload.carbs_g, `${label}: carbs mismatch`);
  assertNear(row.fat_g, snapshot.payload.fat_g, `${label}: fat mismatch`);
  assertNear(row.fiber_g, snapshot.payload.fiber_g, `${label}: fiber mismatch`);
  assertNear(
    row.calories_per_serving,
    snapshot.payload.calories_per_serving,
    `${label}: calories_per_serving mismatch`,
  );
  assertCondition(
    row.serving_label === snapshot.payload.serving_label,
    `${label}: serving_label mismatch`,
  );
}

async function verifyRls(clientA, clientB, protectedLogId) {
  const { data: selectData, error: selectError } = await clientB
    .from('food_logs')
    .select('id')
    .eq('id', protectedLogId);

  if (selectError) {
    throw new Error(`RLS select check failed: ${selectError.message}`);
  }

  assertCondition(selectData.length === 0, 'RLS select check should return zero rows');

  const { data: updateData, error: updateError } = await clientB
    .from('food_logs')
    .update({ note: 'blocked-by-rls' })
    .eq('id', protectedLogId)
    .select('id');

  if (updateError) {
    throw new Error(`RLS update check failed: ${updateError.message}`);
  }

  assertCondition(updateData.length === 0, 'RLS update check should update zero rows');

  const { data: deleteData, error: deleteError } = await clientB
    .from('food_logs')
    .delete()
    .eq('id', protectedLogId)
    .select('id');

  if (deleteError) {
    throw new Error(`RLS delete check failed: ${deleteError.message}`);
  }

  assertCondition(deleteData.length === 0, 'RLS delete check should delete zero rows');

  const preservedRow = await fetchLog(clientA, protectedLogId);
  assertCondition(preservedRow.note == null, 'RLS update should not change the protected row');
}

async function verifyHistoricalStability(dbUrl, detail, serving, insertedRow) {
  const pgClient = new PgClient({ connectionString: dbUrl });
  await pgClient.connect();

  try {
    await pgClient.query('BEGIN');

    const nutrientRows = await pgClient.query(
      `
        select fn.amount, n.id as nutrient_id
        from public.food_nutrients fn
        join public.nutrients n on n.id = fn.nutrient_id
        where fn.food_id = $1 and n.code = 'energy_kcal'
      `,
      [detail.food.id],
    );
    const energyRow = nutrientRows.rows[0];

    assertCondition(energyRow, 'Unable to locate banana energy_kcal nutrient row');

    await pgClient.query(
      'update public.food_nutrients set amount = 95 where food_id = $1 and nutrient_id = $2',
      [detail.food.id, energyRow.nutrient_id],
    );

    const liveNutrientRow = await pgClient.query(
      `
        select fn.amount
        from public.food_nutrients fn
        where fn.food_id = $1 and fn.nutrient_id = $2
      `,
      [detail.food.id, energyRow.nutrient_id],
    );
    const updatedEnergy = Number(liveNutrientRow.rows[0].amount);
    const hypotheticalCalories = round4((updatedEnergy * Number(serving.gram_weight)) / 100);
    const storedLogRow = await pgClient.query(
      'select calories from public.food_logs where id = $1',
      [insertedRow.id],
    );
    const storedCalories = Number(storedLogRow.rows[0].calories);

    assertNear(
      storedCalories,
      Number(insertedRow.calories),
      'Historical stability: stored snapshot calories changed unexpectedly',
    );
    assertCondition(
      hypotheticalCalories !== storedCalories,
      'Historical stability: hypothetical live calories should differ from the stored snapshot',
    );

    await pgClient.query('ROLLBACK');

    return {
      updatedEnergy,
      hypotheticalCalories,
      storedCalories,
    };
  } catch (error) {
    await pgClient.query('ROLLBACK');
    throw error;
  } finally {
    await pgClient.end();
  }
}

async function main() {
  assertEnv();

  const createdLogIds = [];
  const summary = {
    banana: {},
    rice: {},
    chicken: {},
    egg: {},
    dailyTotals: {},
    historicalStability: {},
  };

  const { client: clientA, userId } = await createAnonSession('clientA');
  const { client: clientB } = await createAnonSession('clientB');

  try {
    const { data: bananaSearch, error: bananaSearchError } = await clientA.rpc(
      'search_catalog_foods',
      {
        search_query: 'banana',
        result_limit: 5,
      },
    );

    if (bananaSearchError) {
      throw new Error(`Banana search RPC failed: ${bananaSearchError.message}`);
    }

    assertCondition(
      bananaSearch.some((row) => row.name === FOOD_FIXTURES.banana.name),
      'Banana search RPC did not surface Banana, raw',
    );

    const bananaDetail = await fetchFoodDetail(clientA, FOOD_FIXTURES.banana.name);
    const bananaServing = findServing(bananaDetail, FOOD_FIXTURES.banana.initialServing);
    const bananaInsert = await insertCatalogLog(
      clientA,
      userId,
      bananaDetail,
      bananaServing,
      FOOD_FIXTURES.banana.initialQuantity,
      FOOD_FIXTURES.banana.meal,
    );
    createdLogIds.push(bananaInsert.row.id);
    assertRowMatchesSnapshot(bananaInsert.row, bananaInsert.snapshot, 'Banana insert');

    const bananaDouble = await updateCatalogLog(
      clientA,
      bananaInsert.row.id,
      bananaDetail,
      bananaServing,
      FOOD_FIXTURES.banana.secondQuantity,
      FOOD_FIXTURES.banana.meal,
    );
    assertRowMatchesSnapshot(bananaDouble.row, bananaDouble.snapshot, 'Banana double');

    const bananaHundredGrams = findServing(
      bananaDetail,
      FOOD_FIXTURES.banana.updatedServing,
    );
    const bananaFinal = await updateCatalogLog(
      clientA,
      bananaInsert.row.id,
      bananaDetail,
      bananaHundredGrams,
      FOOD_FIXTURES.banana.finalQuantity,
      FOOD_FIXTURES.banana.meal,
    );
    assertRowMatchesSnapshot(bananaFinal.row, bananaFinal.snapshot, 'Banana final');
    const bananaReloaded = await fetchLog(clientA, bananaInsert.row.id);
    assertRowMatchesSnapshot(
      bananaReloaded,
      bananaFinal.snapshot,
      'Banana reload verification',
    );
    summary.banana = {
      insertedCalories: bananaInsert.row.calories,
      doubledCalories: bananaDouble.row.calories,
      finalCalories: bananaFinal.row.calories,
      finalServingLabel: bananaFinal.row.serving_label,
      finalEffectiveGrams: bananaFinal.row.effective_grams,
    };

    const riceDetail = await fetchFoodDetail(clientA, FOOD_FIXTURES.rice.name);
    const riceCup = findServing(riceDetail, FOOD_FIXTURES.rice.initialServing);
    const riceInsert = await insertCatalogLog(
      clientA,
      userId,
      riceDetail,
      riceCup,
      FOOD_FIXTURES.rice.initialQuantity,
      FOOD_FIXTURES.rice.meal,
    );
    createdLogIds.push(riceInsert.row.id);
    assertRowMatchesSnapshot(riceInsert.row, riceInsert.snapshot, 'Rice insert');
    const riceHundredGrams = findServing(riceDetail, FOOD_FIXTURES.rice.updatedServing);
    const riceFinal = await updateCatalogLog(
      clientA,
      riceInsert.row.id,
      riceDetail,
      riceHundredGrams,
      FOOD_FIXTURES.rice.finalQuantity,
      FOOD_FIXTURES.rice.meal,
    );
    assertRowMatchesSnapshot(riceFinal.row, riceFinal.snapshot, 'Rice final');
    summary.rice = {
      insertedServingLabel: riceInsert.row.serving_label,
      insertedEffectiveGrams: riceInsert.row.effective_grams,
      finalCalories: riceFinal.row.calories,
      finalEffectiveGrams: riceFinal.row.effective_grams,
    };

    const chickenDetail = await fetchFoodDetail(clientA, FOOD_FIXTURES.chicken.name);
    const chickenServing = findServing(
      chickenDetail,
      FOOD_FIXTURES.chicken.initialServing,
    );
    const chickenInsert = await insertCatalogLog(
      clientA,
      userId,
      chickenDetail,
      chickenServing,
      FOOD_FIXTURES.chicken.initialQuantity,
      FOOD_FIXTURES.chicken.meal,
    );
    createdLogIds.push(chickenInsert.row.id);
    assertRowMatchesSnapshot(chickenInsert.row, chickenInsert.snapshot, 'Chicken insert');
    assertNear(chickenInsert.row.carbs_g, 0, 'Chicken carbs should remain zero');
    const chickenFinal = await updateCatalogLog(
      clientA,
      chickenInsert.row.id,
      chickenDetail,
      chickenServing,
      FOOD_FIXTURES.chicken.finalQuantity,
      FOOD_FIXTURES.chicken.meal,
    );
    assertRowMatchesSnapshot(chickenFinal.row, chickenFinal.snapshot, 'Chicken final');
    assertNear(chickenFinal.row.carbs_g, 0, 'Chicken edited carbs should remain zero');
    summary.chicken = {
      initialCarbs: chickenInsert.row.carbs_g,
      finalCarbs: chickenFinal.row.carbs_g,
      finalCalories: chickenFinal.row.calories,
    };

    const eggDetail = await fetchFoodDetail(clientA, FOOD_FIXTURES.egg.name);
    const eggServing = findServing(eggDetail, FOOD_FIXTURES.egg.initialServing);
    const eggInsert = await insertCatalogLog(
      clientA,
      userId,
      eggDetail,
      eggServing,
      FOOD_FIXTURES.egg.initialQuantity,
      FOOD_FIXTURES.egg.meal,
    );
    createdLogIds.push(eggInsert.row.id);
    assertRowMatchesSnapshot(eggInsert.row, eggInsert.snapshot, 'Egg insert');
    const eggReloaded = await fetchLog(clientA, eggInsert.row.id);
    assertCondition(
      eggReloaded.serving_label === FOOD_FIXTURES.egg.initialServing,
      'Egg serving label did not survive reload',
    );
    summary.egg = {
      servingLabel: eggReloaded.serving_label,
      calories: eggReloaded.calories,
    };

    const historicalBanana = await insertCatalogLog(
      clientA,
      userId,
      bananaDetail,
      bananaServing,
      1,
      'Snack',
    );
    createdLogIds.push(historicalBanana.row.id);
    const historyCheck = await verifyHistoricalStability(
      SUPABASE_DB_URL,
      bananaDetail,
      bananaServing,
      historicalBanana.row,
    );
    summary.historicalStability = historyCheck;

    await verifyRls(clientA, clientB, bananaInsert.row.id);

    const { data: totalsRows, error: totalsError } = await clientA
      .from('food_logs')
      .select('id, calories, protein_g, carbs_g, fat_g')
      .in('id', createdLogIds);

    if (totalsError) {
      throw new Error(`Daily totals verification failed: ${totalsError.message}`);
    }

    const totals = totalsRows.reduce(
      (accumulator, row) => ({
        calories: round4(accumulator.calories + Number(row.calories)),
        protein: round4(accumulator.protein + Number(row.protein_g)),
        carbs: round4(accumulator.carbs + Number(row.carbs_g)),
        fat: round4(accumulator.fat + Number(row.fat_g)),
      }),
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    );
    summary.dailyTotals = totals;

    console.log(JSON.stringify({ testDate: TEST_DATE, userId, summary }, null, 2));
  } finally {
    if (createdLogIds.length > 0) {
      await clientA.from('food_logs').delete().in('id', createdLogIds);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
