import {
  getProgressTimeZone,
  getRequiredProgressUser,
} from './shared';
import type { Database } from '../../types/database.types';
import type {
  ProgressActivityBucket,
  ProgressActivityRange,
  ProgressMuscleSummary,
  ProgressSecondaryMuscleSummary,
  ProgressTopExerciseSummary,
  ProgressTrainingSummary,
} from './types';

type ActivityBucketRpcRow =
  Database['public']['Functions']['get_activity_buckets']['Returns'][number];
type TrainingSummaryRpcRow =
  Database['public']['Functions']['get_training_summary']['Returns'][number];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProgressMuscleSummary(value: unknown): value is ProgressMuscleSummary {
  return (
    isObject(value) &&
    typeof value.muscleId === 'string' &&
    typeof value.code === 'string' &&
    typeof value.name === 'string' &&
    typeof value.muscleGroup === 'string' &&
    typeof value.setCount === 'number'
  );
}

function isProgressSecondaryMuscleSummary(
  value: unknown,
): value is ProgressSecondaryMuscleSummary {
  return (
    isObject(value) &&
    typeof value.muscleId === 'string' &&
    typeof value.code === 'string' &&
    typeof value.name === 'string' &&
    typeof value.muscleGroup === 'string' &&
    typeof value.setScore === 'number'
  );
}

function isProgressTopExerciseSummary(
  value: unknown,
): value is ProgressTopExerciseSummary {
  return (
    isObject(value) &&
    typeof value.exerciseId === 'string' &&
    typeof value.exerciseName === 'string' &&
    typeof value.completedWorkingSets === 'number' &&
    typeof value.externalVolumeKg === 'number'
  );
}

function parsePrimaryMuscleSets(value: unknown): ProgressMuscleSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isProgressMuscleSummary);
}

function parseSecondaryMuscleSets(
  value: unknown,
): ProgressSecondaryMuscleSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isProgressSecondaryMuscleSummary);
}

function parseTopExercises(value: unknown): ProgressTopExerciseSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isProgressTopExerciseSummary);
}

function mapActivityBucket(row: ActivityBucketRpcRow): ProgressActivityBucket {
  return {
    label: row.label,
    bucketStart: row.bucket_start,
    bucketEnd: row.bucket_end,
    totalMinutes: row.total_minutes ?? 0,
    workoutCount: row.workout_count ?? 0,
    completedWorkingSets: row.completed_working_sets ?? 0,
    externalVolumeKg: Number(row.external_volume_kg ?? 0),
  };
}

export async function getActivityBuckets(
  range: ProgressActivityRange,
  timezone = getProgressTimeZone(),
) {
  const { client } = await getRequiredProgressUser();
  const { data, error } = await client.rpc('get_activity_buckets', {
    p_range: range,
    p_timezone: timezone,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ActivityBucketRpcRow[]).map(mapActivityBucket);
}

export async function getTrainingSummary(timezone = getProgressTimeZone()) {
  const { client } = await getRequiredProgressUser();
  const { data, error } = await client.rpc('get_training_summary', {
    p_timezone: timezone,
  });

  if (error) {
    throw error;
  }

  const row = ((data ?? []) as TrainingSummaryRpcRow[])[0];

  return {
    completedWorkoutsThisWeek: row?.completed_workouts_this_week ?? 0,
    completedWorkoutsLast7Days: row?.completed_workouts_last_7_days ?? 0,
    completedWorkoutsLast30Days: row?.completed_workouts_last_30_days ?? 0,
    completedWorkingSetsThisWeek: row?.completed_working_sets_this_week ?? 0,
    totalDurationSecondsThisWeek: row?.total_duration_seconds_this_week ?? 0,
    externalVolumeKgThisWeek: Number(row?.external_volume_kg_this_week ?? 0),
    workoutGoalPerWeek: row?.workout_goal_per_week ?? null,
    weeklyGoalCompletionPercent: row?.weekly_goal_completion_percent ?? null,
    primaryMuscleSets: parsePrimaryMuscleSets(row?.primary_muscle_sets),
    secondaryMuscleSets: parseSecondaryMuscleSets(row?.secondary_muscle_sets),
    topExercises: parseTopExercises(row?.top_exercises),
  } satisfies ProgressTrainingSummary;
}

export function calculateGoalCompletionForRange({
  buckets,
  range,
  workoutGoalPerWeek,
  weeklyGoalCompletionPercent,
}: {
  buckets: ProgressActivityBucket[];
  range: ProgressActivityRange;
  workoutGoalPerWeek: number | null;
  weeklyGoalCompletionPercent: number | null;
}) {
  if (range === 'week') {
    return weeklyGoalCompletionPercent;
  }

  if (!workoutGoalPerWeek || workoutGoalPerWeek <= 0) {
    return null;
  }

  const workoutCount = buckets.reduce((sum, bucket) => sum + bucket.workoutCount, 0);
  return Number((((workoutCount / (workoutGoalPerWeek * 4)) * 100)).toFixed(2));
}
