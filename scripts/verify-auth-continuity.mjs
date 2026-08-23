import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client: PgClient } = pg;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

const PROFILE_FIXTURE = {
  display_name: 'Upgrade Continuity Test',
  age_years: 31,
  height_cm: 180,
  current_weight_kg: 80,
  fitness_goal: 'improve_strength',
  experience_level: 'intermediate',
  preferred_training_days_per_week: 4,
  preferred_training_days: ['monday', 'tuesday', 'thursday', 'saturday'],
  preferred_workout_location: 'gym',
  preferred_units: 'metric',
  onboarding_completed: true,
};

const CUSTOM_FOOD_NAME = 'Continuity Test Protein Oats';
const WORKOUT_COMPLETED_AT = '2026-08-23T10:30:00.000Z';
const BODY_WEIGHT_MEASURED_AT = '2026-08-23T09:00:00.000Z';
const BODY_MEASUREMENT_MEASURED_AT = '2026-08-23T09:05:00.000Z';

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

  assertCondition(data.user?.id, `${label}: missing user id after anonymous sign-in.`);
  assertCondition(data.session, `${label}: missing session after anonymous sign-in.`);

  return {
    client,
    label,
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

async function createMailbox() {
  const domains = await fetch('https://api.mail.tm/domains').then((response) =>
    response.json(),
  );
  const domain = domains['hydra:member']?.[0]?.domain;
  assertCondition(domain, 'mail.tm did not return an active domain.');

  const address = `oneup-auth-${Date.now()}@${domain}`;
  const password = 'MailTmPass123!';

  const accountResponse = await fetch('https://api.mail.tm/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });

  if (!accountResponse.ok) {
    throw new Error(
      `Temporary mailbox creation failed: ${accountResponse.status} ${await accountResponse.text()}`,
    );
  }

  const tokenResponse = await fetch('https://api.mail.tm/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
  const tokenPayload = await tokenResponse.json();

  assertCondition(
    tokenPayload.token,
    `Temporary mailbox authentication failed: ${JSON.stringify(tokenPayload)}`,
  );

  return {
    address,
    token: tokenPayload.token,
  };
}

async function waitForEmailChangeTokenHash(mailboxToken) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const messageResponse = await fetch('https://api.mail.tm/messages', {
      headers: { authorization: `Bearer ${mailboxToken}` },
    });
    const messagePayload = await messageResponse.json();
    const message = messagePayload['hydra:member']?.[0];

    if (message?.id) {
      const fullMessageResponse = await fetch(
        `https://api.mail.tm/messages/${message.id}`,
        {
          headers: { authorization: `Bearer ${mailboxToken}` },
        },
      );
      const fullMessage = await fullMessageResponse.json();
      const combinedBody = [fullMessage.text, ...(fullMessage.html ?? [])]
        .filter(Boolean)
        .join('\n');
      const tokenMatch = combinedBody.match(
        /token=([a-f0-9]+)&(?:amp;)?type=email_change/i,
      );

      assertCondition(
        tokenMatch?.[1],
        'Could not extract the email-change verification token from the confirmation email.',
      );

      return tokenMatch[1];
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Timed out waiting for the email-change confirmation email.');
}

async function setProfile(client, userId, values, label) {
  const { error } = await client.from('profiles').update(values).eq('id', userId);

  if (error) {
    throw new Error(`${label}: profile update failed: ${error.message}`);
  }
}

async function getCatalogFoodFixture(pgClient) {
  const result = await pgClient.query(
    `
      select
        cf.id as catalog_food_id,
        cf.name as food_name,
        cf.brand_name as food_brand,
        fs.id as catalog_serving_id,
        fs.serving_name,
        fs.quantity,
        fs.gram_weight,
        fs.nutrient_values
      from public.catalog_foods cf
      join public.food_servings fs on fs.food_id = cf.id
      where cf.is_active
        and cf.food_type = 'common'
        and cf.name = 'Banana, raw'
      order by fs.is_default desc, fs.quantity asc, fs.gram_weight asc
      limit 1
    `,
  );

  assertCondition(result.rows.length === 1, 'Banana, raw fixture serving was not found.');
  return result.rows[0];
}

async function createCatalogFoodLog(client, userId, fixture) {
  const nutrients = fixture.nutrient_values ?? {};
  const { data, error } = await client
    .from('food_logs')
    .insert({
      user_id: userId,
      food_id: null,
      meal: 'Lunch',
      servings: Number(fixture.quantity ?? 1),
      calories: Number(nutrients.energy_kcal ?? 0),
      protein_g: Number(nutrients.protein ?? 0),
      carbs_g: Number(nutrients.carbohydrate ?? 0),
      fat_g: Number(nutrients.fat ?? 0),
      fiber_g: Number(nutrients.fiber ?? 0),
      logged_at: '2026-08-23T08:00:00.000Z',
      note: 'Continuity catalog log',
      logged_from: 'search',
      food_name: fixture.food_name,
      food_brand: fixture.food_brand,
      serving_label: fixture.serving_name,
      food_source: 'usda',
      calories_per_serving: Number(nutrients.energy_kcal ?? 0),
      protein_per_serving_g: Number(nutrients.protein ?? 0),
      carbs_per_serving_g: Number(nutrients.carbohydrate ?? 0),
      fat_per_serving_g: Number(nutrients.fat ?? 0),
      fiber_per_serving_g: Number(nutrients.fiber ?? 0),
      sodium_mg_per_serving: Number(nutrients.sodium ?? 0),
      catalog_food_id: fixture.catalog_food_id,
      catalog_serving_id: fixture.catalog_serving_id,
      serving_quantity: Number(fixture.quantity ?? 1),
      effective_grams:
        fixture.gram_weight == null ? null : Number(fixture.gram_weight),
      nutrients_snapshot: nutrients,
      user_food_id: null,
      user_food_serving_id: null,
      recipe_id: null,
    })
    .select('id, catalog_food_id, catalog_serving_id, food_name')
    .single();

  if (error) {
    throw new Error(`Catalog food log creation failed: ${error.message}`);
  }

  return data;
}

async function createCustomFood(client) {
  const { data, error } = await client.rpc('save_user_food', {
    food_name: CUSTOM_FOOD_NAME,
    brand_name: 'ONE UP Fixture',
    description: 'Reusable continuity verifier custom food',
    base_amount: 100,
    base_unit: 'g',
    nutrient_values: {
      energy_kcal: 412,
      protein: 28,
      carbohydrate: 49,
      fat: 11,
      fiber: 8,
      sodium: 120,
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
        serving_name: '1 bowl',
        quantity: 1,
        gram_weight: 240,
        household_unit: 'bowl',
        is_default: false,
      },
    ],
  });

  if (error) {
    throw new Error(`Custom food creation failed: ${error.message}`);
  }

  assertCondition(data, 'Custom food RPC did not return a food id.');
  return data;
}

async function createWorkoutPlan(client, exerciseId) {
  const { data, error } = await client.rpc('save_workout_plan', {
    p_name: 'Continuity Test Plan',
    p_description: 'Workout plan for auth continuity verification',
    p_is_active: true,
    p_is_template: false,
    p_days: [
      {
        name: 'Upper',
        day_order: 1,
        exercises: [
          {
            exercise_id: exerciseId,
            position: 1,
            target_sets: 2,
            target_reps_min: 5,
            target_reps_max: 5,
            target_weight_kg: 80,
            rest_seconds: 120,
          },
        ],
      },
    ],
  });

  if (error) {
    throw new Error(`Workout plan creation failed: ${error.message}`);
  }

  assertCondition(data, 'Workout plan RPC did not return a plan id.');
  return data;
}

async function getPlanDayId(pgClient, planId) {
  const result = await pgClient.query(
    `
      select id
      from public.workout_plan_days
      where workout_plan_id = $1
      order by day_order
      limit 1
    `,
    [planId],
  );

  assertCondition(result.rows.length === 1, 'Workout plan day was not created.');
  return result.rows[0].id;
}

async function getSessionExercise(pgClient, sessionId) {
  const result = await pgClient.query(
    `
      select id, exercise_id
      from public.workout_session_exercises
      where workout_session_id = $1
      order by position
      limit 1
    `,
    [sessionId],
  );

  assertCondition(result.rows.length === 1, 'Workout session exercise row was not created.');
  return result.rows[0];
}

async function getOrderedSets(pgClient, sessionExerciseId) {
  const result = await pgClient.query(
    `
      select id, set_number
      from public.workout_sets
      where workout_session_exercise_id = $1
      order by set_number
    `,
    [sessionExerciseId],
  );

  return result.rows;
}

async function setSessionTimestamps(pgClient, sessionId, completedAt, durationSeconds = 2400) {
  const completedDate = new Date(completedAt);
  const startedAt = new Date(completedDate.getTime() - durationSeconds * 1000).toISOString();

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
      set completed_at = $2::timestamptz
      where workout_session_id = $1
        and is_completed
    `,
    [sessionId, completedAt],
  );
}

async function createCompletedWorkoutSession({
  client,
  pgClient,
  exerciseId,
  workoutPlanDayId,
}) {
  const { data, error } = await client.rpc('start_workout_session', {
    p_workout_plan_day_id: workoutPlanDayId,
  });

  if (error) {
    throw new Error(`Workout session start failed: ${error.message}`);
  }

  const sessionId = data?.[0]?.session_id;
  assertCondition(sessionId, 'Workout session start did not return a session id.');

  const sessionExercise = await getSessionExercise(pgClient, sessionId);
  assertCondition(
    sessionExercise.exercise_id === exerciseId,
    'Workout session exercise snapshot did not match the planned exercise.',
  );

  const sets = await getOrderedSets(pgClient, sessionExercise.id);
  assertCondition(sets.length === 2, 'Workout session should have created two sets.');

  const setUpdates = [
    { weight_kg: 80, reps: 5, is_completed: true },
    { weight_kg: 82.5, reps: 5, is_completed: true },
  ];

  for (let index = 0; index < sets.length; index += 1) {
    const { error: updateError } = await client
      .from('workout_sets')
      .update(setUpdates[index])
      .eq('id', sets[index].id);

    if (updateError) {
      throw new Error(`Workout set update ${index + 1} failed: ${updateError.message}`);
    }
  }

  const { error: completeError } = await client.rpc('complete_workout_session', {
    p_workout_session_id: sessionId,
  });

  if (completeError) {
    throw new Error(`Workout session completion failed: ${completeError.message}`);
  }

  await setSessionTimestamps(pgClient, sessionId, WORKOUT_COMPLETED_AT);

  return {
    sessionExerciseId: sessionExercise.id,
    sessionId,
    setIds: sets.map((set) => set.id),
  };
}

async function createProgressEntries(client, userId) {
  const { data: bodyWeightRow, error: bodyWeightError } = await client
    .from('body_weight_entries')
    .insert({
      user_id: userId,
      weight_kg: 80,
      measured_at: BODY_WEIGHT_MEASURED_AT,
      source: 'manual',
      notes: 'Continuity verifier weight',
    })
    .select('id, user_id, weight_kg')
    .single();

  if (bodyWeightError) {
    throw new Error(`Body weight insert failed: ${bodyWeightError.message}`);
  }

  const { data: measurementRow, error: measurementError } = await client
    .from('body_measurements')
    .insert({
      user_id: userId,
      measurement_type: 'waist',
      value: 82,
      unit: 'cm',
      measured_at: BODY_MEASUREMENT_MEASURED_AT,
      notes: 'Continuity verifier waist',
    })
    .select('id, user_id, measurement_type, value')
    .single();

  if (measurementError) {
    throw new Error(`Body measurement insert failed: ${measurementError.message}`);
  }

  return {
    bodyMeasurementId: measurementRow.id,
    bodyWeightId: bodyWeightRow.id,
  };
}

async function loadOwnershipSnapshot(pgClient, userId) {
  const queries = {
    profile: `
      select id, display_name, fitness_goal, current_weight_kg, onboarding_completed
      from public.profiles
      where id = $1
    `,
    nutritionLog: `
      select id, user_id, food_name, catalog_food_id, user_food_id
      from public.food_logs
      where user_id = $1
      order by logged_at desc
      limit 5
    `,
    customFood: `
      select id, user_id, name, brand_name, is_active
      from public.user_foods
      where user_id = $1
      order by created_at desc
      limit 5
    `,
    workoutPlan: `
      select id, user_id, name, is_active
      from public.workout_plans
      where user_id = $1
      order by created_at desc
      limit 5
    `,
    workoutSession: `
      select id, user_id, workout_plan_id, workout_plan_day_id, status, completed_at
      from public.workout_sessions
      where user_id = $1
      order by completed_at desc nulls last, created_at desc
      limit 5
    `,
    workoutSet: `
      select id, user_id, workout_session_id, exercise_id, weight_kg, reps, is_completed
      from public.workout_sets
      where user_id = $1
      order by created_at desc
      limit 5
    `,
    bodyWeight: `
      select id, user_id, weight_kg
      from public.body_weight_entries
      where user_id = $1
      order by measured_at desc
      limit 5
    `,
    bodyMeasurement: `
      select id, user_id, measurement_type, value
      from public.body_measurements
      where user_id = $1
      order by measured_at desc
      limit 5
    `,
  };

  const snapshot = {};

  for (const [key, sql] of Object.entries(queries)) {
    const result = await pgClient.query(sql, [userId]);
    snapshot[key] = result.rows;
  }

  return snapshot;
}

async function verifyRlsIsolation(userBClient, userAId) {
  const checks = [
    ['profiles', userBClient.from('profiles').select('id').eq('id', userAId)],
    ['food_logs', userBClient.from('food_logs').select('id').eq('user_id', userAId)],
    ['user_foods', userBClient.from('user_foods').select('id').eq('user_id', userAId)],
    ['workout_plans', userBClient.from('workout_plans').select('id').eq('user_id', userAId)],
    ['workout_sessions', userBClient.from('workout_sessions').select('id').eq('user_id', userAId)],
    ['body_weight_entries', userBClient.from('body_weight_entries').select('id').eq('user_id', userAId)],
    ['body_measurements', userBClient.from('body_measurements').select('id').eq('user_id', userAId)],
  ];

  for (const [label, request] of checks) {
    const { data, error } = await request;

    if (error) {
      throw new Error(`User B ${label} isolation check failed: ${error.message}`);
    }

    assertCondition(
      (data?.length ?? 0) === 0,
      `User B should not be able to read User A ${label}.`,
    );
  }
}

async function verifyContinuityReads(client, originalUserId) {
  const [
    profileResponse,
    foodLogsResponse,
    userFoodsResponse,
    workoutPlansResponse,
    workoutSessionsResponse,
    bodyWeightResponse,
    bodyMeasurementResponse,
    trainingSummaryResponse,
  ] = await Promise.all([
    client.from('profiles').select('*').single(),
    client.from('food_logs').select('id, food_name').order('logged_at', { ascending: false }),
    client.from('user_foods').select('id, name').eq('is_active', true),
    client.from('workout_plans').select('id, name').eq('is_active', true),
    client.from('workout_sessions').select('id, status').order('completed_at', { ascending: false }),
    client.from('body_weight_entries').select('id, weight_kg').order('measured_at', { ascending: false }),
    client.from('body_measurements').select('id, measurement_type').order('measured_at', { ascending: false }),
    client.rpc('get_training_summary', {
      p_timezone: 'UTC',
      p_reference_at: '2026-08-23T12:00:00.000Z',
    }),
  ]);

  const responses = [
    ['profile', profileResponse],
    ['food logs', foodLogsResponse],
    ['user foods', userFoodsResponse],
    ['workout plans', workoutPlansResponse],
    ['workout sessions', workoutSessionsResponse],
    ['body weight entries', bodyWeightResponse],
    ['body measurements', bodyMeasurementResponse],
    ['training summary', trainingSummaryResponse],
  ];

  for (const [label, response] of responses) {
    if (response.error) {
      throw new Error(`Continuity read for ${label} failed: ${response.error.message}`);
    }
  }

  assertCondition(
    profileResponse.data.id === originalUserId,
    'Profile continuity check returned the wrong user id.',
  );
  assertCondition(
    profileResponse.data.display_name === PROFILE_FIXTURE.display_name,
    'Profile display name did not persist through upgrade.',
  );
  assertCondition(
    profileResponse.data.fitness_goal === PROFILE_FIXTURE.fitness_goal,
    'Profile fitness goal did not persist through upgrade.',
  );
  assertCondition(
    Number(profileResponse.data.current_weight_kg) === PROFILE_FIXTURE.current_weight_kg,
    'Profile weight did not persist through upgrade.',
  );
  assertCondition(
    (foodLogsResponse.data ?? []).some((row) => row.food_name === 'Banana, raw'),
    'Catalog food log did not persist through upgrade.',
  );
  assertCondition(
    (userFoodsResponse.data ?? []).some((row) => row.name === CUSTOM_FOOD_NAME),
    'Custom food did not persist through upgrade.',
  );
  assertCondition(
    (workoutPlansResponse.data ?? []).some((row) => row.name === 'Continuity Test Plan'),
    'Workout plan did not persist through upgrade.',
  );
  assertCondition(
    (workoutSessionsResponse.data ?? []).some((row) => row.status === 'completed'),
    'Completed workout session did not persist through upgrade.',
  );
  assertCondition(
    (bodyWeightResponse.data ?? []).some((row) => Number(row.weight_kg) === 80),
    'Body weight history did not persist through upgrade.',
  );
  assertCondition(
    (bodyMeasurementResponse.data ?? []).some((row) => row.measurement_type === 'waist'),
    'Body measurement history did not persist through upgrade.',
  );

  const trainingSummary = trainingSummaryResponse.data?.[0];
  assertCondition(
    Number(trainingSummary?.completed_workouts_this_week ?? 0) >= 1,
    'Progress analytics did not retain the completed workout after upgrade.',
  );
}

async function main() {
  assertEnv();

  const pgClient = await createPgClient();
  const createdUserIds = [];
  const createdMailbox = await createMailbox();
  const permanentPassword = 'AuthContinuity123!';

  try {
    console.log('Creating temporary verifier users...');
    const userA = await createAnonymousUser('user-a');
    const userB = await createAnonymousUser('user-b');
    createdUserIds.push(userA.userId, userB.userId);

    console.log('Preparing profile, nutrition, workout, and progress data for User A...');
    await setProfile(userA.client, userA.userId, PROFILE_FIXTURE, 'user-a');

    const catalogFoodFixture = await getCatalogFoodFixture(pgClient);
    const catalogLog = await createCatalogFoodLog(
      userA.client,
      userA.userId,
      catalogFoodFixture,
    );
    const customFoodId = await createCustomFood(userA.client);

    const benchExerciseId = '4bcd6394-106d-531b-bd20-707153a8f6f6';
    const planId = await createWorkoutPlan(userA.client, benchExerciseId);
    const planDayId = await getPlanDayId(pgClient, planId);
    const workoutSession = await createCompletedWorkoutSession({
      client: userA.client,
      exerciseId: benchExerciseId,
      pgClient,
      workoutPlanDayId: planDayId,
    });
    const progressEntries = await createProgressEntries(userA.client, userA.userId);

    const ownershipBefore = await loadOwnershipSnapshot(pgClient, userA.userId);
    assertCondition(ownershipBefore.profile.length === 1, 'Profile row should exist before upgrade.');
    assertCondition(
      ownershipBefore.nutritionLog.some((row) => row.id === catalogLog.id),
      'Catalog food log should be owned by the original user before upgrade.',
    );
    assertCondition(
      ownershipBefore.customFood.some((row) => row.id === customFoodId),
      'Custom food should be owned by the original user before upgrade.',
    );
    assertCondition(
      ownershipBefore.workoutPlan.some((row) => row.id === planId),
      'Workout plan should be owned by the original user before upgrade.',
    );
    assertCondition(
      ownershipBefore.workoutSession.some((row) => row.id === workoutSession.sessionId),
      'Workout session should be owned by the original user before upgrade.',
    );
    assertCondition(
      ownershipBefore.workoutSet.some((row) => workoutSession.setIds.includes(row.id)),
      'Workout sets should be owned by the original user before upgrade.',
    );
    assertCondition(
      ownershipBefore.bodyWeight.some((row) => row.id === progressEntries.bodyWeightId),
      'Body weight entry should be owned by the original user before upgrade.',
    );
    assertCondition(
      ownershipBefore.bodyMeasurement.some(
        (row) => row.id === progressEntries.bodyMeasurementId,
      ),
      'Body measurement should be owned by the original user before upgrade.',
    );

    console.log('Linking the guest account to a permanent email identity...');
    const upgradeEmailResponse = await userA.client.auth.updateUser({
      email: createdMailbox.address,
    });

    if (upgradeEmailResponse.error) {
      throw new Error(
        `Email-link step failed: ${upgradeEmailResponse.error.message} (${upgradeEmailResponse.error.code ?? 'no_code'})`,
      );
    }

    assertCondition(
      upgradeEmailResponse.data.user?.id === userA.userId,
      'Linking the email identity changed the auth user id unexpectedly.',
    );

    const tokenHash = await waitForEmailChangeTokenHash(createdMailbox.token);
    const verifyResponse = await userA.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email_change',
    });

    if (verifyResponse.error) {
      throw new Error(`Email confirmation failed: ${verifyResponse.error.message}`);
    }

    assertCondition(
      verifyResponse.data.user?.id === userA.userId,
      'Email confirmation changed the auth user id unexpectedly.',
    );
    assertCondition(
      verifyResponse.data.user?.is_anonymous === false,
      'User should no longer be anonymous after email confirmation.',
    );

    const passwordResponse = await userA.client.auth.updateUser({
      password: permanentPassword,
    });

    if (passwordResponse.error) {
      throw new Error(`Password finalization failed: ${passwordResponse.error.message}`);
    }

    assertCondition(
      passwordResponse.data.user?.id === userA.userId,
      'Setting the password changed the auth user id unexpectedly.',
    );

    console.log('Verifying RLS still isolates the upgraded user...');
    await verifyRlsIsolation(userB.client, userA.userId);

    console.log('Signing out and signing back in with the permanent credentials...');
    const signOutResponse = await userA.client.auth.signOut();

    if (signOutResponse.error) {
      throw new Error(`Sign-out after upgrade failed: ${signOutResponse.error.message}`);
    }

    const signInResponse = await userA.client.auth.signInWithPassword({
      email: createdMailbox.address,
      password: permanentPassword,
    });

    if (signInResponse.error) {
      throw new Error(`Email/password sign-in failed: ${signInResponse.error.message}`);
    }

    assertCondition(
      signInResponse.data.user?.id === userA.userId,
      'Signing back in with email/password returned a different auth user id.',
    );
    assertCondition(
      signInResponse.data.user?.is_anonymous === false,
      'Permanent sign-in should not return an anonymous user.',
    );

    console.log('Confirming cross-system continuity after re-login...');
    await verifyContinuityReads(userA.client, userA.userId);

    console.log(
      JSON.stringify(
        {
          same_uuid_after_link: true,
          same_uuid_after_verification: true,
          same_uuid_after_password: true,
          same_uuid_after_relogin: true,
          original_user_id: userA.userId,
          registered_user_id: signInResponse.data.user.id,
          continuity: {
            profile: 'PASS',
            nutrition_catalog_log: 'PASS',
            nutrition_custom_food: 'PASS',
            workout_plan: 'PASS',
            workout_session: 'PASS',
            progress_body_weight: 'PASS',
            progress_measurement: 'PASS',
            progress_analytics: 'PASS',
          },
          rls: 'PASS',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupUsers(pgClient, createdUserIds).catch((error) => {
      console.error('Cleanup warning:', error.message);
    });
    await pgClient.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
