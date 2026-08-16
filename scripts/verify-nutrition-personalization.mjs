import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const TEST_DATE = 'Sunday, August 9, 2026';

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

const FIXTURES = {
  banana: {
    name: 'Banana, raw',
    servings: {
      household: '1 banana',
      grams: '100 g',
    },
  },
  egg: {
    name: 'Egg, whole, boiled or poached',
    servings: {
      default: '1 egg',
    },
  },
  oatmeal: {
    name: 'Oatmeal, instant, plain, made with water, no added fat',
    servings: {
      default: '1 cup, cooked',
    },
  },
  rice: {
    name: 'Rice, white, cooked, no added fat',
    servings: {
      default: '1 cup, cooked',
    },
  },
  chicken: {
    name: 'Chicken breast, baked, broiled, or roasted, skin not eaten, from raw',
    servings: {
      default: '100 g',
    },
  },
  yogurt: {
    name: 'Yogurt, Greek, plain, nonfat',
    servings: {
      default: '1 container',
    },
  },
};

const CORE_LOGS = [
  {
    foodKey: 'egg',
    servingKey: 'default',
    quantity: 1,
    meal: 'Breakfast',
    loggedAt: '2026-08-09T08:00:00.000Z',
  },
  {
    foodKey: 'egg',
    servingKey: 'default',
    quantity: 1,
    meal: 'Breakfast',
    loggedAt: '2026-08-07T08:05:00.000Z',
  },
  {
    foodKey: 'egg',
    servingKey: 'default',
    quantity: 1,
    meal: 'Breakfast',
    loggedAt: '2026-08-04T08:10:00.000Z',
  },
  {
    foodKey: 'banana',
    servingKey: 'household',
    quantity: 1,
    meal: 'Breakfast',
    loggedAt: '2026-08-08T08:20:00.000Z',
  },
  {
    foodKey: 'banana',
    servingKey: 'grams',
    quantity: 1,
    meal: 'Snack',
    loggedAt: '2026-08-09T21:00:00.000Z',
  },
  {
    foodKey: 'oatmeal',
    servingKey: 'default',
    quantity: 1,
    meal: 'Breakfast',
    loggedAt: '2026-08-06T08:15:00.000Z',
  },
  {
    foodKey: 'oatmeal',
    servingKey: 'default',
    quantity: 1,
    meal: 'Breakfast',
    loggedAt: '2026-08-01T08:15:00.000Z',
  },
  {
    foodKey: 'rice',
    servingKey: 'default',
    quantity: 1,
    meal: 'Lunch',
    loggedAt: '2026-08-09T12:00:00.000Z',
  },
  {
    foodKey: 'chicken',
    servingKey: 'default',
    quantity: 1,
    meal: 'Lunch',
    loggedAt: '2026-08-09T12:05:00.000Z',
  },
  {
    foodKey: 'rice',
    servingKey: 'default',
    quantity: 1,
    meal: 'Lunch',
    loggedAt: '2026-08-05T12:00:00.000Z',
  },
  {
    foodKey: 'chicken',
    servingKey: 'default',
    quantity: 1,
    meal: 'Lunch',
    loggedAt: '2026-08-05T12:05:00.000Z',
  },
  {
    foodKey: 'yogurt',
    servingKey: 'default',
    quantity: 1,
    meal: 'Dinner',
    loggedAt: '2026-08-07T20:00:00.000Z',
  },
];

