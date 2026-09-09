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

async function loadProfile(client, userId, label) {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    throw new Error(`${label}: profile fetch failed: ${error.message}`);
  }

  return data;
}

async function assertSingleProfile(pgClient, userId, label) {
  const result = await pgClient.query(
    `select count(*)::integer as count from public.profiles where id = $1`,
    [userId],
  );
  assertCondition(result.rows[0]?.count === 1, `${label}: expected exactly one profile row`);
}

async function expectConstraintFailure(pgClient, sql, params, label) {
  try {
    await pgClient.query(sql, params);
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  throw new Error(`${label}: expected database constraint failure`);
}

async function cleanupUsers(pgClient, userIds) {
  if (userIds.length === 0) {
    return;
  }

  await pgClient.query(`delete from auth.users where id = any($1::uuid[])`, [userIds]);
}

async function verifyProfileFoundation() {
  assertEnv();

  const pgClient = await createPgClient();
  const createdUserIds = [];

  try {
    console.log('Creating authenticated anonymous test users...');
    const userA = await createAnonymousUser('user-a');
    const userB = await createAnonymousUser('user-b');
    const userC = await createAnonymousUser('user-c');
    createdUserIds.push(userA.userId, userB.userId, userC.userId);

    console.log('Checking minimal profile bootstrap...');
    const initialProfileA = await loadProfile(userA.client, userA.userId, 'user-a');
    assertCondition(initialProfileA.onboarding_completed === false, 'user-a: onboarding should start incomplete');
    assertSingleProfile(pgClient, userA.userId, 'user-a');

    console.log('Completing onboarding for user A...');
    const { data: completedProfile, error: completionError } = await userA.client
      .from('profiles')
      .update({
        display_name: 'Profile Verifier A',
        age_years: 31,
        height_cm: 182.88,
        current_weight_kg: 80,
        target_weight_kg: 77.5,
        fitness_goal: 'improve_strength',
        experience_level: 'intermediate',
        preferred_training_days_per_week: 4,
        preferred_training_days: ['monday', 'tuesday', 'thursday', 'saturday'],
        preferred_workout_location: 'gym',
        preferred_units: 'imperial',
        onboarding_completed: true,
      })
      .eq('id', userA.userId)
      .select('*')
      .single();

    if (completionError) {
      throw new Error(`user-a: onboarding completion failed: ${completionError.message}`);
    }

    assertCondition(completedProfile.onboarding_completed === true, 'user-a: onboarding flag should be true');
    assertCondition(completedProfile.onboarding_completed_at != null, 'user-a: onboarding timestamp should be set');
    assertSingleProfile(pgClient, userA.userId, 'user-a');

    console.log('Re-reading persisted profile through a fresh client session...');
    const freshClientA = createPublicClient();
    const freshSignIn = await freshClientA.auth.setSession({
      access_token: userA.session.access_token,
      refresh_token: userA.session.refresh_token,
    });
    if (freshSignIn.error) {
      throw new Error(`user-a fresh session restore failed: ${freshSignIn.error.message}`);
    }
    const freshProfileA = await loadProfile(freshClientA, userA.userId, 'user-a fresh');
    assertCondition(freshProfileA.display_name === 'Profile Verifier A', 'user-a fresh: display name did not persist');
    assertCondition(Number(freshProfileA.current_weight_kg) === 80, 'user-a fresh: current weight did not persist');
    assertCondition(freshProfileA.preferred_units === 'imperial', 'user-a fresh: preferred units did not persist');

    console.log('Updating profile preferences for user A...');
    const { data: updatedProfileA, error: updateError } = await userA.client
      .from('profiles')
      .update({
        fitness_goal: 'maintain',
        preferred_training_days_per_week: 5,
        preferred_training_days: ['monday', 'tuesday', 'thursday', 'friday', 'saturday'],
        preferred_units: 'metric',
      })
      .eq('id', userA.userId)
      .select('*')
      .single();

    if (updateError) {
      throw new Error(`user-a update failed: ${updateError.message}`);
    }

    assertCondition(updatedProfileA.fitness_goal === 'maintain', 'user-a update: goal not updated');
    assertCondition(updatedProfileA.preferred_units === 'metric', 'user-a update: units not updated');

    console.log('Creating a partial onboarding row for user C...');
    const { data: partialProfile, error: partialError } = await userC.client
      .from('profiles')
      .update({
        display_name: 'Partial User',
        preferred_units: 'metric',
      })
      .eq('id', userC.userId)
      .select('*')
      .single();

    if (partialError) {
      throw new Error(`user-c partial update failed: ${partialError.message}`);
    }

    assertCondition(partialProfile.onboarding_completed === false, 'user-c: partial onboarding should stay incomplete');
    assertSingleProfile(pgClient, userC.userId, 'user-c');

    console.log('Verifying RLS isolation between user A and user B...');
    const { data: userBReadRows, error: userBReadError } = await userB.client
      .from('profiles')
      .select('id')
      .eq('id', userA.userId);

    if (userBReadError) {
      throw new Error(`user-b read isolation failed unexpectedly: ${userBReadError.message}`);
    }

    assertCondition(userBReadRows.length === 0, 'user-b should not read user-a profile');

    const { data: userBUpdateRows, error: userBUpdateError } = await userB.client
      .from('profiles')
      .update({ display_name: 'Not Allowed' })
      .eq('id', userA.userId)
      .select('id');

    if (userBUpdateError) {
      throw new Error(`user-b update isolation failed unexpectedly: ${userBUpdateError.message}`);
    }

    assertCondition(userBUpdateRows.length === 0, 'user-b should not update user-a profile');

    console.log('Checking database constraints...');
    const heightFailure = await expectConstraintFailure(
      pgClient,
      `update public.profiles set height_cm = -1 where id = $1`,
      [userA.userId],
      'negative height',
    );
    const weightFailure = await expectConstraintFailure(
      pgClient,
      `update public.profiles set current_weight_kg = -1 where id = $1`,
      [userA.userId],
      'negative weight',
    );
    const daysFailure = await expectConstraintFailure(
      pgClient,
      `update public.profiles set preferred_training_days_per_week = 8 where id = $1`,
      [userA.userId],
      'training days upper bound',
    );
    const goalFailure = await expectConstraintFailure(
      pgClient,
      `update public.profiles set fitness_goal = 'bulk_forever' where id = $1`,
      [userA.userId],
      'invalid goal value',
    );
    const experienceFailure = await expectConstraintFailure(
      pgClient,
      `update public.profiles set experience_level = 'elite' where id = $1`,
      [userA.userId],
      'invalid experience value',
    );

    assertCondition(heightFailure.toLowerCase().includes('profiles_height_cm_check'), 'height constraint was not enforced');
    assertCondition(weightFailure.toLowerCase().includes('profiles_current_weight_kg_check'), 'weight constraint was not enforced');
    assertCondition(daysFailure.toLowerCase().includes('profiles_preferred_training_days_per_week_check'), 'training day constraint was not enforced');
    assertCondition(goalFailure.toLowerCase().includes('profiles_fitness_goal_check'), 'goal constraint was not enforced');
    assertCondition(experienceFailure.toLowerCase().includes('profiles_experience_level_check'), 'experience constraint was not enforced');

    console.log('Profile foundation verification passed.');
    console.log(
      JSON.stringify(
        {
          userA: userA.userId,
          userB: userB.userId,
          userC: userC.userId,
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

verifyProfileFoundation().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
