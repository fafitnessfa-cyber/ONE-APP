export type WorkoutTrackingMetric =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'reps_only'
  | 'duration'
  | 'distance_duration';

export type WorkoutLoadType =
  | 'external_weight'
  | 'bodyweight'
  | 'bodyweight_plus_load'
  | 'assisted'
  | 'duration'
  | 'distance_duration';

export type WorkoutSessionStatus = 'in_progress' | 'completed' | 'cancelled';
export type WorkoutSetType = 'warmup' | 'working' | 'drop' | 'failure';
export type WorkoutPlanWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface WorkoutPlanExerciseTargets {
  targetSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetWeightKg: number | null;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
  restSeconds: number | null;
}

export interface WorkoutPlanExercise extends WorkoutPlanExerciseTargets {
  id: string;
  workoutPlanDayId: string;
  exerciseId: string;
  position: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutPlanDay {
  id: string;
  workoutPlanId: string;
  name: string;
  dayOrder: number;
  weekday: WorkoutPlanWeekday | null;
  notes: string | null;
  exercises: WorkoutPlanExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutPlan {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isTemplate: boolean;
  days: WorkoutPlanDay[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutSetPlannedValues {
  plannedRepsMin: number | null;
  plannedRepsMax: number | null;
  plannedWeightKg: number | null;
  plannedDurationSeconds: number | null;
  plannedDistanceMeters: number | null;
}

export interface WorkoutSet extends WorkoutSetPlannedValues {
  id: string;
  userId: string;
  workoutSessionId: string;
  workoutSessionExerciseId: string;
  exerciseId: string;
  setNumber: number;
  setType: WorkoutSetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  assistanceWeightKg: number | null;
  bodyweightKgSnapshot: number | null;
  rpe: number | null;
  rir: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutSessionExercise {
  id: string;
  workoutSessionId: string;
  workoutPlanExerciseId: string | null;
  exerciseId: string;
  exerciseNameSnapshot: string;
  position: number;
  trackingMetricSnapshot: WorkoutTrackingMetric;
  loadTypeSnapshot: WorkoutLoadType;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sets: WorkoutSet[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  workoutPlanId: string | null;
  workoutPlanDayId: string | null;
  nameSnapshot: string;
  status: WorkoutSessionStatus;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  notes: string | null;
  exercises: WorkoutSessionExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutHistorySessionSummary {
  id: string;
  nameSnapshot: string;
  status: WorkoutSessionStatus;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  exerciseCount: number;
  completedSetCount: number;
  totalSetCount: number;
}

export interface SaveWorkoutPlanExerciseInput
  extends WorkoutPlanExerciseTargets {
  exerciseId: string;
  position: number;
  notes?: string | null;
}

export interface SaveWorkoutPlanDayInput {
  name: string;
  dayOrder: number;
  weekday?: WorkoutPlanWeekday | null;
  notes?: string | null;
  exercises: SaveWorkoutPlanExerciseInput[];
}

export interface SaveWorkoutPlanInput {
  planId?: string | null;
  name: string;
  description?: string | null;
  isActive?: boolean;
  isTemplate?: boolean;
  days: SaveWorkoutPlanDayInput[];
}

export interface StartWorkoutExerciseInput
  extends WorkoutPlanExerciseTargets {
  exerciseId: string;
  position: number;
  notes?: string | null;
}

export interface StartWorkoutSessionInput {
  workoutPlanDayId?: string | null;
  sessionName?: string | null;
  exercises?: StartWorkoutExerciseInput[];
}

export interface UpdateWorkoutSetInput {
  setId: string;
  setType?: WorkoutSetType;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  assistanceWeightKg?: number | null;
  rpe?: number | null;
  rir?: number | null;
  isCompleted?: boolean;
}

export interface AddWorkoutSetInput extends WorkoutSetPlannedValues {
  workoutSessionId: string;
  workoutSessionExerciseId: string;
  exerciseId: string;
  setNumber: number;
  setType?: WorkoutSetType;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  assistanceWeightKg?: number | null;
  bodyweightKgSnapshot?: number | null;
}

export type WorkoutSetDraftField =
  | 'reps'
  | 'weight'
  | 'durationSeconds'
  | 'distanceMeters'
  | 'assistanceWeight';

export interface WorkoutSetDraft {
  reps: string;
  weight: string;
  durationSeconds: string;
  distanceMeters: string;
  assistanceWeight: string;
}