const BULK_BLUEPRINTS = [
  {
    foodKey: 'egg',
    servingKey: 'default',
    meal: 'Breakfast',
    quantity: 1,
    count: 18,
    startDaysAgo: 10,
    stepDays: 4,
    hour: 8,
    minute: 12,
  },
  {
    foodKey: 'oatmeal',
    servingKey: 'default',
    meal: 'Breakfast',
    quantity: 1,
    count: 10,
    startDaysAgo: 11,
    stepDays: 5,
    hour: 8,
    minute: 18,
  },
  {
    foodKey: 'rice',
    servingKey: 'default',
    meal: 'Lunch',
    quantity: 1,
    count: 12,
    startDaysAgo: 12,
    stepDays: 5,
    hour: 12,
    minute: 10,
  },
  {
    foodKey: 'chicken',
    servingKey: 'default',
    meal: 'Lunch',
    quantity: 1,
    count: 12,
    startDaysAgo: 13,
    stepDays: 5,
    hour: 12,
    minute: 15,
  },
  {
    foodKey: 'banana',
    servingKey: 'grams',
    meal: 'Snack',
    quantity: 1,
    count: 6,
    startDaysAgo: 14,
    stepDays: 5,
    hour: 20,
    minute: 30,
  },
  {
    foodKey: 'yogurt',
    servingKey: 'default',
    meal: 'Dinner',
    quantity: 1,
    count: 6,
    startDaysAgo: 15,
    stepDays: 5,
    hour: 19,
    minute: 45,
  },
];

const EXPLAIN_RECENT_SQL = `
  with input as (
    select greatest(1, least(coalesce($2::integer, 20), 30)) as capped_limit
  ),
  scoped_logs as (
    select
      case
        when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
        else 'legacy:' || fl.food_id::text
      end as reference_key,
      case
        when fl.catalog_food_id is not null then 'catalog'
        else 'legacy'
      end as entry_type,
      fl.*,
      row_number() over (
        partition by
          case
            when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
            else 'legacy:' || fl.food_id::text
          end
        order by fl.logged_at desc, fl.id desc
      ) as recent_rank,
      count(*) over (
        partition by
          case
            when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
            else 'legacy:' || fl.food_id::text
          end
      ) as log_count
    from public.food_logs fl
    where fl.user_id = $1::uuid
  )
  select
    sl.reference_key,
    sl.entry_type,
    sl.catalog_food_id,
    sl.food_id,
    sl.catalog_serving_id,
    sl.food_name,
    sl.food_brand,
    sl.food_source,
    sl.serving_label,
    sl.serving_quantity,
    sl.effective_grams,
    sl.calories_per_serving,
    sl.protein_per_serving_g,
    sl.carbs_per_serving_g,
    sl.fat_per_serving_g,
    sl.fiber_per_serving_g,
    sl.sodium_mg_per_serving,
    sl.logged_at as last_logged_at,
    sl.log_count
  from scoped_logs sl
  where sl.recent_rank = 1
  order by sl.logged_at desc, sl.reference_key
  limit (select capped_limit from input);
`;

