import type { User } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '../supabase';

export function assertWorkoutSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
}

export async function getRequiredWorkoutUser(): Promise<{
  client: ReturnType<typeof assertWorkoutSupabase>;
  user: User;
}> {
  const client = assertWorkoutSupabase();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    throw new Error('Sign in is required to save workouts.');
  }

  return {
    client,
    user: session.user,
  };
}

export function getFriendlyWorkoutError(
  error: unknown,
  fallback = 'Unable to sync your workout right now.',
) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error.message.includes('EXPO_PUBLIC_SUPABASE_URL')) {
    return error.message;
  }

  if (error.message.toLowerCase().includes('fetch')) {
    return 'Unable to reach Supabase right now. Please try again.';
  }

  if (error.message.toLowerCase().includes('sign in')) {
    return 'Please sign in again to keep saving this workout.';
  }

  return error.message;
}
