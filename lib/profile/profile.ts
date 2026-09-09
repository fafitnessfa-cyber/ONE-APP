import type { Session, User } from '@supabase/supabase-js';
import type {
  ProfileExperienceLevel,
  ProfileFitnessGoal,
  ProfileUnitPreference,
  ProfileWeekday,
  ProfileWorkoutLocation,
  UserProfile,
} from '../../types';
import type { Tables, TablesInsert } from '../../types/database.types';
import { supabase, supabaseConfigError } from '../supabase';
import { normalizeWeekdays } from './utils';

type ProfileRow = Tables<'profiles'>;

export interface ProfileSaveInput {
  displayName?: string | null;
  phoneNumber?: string | null;
  ageYears?: number | null;
  heightCm?: number | null;
  currentWeightKg?: number | null;
  targetWeightKg?: number | null;
  fitnessGoal?: ProfileFitnessGoal | null;
  experienceLevel?: ProfileExperienceLevel | null;
  preferredTrainingDaysPerWeek?: number | null;
  preferredTrainingDays?: ProfileWeekday[];
  preferredWorkoutLocation?: ProfileWorkoutLocation | null;
  preferredUnits?: ProfileUnitPreference | null;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string | null;
}

function assertSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
}

function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    phoneNumber: row.phone_number,
    ageYears: row.age_years,
    heightCm: row.height_cm,
    currentWeightKg: row.current_weight_kg,
    targetWeightKg: row.target_weight_kg,
    fitnessGoal: row.fitness_goal as ProfileFitnessGoal | null,
    experienceLevel: row.experience_level as ProfileExperienceLevel | null,
    preferredTrainingDaysPerWeek: row.preferred_training_days_per_week,
    preferredTrainingDays: normalizeWeekdays(row.preferred_training_days),
    preferredWorkoutLocation:
      row.preferred_workout_location as ProfileWorkoutLocation | null,
    preferredUnits: row.preferred_units as ProfileUnitPreference | null,
    onboardingCompleted: row.onboarding_completed,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripUndefined<TObject extends Record<string, unknown>>(value: TObject) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as TObject;
}

function buildProfilePayload(
  userId: string,
  input: ProfileSaveInput,
): TablesInsert<'profiles'> {
  return stripUndefined({
    id: userId,
    display_name: input.displayName,
    phone_number: input.phoneNumber,
    age_years: input.ageYears,
    height_cm: input.heightCm,
    current_weight_kg: input.currentWeightKg,
    target_weight_kg: input.targetWeightKg,
    fitness_goal: input.fitnessGoal,
    experience_level: input.experienceLevel,
    preferred_training_days_per_week: input.preferredTrainingDaysPerWeek,
    preferred_training_days: input.preferredTrainingDays
      ? normalizeWeekdays(input.preferredTrainingDays)
      : undefined,
    preferred_workout_location: input.preferredWorkoutLocation,
    preferred_units: input.preferredUnits,
    onboarding_completed: input.onboardingCompleted,
    onboarding_completed_at: input.onboardingCompletedAt,
  });
}

export async function getAuthSession() {
  const client = assertSupabase();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signInAsGuest() {
  const client = assertSupabase();
  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  return data;
}

export async function signInWithPassword(email: string, password: string) {
  const client = assertSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const client = assertSupabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function sendPasswordResetEmail(email: string) {
  const client = assertSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email);

  if (error) {
    throw error;
  }
}

export async function signOutCurrentUser() {
  const client = assertSupabase();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function getCurrentProfile(userId: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProfileRow(data) : null;
}

export async function ensureCurrentProfile(user: User) {
  const existing = await getCurrentProfile(user.id);

  if (existing) {
    return existing;
  }

  return saveCurrentProfile(user.id, {});
}

export async function saveCurrentProfile(userId: string, input: ProfileSaveInput) {
  const client = assertSupabase();
  const { error } = await client
    .from('profiles')
    .upsert(buildProfilePayload(userId, input), { onConflict: 'id' });

  if (error) {
    throw error;
  }

  const profile = await getCurrentProfile(userId);

  if (!profile) {
    throw new Error('Profile save succeeded but the profile could not be reloaded.');
  }

  return profile;
}

export async function refreshProfileForSession(session: Session | null) {
  if (!session?.user) {
    return null;
  }

  return ensureCurrentProfile(session.user);
}
