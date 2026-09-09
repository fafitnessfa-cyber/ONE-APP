import type { Tables } from '../../types/database.types';
import { HOME_PUSH_EXERCISES } from '../exercises/constants';
import { getExerciseBySlug } from '../exercises/exercises';
import type {
  SaveWorkoutPlanInput,
  WorkoutPlan,
  WorkoutPlanDay,
  WorkoutPlanExercise,
} from './types';
import { getRequiredWorkoutUser } from './shared';

const WORKOUT_PLAN_SELECT = `
  id,
  user_id,
  name,
  description,
  is_active,
  is_template,
  created_at,
  updated_at,
  workout_plan_days (
    id,
    workout_plan_id,
    name,
    day_order,
    weekday,
    notes,
    created_at,
    updated_at,
    workout_plan_exercises (
      id,
      workout_plan_day_id,
      exercise_id,
      position,
      target_sets,
      target_reps_min,
      target_reps_max,
      target_weight_kg,
      target_duration_seconds,
      target_distance_meters,
      rest_seconds,
      notes,
      created_at,
      updated_at
    )
  )
`;

const STARTER_PLAN_NAME = 'ONE UP Starter Plan';
const STARTER_PLAN_DAY_NAME = 'Push Strength Day';

type WorkoutPlanRow = Tables<'workout_plans'>;
type WorkoutPlanDayRow = Tables<'workout_plan_days'>;
type WorkoutPlanExerciseRow = Tables<'workout_plan_exercises'>;

interface WorkoutPlanDayQueryRow extends WorkoutPlanDayRow {
  workout_plan_exercises?: WorkoutPlanExerciseRow[] | null;
}

interface WorkoutPlanQueryRow extends WorkoutPlanRow {
  workout_plan_days?: WorkoutPlanDayQueryRow[] | null;
}

function mapWorkoutPlanExercise(row: WorkoutPlanExerciseRow): WorkoutPlanExercise {
  return {
    id: row.id,
    workoutPlanDayId: row.workout_plan_day_id,
    exerciseId: row.exercise_id,
    position: row.position,
    targetSets: row.target_sets,
    targetRepsMin: row.target_reps_min,
    targetRepsMax: row.target_reps_max,
    targetWeightKg: row.target_weight_kg,
    targetDurationSeconds: row.target_duration_seconds,
    targetDistanceMeters: row.target_distance_meters,
    restSeconds: row.rest_seconds,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkoutPlanDay(row: WorkoutPlanDayQueryRow): WorkoutPlanDay {
  const exercises = [...(row.workout_plan_exercises ?? [])]
    .sort((left, right) => left.position - right.position)
    .map(mapWorkoutPlanExercise);

  return {
    id: row.id,
    workoutPlanId: row.workout_plan_id,
    name: row.name,
    dayOrder: row.day_order,
    weekday: row.weekday as WorkoutPlanDay['weekday'],
    notes: row.notes,
    exercises,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkoutPlan(row: WorkoutPlanQueryRow): WorkoutPlan {
  const days = [...(row.workout_plan_days ?? [])]
    .sort((left, right) => left.day_order - right.day_order)
    .map(mapWorkoutPlanDay);

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    isTemplate: row.is_template,
    days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePlanInput(input: SaveWorkoutPlanInput) {
  return input.days.map((day) => ({
    name: day.name,
    day_order: day.dayOrder,
    weekday: day.weekday ?? null,
    notes: day.notes ?? null,
    exercises: day.exercises.map((exercise) => ({
      exercise_id: exercise.exerciseId,
      position: exercise.position,
      target_sets: exercise.targetSets,
      target_reps_min: exercise.targetRepsMin,
      target_reps_max: exercise.targetRepsMax,
      target_weight_kg: exercise.targetWeightKg,
      target_duration_seconds: exercise.targetDurationSeconds,
      target_distance_meters: exercise.targetDistanceMeters,
      rest_seconds: exercise.restSeconds,
      notes: exercise.notes ?? null,
    })),
  }));
}

export async function getWorkoutPlans() {
  const { client, user } = await getRequiredWorkoutUser();
  const { data, error } = await client
    .from('workout_plans')
    .select(WORKOUT_PLAN_SELECT)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as WorkoutPlanQueryRow[]).map(mapWorkoutPlan);
}

export async function getWorkoutPlan(planId: string) {
  const { client, user } = await getRequiredWorkoutUser();
  const { data, error } = await client
    .from('workout_plans')
    .select(WORKOUT_PLAN_SELECT)
    .eq('id', planId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapWorkoutPlan(data as WorkoutPlanQueryRow) : null;
}

export async function saveWorkoutPlan(input: SaveWorkoutPlanInput) {
  const { client } = await getRequiredWorkoutUser();
  const { data, error } = await client.rpc('save_workout_plan', {
    p_plan_id: input.planId ?? undefined,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_is_active: input.isActive ?? true,
    p_is_template: input.isTemplate ?? false,
    p_days: serializePlanInput(input),
  });

  if (error) {
    throw error;
  }

  const planId = data as string | null;
  if (!planId) {
    throw new Error('Supabase did not return a workout plan id.');
  }

  const savedPlan = await getWorkoutPlan(planId);
  if (!savedPlan) {
    throw new Error('Saved workout plan could not be reloaded.');
  }

  return savedPlan;
}

export async function ensureStarterWorkoutPlanDay() {
  const existingPlans = await getWorkoutPlans();
  const existingStarterDay = existingPlans
    .find((plan) => plan.isTemplate && plan.name === STARTER_PLAN_NAME)
    ?.days.find((day) => day.name === STARTER_PLAN_DAY_NAME);

  if (existingStarterDay) {
    return existingStarterDay;
  }

  const starterExercises = await Promise.all(
    HOME_PUSH_EXERCISES.map(async (presetExercise, index) => {
      const exercise = await getExerciseBySlug(presetExercise.slug);

      if (!exercise) {
        throw new Error(
          `Unable to build the starter workout because ${presetExercise.slug} is missing from the exercise catalog.`,
        );
      }

      return {
        exerciseId: exercise.id,
        position: index + 1,
        targetSets: presetExercise.setCount,
        targetRepsMin: Number.parseInt(presetExercise.reps, 10),
        targetRepsMax: Number.parseInt(presetExercise.reps, 10),
        targetWeightKg: Number.parseFloat(presetExercise.weight),
        targetDurationSeconds: null,
        targetDistanceMeters: null,
        restSeconds: 90,
        notes: null,
      };
    }),
  );

  const starterPlan = await saveWorkoutPlan({
    name: STARTER_PLAN_NAME,
    description:
      'Starter workout plan used by the current Home push-day flow.',
    isActive: true,
    isTemplate: true,
    days: [
      {
        name: STARTER_PLAN_DAY_NAME,
        dayOrder: 1,
        exercises: starterExercises,
      },
    ],
  });

  const starterDay = starterPlan.days.find(
    (day) => day.name === STARTER_PLAN_DAY_NAME,
  );

  if (!starterDay) {
    throw new Error('Starter workout day could not be created.');
  }

  return starterDay;
}
