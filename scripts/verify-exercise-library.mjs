import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

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

function createPublicClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function createPgClient() {
  const client = new PgClient({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function callSearchRpc(client, params) {
  const { data, error } = await client.rpc('search_exercises', {
    p_query: params.query ?? null,
    p_slug: params.slug ?? null,
    p_exercise_id: params.exerciseId ?? null,
    p_muscle_codes: params.muscleCodes ?? null,
    p_muscle_groups: params.muscleGroups ?? null,
    p_body_regions: params.bodyRegions ?? null,
    p_equipment_codes: params.equipmentCodes ?? null,
    p_exercise_types: params.exerciseTypes ?? null,
    p_difficulty_levels: params.difficultyLevels ?? null,
    p_movement_patterns: params.movementPatterns ?? null,
    p_program_focuses: params.programFocuses ?? null,
    p_limit: params.limit ?? 60,
  });

  if (error) {
    throw new Error(`search_exercises failed: ${error.message}`);
  }

  return data ?? [];
}

async function expectWriteFailure(operationPromise, label, options = {}) {
  const { allowSilentNoop = false } = options;
  const { data, error } = await operationPromise;

  if (!error) {
    if (
      allowSilentNoop &&
      ((Array.isArray(data) && data.length === 0) || data == null)
    ) {
      return;
    }

    throw new Error(`${label}: expected authenticated write to fail`);
  }

  const message = error.message.toLowerCase();
  const matchesRlsOrPrivilegeFailure =
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('not allowed') ||
    message.includes('forbidden') ||
    message.includes('violates row-level security');

  assertCondition(
    matchesRlsOrPrivilegeFailure,
    `${label}: expected RLS/privilege failure, received "${error.message}"`,
  );
}

async function verifyExerciseLibrary() {
  assertEnv();

  const publicClient = createPublicClient();
  const {
    data: authData,
    error: authError,
  } = await publicClient.auth.signInAnonymously();

  if (authError) {
    throw new Error(`Anonymous sign-in failed: ${authError.message}`);
  }

  assertCondition(authData.user?.id, 'Anonymous sign-in did not return a user.');
  const pgClient = await createPgClient();

  try {
    console.log('Checking seeded exercise-library counts...');
    const countsResult = await pgClient.query(`
      select
        (select count(*)::integer from public.muscles) as muscles,
        (select count(*)::integer from public.equipment) as equipment,
        (select count(*)::integer from public.exercises where is_active) as active_exercises,
        (select count(*)::integer from public.exercise_aliases) as aliases,
        (select count(*)::integer from public.exercise_muscles) as exercise_muscles,
        (select count(*)::integer from public.exercise_equipment) as exercise_equipment,
        (select count(*)::integer from (select slug from public.exercises group by slug having count(*) > 1) duplicates) as duplicate_slugs,
        (select count(*)::integer from (select code from public.muscles group by code having count(*) > 1) duplicates) as duplicate_muscle_codes,
        (select count(*)::integer from (select code from public.equipment group by code having count(*) > 1) duplicates) as duplicate_equipment_codes,
        (select count(*)::integer from public.exercise_muscles em left join public.exercises e on e.id = em.exercise_id where e.id is null) as orphan_exercise_muscles,
        (select count(*)::integer from public.exercise_muscles em left join public.muscles m on m.id = em.muscle_id where m.id is null) as orphan_muscle_links,
        (select count(*)::integer from public.exercise_equipment ee left join public.exercises e on e.id = ee.exercise_id where e.id is null) as orphan_exercise_equipment,
        (select count(*)::integer from public.exercise_equipment ee left join public.equipment eq on eq.id = ee.equipment_id where eq.id is null) as orphan_equipment_links
    `);
    const counts = countsResult.rows[0];

    assertCondition(counts.muscles === 21, `Expected 21 muscles, received ${counts.muscles}`);
    assertCondition(counts.equipment === 12, `Expected 12 equipment rows, received ${counts.equipment}`);
    assertCondition(
      counts.active_exercises === 56,
      `Expected 56 active exercises, received ${counts.active_exercises}`,
    );
    assertCondition(counts.aliases >= 20, `Expected aliases to be seeded, received ${counts.aliases}`);
    assertCondition(counts.duplicate_slugs === 0, 'Expected duplicate slugs to equal 0.');
    assertCondition(
      counts.duplicate_muscle_codes === 0,
      'Expected duplicate muscle codes to equal 0.',
    );
    assertCondition(
      counts.duplicate_equipment_codes === 0,
      'Expected duplicate equipment codes to equal 0.',
    );
    assertCondition(
      counts.orphan_exercise_muscles === 0 && counts.orphan_muscle_links === 0,
      'Expected exercise_muscles rows to stay fully connected.',
    );
    assertCondition(
      counts.orphan_exercise_equipment === 0 && counts.orphan_equipment_links === 0,
      'Expected exercise_equipment rows to stay fully connected.',
    );

    console.log('Checking stable slugs and ids...');
    const slugResult = await pgClient.query(
      `
        select slug, id
        from public.exercises
        where slug = any($1::text[])
        order by slug
      `,
      [['barbell-bench-press', 'romanian-deadlift', 'plank']],
    );
    const slugMap = Object.fromEntries(
      slugResult.rows.map((row) => [row.slug, row.id]),
    );
    assertCondition(
      slugMap['barbell-bench-press'] === '4bcd6394-106d-531b-bd20-707153a8f6f6',
      'Stable id mismatch for barbell-bench-press.',
    );
    assertCondition(
      typeof slugMap['romanian-deadlift'] === 'string',
      'Expected romanian-deadlift to exist.',
    );
    assertCondition(typeof slugMap.plank === 'string', 'Expected plank to exist.');

    console.log('Verifying catalog search, alias search, typo tolerance, and filters...');
    const benchResults = await callSearchRpc(publicClient, {
      query: 'bench',
      limit: 10,
    });
    assertCondition(
      benchResults.some((row) => row.slug === 'barbell-bench-press'),
      'Bench search did not return barbell-bench-press.',
    );
    assertCondition(
      benchResults[0]?.slug === 'barbell-bench-press',
      'Bench search did not rank the canonical bench variation first.',
    );

    const squatResults = await callSearchRpc(publicClient, {
      query: 'squat',
      limit: 10,
    });
    assertCondition(
      squatResults.some((row) => row.slug === 'high-bar-squat'),
      'Squat search did not return high-bar-squat.',
    );

    const rowResults = await callSearchRpc(publicClient, {
      query: 'row',
      limit: 10,
    });
    assertCondition(
      rowResults.some((row) => row.slug === 'bent-over-row'),
      'Row search did not return bent-over-row.',
    );

    const curlResults = await callSearchRpc(publicClient, {
      query: 'curl',
      limit: 10,
    });
    assertCondition(
      curlResults.some((row) => row.slug === 'barbell-curl'),
      'Curl search did not return barbell-curl.',
    );

    const aliasResults = await callSearchRpc(publicClient, {
      query: 'rdl',
      limit: 10,
    });
    assertCondition(
      aliasResults.some((row) => row.slug === 'romanian-deadlift'),
      'Alias search for rdl did not return romanian-deadlift.',
    );

    const lateralRaiseResults = await callSearchRpc(publicClient, {
      query: 'lateral raise',
      limit: 10,
    });
    assertCondition(
      lateralRaiseResults.some((row) => row.slug === 'dumbbell-lateral-raise'),
      'Lateral raise search did not return a lateral raise variation.',
    );

    const typoResults = await callSearchRpc(publicClient, {
      query: 'benchh',
      limit: 10,
    });
    assertCondition(
      typoResults.some((row) => row.slug === 'barbell-bench-press'),
      'Typo-tolerant search did not recover barbell-bench-press.',
    );

    const bodyweightResults = await callSearchRpc(publicClient, {
      equipmentCodes: ['bodyweight'],
      limit: 20,
    });
    assertCondition(
      bodyweightResults.some((row) => row.slug === 'push-up'),
      'Bodyweight filter did not return push-up.',
    );

    const dumbbellResults = await callSearchRpc(publicClient, {
      equipmentCodes: ['dumbbell'],
      limit: 20,
    });
    assertCondition(
      dumbbellResults.some((row) => row.slug === 'dumbbell-bench-press'),
      'Dumbbell filter did not return dumbbell-bench-press.',
    );

    const barbellResults = await callSearchRpc(publicClient, {
      equipmentCodes: ['barbell'],
      limit: 20,
    });
    assertCondition(
      barbellResults.some((row) => row.slug === 'overhead-press'),
      'Barbell filter did not return overhead-press.',
    );

    const cableResults = await callSearchRpc(publicClient, {
      equipmentCodes: ['cable'],
      limit: 20,
    });
    assertCondition(
      cableResults.some((row) => row.slug === 'seated-cable-row'),
      'Cable filter did not return seated-cable-row.',
    );

    const chestResults = await callSearchRpc(publicClient, {
      muscleGroups: ['chest'],
      limit: 20,
    });
    assertCondition(
      chestResults.every((row) => Array.isArray(row.muscle_groups) && row.muscle_groups.includes('chest')),
      'Chest filter returned an exercise without the chest muscle group.',
    );

    const backResults = await callSearchRpc(publicClient, {
      muscleGroups: ['back'],
      limit: 20,
    });
    assertCondition(
      backResults.some((row) => row.slug === 'lat-pulldown'),
      'Back filter did not return lat-pulldown.',
    );

    const shoulderResults = await callSearchRpc(publicClient, {
      muscleGroups: ['shoulders'],
      limit: 20,
    });
    assertCondition(
      shoulderResults.some((row) => row.slug === 'dumbbell-lateral-raise'),
      'Shoulders filter did not return dumbbell-lateral-raise.',
    );

    const legsResults = await callSearchRpc(publicClient, {
      muscleGroups: ['legs'],
      limit: 20,
    });
    assertCondition(
      legsResults.some((row) => row.slug === 'high-bar-squat'),
      'Legs filter did not return high-bar-squat.',
    );

    const chestAndDumbbellResults = await callSearchRpc(publicClient, {
      muscleGroups: ['chest'],
      equipmentCodes: ['dumbbell'],
      limit: 20,
    });
    assertCondition(
      chestAndDumbbellResults.some((row) => row.slug === 'dumbbell-bench-press'),
      'Combined chest + dumbbell filter did not return dumbbell-bench-press.',
    );

    const backAndCableResults = await callSearchRpc(publicClient, {
      muscleGroups: ['back'],
      equipmentCodes: ['cable'],
      limit: 20,
    });
    assertCondition(
      backAndCableResults.some((row) => row.slug === 'seated-cable-row'),
      'Combined back + cable filter did not return seated-cable-row.',
    );

    const legsAndBodyweightResults = await callSearchRpc(publicClient, {
      muscleGroups: ['legs'],
      equipmentCodes: ['bodyweight'],
      limit: 20,
    });
    assertCondition(
      legsAndBodyweightResults.some((row) => row.slug === 'bodyweight-squat'),
      'Combined legs + bodyweight filter did not return bodyweight-squat.',
    );

    console.log('Checking detail payload shape...');
    const detailResults = await callSearchRpc(publicClient, {
      slug: 'barbell-bench-press',
      limit: 1,
    });
    assertCondition(detailResults.length === 1, 'Slug lookup did not return exactly one exercise.');
    assertCondition(
      Array.isArray(detailResults[0].instructions) &&
        detailResults[0].instructions.length >= 3,
      'Exercise detail is missing ordered instructions.',
    );
    assertCondition(
      Array.isArray(detailResults[0].primary_muscles) &&
        detailResults[0].primary_muscles.length >= 1,
      'Exercise detail is missing primary muscles.',
    );

    const lowerCompoundDetails = await callSearchRpc(publicClient, {
      slug: 'high-bar-squat',
      limit: 1,
    });
    assertCondition(
      lowerCompoundDetails.length === 1 &&
        lowerCompoundDetails[0].movement_pattern === 'squat',
      'Expected high-bar-squat detail to load with the squat movement pattern.',
    );

    const isolationDetails = await callSearchRpc(publicClient, {
      slug: 'dumbbell-lateral-raise',
      limit: 1,
    });
    assertCondition(
      isolationDetails.length === 1 &&
        isolationDetails[0].mechanic === 'isolation',
      'Expected dumbbell-lateral-raise detail to load as an isolation exercise.',
    );

    const bodyweightDetails = await callSearchRpc(publicClient, {
      slug: 'push-up',
      limit: 1,
    });
    assertCondition(
      bodyweightDetails.length === 1 &&
        bodyweightDetails[0].load_type === 'bodyweight',
      'Expected push-up detail to load with a bodyweight load type.',
    );

    console.log('Verifying RLS write protection for authenticated users...');
    await expectWriteFailure(
      publicClient.from('exercises').insert({
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'verifier-temp-exercise',
        name: 'Verifier Temp Exercise',
        instructions: ['Step 1'],
        exercise_type: 'strength',
        primary_tracking_metric: 'weight_reps',
        load_type: 'external_weight',
        program_focuses: ['strength'],
        source: 'oneup_internal',
        sort_order: 9999,
      }),
      'authenticated insert',
    );
    await expectWriteFailure(
      publicClient
        .from('exercises')
        .update({ description: 'Verifier mutation' })
        .eq('slug', 'barbell-bench-press')
        .select('id'),
      'authenticated update',
      { allowSilentNoop: true },
    );
    await expectWriteFailure(
      publicClient
        .from('exercises')
        .delete()
        .eq('slug', 'barbell-bench-press')
        .select('id'),
      'authenticated delete',
      { allowSilentNoop: true },
    );

    console.log('Exercise library verification passed.');
  } finally {
    await pgClient.end();
  }
}

void verifyExerciseLibrary().catch((error) => {
  console.error(error);
  process.exit(1);
});