const EXPLAIN_HISTORY_SQL = `
  with input as (
    select
      public.normalize_food_search_text($2::text) as normalized_query,
      trim(regexp_replace(lower(coalesce($2::text, '')), '\\s+', ' ', 'g')) as raw_query_for_trgm,
      greatest(1, least(coalesce($3::integer, 8), 20)) as capped_limit
  ),
  query_state as (
    select
      normalized_query,
      raw_query_for_trgm,
      capped_limit,
      char_length(normalized_query) as query_length
    from input
  ),
  history_window as (
    select
      case
        when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
        else 'legacy:' || fl.food_id::text
      end as reference_key,
      case
        when fl.catalog_food_id is not null then 'catalog'
        else 'legacy'
      end as entry_type,
      fl.*,
      public.normalize_food_search_text(coalesce(fl.food_name, '')) as normalized_name,
      lower(coalesce(fl.food_name, '')) as lower_name,
      lower(coalesce(fl.food_brand, '')) as lower_brand
    from public.food_logs fl
    cross join query_state qs
    where fl.user_id = $1::uuid
      and qs.query_length >= 2
      and fl.logged_at >= timezone('utc'::text, now()) - interval '180 days'
  ),
  matched_logs as (
    select
      hw.*,
      (
        case
          when hw.normalized_name = qs.normalized_query then 120
          when hw.normalized_name like qs.normalized_query || '%' then 92
          when hw.normalized_name like '% ' || qs.normalized_query || '%' then 78
          when hw.normalized_name like '%' || qs.normalized_query || '%' then 64
          else 0
        end
        + case
            when qs.query_length >= 3 then greatest(similarity(hw.lower_name, qs.raw_query_for_trgm), 0) * 28
            else 0
          end
        + case
            when qs.query_length >= 3
              and hw.lower_brand <> ''
              and hw.lower_brand % qs.raw_query_for_trgm
              then greatest(similarity(hw.lower_brand, qs.raw_query_for_trgm), 0) * 10
            else 0
          end
      )::double precision as text_relevance
    from history_window hw
    cross join query_state qs
    where
      hw.normalized_name = qs.normalized_query
      or hw.normalized_name like qs.normalized_query || '%'
      or hw.normalized_name like '% ' || qs.normalized_query || '%'
      or hw.normalized_name like '%' || qs.normalized_query || '%'
      or (
        qs.query_length >= 3
        and (
          hw.lower_name % qs.raw_query_for_trgm
          or (hw.lower_brand <> '' and hw.lower_brand % qs.raw_query_for_trgm)
        )
      )
  ),
  aggregated as (
    select
      ml.reference_key,
      ml.entry_type,
      max(ml.logged_at) as last_logged_at,
      count(*) as log_count,
      max(ml.text_relevance) as text_relevance
    from matched_logs ml
    group by ml.reference_key, ml.entry_type
  ),
  latest_rows as (
    select distinct on (ml.reference_key)
      ml.reference_key,
      ml.catalog_food_id,
      ml.food_id,
      ml.catalog_serving_id,
      ml.food_name,
      ml.food_brand,
      ml.food_source,
      ml.serving_label,
      ml.serving_quantity,
      ml.effective_grams,
      ml.calories_per_serving,
      ml.protein_per_serving_g,
      ml.carbs_per_serving_g,
      ml.fat_per_serving_g,
      ml.fiber_per_serving_g,
      ml.sodium_mg_per_serving
    from matched_logs ml
    order by ml.reference_key, ml.logged_at desc, ml.id desc
  )
  select
    lr.reference_key,
    a.entry_type,
    lr.catalog_food_id,
    lr.food_id,
    lr.catalog_serving_id,
    lr.food_name,
    lr.food_brand,
    lr.food_source,
    lr.serving_label,
    lr.serving_quantity,
    lr.effective_grams,
    lr.calories_per_serving,
    lr.protein_per_serving_g,
    lr.carbs_per_serving_g,
    lr.fat_per_serving_g,
    lr.fiber_per_serving_g,
    lr.sodium_mg_per_serving,
    a.last_logged_at,
    a.log_count,
    (
      a.text_relevance
      + greatest(
          0::double precision,
          24::double precision
            - least(
                extract(epoch from (timezone('utc'::text, now()) - a.last_logged_at)) / 86400::double precision,
                60::double precision
              ) * 0.4
        )
      + least(18::double precision, ln((a.log_count + 1)::numeric)::double precision * 6)
    ) as history_score
  from aggregated a
  join latest_rows lr on lr.reference_key = a.reference_key
  order by history_score desc, a.last_logged_at desc, lr.food_name asc
  limit (select capped_limit from query_state);
`;

