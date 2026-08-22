import { supabase, supabaseConfigError } from '../supabase';
import type { Exercise, ExerciseSearchFilters } from './types';
import { buildExerciseTags } from './constants';

const DEFAULT_SEARCH_LIMIT = 120;

interface SearchExercisesRpcRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  instructions: string[] | null;
  exercise_type: Exercise['exerciseType'];
  movement_pattern: string | null;
  mechanic: string | null;
  difficulty: Exercise['difficulty'];
  laterality: Exercise['laterality'];
  primary_tracking_metric: string;
  load_type: string;
  program_focuses: string[] | null;
  primary_muscles: string[] | null;
  secondary_muscles: string[] | null;
  muscle_groups: string[] | null;
  body_regions: string[] | null;
  equipment: string[] | null;
  equipment_codes: string[] | null;
  aliases: string[] | null;
  relevance_score: number | null;
}

const exerciseSearchCache = new Map<string, Exercise[]>();
const inFlightExerciseSearches = new Map<string, Promise<Exercise[]>>();
const exerciseBySlugCache = new Map<string, Exercise>();
const exerciseByIdCache = new Map<string, Exercise>();

interface ExerciseRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      supabaseConfigError ??
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return supabase;
}

function normalizeSearchQuery(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeStringArray(values: string[] | null | undefined) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function toDisplayLabel(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function toDisplayType(row: SearchExercisesRpcRow) {
  if (
    row.exercise_type === 'strength' &&
    (row.load_type === 'bodyweight' || row.load_type === 'bodyweight_plus_load')
  ) {
    return 'Bodyweight';
  }

  if (row.mechanic) {
    return toDisplayLabel(row.mechanic);
  }

  return toDisplayLabel(row.exercise_type);
}

function cacheExercises(exercises: Exercise[]) {
  exercises.forEach((exercise) => {
    exerciseBySlugCache.set(exercise.slug, exercise);
    exerciseByIdCache.set(exercise.id, exercise);
  });
}

async function runExerciseRpc(args: Record<string, unknown>) {
  const client = assertSupabase() as unknown as ExerciseRpcClient;
  return client.rpc('search_exercises', args);
}

function mapSearchRowToExercise(row: SearchExercisesRpcRow): Exercise {
  const primaryMuscles = normalizeStringArray(row.primary_muscles);
  const secondaryMuscles = normalizeStringArray(row.secondary_muscles);
  const muscles = Array.from(new Set([...primaryMuscles, ...secondaryMuscles]));
  const muscleGroups = normalizeStringArray(row.muscle_groups);
  const bodyRegions = normalizeStringArray(row.body_regions);
  const equipment = normalizeStringArray(row.equipment);
  const equipmentCodes = normalizeStringArray(row.equipment_codes);
  const programFocuses = normalizeStringArray(row.program_focuses);
  const exercise: Exercise = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: toDisplayType(row),
    muscles,
    primaryMuscles,
    secondaryMuscles,
    muscleGroups,
    bodyRegions,
    equipment,
    equipmentCodes,
    tags: [],
    description: row.description ?? undefined,
    instructions: normalizeStringArray(row.instructions),
    exerciseType: row.exercise_type,
    movementPattern: row.movement_pattern,
    mechanic: row.mechanic,
    difficulty: row.difficulty,
    laterality: row.laterality,
    primaryTrackingMetric: row.primary_tracking_metric,
    loadType: row.load_type,
    programFocuses,
    aliases: normalizeStringArray(row.aliases),
  };

  exercise.tags = buildExerciseTags(exercise);
  return exercise;
}

async function ensureExerciseLookupUser() {
  const client = assertSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (session?.user) {
    return session.user;
  }

  const { data, error } = await client.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('Supabase did not return an authenticated user.');
  }

  return data.user;
}

function createSearchCacheKey({
  query,
  filters,
  slug,
  exerciseId,
  limit,
}: {
  query?: string;
  filters?: ExerciseSearchFilters;
  slug?: string;
  exerciseId?: string;
  limit: number;
}) {
  return JSON.stringify({
    query: query ?? '',
    slug: slug ?? '',
    exerciseId: exerciseId ?? '',
    limit,
    filters: {
      muscleGroups: filters?.muscleGroups ?? [],
      bodyRegions: filters?.bodyRegions ?? [],
      equipmentCodes: filters?.equipmentCodes ?? [],
      exerciseTypes: filters?.exerciseTypes ?? [],
      difficultyLevels: filters?.difficultyLevels ?? [],
      movementPatterns: filters?.movementPatterns ?? [],
      programFocuses: filters?.programFocuses ?? [],
    },
  });
}

export async function searchExercises({
  query,
  filters,
  slug,
  exerciseId,
  limit = DEFAULT_SEARCH_LIMIT,
}: {
  query?: string;
  filters?: ExerciseSearchFilters;
  slug?: string;
  exerciseId?: string;
  limit?: number;
}) {
  const normalizedQuery = normalizeSearchQuery(query ?? '');
  const targetSlug = slug?.trim() || undefined;
  const targetExerciseId = exerciseId?.trim() || undefined;
  const cacheKey = createSearchCacheKey({
    query: normalizedQuery,
    filters,
    slug: targetSlug,
    exerciseId: targetExerciseId,
    limit,
  });

  const cachedExercises = exerciseSearchCache.get(cacheKey);
  if (cachedExercises) {
    return cachedExercises;
  }

  const inFlightRequest = inFlightExerciseSearches.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = (async () => {
    await ensureExerciseLookupUser();
    const { data, error } = await runExerciseRpc({
      p_query: normalizedQuery || undefined,
      p_slug: targetSlug ?? undefined,
      p_exercise_id: targetExerciseId ?? undefined,
      p_muscle_codes: undefined,
      p_muscle_groups: filters?.muscleGroups ?? undefined,
      p_body_regions: filters?.bodyRegions ?? undefined,
      p_equipment_codes: filters?.equipmentCodes ?? undefined,
      p_exercise_types: filters?.exerciseTypes ?? undefined,
      p_difficulty_levels: filters?.difficultyLevels ?? undefined,
      p_movement_patterns: filters?.movementPatterns ?? undefined,
      p_program_focuses: filters?.programFocuses ?? undefined,
      p_limit: limit,
    });

    if (error) {
      throw error;
    }

    const exercises = ((data ?? []) as SearchExercisesRpcRow[]).map(
      mapSearchRowToExercise,
    );
    cacheExercises(exercises);
    exerciseSearchCache.set(cacheKey, exercises);
    return exercises;
  })();

  inFlightExerciseSearches.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlightExerciseSearches.delete(cacheKey);
  }
}

export async function getExerciseBySlug(slug: string) {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    return null;
  }

  const cachedExercise = exerciseBySlugCache.get(normalizedSlug);
  if (cachedExercise) {
    return cachedExercise;
  }

  const [exercise] = await searchExercises({
    slug: normalizedSlug,
    limit: 1,
  });

  return exercise ?? null;
}

export function getExerciseMetadataLabel(value: string | null | undefined) {
  const label = toDisplayLabel(value);
  return label || 'Not specified';
}
