export interface Exercise {
  id: string;
  slug: string;
  name: string;
  type: string;
  muscles: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  muscleGroups: string[];
  bodyRegions: string[];
  equipment: string[];
  equipmentCodes: string[];
  tags: string[];
  description?: string;
  instructions: string[];
  exerciseType: 'strength' | 'cardio' | 'mobility';
  movementPattern: string | null;
  mechanic: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  laterality: 'bilateral' | 'unilateral' | 'alternating' | null;
  primaryTrackingMetric: string;
  loadType: string;
  programFocuses: string[];
  aliases: string[];
  image?: string;
}

export type ExerciseFilterTagId =
  | 'all'
  | 'chest'
  | 'legs'
  | 'hypertrophy'
  | 'barbell'
  | 'upper'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'core';

export interface FilterTag {
  id: ExerciseFilterTagId;
  label: string;
}

export interface ExerciseSearchFilters {
  muscleGroups?: string[];
  bodyRegions?: string[];
  equipmentCodes?: string[];
  exerciseTypes?: Exercise['exerciseType'][];
  difficultyLevels?: NonNullable<Exercise['difficulty']>[];
  movementPatterns?: string[];
  programFocuses?: string[];
}