const EXPLAIN_GO_TO_SQL = `
  with input as (
    select
      $2::public.meal_type as requested_meal,
      greatest(1, least(coalesce($3::integer, 8), 20)) as capped_limit
  ),
  history_window as (
    select
      case
        when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
        else 'legacy:' || fl.food_id::text
      end as reference_key,
      case
        when fl.catalog_food_id is not null then 'catalog'
        else 'legacy'
      end as entry_type,
      fl.*
    from public.food_logs fl
    where fl.user_id = $1::uuid
      and fl.logged_at >= timezone('utc'::text, now()) - interval '180 days'
  ),
  aggregated as (
    select
      hw.reference_key,
      hw.entry_type,
      max(hw.logged_at) as last_logged_at,
      count(*) as log_count,
      count(*) filter (where hw.meal = i.requested_meal) as meal_match_count
    from history_window hw
    cross join input i
    group by hw.reference_key, hw.entry_type
  ),
  latest_rows as (
    select distinct on (hw.reference_key)
      hw.reference_key,
      hw.catalog_food_id,
      hw.food_id,
      hw.catalog_serving_id,
      hw.food_name,
      hw.food_brand,
      hw.food_source,
      hw.serving_label,
      hw.serving_quantity,
      hw.effective_grams,
      hw.calories_per_serving,
      hw.protein_per_serving_g,
      hw.carbs_per_serving_g,
      hw.fat_per_serving_g,
      hw.fiber_per_serving_g,
      hw.sodium_mg_per_serving,
      hw.meal as latest_meal
    from history_window hw
    order by hw.reference_key, hw.logged_at desc, hw.id desc
  ),
  eligible as (
    select
      a.reference_key,
      a.entry_type,
      a.last_logged_at,
      a.log_count,
      a.meal_match_count,
      least(36::double precision, ln((a.log_count + 1)::numeric)::double precision * 14) as frequency_component,
      greatest(
        0::double precision,
        28::double precision
          - least(
              extract(epoch from (timezone('utc'::text, now()) - a.last_logged_at)) / 86400::double precision,
              45::double precision
            ) * 0.65
      ) as recency_component,
      case
        when i.requested_meal is null then 0::double precision
        when a.meal_match_count = 0 then 0::double precision
        else least(
          32::double precision,
          (a.meal_match_count::double precision * 10)
            + case
                when lr.latest_meal = i.requested_meal then 6::double precision
                else 0::double precision
              end
        )
      end as meal_context_component
    from aggregated a
    join latest_rows lr on lr.reference_key = a.reference_key
    cross join input i
    where a.log_count >= 2
      and (i.requested_meal is null or a.meal_match_count > 0)
  )
  select
    lr.reference_key,
    e.entry_type,
    lr.catalog_food_id,
    lr.food_id,
    lr.catalog_serving_id,
    lr.food_name,
    lr.food_brand,
    lr.food_source,
    lr.serving_label,
    lr.serving_quantity,
    lr.effective_grams,
    lr.calories_per_serving,
    lr.protein_per_serving_g,
    lr.carbs_per_serving_g,
    lr.fat_per_serving_g,
    lr.fiber_per_serving_g,
    lr.sodium_mg_per_serving,
    e.last_logged_at,
    e.log_count,
    e.meal_match_count,
    (
      e.frequency_component
      + e.recency_component
      + e.meal_context_component
    ) as go_to_score
  from eligible e
  join latest_rows lr on lr.reference_key = e.reference_key
  order by go_to_score desc, e.last_logged_at desc, lr.food_name asc
  limit (select capped_limit from input);
`;

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

function fixtureServingName(foodKey, servingKey) {
  return FIXTURES[foodKey].servings[servingKey];
}

