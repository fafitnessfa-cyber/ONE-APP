import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { poundsToKilograms } from '../lib/workouts/unit-conversion.mjs';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

const SESSION_SELECT = `
  id,
  user_id,
  workout_plan_id,
  workout_plan_day_id,
  name_snapshot,
  status,
  started_at,
  completed_at,
  duration_seconds,
  notes,
  created_at,
  updated_at,
  workout_session_exercises (
    id,
    workout_session_id,
    workout_plan_exercise_id,
    exercise_id,
    exercise_name_snapshot,
    position,
    tracking_metric_snapshot,
    load_type_snapshot,
    notes,
    started_at,
    completed_at,
    created_at,
    updated_at,
    workout_sets (
      id,
      user_id,
      workout_session_id,
      workout_session_exercise_id,
      exercise_id,
      set_number,
      set_type,
      weight_kg,
      reps,
      duration_seconds,
      distance_meters,
      assistance_weight_kg,
      bodyweight_kg_snapshot,
      rpe,
      rir,
      is_completed,
      completed_at,
      planned_reps_min,
      planned_reps_max,
      planned_weight_kg,
      planned_duration_seconds,
      planned_distance_meters,
      created_at,
      updated_at
    )
  )
`;

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

async function loadSession(client, sessionId, label) {
  const { data, error } = await client
    .from('workout_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .single();

  if (error) {
    throw new Error(`${label}: workout session load failed: ${error.message}`);
  }

  return data;
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

async function getPlanDayIds(pgClient, planId) {
  const result = await pgClient.query(
    `
      select id, name
      from public.workout_plan_days
      where workout_plan_id = $1
      order by day_order
    `,
    [planId],
  );

  return Object.fromEntries(result.rows.map((row) => [row.name, row.id]));
}

async function getSessionExerciseByName(pgClient, sessionId, name) {
  const result = await pgClient.query(
    `
      select id, exercise_id, exercise_name_snapshot, tracking_metric_snapshot, load_type_snapshot
      from public.workout_session_exercises
      where workout_session_id = $1
        and exercise_name_snapshot = $2
      limit 1
    `,
    [sessionId, name],
  );

  assertCondition(result.rows.length === 1, `Expected one session exercise for ${name}.`);
  return result.rows[0];
}

async function getOrderedSets(pgClient, sessionExerciseId) {
  const result = await pgClient.query(
    `
      select *
      from public.workout_sets
      where workout_session_exercise_id = $1
      order by set_number
    `,
    [sessionExerciseId],
  );

  return result.rows;
}

async function verifyWorkouts() {
  assertEnv();

  const pgClient = await createPgClient();
  const createdUserIds = [];

  try {
    console.log('Creating authenticated anonymous verifier users...');
    const userA = await createAnonymousUser('user-a');
    const userB = await createAnonymousUser('user-b');
    createdUserIds.push(userA.userId, userB.userId);

    console.log('Bootstrapping profile state for workout logging...');
    await setProfile(
      userA.client,
      userA.userId,
      {
        display_name: 'Workout Verifier A',
        age_years: 31,
        height_cm: 182.88,
        current_weight_kg: 80,
        fitness_goal: 'improve_strength',
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
        display_name: 'Workout Verifier B',
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

    console.log('Resolving exercise ids from the exercise catalog...');
    const exerciseRows = await findExerciseRows(pgClient, [
      'barbell-bench-press',
      'bent-over-row',
      'overhead-press',
      'high-bar-squat',
      'romanian-deadlift',
      'push-up',
      'plank',
    ]);

    const bench = exerciseRows['barbell-bench-press'];
    const row = exerciseRows['bent-over-row'];
    const overheadPress = exerciseRows['overhead-press'];
    const squat = exerciseRows['high-bar-squat'];
    const rdl = exerciseRows['romanian-deadlift'];
    const pushUp = exerciseRows['push-up'];
    const plank = exerciseRows.plank;

    assertCondition(bench && row && overheadPress && squat && rdl && pushUp && plank, 'Missing expected seeded exercises.');

    console.log('Creating the Upper/Lower workout plan through the plan RPC...');
    const { data: createdPlanId, error: createPlanError } = await userA.client.rpc(
      'save_workout_plan',
      {
        p_name: 'Test Upper Lower',
        p_description: 'Workout verifier plan',
        p_is_active: true,
        p_is_template: false,
        p_days: [
          {
            name: 'Upper',
            day_order: 1,
            exercises: [
              {
                exercise_id: bench.id,
                position: 1,
                target_sets: 3,
                target_reps_min: 8,
                target_reps_max: 8,
                target_weight_kg: 75,
                rest_seconds: 90,
              },
              {
                exercise_id: row.id,
                position: 2,
                target_sets: 3,
                target_reps_min: 10,
                target_reps_max: 10,
                target_weight_kg: 50,
                rest_seconds: 90,
              },
              {
                exercise_id: overheadPress.id,
                position: 3,
                target_sets: 3,
                target_reps_min: 10,
                target_reps_max: 10,
                target_weight_kg: 32.5,
                rest_seconds: 90,
              },
            ],
          },
          {
            name: 'Lower',
            day_order: 2,
            exercises: [
              {
                exercise_id: squat.id,
                position: 1,
                target_sets: 4,
                target_reps_min: 8,
                target_reps_max: 8,
                target_weight_kg: 100,
                rest_seconds: 120,
              },
              {
                exercise_id: rdl.id,
                position: 2,
                target_sets: 3,
                target_reps_min: 8,
                target_reps_max: 8,
                target_weight_kg: 90,
                rest_seconds: 120,
              },
            ],
          },
        ],
      },
    );

    if (createPlanError) {
      throw new Error(`Plan creation failed: ${createPlanError.message}`);
    }

    assertCondition(createdPlanId, 'Plan creation did not return a plan id.');
    const planDayIds = await getPlanDayIds(pgClient, createdPlanId);
    assertCondition(planDayIds.Upper && planDayIds.Lower, 'Plan days were not created.');

    console.log('Starting the planned Upper workout session...');
    const { data: startedUpperSession, error: startUpperError } = await userA.client.rpc(
      'start_workout_session',
      {
        p_workout_plan_day_id: planDayIds.Upper,
      },
    );

    if (startUpperError) {
      throw new Error(`Upper session start failed: ${startUpperError.message}`);
    }

    const upperSessionStart = startedUpperSession?.[0];
    assertCondition(upperSessionStart?.session_id, 'Upper session start did not return a session id.');
    assertCondition(upperSessionStart.was_resumed === false, 'First Upper session start should create a session.');

    const upperSession = await loadSession(
      userA.client,
      upperSessionStart.session_id,
      'upper session',
    );
    assertCondition(upperSession.status === 'in_progress', 'Upper session should be in progress.');
    assertCondition(upperSession.workout_plan_day_id === planDayIds.Upper, 'Upper session should reference the Upper day.');
    assertCondition(upperSession.workout_session_exercises.length === 3, 'Upper session should snapshot three exercises.');

    const benchSessionExercise = await getSessionExerciseByName(
      pgClient,
      upperSessionStart.session_id,
      'Barbell Bench Press',
    );
    const benchSets = await getOrderedSets(pgClient, benchSessionExercise.id);
    assertCondition(benchSets.length === 3, 'Bench should initialize three sets from the plan.');

    console.log('Checking the one-active-session rule before completion...');
    const { data: duplicateStartAttempt, error: duplicateStartError } = await userA.client.rpc(
      'start_workout_session',
      {
        p_session_name: 'Should Not Start',
        p_exercises: [
          {
            exercise_id: pushUp.id,
            position: 1,
            target_sets: 1,
            target_reps_min: 12,
            target_reps_max: 20,
          },
        ],
      },
    );

    if (duplicateStartError) {
      throw new Error(`Duplicate active-session guard failed: ${duplicateStartError.message}`);
    }

    assertCondition(
      duplicateStartAttempt?.[0]?.session_id === upperSessionStart.session_id,
      'Duplicate start should return the already active session id.',
    );
    assertCondition(
      duplicateStartAttempt?.[0]?.was_resumed === true,
      'Duplicate start should mark the existing session as resumed.',
    );

    console.log('Logging bench working sets and verifying canonical weight conversion...');
    const convertedBenchWeightKg = poundsToKilograms(176.37);
    assertCondition(
      Math.abs(convertedBenchWeightKg - 80) < 0.01,
      '176.37 lb should convert to approximately 80 kg.',
    );

    const benchSetPayloads = [
      { weight_kg: convertedBenchWeightKg, reps: 8, is_completed: true },
      { weight_kg: convertedBenchWeightKg, reps: 8, is_completed: true },
      { weight_kg: 75, reps: 7, is_completed: true },
    ];

    for (let index = 0; index < benchSets.length; index += 1) {
      const { error } = await userA.client
        .from('workout_sets')
        .update(benchSetPayloads[index])
        .eq('id', benchSets[index].id);

      if (error) {
        throw new Error(`Bench set ${index + 1} update failed: ${error.message}`);
      }
    }

    console.log('Finishing the remaining Upper workout sets...');
    const upperSessionExerciseRows = upperSession.workout_session_exercises.filter(
      (exercise) => exercise.exercise_name_snapshot !== 'Barbell Bench Press',
    );

    for (const sessionExercise of upperSessionExerciseRows) {
      for (const set of sessionExercise.workout_sets) {
        const payload =
          sessionExercise.exercise_name_snapshot === 'Bent Over Row'
            ? { weight_kg: 52.5, reps: 10, is_completed: true }
            : { weight_kg: 35, reps: 10, is_completed: true };

        const { error } = await userA.client
          .from('workout_sets')
          .update(payload)
          .eq('id', set.id);

        if (error) {
          throw new Error(
            `${sessionExercise.exercise_name_snapshot} set update failed: ${error.message}`,
          );
        }
      }
    }

    console.log('Reloading the active session from the database...');
    const reloadedUpperSession = await loadSession(
      userA.client,
      upperSessionStart.session_id,
      'upper session reload',
    );
    const reloadedBench = reloadedUpperSession.workout_session_exercises.find(
      (exercise) => exercise.exercise_name_snapshot === 'Barbell Bench Press',
    );
    assertCondition(reloadedBench, 'Reloaded session should include bench.');
    assertCondition(reloadedBench.workout_sets[0].reps === 8, 'Bench set 1 reps should persist.');
    assertCondition(
      Math.abs(Number(reloadedBench.workout_sets[0].weight_kg) - 80) < 0.01,
      'Bench set 1 weight should persist in canonical kilograms.',
    );

    console.log('Completing the Upper session...');
    const { data: completedUpperRows, error: completeUpperError } = await userA.client.rpc(
      'complete_workout_session',
      {
        p_workout_session_id: upperSessionStart.session_id,
      },
    );

    if (completeUpperError) {
      throw new Error(`Upper session completion failed: ${completeUpperError.message}`);
    }

    assertCondition(completedUpperRows?.[0]?.status === 'completed', 'Upper session should complete.');
    assertCondition(
      completedUpperRows?.[0]?.completed_at,
      'Upper session completion should set completed_at.',
    );

    const { data: noActiveRows, error: noActiveError } = await userA.client
      .from('workout_sessions')
      .select('id')
      .eq('status', 'in_progress');
    if (noActiveError) {
      throw new Error(`Active session lookup failed: ${noActiveError.message}`);
    }
    assertCondition(noActiveRows.length === 0, 'Completed session should no longer be active.');

    console.log('Editing the plan after completion to prove historical stability...');
    const { error: updatePlanError } = await userA.client.rpc('save_workout_plan', {
      p_plan_id: createdPlanId,
      p_name: 'Test Upper Lower',
      p_description: 'Workout verifier plan updated after completion',
      p_is_active: true,
      p_is_template: false,
      p_days: [
        {
          name: 'Upper',
          day_order: 1,
          exercises: [
            {
              exercise_id: bench.id,
              position: 1,
              target_sets: 4,
              target_reps_min: 10,
              target_reps_max: 10,
              target_weight_kg: 82.5,
              rest_seconds: 90,
            },
            {
              exercise_id: row.id,
              position: 2,
              target_sets: 3,
              target_reps_min: 10,
              target_reps_max: 10,
              target_weight_kg: 55,
              rest_seconds: 90,
            },
            {
              exercise_id: overheadPress.id,
              position: 3,
              target_sets: 3,
              target_reps_min: 10,
              target_reps_max: 10,
              target_weight_kg: 37.5,
              rest_seconds: 90,
            },
          ],
        },
        {
          name: 'Lower',
          day_order: 2,
          exercises: [
            {
              exercise_id: squat.id,
              position: 1,
              target_sets: 4,
              target_reps_min: 8,
              target_reps_max: 8,
              target_weight_kg: 100,
              rest_seconds: 120,
            },
            {
              exercise_id: rdl.id,
              position: 2,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 8,
              target_weight_kg: 90,
              rest_seconds: 120,
            },
          ],
        },
      ],
    });

    if (updatePlanError) {
      throw new Error(`Plan update failed: ${updatePlanError.message}`);
    }

    const stableBenchSets = await getOrderedSets(pgClient, benchSessionExercise.id);
    assertCondition(stableBenchSets.length === 3, 'Completed bench history should keep three performed sets.');
    assertCondition(stableBenchSets[2].reps === 7, 'Completed bench history should keep the original performed reps.');

    console.log('Verifying exercise name snapshots survive future exercise edits...');
    await pgClient.query('begin');
    try {
      await pgClient.query(
        `update public.exercises set name = 'Temporary Bench Rename' where id = $1`,
        [bench.id],
      );
      const snapshotResult = await pgClient.query(
        `
          select exercise_name_snapshot
          from public.workout_session_exercises
          where workout_session_id = $1
            and exercise_id = $2
        `,
        [upperSessionStart.session_id, bench.id],
      );
      assertCondition(
        snapshotResult.rows[0]?.exercise_name_snapshot === 'Barbell Bench Press',
        'Session exercise snapshot should remain stable even if the master exercise name changes later.',
      );
    } finally {
      await pgClient.query('rollback');
    }

    console.log('Starting a bodyweight Push-Up session...');
    const { data: pushUpSessionRows, error: pushUpSessionError } = await userA.client.rpc(
      'start_workout_session',
      {
        p_session_name: 'Push-Up Test',
        p_exercises: [
          {
            exercise_id: pushUp.id,
            position: 1,
            target_sets: 1,
            target_reps_min: 12,
            target_reps_max: 20,
          },
        ],
      },
    );

    if (pushUpSessionError) {
      throw new Error(`Push-Up session start failed: ${pushUpSessionError.message}`);
    }

    const pushUpSessionId = pushUpSessionRows?.[0]?.session_id;
    assertCondition(pushUpSessionId, 'Push-Up session should return a session id.');

    const pushUpSessionExercise = await getSessionExerciseByName(
      pgClient,
      pushUpSessionId,
      'Push-Up',
    );
    const pushUpSets = await getOrderedSets(pgClient, pushUpSessionExercise.id);
    assertCondition(pushUpSets.length === 1, 'Push-Up custom session should create one set.');
    assertCondition(
      Math.abs(Number(pushUpSets[0].bodyweight_kg_snapshot) - 80) < 0.01,
      'Push-Up bodyweight snapshot should capture the current profile weight.',
    );

    const { error: pushUpSetError } = await userA.client
      .from('workout_sets')
      .update({ reps: 20, is_completed: true })
      .eq('id', pushUpSets[0].id);

    if (pushUpSetError) {
      throw new Error(`Push-Up set update failed: ${pushUpSetError.message}`);
    }

    const reloadedPushUpSets = await getOrderedSets(pgClient, pushUpSessionExercise.id);
    assertCondition(reloadedPushUpSets[0].reps === 20, 'Push-Up reps should persist.');

    const { error: completePushUpError } = await userA.client.rpc(
      'complete_workout_session',
      {
        p_workout_session_id: pushUpSessionId,
      },
    );

    if (completePushUpError) {
      throw new Error(`Push-Up session completion failed: ${completePushUpError.message}`);
    }

    console.log('Starting a duration-based Plank session...');
    const { data: plankSessionRows, error: plankSessionError } = await userA.client.rpc(
      'start_workout_session',
      {
        p_session_name: 'Plank Test',
        p_exercises: [
          {
            exercise_id: plank.id,
            position: 1,
            target_sets: 1,
            target_duration_seconds: 45,
          },
        ],
      },
    );

    if (plankSessionError) {
      throw new Error(`Plank session start failed: ${plankSessionError.message}`);
    }

    const plankSessionId = plankSessionRows?.[0]?.session_id;
    assertCondition(plankSessionId, 'Plank session should return a session id.');

    const plankSessionExercise = await getSessionExerciseByName(
      pgClient,
      plankSessionId,
      'Plank',
    );
    const plankSets = await getOrderedSets(pgClient, plankSessionExercise.id);
    assertCondition(plankSets.length === 1, 'Plank custom session should create one set.');

    const { error: plankSetError } = await userA.client
      .from('workout_sets')
      .update({ duration_seconds: 45, is_completed: true })
      .eq('id', plankSets[0].id);

    if (plankSetError) {
      throw new Error(`Plank set update failed: ${plankSetError.message}`);
    }

    const reloadedPlankSets = await getOrderedSets(pgClient, plankSessionExercise.id);
    assertCondition(
      reloadedPlankSets[0].duration_seconds === 45,
      'Plank duration should persist.',
    );
    assertCondition(
      reloadedPlankSets[0].reps == null && reloadedPlankSets[0].weight_kg == null,
      'Plank set should not require reps or weight.',
    );

    const { error: completePlankError } = await userA.client.rpc(
      'complete_workout_session',
      {
        p_workout_session_id: plankSessionId,
      },
    );

    if (completePlankError) {
      throw new Error(`Plank session completion failed: ${completePlankError.message}`);
    }

    console.log('Starting and cancelling a session...');
    const { data: cancelSessionRows, error: cancelSessionStartError } = await userA.client.rpc(
      'start_workout_session',
      {
        p_session_name: 'Cancel Test',
        p_exercises: [
          {
            exercise_id: row.id,
            position: 1,
            target_sets: 1,
            target_reps_min: 12,
            target_reps_max: 12,
            target_weight_kg: 40,
          },
        ],
      },
    );

    if (cancelSessionStartError) {
      throw new Error(`Cancel session start failed: ${cancelSessionStartError.message}`);
    }

    const cancelSessionId = cancelSessionRows?.[0]?.session_id;
    assertCondition(cancelSessionId, 'Cancel session should return a session id.');

    const { data: cancelledRows, error: cancelSessionError } = await userA.client.rpc(
      'cancel_workout_session',
      {
        p_workout_session_id: cancelSessionId,
      },
    );

    if (cancelSessionError) {
      throw new Error(`Cancel session RPC failed: ${cancelSessionError.message}`);
    }

    assertCondition(
      cancelledRows?.[0]?.status === 'cancelled',
      'Cancelled session should be marked cancelled.',
    );

    const cancelledResult = await pgClient.query(
      `
        select status
        from public.workout_sessions
        where id = $1
      `,
      [cancelSessionId],
    );
    assertCondition(
      cancelledResult.rows[0]?.status === 'cancelled',
      'Cancelled session should persist in the database.',
    );

    const completedSessionCount = await pgClient.query(
      `
        select count(*)::integer as count
        from public.workout_sessions
        where id = $1
          and status = 'completed'
      `,
      [cancelSessionId],
    );
    assertCondition(
      completedSessionCount.rows[0]?.count === 0,
      'Cancelled session must not appear as completed.',
    );

    console.log('Testing RLS isolation between User A and User B...');
    const { data: userBPlanRows, error: userBPlanReadError } = await userB.client
      .from('workout_plans')
      .select('id')
      .eq('id', createdPlanId);

    if (userBPlanReadError) {
      throw new Error(`User B plan read failed unexpectedly: ${userBPlanReadError.message}`);
    }

    assertCondition(userBPlanRows.length === 0, 'User B should not read User A plans.');

    const { data: userBSessionRows, error: userBSessionReadError } = await userB.client
      .from('workout_sessions')
      .select('id')
      .eq('id', upperSessionStart.session_id);

    if (userBSessionReadError) {
      throw new Error(`User B session read failed unexpectedly: ${userBSessionReadError.message}`);
    }

    assertCondition(userBSessionRows.length === 0, 'User B should not read User A sessions.');

    const { data: userBSetUpdateRows, error: userBSetUpdateError } = await userB.client
      .from('workout_sets')
      .update({ reps: 1 })
      .eq('id', benchSets[0].id)
      .select('id');

    if (userBSetUpdateError) {
      throw new Error(`User B set update failed unexpectedly: ${userBSetUpdateError.message}`);
    }

    assertCondition(userBSetUpdateRows.length === 0, 'User B should not update User A workout sets.');

    const { error: userBCompleteError } = await userB.client.rpc(
      'complete_workout_session',
      {
        p_workout_session_id: upperSessionStart.session_id,
      },
    );

    assertCondition(
      Boolean(userBCompleteError),
      'User B should not be able to complete User A sessions.',
    );

    console.log('Running future analytics readiness queries...');
    const chestSetsResult = await pgClient.query(
      `
        select count(*)::integer as count
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
          and ws.set_type = 'working'
          and wss.status = 'completed'
          and m.muscle_group = 'chest'
          and wss.completed_at >= date_trunc('week', timezone('utc', now()))
      `,
      [userA.userId],
    );
    assertCondition(
      chestSetsResult.rows[0]?.count >= 3,
      'Weekly chest-set analytics query should find completed chest work.',
    );

    const benchHistoryResult = await pgClient.query(
      `
        select
          wss.completed_at::date as completed_date,
          ws.weight_kg,
          ws.reps
        from public.workout_sets ws
        join public.workout_sessions wss
          on wss.id = ws.workout_session_id
        where ws.user_id = $1
          and ws.exercise_id = $2
          and ws.is_completed = true
          and wss.status = 'completed'
        order by wss.completed_at asc, ws.set_number asc
      `,
      [userA.userId, bench.id],
    );
    assertCondition(
      benchHistoryResult.rows.length === 3,
      'Bench history query should return the three completed bench sets.',
    );
    assertCondition(
      Math.abs(Number(benchHistoryResult.rows[0].weight_kg) - 80) < 0.01,
      'Bench history query should preserve performed weight.',
    );

    console.log('Workout verification passed.');
    console.log(
      JSON.stringify(
        {
          userA: userA.userId,
          userB: userB.userId,
          createdPlanId,
          upperSessionId: upperSessionStart.session_id,
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

verifyWorkouts().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
