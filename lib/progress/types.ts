import type { ProfileUnitPreference } from '../../types';

export type ProgressActivityRange = 'week' | 'month';

export type BodyMeasurementType =
  | 'waist'
  | 'chest'
  | 'hips'
  | 'left_arm'
  | 'right_arm'
  | 'left_thigh'
  | 'right_thigh'
  | 'neck'
  | 'body_fat_percentage';

export type BodyMeasurementUnit = 'cm' | 'percent';

export type PersonalRecordType =
  | 'heaviest_load'
  | 'estimated_one_rep_max'
  | 'max_reps'
  | 'least_assistance'
  | 'longest_duration'
  | 'longest_distance';

export interface BodyWeightEntry {
  id: string;
  userId: string;
  weightKg: number;
  measuredAt: string;
  source: 'manual' | 'profile_sync' | 'backfill';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BodyMeasurementEntry {
  id: string;
  userId: string;
  measurementType: BodyMeasurementType;
  value: number;
  unit: BodyMeasurementUnit;
  measuredAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressActivityBucket {
  label: string;
  bucketStart: string;
  bucketEnd: string;
  totalMinutes: number;
  workoutCount: number;
  completedWorkingSets: number;
  externalVolumeKg: number;
}

export interface ProgressMuscleSummary {
  muscleId: string;
  code: string;
  name: string;
  muscleGroup: string;
  setCount: number;
}

export interface ProgressSecondaryMuscleSummary {
  muscleId: string;
  code: string;
  name: string;
  muscleGroup: string;
  setScore: number;
}

export interface ProgressTopExerciseSummary {
  exerciseId: string;
  exerciseName: string;
  completedWorkingSets: number;
  externalVolumeKg: number;
}

export interface ProgressTrainingSummary {
  completedWorkoutsThisWeek: number;
  completedWorkoutsLast7Days: number;
  completedWorkoutsLast30Days: number;
  completedWorkingSetsThisWeek: number;
  totalDurationSecondsThisWeek: number;
  externalVolumeKgThisWeek: number;
  workoutGoalPerWeek: number | null;
  weeklyGoalCompletionPercent: number | null;
  primaryMuscleSets: ProgressMuscleSummary[];
  secondaryMuscleSets: ProgressSecondaryMuscleSummary[];
  topExercises: ProgressTopExerciseSummary[];
}

export interface ExerciseProgressRow {
  workoutSetId: string;
  workoutSessionId: string;
  workoutSessionExerciseId: string;
  exerciseId: string;
  sessionName: string;
  exerciseName: string;
  achievedAt: string;
  setNumber: number;
  setType: string;
  trackingMetric: string;
  loadType: string;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  assistanceWeightKg: number | null;
  bodyweightKgSnapshot: number | null;
  countsAsWorkingSet: boolean;
  externalVolumeKg: number | null;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  recordType: PersonalRecordType;
  value: number;
  unit: 'kg' | 'reps' | 'seconds' | 'meters';
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  assistanceWeightKg: number | null;
  bodyweightKgSnapshot: number | null;
  workoutSessionId: string;
  workoutSetId: string;
  achievedAt: string;
  trackingMetric: string;
  loadType: string;
  previousValue: number | null;
  previousAchievedAt: string | null;
}

export interface BodyWeightTrendSummary {
  latestEntry: BodyWeightEntry | null;
  previousEntry: BodyWeightEntry | null;
  latestDisplayValue: number | null;
  previousDisplayValue: number | null;
  deltaDisplayValue: number | null;
  unitLabel: 'kg' | 'lb';
}

export interface MeasurementTrendSummary {
  latestEntry: BodyMeasurementEntry | null;
  previousEntry: BodyMeasurementEntry | null;
  latestDisplayValue: number | null;
  previousDisplayValue: number | null;
  deltaDisplayValue: number | null;
  unitLabel: string;
}

export interface MeasurementOption {
  type: BodyMeasurementType;
  label: string;
}

export interface DisplayMeasurementValue {
  value: number;
  unitLabel: string;
}

export interface ProgressDashboardSnapshot {
  activity: Record<ProgressActivityRange, ProgressActivityBucket[]>;
  summary: ProgressTrainingSummary;
  weightHistory: BodyWeightEntry[];
  measurements: BodyMeasurementEntry[];
  records: PersonalRecord[];
}

export interface MeasurementDisplayContext {
  measurementType: BodyMeasurementType;
  preferredUnits: ProfileUnitPreference | null | undefined;
}
