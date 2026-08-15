import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = normalizeDbUrl(process.env.SUPABASE_DB_URL);

const LOCAL_USDA_UPC = '038000162367';
const REAL_INCOMPLETE_BARCODE = '3017624010701';
const REAL_NOT_FOUND_BARCODE = '00000000000000';
const VERIFY_NOTE = 'verify-nutrition-barcodes';
const VERIFY_MEAL = 'Breakfast';
const VERIFY_LOG_SOURCE = 'barcode';
const VERIFY_USER_AGENT = 'ONE-UP/0.1 (local-dev@oneup.invalid)';

const MOCK_SUCCESS_BARCODE = buildValidGtin14('9099990000000');
const MOCK_INCOMPLETE_BARCODE = buildValidGtin14('9099990000001');
const MOCK_COLLISION_BARCODE = buildValidGtin14('9099990000002');

const MOCK_SUCCESS_PRODUCT = {
  code: MOCK_SUCCESS_BARCODE,
  product_name: 'ONE UP TEST PROTEIN BAR',
  brands: 'ONE UP TEST',
  nutrition_data: 'on',
  nutrition_data_per: '100g',
  serving_size: '1 bar (40 g)',
  quantity: '40 g',
  product_quantity: 40,
  product_quantity_unit: 'g',
  updated_t: 1786329600,
  countries_tags: ['en:united-states'],
  misc_tags: [],
  nutriments: {
    'energy-kj_100g': 840,
    'energy-kj_serving': 336,
    energy: 840,
    energy_unit: 'kJ',
    'energy-kj_unit': 'kJ',
    proteins_100g: 20,
    proteins_serving: 8,
    proteins_unit: 'g',
    carbohydrates_100g: 0,
    carbohydrates_serving: 0,
    carbohydrates_unit: 'g',
    fat_100g: 8,
    fat_serving: 3.2,
    fat_unit: 'g',
    fiber_100g: 5,
    fiber_serving: 2,
    fiber_unit: 'g',
    sugars_100g: 0,
    sugars_serving: 0,
    sugars_unit: 'g',
    sodium_100g: 0.45,
    sodium_serving: 0.18,
    sodium_unit: 'g',
    potassium_100g: 300,
    potassium_serving: 120,
    potassium_unit: 'mg',
    calcium_100g: 120,
    calcium_serving: 48,
    calcium_unit: 'mg',
    iron_100g: 4,
    iron_serving: 1.6,
    iron_unit: 'mg',
    'vitamin-c_100g': 30,
    'vitamin-c_serving': 12,
    'vitamin-c_unit': 'mg',
    'vitamin-d_100g': 2.5,
    'vitamin-d_serving': 1,
    'vitamin-d_unit': 'µg',
    'saturated-fat_100g': 2,
    'saturated-fat_serving': 0.8,
    'saturated-fat_unit': 'g',
    cholesterol_100g: 15,
    cholesterol_serving: 6,
    cholesterol_unit: 'mg',
  },
};

const MOCK_INCOMPLETE_PRODUCT = {
  code: MOCK_INCOMPLETE_BARCODE,
  product_name: 'ONE UP TEST INCOMPLETE BAR',
  brands: 'ONE UP TEST',
  nutrition_data: 'on',
  nutrition_data_per: '100g',
  serving_size: '1 bar (35 g)',
  quantity: '35 g',
  product_quantity: 35,
  product_quantity_unit: 'g',
  updated_t: 1786329600,
  countries_tags: ['en:united-states'],
  misc_tags: [],
  nutriments: {
    'energy-kj_100g': 900,
    'energy-kj_unit': 'kJ',
    proteins_100g: 14,
    proteins_unit: 'g',
    carbohydrates_100g: 22,
    carbohydrates_unit: 'g',
    fat_100g: 11,
    fat_unit: 'g',
    sodium_100g: 0.3,
    sodium_unit: 'g',
  },
};

