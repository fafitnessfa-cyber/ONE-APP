import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  kilogramsToPounds,
  roundToTwoDecimals,
} from '../lib/workouts/unit-conversion.mjs';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

const WEIGHT_DAY_1 = '2026-08-09T07:00:00.000Z';
const WEIGHT_DAY_8 = '2026-08-16T07:00:00.000Z';
const WEIGHT_DAY_15 = '2026-08-23T07:00:00.000Z';

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

function assertApproximately(actual, expected, tolerance, message) {
  if (Math.abs(Number(actual) - Number(expected)) > tolerance) {
    throw new Error(`${message} Expected ${expected}, received ${actual}.`);
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

async function createAnonymousUser(label) {
  const client = createPublicClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw new Error(`${label}: anonymous sign-in failed: ${error.message}`);
  }

  assertCondition(data.user?.id, `${label}: missing user id after anonymous sign-in`);
  assertCondition(data.session, `${label}: missing session after anonymous sign-in`);

  return {
    client,
    session: data.session,
    userId: data.user.id,
  };
}

async function cleanupUsers(pgClient, userIds) {
  if (userIds.length === 0) {
    return;
  }

  await pgClient.query('delete from auth.users where id = any($1::uuid[])', [userIds]);
}

async function setProfile(client, userId, values, label) {
  const { error } = await client
    .from('profiles')
    .update(values)
    .eq('id', userId);

  if (error) {
    throw new Error(`${label}: profile update failed: ${error.message}`);
  }
}

async function loadCurrentWeightKg(client, label) {
  const { data, error } = await client
    .from('profiles')
    .select('current_weight_kg')
    .single();

  if (error) {
    throw new Error(`${label}: profile load failed: ${error.message}`);
  }

  return Number(data.current_weight_kg);
}

async function findExerciseRows(pgClient, slugs) {
  const result = await pgClient.query(
    `
      select id, slug, name
      from public.exercises
      where slug = any($1::text[])
      order by slug
    `,
    [slugs],
  );

  return Object.fromEntries(result.rows.map((row) => [row.slug, row]));
}

async function getSessionExercise(pgClient, sessionId) {
  const result = await pgClient.query(
    `
      select id, exercise_id, exercise_name_snapshot
      from public.workout_session_exercises
      where workout_session_id = $1
      limit 1
    `,
    [sessionId],
  );

  assertCondition(result.rows.length === 1, `Expected one session exercise for ${sessionId}.`);
  return result.rows[0];
}

async function getOrderedSets(pgClient, sessionExerciseId) {
  const result = await pgClient.query(
    `
      select id, set_number, set_type, is_completed
      from public.workout_sets
      where workout_session_exercise_id = $1
      order by set_number
    `,
    [sessionExerciseId],
  );

  return result.rows;
}

async function setSessionTimestamps(pgClient, sessionId, completedAt, durationSeconds = 2700) {
  const completedDate = new Date(completedAt);
  const startedAt = new Date(completedDate.getTime() - (durationSeconds * 1000)).toISOString();

  await pgClient.query(
    `
      update public.workout_sessions
      set
        started_at = $2::timestamptz,
        completed_at = $3::timestamptz,
        duration_seconds = $4
      where id = $1
    `,
    [sessionId, startedAt, completedAt, durationSeconds],
  );

  await pgClient.query(
    `
      update public.workout_session_exercises
      set
        started_at = $2::timestamptz,
        completed_at = $3::timestamptz
      where workout_session_id = $1
    `,
    [sessionId, startedAt, completedAt],
  );

  await pgClient.query(
    `
      update public.workout_sets
      set completed_at = case when is_completed then $2::timestamptz else null end
      where workout_session_id = $1
    `,
    [sessionId, completedAt],
  );
}

async function createLoggedSession({
  client,
  pgClient,
  sessionName,
  exerciseId,
  setPayloads,
  completedAt,
  cancel = false,
}) {
  const firstPayload = setPayloads[0] ?? {};
  const { data, error } = await client.rpc('start_workout_session', {
    p_session_name: sessionName,
    p_exercises: [
      {
        exercise_id: exerciseId,
        position: 1,
        target_sets: setPayloads.length,
        target_reps_min: firstPayload.reps ?? null,
        target_reps_max: firstPayload.reps ?? null,
        target_weight_kg: firstPayload.weight_kg ?? null,
        target_duration_seconds: firstPayload.duration_seconds ?? null,
        target_distance_meters: firstPayload.distance_meters ?? null,
      },
    ],
  });

  if (error) {
    throw new Error(`${sessionName}: start_workout_session failed: ${error.message}`);
  }

  const sessionId = data?.[0]?.session_id;
  assertCondition(sessionId, `${sessionName}: missing session id.`);

  const sessionExercise = await getSessionExercise(pgClient, sessionId);
  const sets = await getOrderedSets(pgClient, sessionExercise.id);
  assertCondition(
    sets.length === setPayloads.length,
    `${sessionName}: expected ${setPayloads.length} set rows, found ${sets.length}.`,
  );

  for (let index = 0; index < sets.length; index += 1) {
    const payload = setPayloads[index];
    const { error: updateError } = await client
      .from('workout_sets')
      .update(payload)
      .eq('id', sets[index].id);

    if (updateError) {
      throw new Error(`${sessionName}: set ${index + 1} update failed: ${updateError.message}`);
    }
  }

  if (cancel) {
    const { error: cancelError } = await client.rpc('cancel_workout_session', {
      p_workout_session_id: sessionId,
    });

    if (cancelError) {
      throw new Error(`${sessionName}: cancel_workout_session failed: ${cancelError.message}`);
    }

    return { sessionId, sessionExerciseId: sessionExercise.id };
  }

  const { error: completeError } = await client.rpc('complete_workout_session', {
    p_workout_session_id: sessionId,
  });

  if (completeError) {
    throw new Error(`${sessionName}: complete_workout_session failed: ${completeError.message}`);
  }

  await setSessionTimestamps(pgClient, sessionId, completedAt);
  return { sessionId, sessionExerciseId: sessionExercise.id };
}

async function callRpc(client, fn, args, label) {
  const { data, error } = await client.rpc(fn, args);

  if (error) {
    throw new Error(`${label}: ${fn} failed: ${error.message}`);
  }

  return data ?? [];
}

async function explainQuery(pgClient, userId, sql, params, label) {
  await pgClient.query('begin');

  try {
    await pgClient.query(
      `select set_config('request.jwt.claim.sub', $1, true)`,
      [userId],
    );
    const explainResult = await pgClient.query(
      `explain (analyze, buffers) ${sql}`,
      params,
    );
    const explainText = explainResult.rows.map((row) => row['QUERY PLAN']).join('\n');
    const timingMatch = explainText.match(/Execution Time: ([0-9.]+) ms/);
    const executionTimeMs = timingMatch ? Number(timingMatch[1]) : null;

    assertCondition(
      executionTimeMs != null,
      `${label}: EXPLAIN ANALYZE did not include execution time.`,
    );

    return {
      executionTimeMs,
      explainText,
    };
  } finally {
    await pgClient.query('rollback');
  }
}

async function verifyProgress() {
  assertEnv();

  const pgClient = await createPgClient();
  const createdUserIds = [];

  try {
    console.log('Creating authenticated anonymous verifier users...');
    const userA = await createAnonymousUser('user-a');
    const userB = await createAnonymousUser('user-b');
    createdUserIds.push(userA.userId, userB.userId);

    console.log('Bootstrapping profile state...');
    await setProfile(
      userA.client,
      userA.userId,
      {
        display_name: 'Progress Verifier A',
        age_years: 31,
        height_cm: 182,
        current_weight_kg: null,
        target_weight_kg: 76,
        fitness_goal: 'build_muscle',
        experience_level: 'intermediate',
        preferred_training_days_per_week: 4,
        preferred_training_days: ['monday', 'tuesday', 'thursday', 'saturday'],
        preferred_workout_location: 'gym',
        preferred_units: 'imperial',
        onboarding_completed: true,
      },
      'user-a',
    );
    await setProfile(
      userB.client,
      userB.userId,
      {
        display_name: 'Progress Verifier B',
        age_years: 28,
        height_cm: 175,
        current_weight_kg: 70,
        fitness_goal: 'maintain',
        experience_level: 'beginner',
        preferred_training_days_per_week: 3,
        preferred_training_days: ['monday', 'wednesday', 'friday'],
        preferred_workout_location: 'home',
        preferred_units: 'metric',
        onboarding_completed: true,
      },
      'user-b',
    );

    console.log('Resolving exercise ids from the exercise library...');
    const exercises = await findExerciseRows(pgClient, [
      'barbell-bench-press',
      'bent-over-row',
      'high-bar-squat',
      'push-up',
      'plank',
    ]);
    const bench = exercises['barbell-bench-press'];
    const row = exercises['bent-over-row'];
    const squat = exercises['high-bar-squat'];
    const pushUp = exercises['push-up'];
    const plank = exercises.plank;
    assertCondition(bench && row && squat && pushUp && plank, 'Missing seeded exercises.');

    console.log('Running body-weight sync checks...');
    const insertWeight = async (weightKg, measuredAt) => {
      const { data, error } = await userA.client
        .from('body_weight_entries')
        .insert({
          user_id: userA.userId,
          weight_kg: weightKg,
          measured_at: measuredAt,
          source: 'manual',
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(`Weight insert failed: ${error.message}`);
      }

      return data;
    };

    await insertWeight(80, WEIGHT_DAY_1);
    await insertWeight(79.5, WEIGHT_DAY_8);
    const latestWeightEntry = await insertWeight(79.2, WEIGHT_DAY_15);

    const { data: weightHistoryRows, error: weightHistoryError } = await userA.client
      .from('body_weight_entries')
      .select('id, weight_kg, measured_at')
      .order('measured_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (weightHistoryError) {
      throw new Error(`Weight history load failed: ${weightHistoryError.message}`);
    }

    assertCondition(
      weightHistoryRows.length >= 3,
      `Expected at least 3 historical weight rows, found ${weightHistoryRows.length}.`,
    );
    assertCondition(
      Number(weightHistoryRows[0].weight_kg) === 79.2 &&
        Number(weightHistoryRows[1].weight_kg) === 79.5 &&
        Number(weightHistoryRows[2].weight_kg) === 80,
      'Weight history rows were not ordered chronologically by measured_at desc.',
    );
    assertCondition(
      Number(await loadCurrentWeightKg(userA.client, 'user-a')) === 79.2,
      'Profile current_weight_kg should sync to 79.2 kg after the latest insert.',
    );

    const { error: updateLatestWeightError } = await userA.client
      .from('body_weight_entries')
      .update({ weight_kg: 79.0 })
      .eq('id', latestWeightEntry.id);

    if (updateLatestWeightError) {
      throw new Error(`Latest weight update failed: ${updateLatestWeightError.message}`);
    }

    assertCondition(
      Number(await loadCurrentWeightKg(userA.client, 'user-a')) === 79.0,
      'Profile current_weight_kg should sync to 79.0 kg after editing the latest weight.',
    );

    const { error: deleteLatestWeightError } = await userA.client
      .from('body_weight_entries')
      .delete()
      .eq('id', latestWeightEntry.id);

    if (deleteLatestWeightError) {
      throw new Error(`Latest weight delete failed: ${deleteLatestWeightError.message}`);
    }

    assertCondition(
      Number(await loadCurrentWeightKg(userA.client, 'user-a')) === 79.5,
      'Profile current_weight_kg should fall back to 79.5 kg after deleting the latest weight.',
    );

    console.log('Checking shared unit conversion expectations...');
    assertApproximately(
      kilogramsToPounds(79.5),
      175.27,
      0.02,
      '79.5 kg should convert consistently to pounds.',
    );

    console.log('Running body-measurement history and RLS checks...');
    const { data: waistEntryA, error: waistEntryAError } = await userA.client
      .from('body_measurements')
      .insert({
        user_id: userA.userId,
        measurement_type: 'waist',
        value: 90,
        unit: 'cm',
        measured_at: '2026-08-18T07:00:00.000Z',
      })
      .select('*')
      .single();

    if (waistEntryAError) {
      throw new Error(`Waist insert 90 cm failed: ${waistEntryAError.message}`);
    }

    const { error: waistEntryBError } = await userA.client
      .from('body_measurements')
      .insert({
        user_id: userA.userId,
        measurement_type: 'waist',
        value: 88,
        unit: 'cm',
        measured_at: '2026-08-22T07:00:00.000Z',
      });

    if (waistEntryBError) {
      throw new Error(`Waist insert 88 cm failed: ${waistEntryBError.message}`);
    }

    const { data: waistHistoryRows, error: waistHistoryError } = await userA.client
      .from('body_measurements')
      .select('value, measured_at')
      .eq('measurement_type', 'waist')
      .order('measured_at', { ascending: false });

    if (waistHistoryError) {
      throw new Error(`Waist history load failed: ${waistHistoryError.message}`);
    }

    assertCondition(
      Number(waistHistoryRows[0].value) === 88 &&
        Number(waistHistoryRows[1].value) === 90,
      'Waist history should return the newer 88 cm entry before 90 cm.',
    );

    const { data: userBWaistRows, error: userBWaistError } = await userB.client
      .from('body_measurements')
      .select('id')
      .eq('id', waistEntryA.id);

    if (userBWaistError) {
      throw new Error(`User B waist read failed unexpectedly: ${userBWaistError.message}`);
    }

    assertCondition(userBWaistRows.length === 0, 'User B should not read User A measurements.');

    console.log('Creating deterministic workout history for PR checks...');
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Bench 80x8',
      exerciseId: bench.id,
      completedAt: '2026-08-18T10:00:00.000Z',
      setPayloads: [{ weight_kg: 80, reps: 8, is_completed: true }],
    });
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Bench 85x6',
      exerciseId: bench.id,
      completedAt: '2026-08-19T10:00:00.000Z',
      setPayloads: [{ weight_kg: 85, reps: 6, is_completed: true }],
    });
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Bench 90x3',
      exerciseId: bench.id,
      completedAt: '2026-08-20T10:00:00.000Z',
      setPayloads: [{ weight_kg: 90, reps: 3, is_completed: true }],
    });

    const initialBenchRecords = await callRpc(
      userA.client,
      'get_personal_records',
      {
        p_exercise_id: bench.id,
        p_limit: 10,
      },
      'bench records after initial history',
    );

    const initialHeaviestBench = initialBenchRecords.find(
      (row) => row.record_type === 'heaviest_load',
    );
    const initialBenchE1rm = initialBenchRecords.find(
      (row) => row.record_type === 'estimated_one_rep_max',
    );
    assertCondition(
      Number(initialHeaviestBench?.value) === 90,
      'Bench heaviest-load PR should be 90 kg after the first three sessions.',
    );
    assertApproximately(
      Number(initialBenchE1rm?.value),
      102.0,
      0.01,
      'Bench estimated 1RM should be 102.0 kg from 85 x 6.',
    );

    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Bench 70x10',
      exerciseId: bench.id,
      completedAt: '2026-08-21T10:00:00.000Z',
      setPayloads: [{ weight_kg: 70, reps: 10, is_completed: true }],
    });

    const stableBenchRecords = await callRpc(
      userA.client,
      'get_personal_records',
      {
        p_exercise_id: bench.id,
        p_limit: 10,
      },
      'bench records after lower-performance set',
    );
    assertCondition(
      Number(
        stableBenchRecords.find((row) => row.record_type === 'heaviest_load')?.value,
      ) === 90,
      'Bench heaviest-load PR should stay 90 kg after a lower performance later.',
    );

    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Bench 92.5x3',
      exerciseId: bench.id,
      completedAt: '2026-08-22T10:00:00.000Z',
      setPayloads: [{ weight_kg: 92.5, reps: 3, is_completed: true }],
    });

    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Bench Warmup 100x1',
      exerciseId: bench.id,
      completedAt: '2026-08-23T06:30:00.000Z',
      setPayloads: [{ weight_kg: 100, reps: 1, set_type: 'warmup', is_completed: true }],
    });

    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Bench Incomplete 140x1',
      exerciseId: bench.id,
      completedAt: '2026-08-23T07:30:00.000Z',
      setPayloads: [{ weight_kg: 140, reps: 1, is_completed: false }],
    });

    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Cancelled Bench 150x2',
      exerciseId: bench.id,
      completedAt: '2026-08-23T08:30:00.000Z',
      setPayloads: [{ weight_kg: 150, reps: 2, is_completed: true }],
      cancel: true,
    });

    const finalBenchRecords = await callRpc(
      userA.client,
      'get_personal_records',
      {
        p_exercise_id: bench.id,
        p_limit: 10,
      },
      'bench records after warmup/incomplete/cancelled coverage',
    );
    assertCondition(
      Number(
        finalBenchRecords.find((row) => row.record_type === 'heaviest_load')?.value,
      ) === 92.5,
      'Bench heaviest-load PR should update to 92.5 kg after 92.5 x 3.',
    );
    assertApproximately(
      Number(
        finalBenchRecords.find((row) => row.record_type === 'estimated_one_rep_max')?.value,
      ),
      102.0,
      0.01,
      'Bench estimated 1RM should remain 102.0 kg because warmups and higher-load incomplete sets are excluded.',
    );
    assertCondition(
      Number(finalBenchRecords.find((row) => row.record_type === 'max_reps')?.value) === 10,
      'Bench rep PR should be 10 reps from the completed 70 x 10 set.',
    );

    console.log('Creating bodyweight and duration PR history...');
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Push-Up 20',
      exerciseId: pushUp.id,
      completedAt: '2026-08-20T12:00:00.000Z',
      setPayloads: [{ reps: 20, is_completed: true }],
    });
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Push-Up 25',
      exerciseId: pushUp.id,
      completedAt: '2026-08-22T12:00:00.000Z',
      setPayloads: [{ reps: 25, is_completed: true }],
    });
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Plank 45',
      exerciseId: plank.id,
      completedAt: '2026-08-21T12:30:00.000Z',
      setPayloads: [{ duration_seconds: 45, is_completed: true }],
    });
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Plank 60',
      exerciseId: plank.id,
      completedAt: '2026-08-23T12:30:00.000Z',
      setPayloads: [{ duration_seconds: 60, is_completed: true }],
    });
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Row 60x10',
      exerciseId: row.id,
      completedAt: '2026-08-18T16:00:00.000Z',
      setPayloads: [{ weight_kg: 60, reps: 10, is_completed: true }],
    });
    await createLoggedSession({
      client: userA.client,
      pgClient,
      sessionName: 'Squat 100x8',
      exerciseId: squat.id,
      completedAt: '2026-08-19T16:00:00.000Z',
      setPayloads: [{ weight_kg: 100, reps: 8, is_completed: true }],
    });

    const pushUpRecords = await callRpc(
      userA.client,
      'get_personal_records',
      {
        p_exercise_id: pushUp.id,
        p_limit: 10,
      },
      'push-up records',
    );
    assertCondition(
      pushUpRecords.some(
        (row) => row.record_type === 'max_reps' && Number(row.value) === 25,
      ),
      'Push-Up max-reps PR should be 25.',
    );
    assertCondition(
      pushUpRecords.every(
        (row) => row.record_type !== 'heaviest_load' && row.record_type !== 'estimated_one_rep_max',
      ),
      'Bodyweight Push-Up PRs should not invent external-load records.',
    );

    const plankRecords = await callRpc(
      userA.client,
      'get_personal_records',
      {
        p_exercise_id: plank.id,
        p_limit: 10,
      },
      'plank records',
    );
    assertCondition(
      plankRecords.some(
        (row) => row.record_type === 'longest_duration' && Number(row.value) === 60,
      ),
      'Plank duration PR should be 60 seconds.',
    );

    console.log('Verifying weekly analytics and muscle mappings...');
    const [trainingSummary] = await callRpc(
      userA.client,
      'get_training_summary',
      {
        p_timezone: 'UTC',
        p_reference_at: '2026-08-23T12:00:00.000Z',
      },
      'training summary',
    );

    assertCondition(
      Number(trainingSummary.completed_working_sets_this_week) === 11,
      `Expected 11 completed working sets in the current week, received ${trainingSummary.completed_working_sets_this_week}.`,
    );
    assertCondition(
      Number(trainingSummary.completed_workouts_this_week) === 13,
      `Expected 13 completed workouts in the current week, received ${trainingSummary.completed_workouts_this_week}.`,
    );

    const directPrimaryMuscleCounts = await pgClient.query(
      `
        select
          m.code,
          count(*)::integer as set_count
        from public.workout_sets ws
        join public.workout_sessions wss
          on wss.id = ws.workout_session_id
        join public.exercise_muscles em
          on em.exercise_id = ws.exercise_id
         and em.role = 'primary'
        join public.muscles m
          on m.id = em.muscle_id
        where ws.user_id = $1
          and ws.is_completed = true
          and ws.set_type <> 'warmup'
          and wss.status = 'completed'
          and wss.completed_at >= '2026-08-17T00:00:00.000Z'
          and wss.completed_at < '2026-08-24T00:00:00.000Z'
        group by m.code
      `,
      [userA.userId],
    );

    const summaryPrimaryMuscles = Object.fromEntries(
      (trainingSummary.primary_muscle_sets ?? []).map((row) => [row.code, row.setCount]),
    );
    directPrimaryMuscleCounts.rows.forEach((row) => {
      assertCondition(
        Number(summaryPrimaryMuscles[row.code]) === row.set_count,
        `Primary muscle summary mismatch for ${row.code}.`,
      );
    });

    console.log('Checking exercise-history ordering...');
    const benchHistoryRows = await callRpc(
      userA.client,
      'get_exercise_progress',
      {
        p_exercise_id: bench.id,
        p_limit: 20,
      },
      'bench exercise history',
    );
    const benchWorkingHistory = benchHistoryRows.filter((row) => row.counts_as_working_set);
    assertCondition(
      Number(benchWorkingHistory[0]?.weight_kg) === 92.5 &&
        Number(benchWorkingHistory[1]?.weight_kg) === 70 &&
        Number(benchWorkingHistory[2]?.weight_kg) === 90,
      'Bench exercise history should be ordered newest-first and preserve weight/reps snapshots.',
    );

    console.log('Running Progress RLS checks...');
    const { data: userBWeightRows, error: userBWeightError } = await userB.client
      .from('body_weight_entries')
      .select('id')
      .eq('user_id', userA.userId);
    if (userBWeightError) {
      throw new Error(`User B weight read failed unexpectedly: ${userBWeightError.message}`);
    }
    assertCondition(userBWeightRows.length === 0, 'User B should not read User A weights.');

    const userBRecords = await callRpc(
      userB.client,
      'get_personal_records',
      {
        p_exercise_id: bench.id,
        p_limit: 10,
      },
      'user-b personal records',
    );
    assertCondition(userBRecords.length === 0, 'User B should not see User A PR data.');

    const userBExerciseHistory = await callRpc(
      userB.client,
      'get_exercise_progress',
      {
        p_exercise_id: bench.id,
        p_limit: 10,
      },
      'user-b exercise progress',
    );
    assertCondition(
      userBExerciseHistory.length === 0,
      'User B should not see User A exercise progress.',
    );

    const [userBTrainingSummary] = await callRpc(
      userB.client,
      'get_training_summary',
      {
        p_timezone: 'UTC',
        p_reference_at: '2026-08-23T12:00:00.000Z',
      },
      'user-b training summary',
    );
    assertCondition(
      Number(userBTrainingSummary.completed_workouts_this_week) === 0,
      'User B should not inherit User A progress analytics.',
    );

    console.log('Collecting EXPLAIN ANALYZE timings...');
    const recordsExplain = await explainQuery(
      pgClient,
      userA.userId,
      `select * from public.get_personal_records($1::uuid, $2::integer)`,
      [bench.id, 20],
      'personal records explain',
    );
    const summaryExplain = await explainQuery(
      pgClient,
      userA.userId,
      `select * from public.get_training_summary($1::text, $2::timestamptz)`,
      ['UTC', '2026-08-23T12:00:00.000Z'],
      'training summary explain',
    );
    const historyExplain = await explainQuery(
      pgClient,
      userA.userId,
      `select * from public.get_exercise_progress($1::uuid, $2::integer)`,
      [bench.id, 20],
      'exercise history explain',
    );

    assertCondition(
      recordsExplain.executionTimeMs < 250,
      `get_personal_records should stay well under 250 ms for the verifier dataset; received ${recordsExplain.executionTimeMs} ms.`,
    );
    assertCondition(
      summaryExplain.executionTimeMs < 250,
      `get_training_summary should stay well under 250 ms for the verifier dataset; received ${summaryExplain.executionTimeMs} ms.`,
    );
    assertCondition(
      historyExplain.executionTimeMs < 250,
      `get_exercise_progress should stay well under 250 ms for the verifier dataset; received ${historyExplain.executionTimeMs} ms.`,
    );

    console.log('Progress verification passed.');
    console.log(
      JSON.stringify(
        {
          userA: userA.userId,
          userB: userB.userId,
          explainTimingsMs: {
            get_personal_records: recordsExplain.executionTimeMs,
            get_training_summary: summaryExplain.executionTimeMs,
            get_exercise_progress: historyExplain.executionTimeMs,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupUsers(pgClient, createdUserIds);
    await pgClient.end();
  }
}

verifyProgress().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
