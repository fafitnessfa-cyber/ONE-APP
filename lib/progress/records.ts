import { getRequiredProgressUser } from './shared';
import type { Database } from '../../types/database.types';
import type {
  ExerciseProgressRow,
  PersonalRecord,
  PersonalRecordType,
} from './types';

type ExerciseProgressRpcRow =
  Database['public']['Functions']['get_exercise_progress']['Returns'][number];
type PersonalRecordRpcRow =
  Database['public']['Functions']['get_personal_records']['Returns'][number];

function isPersonalRecordType(value: string): value is PersonalRecordType {
  return [
    'heaviest_load',
    'estimated_one_rep_max',
    'max_reps',
    'least_assistance',
    'longest_duration',
    'longest_distance',
  ].includes(value);
}

function isPersonalRecordUnit(
  value: string,
): value is PersonalRecord['unit'] {
  return ['kg', 'reps', 'seconds', 'meters'].includes(value);
}

function mapExerciseProgressRow(row: ExerciseProgressRpcRow): ExerciseProgressRow {
  return {
    workoutSetId: row.workout_set_id,
    workoutSessionId: row.workout_session_id,
    workoutSessionExerciseId: row.workout_session_exercise_id,
    exerciseId: row.exercise_id,
    sessionName: row.session_name,
    exerciseName: row.exercise_name,
    achievedAt: row.achieved_at,
    setNumber: row.set_number,
    setType: row.set_type,
    trackingMetric: row.tracking_metric,
    loadType: row.load_type,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters:
      row.distance_meters == null ? null : Number(row.distance_meters),
    assistanceWeightKg:
      row.assistance_weight_kg == null ? null : Number(row.assistance_weight_kg),
    bodyweightKgSnapshot:
      row.bodyweight_kg_snapshot == null ? null : Number(row.bodyweight_kg_snapshot),
    countsAsWorkingSet: Boolean(row.counts_as_working_set),
    externalVolumeKg:
      row.external_volume_kg == null ? null : Number(row.external_volume_kg),
  };
}

function mapPersonalRecordRow(row: PersonalRecordRpcRow): PersonalRecord {
  if (!isPersonalRecordType(row.record_type)) {
    throw new Error(`Unexpected personal record type: ${row.record_type}`);
  }

  if (!isPersonalRecordUnit(row.unit)) {
    throw new Error(`Unexpected personal record unit: ${row.unit}`);
  }

  return {
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    recordType: row.record_type,
    value: Number(row.value),
    unit: row.unit,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters:
      row.distance_meters == null ? null : Number(row.distance_meters),
    assistanceWeightKg:
      row.assistance_weight_kg == null ? null : Number(row.assistance_weight_kg),
    bodyweightKgSnapshot:
      row.bodyweight_kg_snapshot == null ? null : Number(row.bodyweight_kg_snapshot),
    workoutSessionId: row.workout_session_id,
    workoutSetId: row.workout_set_id,
    achievedAt: row.achieved_at,
    trackingMetric: row.tracking_metric,
    loadType: row.load_type,
    previousValue:
      row.previous_value == null ? null : Number(row.previous_value),
    previousAchievedAt: row.previous_achieved_at,
  };
}

export async function getExerciseProgress(exerciseId: string, limit = 60) {
  const { client } = await getRequiredProgressUser();
  const { data, error } = await client.rpc('get_exercise_progress', {
    p_exercise_id: exerciseId,
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ExerciseProgressRpcRow[]).map(mapExerciseProgressRow);
}

export async function getPersonalRecords({
  exerciseId,
  limit = 100,
}: {
  exerciseId?: string;
  limit?: number;
} = {}) {
  const { client } = await getRequiredProgressUser();
  const { data, error } = await client.rpc('get_personal_records', {
    p_exercise_id: exerciseId,
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as PersonalRecordRpcRow[]).map(mapPersonalRecordRow);
}