function normalizeDbUrl(value) {
  if (!value) {
    return value;
  }

  return value
    .replace(/[?&]sslmode=require\b/, '')
    .replace(/[?&]uselibpqcompat=true\b/, '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
}

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

function calculateGtinCheckDigit(body) {
  let total = 0;

  for (let index = 0; index < body.length; index += 1) {
    const reverseIndex = body.length - 1 - index;
    const digit = Number(body[reverseIndex]);
    total += digit * (index % 2 === 0 ? 3 : 1);
  }

  return (10 - (total % 10)) % 10;
}

function isValidGtinDigits(digits) {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) {
    return false;
  }

  return calculateGtinCheckDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

function buildValidGtin14(body) {
  return `${body}${calculateGtinCheckDigit(body)}`;
}

function normalizeBarcode(rawValue) {
  const cleanedDigits = rawValue.replace(/[^\d]/g, '');

  if (!cleanedDigits) {
    return {
      ok: false,
      code: 'empty',
      message: 'Barcode is empty.',
    };
  }

  if (![8, 12, 13, 14].includes(cleanedDigits.length)) {
    return {
      ok: false,
      code: 'unsupported_format',
      message: 'Unsupported barcode length.',
    };
  }

  if (!isValidGtinDigits(cleanedDigits)) {
    return {
      ok: false,
      code: 'invalid_check_digit',
      message: 'Invalid barcode check digit.',
    };
  }

  return {
    ok: true,
    cleanedDigits,
    normalizedBarcode: cleanedDigits.padStart(14, '0'),
  };
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

async function createDbClient() {
  const client = new PgClient({
    connectionString: SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  await client.connect();
  return client;
}

async function cleanupVerifierRows(db) {
  await db.query('begin');

  try {
    await db.query(
      `delete from public.food_logs
       where note = $1
          or food_name in ($2, $3)
          or food_brand = $4`,
      [
        VERIFY_NOTE,
        MOCK_SUCCESS_PRODUCT.product_name,
        MOCK_INCOMPLETE_PRODUCT.product_name,
        'ONE UP TEST',
      ],
    );

    await db.query(
      `delete from public.food_barcodes
       where barcode = any($1::text[])`,
      [[MOCK_SUCCESS_BARCODE, MOCK_INCOMPLETE_BARCODE, MOCK_COLLISION_BARCODE]],
    );

    await db.query(
      `delete from public.food_nutrients
       where food_id in (
         select id
         from public.catalog_foods
         where source_food_id = any($1::text[])
       )`,
      [[MOCK_SUCCESS_BARCODE, MOCK_INCOMPLETE_BARCODE, 'oneup-test-usda-collision', 'oneup-test-off-collision']],
    );

    await db.query(
      `delete from public.food_servings
       where food_id in (
         select id
         from public.catalog_foods
         where source_food_id = any($1::text[])
       )`,
      [[MOCK_SUCCESS_BARCODE, MOCK_INCOMPLETE_BARCODE, 'oneup-test-usda-collision', 'oneup-test-off-collision']],
    );

    await db.query(
      `delete from public.catalog_foods
       where source_food_id = any($1::text[])`,
      [[MOCK_SUCCESS_BARCODE, MOCK_INCOMPLETE_BARCODE, 'oneup-test-usda-collision', 'oneup-test-off-collision']],
    );

    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function lookupBarcode(client, rawBarcode) {
  const normalized = normalizeBarcode(rawBarcode);

  assertCondition(normalized.ok, `Normalization failed for ${rawBarcode}`);

  const startedAt = Date.now();
  const { data, error } = await client.rpc('lookup_food_barcode', {
    raw_barcode: rawBarcode,
    input_normalized_barcode: normalized.normalizedBarcode,
  });

  if (error) {
    throw new Error(`lookup_food_barcode failed for ${rawBarcode}: ${error.message}`);
  }

  return {
    elapsedMs: Date.now() - startedAt,
    normalizedBarcode: normalized.normalizedBarcode,
    row: data?.[0] ?? null,
  };
}

async function importMockProduct(db, product, barcode) {
  const { rows } = await db.query(
    `select *
     from public.import_open_food_facts_product(
       $1::jsonb,
       $2::text,
       $2::text,
       'US'
     )`,
    [JSON.stringify(product), barcode],
  );

  return rows[0] ?? null;
}

async function fetchCatalogFoodDetails(db, foodId) {
  const { rows: foodRows } = await db.query(
    `select id, name, brand_name, base_amount, base_unit
     from public.catalog_foods
     where id = $1`,
    [foodId],
  );
  const { rows: servingRows } = await db.query(
    `select id, serving_name, quantity, gram_weight, milliliter_volume, household_unit, is_default, nutrient_values
     from public.food_servings
     where food_id = $1
     order by is_default desc, serving_name asc`,
    [foodId],
  );
  const { rows: nutrientRows } = await db.query(
    `select n.code, fn.amount
     from public.food_nutrients fn
     join public.nutrients n on n.id = fn.nutrient_id
     where fn.food_id = $1`,
    [foodId],
  );

  assertCondition(foodRows[0], `Food ${foodId} was not found.`);

  return {
    food: foodRows[0],
    servings: servingRows,
    nutrients: Object.fromEntries(
      nutrientRows.map((row) => [row.code, Number(row.amount)]),
    ),
  };
}

function getServingNutrientValues(detail, servingRow) {
  if (servingRow.nutrient_values && typeof servingRow.nutrient_values === 'object') {
    return Object.fromEntries(
      Object.entries(servingRow.nutrient_values).map(([code, value]) => [
        code,
        Number(value),
      ]),
    );
  }

  const baseAmount = Number(detail.food.base_amount);
  const baseUnit = String(detail.food.base_unit).trim().toLowerCase();
  const factor =
    baseUnit === 'g'
      ? Number(servingRow.gram_weight) / baseAmount
      : Number(servingRow.milliliter_volume) / baseAmount;

  return Object.fromEntries(
    Object.entries(detail.nutrients).map(([code, amount]) => [code, round4(Number(amount) * factor)]),
  );
}

async function insertAndDeleteFoodLog(ownerSession, otherSession, detail, servingRow) {
  const perServingValues = getServingNutrientValues(detail, servingRow);
  const calories = perServingValues.energy_kcal ?? 0;
  const protein = perServingValues.protein ?? 0;
  const carbs = perServingValues.carbohydrate ?? 0;
  const fats = perServingValues.fat ?? 0;
  const fiber = perServingValues.fiber ?? 0;
  const sodium = perServingValues.sodium ?? 0;

  const { count: beforeCount, error: beforeCountError } = await ownerSession.client
    .from('food_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', ownerSession.userId);

  if (beforeCountError) {
    throw new Error(`Unable to count existing logs: ${beforeCountError.message}`);
  }

  const { data: insertedLog, error: insertError } = await ownerSession.client
    .from('food_logs')
    .insert({
      user_id: ownerSession.userId,
      meal: VERIFY_MEAL,
      logged_at: new Date().toISOString(),
      note: VERIFY_NOTE,
      food_id: null,
      catalog_food_id: detail.food.id,
      catalog_serving_id: servingRow.id,
      servings: 1,
      serving_quantity: 1,
      effective_grams:
        servingRow.gram_weight == null ? null : Number(servingRow.gram_weight),
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fats,
      fiber_g: fiber,
      logged_from: VERIFY_LOG_SOURCE,
      food_name: detail.food.name,
      food_brand: detail.food.brand_name,
      serving_label: servingRow.serving_name,
      food_source: 'branded',
      calories_per_serving: calories,
      protein_per_serving_g: protein,
      carbs_per_serving_g: carbs,
      fat_per_serving_g: fats,
      fiber_per_serving_g: fiber,
      sodium_mg_per_serving: sodium,
      nutrients_snapshot: perServingValues,
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(`Unable to insert food log: ${insertError.message}`);
  }

  const { data: ownerDeleteAttempt, error: otherDeleteError } = await otherSession.client
    .from('food_logs')
    .delete()
    .eq('id', insertedLog.id)
    .select('id');

  if (otherDeleteError) {
    throw new Error(`Unexpected delete error from non-owner session: ${otherDeleteError.message}`);
  }

  assertCondition(
    (ownerDeleteAttempt ?? []).length === 0,
    'A non-owner session should not be able to delete another user log.',
  );

  const { data: deletedRows, error: deleteError } = await ownerSession.client
    .from('food_logs')
    .delete()
    .eq('id', insertedLog.id)
    .select('id');

  if (deleteError) {
    throw new Error(`Owner delete failed: ${deleteError.message}`);
  }

  assertCondition(
    (deletedRows ?? []).length === 1,
    'Owner delete should remove exactly one log row.',
  );

  const { count: afterCount, error: afterCountError } = await ownerSession.client
    .from('food_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', ownerSession.userId);

  if (afterCountError) {
    throw new Error(`Unable to count logs after delete: ${afterCountError.message}`);
  }

  assertCondition(
    beforeCount === afterCount,
    'Food log count should return to its original value after deletion.',
  );

  return {
    insertedLogId: insertedLog.id,
    calories,
    protein,
    carbs,
    fats,
    fiber,
    sodium,
  };
}

async function runCollisionTest(db) {
  const { rows: sourceRows } = await db.query(
    `select code, id
     from public.food_sources
     where code in ('USDA_BRANDED', 'OPEN_FOOD_FACTS')`,
  );

  const sourceIdByCode = new Map(sourceRows.map((row) => [row.code, row.id]));
  const usdaSourceId = sourceIdByCode.get('USDA_BRANDED');
  const offSourceId = sourceIdByCode.get('OPEN_FOOD_FACTS');

  assertCondition(usdaSourceId && offSourceId, 'Missing barcode collision source ids.');

  const insertFood = async ({
    sourceId,
    sourceFoodId,
    name,
    brandName,
    verificationLevel,
    dataCompleteness,
  }) => {
    const { rows } = await db.query(
      `insert into public.catalog_foods (
         source_id,
         source_food_id,
         food_type,
         name,
         description,
         brand_name,
         country_code,
         verification_level,
         data_completeness,
         base_amount,
         base_unit,
         is_active,
         metadata
       )
       values (
         $1,
         $2,
         'branded',
         $3,
         'Verifier collision test',
         $4,
         'US',
         $5,
         $6,
         100,
         'g',
         true,
         '{"verifier":"verify-nutrition-barcodes"}'::jsonb
       )
       returning id`,
      [sourceId, sourceFoodId, name, brandName, verificationLevel, dataCompleteness],
    );
    return rows[0].id;
  };

  const usdaFoodId = await insertFood({
    sourceId: usdaSourceId,
    sourceFoodId: 'oneup-test-usda-collision',
    name: 'ONE UP Test USDA Collision',
    brandName: 'ONE UP TEST',
    verificationLevel: 'manufacturer',
    dataCompleteness: 1,
  });
  const offFoodId = await insertFood({
    sourceId: offSourceId,
    sourceFoodId: 'oneup-test-off-collision',
    name: 'ONE UP Test OFF Collision',
    brandName: 'ONE UP TEST',
    verificationLevel: 'community',
    dataCompleteness: 0.8,
  });

  await db.query(
    `insert into public.food_barcodes (food_id, barcode, country_code, is_primary)
     values
       ($1, $3, 'US', true),
       ($2, $3, 'US', true)`,
    [usdaFoodId, offFoodId, MOCK_COLLISION_BARCODE],
  );

  const { rows } = await db.query(
    `select *
     from public.resolve_catalog_food_barcode($1, 'US')`,
    [MOCK_COLLISION_BARCODE],
  );

  const resolvedRow = rows[0];

  assertCondition(resolvedRow, 'Collision resolver did not return a row.');
  assertCondition(
    resolvedRow.source_code === 'USDA_BRANDED',
    `Expected USDA_BRANDED to win collision resolution, received ${resolvedRow.source_code}.`,
  );

  return {
    sourceCode: resolvedRow.source_code,
    reason: resolvedRow.resolver_reason,
  };
}

async function run() {
  assertEnv();

  const db = await createDbClient();
  const ownerSession = await createAnonSession('owner');
  const otherSession = await createAnonSession('other');

  try {
    await cleanupVerifierRows(db);

    const normalizationExamples = [
      normalizeBarcode(LOCAL_USDA_UPC),
      normalizeBarcode('3046920029759'),
      normalizeBarcode(REAL_NOT_FOUND_BARCODE),
    ];

    assertCondition(normalizationExamples.every((item) => item.ok), 'Expected normalization examples to succeed.');
    assertCondition(
      normalizationExamples[0].normalizedBarcode === '00038000162367',
      'UPC-A normalization did not preserve the expected GTIN-14 representation.',
    );
    assertCondition(
      normalizationExamples[1].normalizedBarcode === '03046920029759',
      'EAN-13 normalization did not preserve the expected GTIN-14 representation.',
    );
    assertCondition(
      normalizeBarcode('123').ok === false,
      'Malformed barcode should fail normalization.',
    );

    const localLookup = await lookupBarcode(ownerSession.client, LOCAL_USDA_UPC);
    assertCondition(localLookup.row?.status === 'found', 'Expected USDA local barcode lookup to succeed.');
    assertCondition(localLookup.row?.lookup_path === 'local', 'Expected USDA barcode lookup to stay local.');

    const { rows: conversionRows } = await db.query(
      `select
         public.convert_nutrient_unit(0.45, 'g', 'mg') as sodium_mg,
         public.convert_nutrient_unit(2.5, 'µg', 'mcg') as vitamin_d_mcg,
         public.convert_nutrient_unit(840, 'kJ', 'kcal') as energy_kcal`,
    );
    assertNear(Number(conversionRows[0].sodium_mg), 450, 'Sodium conversion failed');
    assertNear(Number(conversionRows[0].vitamin_d_mcg), 2.5, 'Vitamin D conversion failed');
    assertNear(Number(conversionRows[0].energy_kcal), 200.7648, 'Energy conversion failed');

    const importedMock = await importMockProduct(db, MOCK_SUCCESS_PRODUCT, MOCK_SUCCESS_BARCODE);
    assertCondition(importedMock?.status === 'imported', 'Expected mocked OFF import to succeed.');

    const importedMockAgain = await importMockProduct(db, MOCK_SUCCESS_PRODUCT, MOCK_SUCCESS_BARCODE);
    assertCondition(
      importedMockAgain?.food_id === importedMock.food_id,
      'Repeated mocked import should reuse the same catalog food id.',
    );

    const { rows: mockCounts } = await db.query(
      `select
         count(distinct cf.id) as catalog_rows,
         count(distinct fn.nutrient_id) as nutrient_rows,
         count(distinct fs.id) as serving_rows,
         count(distinct fb.id) as barcode_rows
       from public.catalog_foods cf
       left join public.food_nutrients fn on fn.food_id = cf.id
       left join public.food_servings fs on fs.food_id = cf.id
       left join public.food_barcodes fb on fb.food_id = cf.id
       where cf.source_food_id = $1`,
      [MOCK_SUCCESS_BARCODE],
    );

    assertCondition(Number(mockCounts[0].catalog_rows) === 1, 'Mock import should create one catalog row.');
    assertCondition(Number(mockCounts[0].nutrient_rows) >= 14, 'Mock import should store canonical nutrient rows.');
    assertCondition(Number(mockCounts[0].serving_rows) === 2, 'Mock import should store base and household servings.');
    assertCondition(Number(mockCounts[0].barcode_rows) === 1, 'Mock import should store exactly one barcode row.');

    const mockLookupFirst = await lookupBarcode(ownerSession.client, MOCK_SUCCESS_BARCODE);
    const mockLookupSecond = await lookupBarcode(ownerSession.client, MOCK_SUCCESS_BARCODE);
    assertCondition(mockLookupFirst.row?.status === 'found', 'Expected mocked product lookup to resolve locally after import.');
    assertCondition(mockLookupFirst.row?.lookup_path === 'local', 'Expected mocked product lookup path to be local.');
    assertCondition(mockLookupSecond.row?.status === 'found', 'Expected repeated mocked product lookup to stay local.');

    const detail = await fetchCatalogFoodDetails(db, importedMock.food_id);
    const defaultServing =
      detail.servings.find((row) => row.is_default) ?? detail.servings[0];

    assertCondition(defaultServing, 'Expected a default serving for the mocked product.');

    const perServingValues = getServingNutrientValues(detail, defaultServing);
    assertNear(Number(detail.nutrients.energy_kcal), 200.7648, 'Stored base energy should match kJ conversion');
    assertNear(Number(detail.nutrients.sodium), 450, 'Stored base sodium should be converted to mg');
    assertNear(Number(detail.nutrients.vitamin_d), 2.5, 'Stored base vitamin D should stay in mcg');
    assertCondition(Number(detail.nutrients.carbohydrate) === 0, 'Explicit zero carbohydrate should be preserved.');
    assertNear(Number(perServingValues.sodium), 180, 'Serving sodium should be converted to mg');

    const incompleteResult = await importMockProduct(db, MOCK_INCOMPLETE_PRODUCT, MOCK_INCOMPLETE_BARCODE);
    assertCondition(
      incompleteResult?.status === 'incomplete',
      'Expected incomplete mocked product to be rejected.',
    );
    const { rows: incompleteCountRows } = await db.query(
      `select count(*) as count
       from public.catalog_foods
       where source_food_id = $1`,
      [MOCK_INCOMPLETE_BARCODE],
    );
    assertCondition(
      Number(incompleteCountRows[0].count) === 0,
      'Incomplete mocked product should not create a catalog row.',
    );

    const realIncompleteLookup = await lookupBarcode(ownerSession.client, REAL_INCOMPLETE_BARCODE);
    assertCondition(
      realIncompleteLookup.row?.status === 'incomplete',
      'Expected the real incomplete OFF barcode to remain incomplete.',
    );

    const realNotFoundLookup = await lookupBarcode(ownerSession.client, REAL_NOT_FOUND_BARCODE);
    assertCondition(
      realNotFoundLookup.row?.status === 'not_found',
      'Expected the real not-found barcode to return not_found.',
    );

    const collisionResult = await runCollisionTest(db);
    const logResult = await insertAndDeleteFoodLog(
      ownerSession,
      otherSession,
      detail,
      defaultServing,
    );

    const summary = {
      date: '2026-08-10',
      localLookupMs: localLookup.elapsedMs,
      mockLookupMs: mockLookupFirst.elapsedMs,
      realIncompleteLookupMs: realIncompleteLookup.elapsedMs,
      realNotFoundLookupMs: realNotFoundLookup.elapsedMs,
      normalization: {
        upcA: normalizationExamples[0].normalizedBarcode,
        ean13: normalizationExamples[1].normalizedBarcode,
        gtin14: normalizationExamples[2].normalizedBarcode,
      },
      conversions: {
        sodiumMg: Number(conversionRows[0].sodium_mg),
        vitaminDMcg: Number(conversionRows[0].vitamin_d_mcg),
        energyKcal: Number(conversionRows[0].energy_kcal),
      },
      mockImport: {
        foodId: importedMock.food_id,
        barcode: MOCK_SUCCESS_BARCODE,
        productName: MOCK_SUCCESS_PRODUCT.product_name,
        baseEnergyKcal: Number(detail.nutrients.energy_kcal),
        baseSodiumMg: Number(detail.nutrients.sodium),
        baseVitaminDMcg: Number(detail.nutrients.vitamin_d),
        defaultServing: defaultServing.serving_name,
        defaultServingSodiumMg: Number(perServingValues.sodium),
        secondLookupPath: mockLookupSecond.row?.lookup_path ?? null,
      },
      liveStatuses: {
        incomplete: realIncompleteLookup.row?.status ?? null,
        notFound: realNotFoundLookup.row?.status ?? null,
      },
      collision: collisionResult,
      foodLog: logResult,
      verdict: 'ok',
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await cleanupVerifierRows(db);
    await db.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
