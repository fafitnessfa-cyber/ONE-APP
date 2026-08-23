import type { Tables, TablesInsert, TablesUpdate } from '../../types/database.types';
import type {
  AddWorkoutSetInput,
  StartWorkoutSessionInput,
  UpdateWorkoutSetInput,
  WorkoutHistorySessionSummary,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSet,
} from './types';
import { getRequiredWorkoutUser } from './shared';

const WORKOUT_SESSION_SELECT = `
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

type WorkoutSessionRow = Tables<'workout_sessions'>;
type WorkoutSessionExerciseRow = Tables<'workout_session_exercises'>;
type WorkoutSetRow = Tables<'workout_sets'>;

interface WorkoutSessionExerciseQueryRow extends WorkoutSessionExerciseRow {
  workout_sets?: WorkoutSetRow[] | null;
}

interface WorkoutSessionQueryRow extends WorkoutSessionRow {
  workout_session_exercises?: WorkoutSessionExerciseQueryRow[] | null;
}

function mapWorkoutSet(row: WorkoutSetRow): WorkoutSet {
  return {
    id: row.id,
    userId: row.user_id,
    workoutSessionId: row.workout_session_id,
    workoutSessionExerciseId: row.workout_session_exercise_id,
    exerciseId: row.exercise_id,
    setNumber: row.set_number,
    setType: row.set_type as WorkoutSet['setType'],
    weightKg: row.weight_kg,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    assistanceWeightKg: row.assistance_weight_kg,
    bodyweightKgSnapshot: row.bodyweight_kg_snapshot,
    rpe: row.rpe,
    rir: row.rir,
    isCompleted: row.is_completed,
    completedAt: row.completed_at,
    plannedRepsMin: row.planned_reps_min,
    plannedRepsMax: row.planned_reps_max,
    plannedWeightKg: row.planned_weight_kg,
    plannedDurationSeconds: row.planned_duration_seconds,
    plannedDistanceMeters: row.planned_distance_meters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkoutSessionExercise(
  row: WorkoutSessionExerciseQueryRow,
): WorkoutSessionExercise {
  return {
    id: row.id,
    workoutSessionId: row.workout_session_id,
    workoutPlanExerciseId: row.workout_plan_exercise_id,
    exerciseId: row.exercise_id,
    exerciseNameSnapshot: row.exercise_name_snapshot,
    position: row.position,
    trackingMetricSnapshot:
      row.tracking_metric_snapshot as WorkoutSessionExercise['trackingMetricSnapshot'],
    loadTypeSnapshot:
      row.load_type_snapshot as WorkoutSessionExercise['loadTypeSnapshot'],
    notes: row.notes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    sets: [...(row.workout_sets ?? [])]
      .sort((left, right) => left.set_number - right.set_number)
      .map(mapWorkoutSet),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkoutSession(row: WorkoutSessionQueryRow): WorkoutSession {
  return {
    id: row.id,
    userId: row.user_id,
    workoutPlanId: row.workout_plan_id,
    workoutPlanDayId: row.workout_plan_day_id,
    nameSnapshot: row.name_snapshot,
    status: row.status as WorkoutSession['status'],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationSeconds: row.duration_seconds,
    notes: row.notes,
    exercises: [...(row.workout_session_exercises ?? [])]
      .sort((left, right) => left.position - right.position)
      .map(mapWorkoutSessionExercise),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildWorkoutSetUpdatePayload(
  input: UpdateWorkoutSetInput,
): TablesUpdate<'workout_sets'> {
  const payload: TablesUpdate<'workout_sets'> = {};

  if (input.setType !== undefined) {
    payload.set_type = input.setType;
  }

  if (input.weightKg !== undefined) {
    payload.weight_kg = input.weightKg;
  }

  if (input.reps !== undefined) {
    payload.reps = input.reps;
  }

  if (input.durationSeconds !== undefined) {
    payload.duration_seconds = input.durationSeconds;
  }

  if (input.distanceMeters !== undefined) {
    payload.distance_meters = input.distanceMeters;
  }

  if (input.assistanceWeightKg !== undefined) {
    payload.assistance_weight_kg = input.assistanceWeightKg;
  }

  if (input.rpe !== undefined) {
    payload.rpe = input.rpe;
  }

  if (input.rir !== undefined) {
    payload.rir = input.rir;
  }

  if (input.isCompleted !== undefined) {
    payload.is_completed = input.isCompleted;
  }

  return payload;
}

export async function getWorkoutSession(sessionId: string) {
  const { client, user } = await getRequiredWorkoutUser();
  const { data, error } = await client
    .from('workout_sessions')
    .select(WORKOUT_SESSION_SELECT)
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapWorkoutSession(data as WorkoutSessionQueryRow) : null;
}

export async function getActiveWorkoutSession() {
  const { client, user } = await getRequiredWorkoutUser();
  const { data, error } = await client
    .from('workout_sessions')
    .select(WORKOUT_SESSION_SELECT)
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapWorkoutSession(data as WorkoutSessionQueryRow) : null;
}

export async function startWorkoutSession(input: StartWorkoutSessionInput) {
  const { client } = await getRequiredWorkoutUser();
  const { data, error } = await client.rpc('start_workout_session', {
    p_workout_plan_day_id: input.workoutPlanDayId ?? undefined,
    p_session_name: input.sessionName ?? undefined,
    p_exercises:
      input.exercises?.map((exercise) => ({
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
      })) ?? [],
  });

  if (error) {
    throw error;
  }

  const startResult = (data ?? [])[0];
  if (!startResult?.session_id) {
    throw new Error('Supabase did not return a workout session id.');
  }

  const session = await getWorkoutSession(startResult.session_id);
  if (!session) {
    throw new Error('Workout session could not be loaded.');
  }

  return {
    session,
    wasResumed: Boolean(startResult.was_resumed),
  };
}

export async function updateWorkoutSet(input: UpdateWorkoutSetInput) {
  const { client } = await getRequiredWorkoutUser();
  const { data, error } = await client
    .from('workout_sets')
    .update(buildWorkoutSetUpdatePayload(input))
    .eq('id', input.setId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapWorkoutSet(data as WorkoutSetRow);
}

export async function addWorkoutSet(input: AddWorkoutSetInput) {
  const { client, user } = await getRequiredWorkoutUser();
  const payload: TablesInsert<'workout_sets'> = {
    user_id: user.id,
    workout_session_id: input.workoutSessionId,
    workout_session_exercise_id: input.workoutSessionExerciseId,
    exercise_id: input.exerciseId,
    set_number: input.setNumber,
    set_type: input.setType ?? 'working',
    weight_kg: input.weightKg ?? null,
    reps: input.reps ?? null,
    duration_seconds: input.durationSeconds ?? null,
    distance_meters: input.distanceMeters ?? null,
    assistance_weight_kg: input.assistanceWeightKg ?? null,
    bodyweight_kg_snapshot: input.bodyweightKgSnapshot ?? null,
    planned_reps_min: input.plannedRepsMin,
    planned_reps_max: input.plannedRepsMax,
    planned_weight_kg: input.plannedWeightKg,
    planned_duration_seconds: input.plannedDurationSeconds,
    planned_distance_meters: input.plannedDistanceMeters,
    is_completed: false,
  };

  const { data, error } = await client
    .from('workout_sets')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapWorkoutSet(data as WorkoutSetRow);
}

export async function removeWorkoutSet(setId: string) {
  const { client } = await getRequiredWorkoutUser();
  const { error } = await client.from('workout_sets').delete().eq('id', setId);

  if (error) {
    throw error;
  }
}

export async function completeWorkoutSession(sessionId: string) {
  const { client } = await getRequiredWorkoutUser();
  const { data, error } = await client.rpc('complete_workout_session', {
    p_workout_session_id: sessionId,
  });

  if (error) {
    throw error;
  }

  return (data ?? [])[0] ?? null;
}

export async function cancelWorkoutSession(sessionId: string) {
  const { client } = await getRequiredWorkoutUser();
  const { data, error } = await client.rpc('cancel_workout_session', {
    p_workout_session_id: sessionId,
  });

  if (error) {
    throw error;
  }

  return (data ?? [])[0] ?? null;
}

export async function getRecentWorkoutSessions(limit = 12) {
  const { client, user } = await getRequiredWorkoutUser();
  const { data, error } = await client
    .from('workout_sessions')
    .select(WORKOUT_SESSION_SELECT)
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as WorkoutSessionQueryRow[]).map((row) => {
    const session = mapWorkoutSession(row);
    const allSets = session.exercises.flatMap((exercise) => exercise.sets);

    return {
      id: session.id,
      nameSnapshot: session.nameSnapshot,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      durationSeconds: session.durationSeconds,
      exerciseCount: session.exercises.length,
      completedSetCount: allSets.filter((set) => set.isCompleted).length,
      totalSetCount: allSets.length,
    } satisfies WorkoutHistorySessionSummary;
  });
}