function createPgClient() {
  const databaseUrl = new URL(SUPABASE_DB_URL);

  return new PgClient({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 5432),
    database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

function isoDaysAgo(daysAgo, hour, minute) {
  const base = new Date('2026-08-09T00:00:00.000Z');
  base.setUTCDate(base.getUTCDate() - daysAgo);
  base.setUTCHours(hour, minute, 0, 0);
  return base.toISOString();
}

function buildScenarioLogs() {
  const logs = [...CORE_LOGS];

  for (const blueprint of BULK_BLUEPRINTS) {
    for (let index = 0; index < blueprint.count; index += 1) {
      logs.push({
        foodKey: blueprint.foodKey,
        servingKey: blueprint.servingKey,
        quantity: blueprint.quantity,
        meal: blueprint.meal,
        loggedAt: isoDaysAgo(
          blueprint.startDaysAgo + index * blueprint.stepDays,
          blueprint.hour,
          blueprint.minute,
        ),
      });
    }
  }

  return logs.sort(
    (left, right) => new Date(left.loggedAt).getTime() - new Date(right.loggedAt).getTime(),
  );
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
    .select(
      'id, serving_name, quantity, gram_weight, milliliter_volume, household_unit, is_default',
    )
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
  assertCondition(serving, `Serving "${servingName}" not found for ${detail.food.name}`);
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

function buildLogPayload(userId, detail, servingName, quantity, meal, loggedAt) {
  const serving = findServing(detail, servingName);
  const snapshot = calculateSnapshot(detail, serving, quantity);

  return {
    snapshot,
    payload: {
      user_id: userId,
      meal,
      logged_at: loggedAt,
      note: null,
      ...snapshot.payload,
    },
  };
}

async function insertCatalogLogs(client, payloads) {
  const { data, error } = await client.from('food_logs').insert(payloads).select('*');

  if (error) {
    throw new Error(`Bulk food log insert failed: ${error.message}`);
  }

  return data ?? [];
}

async function callRpc(client, functionName, args, label) {
  const { data, error } = await client.rpc(functionName, args);

  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }

  return data ?? [];
}

function findRowByName(rows, foodName) {
  return rows.find((row) => row.food_name === foodName) ?? null;
}

async function verifyFavoriteIsolation(ownerClient, otherClient, favoriteId) {
  const { data: selectRows, error: selectError } = await otherClient
    .from('food_favorites')
    .select('id')
    .eq('id', favoriteId);

  if (selectError) {
    throw new Error(`Favorite RLS select check failed: ${selectError.message}`);
  }

  assertCondition((selectRows?.length ?? 0) === 0, 'User B should not see User A favorites');

  const { data: updateRows, error: updateError } = await otherClient
    .from('food_favorites')
    .update({ sort_order: 999 })
    .eq('id', favoriteId)
    .select('id');

  if (updateError) {
    throw new Error(`Favorite RLS update check failed: ${updateError.message}`);
  }

  assertCondition((updateRows?.length ?? 0) === 0, 'User B should not update User A favorites');

  const { data: deleteRows, error: deleteError } = await otherClient
    .from('food_favorites')
    .delete()
    .eq('id', favoriteId)
    .select('id');

  if (deleteError) {
    throw new Error(`Favorite RLS delete check failed: ${deleteError.message}`);
  }

  assertCondition((deleteRows?.length ?? 0) === 0, 'User B should not delete User A favorites');

  const { data: ownerRows, error: ownerError } = await ownerClient
    .from('food_favorites')
    .select('id')
    .eq('id', favoriteId);

  if (ownerError) {
    throw new Error(`Favorite owner re-check failed: ${ownerError.message}`);
  }

  assertCondition(
    (ownerRows?.length ?? 0) === 1,
    'Owner favorite should still exist after RLS checks',
  );
}

async function verifyRpcIsolation(client) {
  const recentRows = await callRpc(
    client,
    'get_recent_foods',
    { result_limit: 20 },
    'User B recents RPC failed',
  );
  const historyRows = await callRpc(
    client,
    'search_food_history',
    { search_query: 'egg', result_limit: 8 },
    'User B history RPC failed',
  );
  const goToRows = await callRpc(
    client,
    'get_food_go_tos',
    { meal_context: 'Breakfast', result_limit: 8 },
    'User B go-to RPC failed',
  );

  assertCondition(recentRows.length === 0, 'User B recents should be empty');
  assertCondition(historyRows.length === 0, 'User B history should be empty');
  assertCondition(goToRows.length === 0, 'User B go-tos should be empty');
}

async function explainSqlQuery(sql, params) {
  const pgClient = createPgClient();
  await pgClient.connect();

  try {
    const result = await pgClient.query(
      `explain (analyze, buffers, verbose) ${sql}`,
      params,
    );
    const planText = result.rows.map((row) => row['QUERY PLAN']).join('\n');
    const executionMatch = planText.match(/Execution Time: ([0-9.]+) ms/);
    const indexMatches = [
      ...planText.matchAll(/Index(?: Only)? Scan using ([^ ]+)/g),
      ...planText.matchAll(/Bitmap Index Scan on ([^ ]+)/g),
    ];
    const indexes = [...new Set(indexMatches.map((match) => match[1]))];

    return {
      planText,
      executionMs: executionMatch ? Number(executionMatch[1]) : null,
      indexes,
    };
  } finally {
    await pgClient.end();
  }
}

async function cleanupUsers(userIds) {
  if (userIds.length === 0) {
    return;
  }

  const pgClient = createPgClient();
  await pgClient.connect();

  try {
    await pgClient.query('begin');
    await pgClient.query('delete from public.food_favorites where user_id = any($1::uuid[])', [userIds]);
    await pgClient.query('delete from public.food_logs where user_id = any($1::uuid[])', [userIds]);
    await pgClient.query('delete from public.nutrition_goals where user_id = any($1::uuid[])', [userIds]);
    await pgClient.query('delete from auth.users where id = any($1::uuid[])', [userIds]);
    await pgClient.query('commit');
  } catch (error) {
    await pgClient.query('rollback');
    throw error;
  } finally {
    await pgClient.end();
  }
}

async function main() {
  assertEnv();

  const createdUserIds = [];
  const { client: clientA, userId: userAId } = await createAnonSession('clientA');
  createdUserIds.push(userAId);
  const { client: clientB, userId: userBId } = await createAnonSession('clientB');
  createdUserIds.push(userBId);

  try {
    const detailsByKey = Object.fromEntries(
      await Promise.all(
        Object.entries(FIXTURES).map(async ([foodKey, fixture]) => [
          foodKey,
          await fetchFoodDetail(clientA, fixture.name),
        ]),
      ),
    );

    const scenarioDefinitions = buildScenarioLogs();
    const scenarioPayloads = scenarioDefinitions.map((definition) =>
      buildLogPayload(
        userAId,
        detailsByKey[definition.foodKey],
        fixtureServingName(definition.foodKey, definition.servingKey),
        definition.quantity,
        definition.meal,
        definition.loggedAt,
      ),
    );

    const insertedLogs = await insertCatalogLogs(
      clientA,
      scenarioPayloads.map((entry) => entry.payload),
    );

    assertCondition(
      insertedLogs.length === scenarioPayloads.length,
      'Inserted log count mismatch',
    );

    const recentRows = await callRpc(
      clientA,
      'get_recent_foods',
      { result_limit: 20 },
      'Recent foods RPC failed',
    );
    const eggRecentRows = recentRows.filter((row) => row.food_name === FIXTURES.egg.name);
    const bananaRecent = findRowByName(recentRows, FIXTURES.banana.name);

    assertCondition(eggRecentRows.length === 1, 'Egg should appear once in recents');
    assertCondition(bananaRecent != null, 'Banana should appear in recents');
    assertCondition(
      bananaRecent.serving_label === FIXTURES.banana.servings.grams,
      'Recent banana should keep the most recent serving label',
    );

    const historyEggRows = await callRpc(
      clientA,
      'search_food_history',
      { search_query: 'egg', result_limit: 5 },
      'Egg history RPC failed',
    );
    const historyChickenRows = await callRpc(
      clientA,
      'search_food_history',
      { search_query: 'chicken', result_limit: 5 },
      'Chicken history RPC failed',
    );
    const historySalmonRows = await callRpc(
      clientA,
      'search_food_history',
      { search_query: 'salmon', result_limit: 5 },
      'Salmon history RPC failed',
    );
    const salmonCatalogRows = await callRpc(
      clientA,
      'search_catalog_foods',
      { search_query: 'salmon', result_limit: 5 },
      'Salmon catalog RPC failed',
    );

    assertCondition(
      historyEggRows[0]?.food_name === FIXTURES.egg.name,
      'Egg should rank first in egg history search',
    );
    assertCondition(
      historyChickenRows.some((row) => row.food_name === FIXTURES.chicken.name),
      'Chicken history search should include the logged chicken food',
    );
    assertCondition(
      historySalmonRows.every((row) => row.food_name !== FIXTURES.egg.name),
      'Egg should not appear for unrelated salmon history search',
    );
    assertCondition(
      salmonCatalogRows.some((row) => /salmon/i.test(row.name)),
      'Catalog salmon search should still return salmon foods',
    );

    const breakfastGoToRows = await callRpc(
      clientA,
      'get_food_go_tos',
      { meal_context: 'Breakfast', result_limit: 8 },
      'Breakfast go-to RPC failed',
    );
    const lunchGoToRows = await callRpc(
      clientA,
      'get_food_go_tos',
      { meal_context: 'Lunch', result_limit: 8 },
      'Lunch go-to RPC failed',
    );

    assertCondition(
      breakfastGoToRows.some((row) => row.food_name === FIXTURES.egg.name),
      'Breakfast go-tos should include eggs',
    );
    assertCondition(
      breakfastGoToRows.some((row) => row.food_name === FIXTURES.oatmeal.name),
      'Breakfast go-tos should include oatmeal',
    );
    assertCondition(
      breakfastGoToRows.every(
        (row) =>
          row.food_name !== FIXTURES.rice.name &&
          row.food_name !== FIXTURES.chicken.name,
      ),
      'Breakfast go-tos should not include lunch-only foods',
    );
    assertCondition(
      lunchGoToRows.some((row) => row.food_name === FIXTURES.rice.name),
      'Lunch go-tos should include rice',
    );
    assertCondition(
      lunchGoToRows.some((row) => row.food_name === FIXTURES.chicken.name),
      'Lunch go-tos should include chicken',
    );
    assertCondition(
      lunchGoToRows.every(
        (row) =>
          row.food_name !== FIXTURES.egg.name &&
          row.food_name !== FIXTURES.oatmeal.name,
      ),
      'Lunch go-tos should not include breakfast-only foods',
    );

    const bananaDetail = detailsByKey.banana;
    const bananaHousehold = buildLogPayload(
      userAId,
      bananaDetail,
      FIXTURES.banana.servings.household,
      1,
      'Breakfast',
      '2026-08-09T09:30:00.000Z',
    );
    const bananaHundredGrams = buildLogPayload(
      userAId,
      bananaDetail,
      FIXTURES.banana.servings.grams,
      1,
      'Breakfast',
      '2026-08-09T09:35:00.000Z',
    );

    const { data: favoriteRows, error: favoriteError } = await clientA
      .from('food_favorites')
      .insert([
        {
          user_id: userAId,
          catalog_food_id: bananaDetail.food.id,
          catalog_serving_id: bananaHousehold.payload.catalog_serving_id,
          serving_label: bananaHousehold.payload.serving_label,
          serving_quantity: bananaHousehold.payload.serving_quantity,
          effective_grams: bananaHousehold.payload.effective_grams,
          display_name: null,
          sort_order: 0,
        },
        {
          user_id: userAId,
          catalog_food_id: bananaDetail.food.id,
          catalog_serving_id: bananaHundredGrams.payload.catalog_serving_id,
          serving_label: bananaHundredGrams.payload.serving_label,
          serving_quantity: bananaHundredGrams.payload.serving_quantity,
          effective_grams: bananaHundredGrams.payload.effective_grams,
          display_name: null,
          sort_order: 1,
        },
      ])
      .select('*');

    if (favoriteError) {
      throw new Error(`Favorite insert failed: ${favoriteError.message}`);
    }

    assertCondition(favoriteRows.length === 2, 'Two banana favorites should be allowed');

    const gramsFavorite = favoriteRows.find(
      (row) => row.serving_label === FIXTURES.banana.servings.grams,
    );
    const householdFavorite = favoriteRows.find(
      (row) => row.serving_label === FIXTURES.banana.servings.household,
    );

    assertCondition(gramsFavorite, '100 g banana favorite should exist');
    assertCondition(householdFavorite, '1 banana favorite should exist');

    await verifyFavoriteIsolation(clientA, clientB, householdFavorite.id);
    await verifyRpcIsolation(clientB);

    const { data: removedFavoriteRows, error: removeFavoriteError } = await clientA
      .from('food_favorites')
      .delete()
      .eq('id', gramsFavorite.id)
      .select('*');

    if (removeFavoriteError) {
      throw new Error(`Favorite delete failed: ${removeFavoriteError.message}`);
    }

    assertCondition(removedFavoriteRows.length === 1, 'One favorite should be removed');

    const { data: remainingFavorites, error: remainingFavoritesError } = await clientA
      .from('food_favorites')
      .select('*')
      .order('sort_order', { ascending: true });

    if (remainingFavoritesError) {
      throw new Error(`Favorite re-check failed: ${remainingFavoritesError.message}`);
    }

    assertCondition(
      remainingFavorites.length === 1,
      'One banana favorite should remain after deletion',
    );
    assertCondition(
      remainingFavorites[0].serving_label === FIXTURES.banana.servings.household,
      'The household banana favorite should remain',
    );

    const favoriteLogRows = await insertCatalogLogs(clientA, [bananaHousehold.payload]);
    const favoriteLog = favoriteLogRows[0];

    assertNear(
      Number(favoriteLog.calories),
      bananaHousehold.snapshot.payload.calories,
      'Favorite-based banana log should use current catalog calories',
    );
    assertCondition(
      favoriteLog.serving_label === FIXTURES.banana.servings.household,
      'Favorite-based banana log should preserve the selected serving label',
    );

    const recentPlan = await explainSqlQuery(EXPLAIN_RECENT_SQL, [userAId, 20]);
    const historyPlan = await explainSqlQuery(EXPLAIN_HISTORY_SQL, [
      userAId,
      'egg',
      8,
    ]);
    const goToPlan = await explainSqlQuery(EXPLAIN_GO_TO_SQL, [
      userAId,
      'Breakfast',
      8,
    ]);

    console.log(
      JSON.stringify(
        {
          testDate: TEST_DATE,
          users: {
            userA: userAId,
            userB: userBId,
          },
          dataset: {
            insertedScenarioLogs: insertedLogs.length,
            insertedFavoriteLog: favoriteLog.id,
          },
          recents: recentRows.slice(0, 6).map((row) => ({
            food_name: row.food_name,
            serving_label: row.serving_label,
            last_logged_at: row.last_logged_at,
            log_count: row.log_count,
          })),
          history: {
            egg: historyEggRows.slice(0, 3).map((row) => ({
              food_name: row.food_name,
              history_score: row.history_score,
              log_count: row.log_count,
            })),
            chicken: historyChickenRows.slice(0, 3).map((row) => ({
              food_name: row.food_name,
              history_score: row.history_score,
              log_count: row.log_count,
            })),
            salmon: historySalmonRows.slice(0, 3).map((row) => ({
              food_name: row.food_name,
              history_score: row.history_score,
              log_count: row.log_count,
            })),
          },
          salmonCatalog: salmonCatalogRows.slice(0, 3).map((row) => row.name),
          goTos: {
            breakfast: breakfastGoToRows.slice(0, 5).map((row) => ({
              food_name: row.food_name,
              go_to_score: row.go_to_score,
              log_count: row.log_count,
              meal_match_count: row.meal_match_count,
            })),
            lunch: lunchGoToRows.slice(0, 5).map((row) => ({
              food_name: row.food_name,
              go_to_score: row.go_to_score,
              log_count: row.log_count,
              meal_match_count: row.meal_match_count,
            })),
          },
          favorites: {
            created: favoriteRows.map((row) => ({
              id: row.id,
              serving_label: row.serving_label,
              serving_quantity: row.serving_quantity,
              effective_grams: row.effective_grams,
            })),
            remaining: remainingFavorites.map((row) => ({
              id: row.id,
              serving_label: row.serving_label,
              serving_quantity: row.serving_quantity,
              effective_grams: row.effective_grams,
            })),
          },
          favoriteLog: {
            id: favoriteLog.id,
            serving_label: favoriteLog.serving_label,
            calories: favoriteLog.calories,
            nutrients_snapshot: favoriteLog.nutrients_snapshot,
          },
          performance: {
            recent: {
              executionMs: recentPlan.executionMs,
              indexes: recentPlan.indexes,
              planText: recentPlan.planText,
            },
            history: {
              executionMs: historyPlan.executionMs,
              indexes: historyPlan.indexes,
              planText: historyPlan.planText,
            },
            goTos: {
              executionMs: goToPlan.executionMs,
              indexes: goToPlan.indexes,
              planText: goToPlan.planText,
            },
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupUsers(createdUserIds);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
