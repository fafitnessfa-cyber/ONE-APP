import type {
  Exercise,
  ExerciseFilterTagId,
  ExerciseSearchFilters,
  FilterTag,
} from './types';

export const WORKOUT_FILTER_TAGS: FilterTag[] = [
  { id: 'all', label: 'All' },
  { id: 'chest', label: 'Chest' },
  { id: 'legs', label: 'Legs' },
  { id: 'hypertrophy', label: 'Hypertrophy' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'upper', label: 'Upper Body' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'arms', label: 'Arms' },
  { id: 'core', label: 'Core' },
];

export const WORKOUT_FILTERS: Record<
  ExerciseFilterTagId,
  ExerciseSearchFilters
> = {
  all: {},
  chest: { muscleGroups: ['chest'] },
  legs: { muscleGroups: ['legs'] },
  hypertrophy: { programFocuses: ['hypertrophy'] },
  barbell: { equipmentCodes: ['barbell'] },
  upper: { bodyRegions: ['upper', 'core'] },
  back: { muscleGroups: ['back'] },
  shoulders: { muscleGroups: ['shoulders'] },
  arms: { muscleGroups: ['arms'] },
  core: { muscleGroups: ['core'] },
};

export const HOME_PUSH_WORKOUT_ID = 'push-strength-day';

export const HOME_PUSH_EXERCISES = [
  { slug: 'barbell-bench-press', setCount: 4, reps: '8', weight: '60' },
  { slug: 'overhead-press', setCount: 3, reps: '10', weight: '32.5' },
  { slug: 'cable-fly', setCount: 3, reps: '12', weight: '15' },
  { slug: 'triceps-pushdown', setCount: 3, reps: '12', weight: '20' },
] as const;

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

export function buildExerciseTags(
  exercise: Pick<
    Exercise,
    'muscleGroups' | 'bodyRegions' | 'equipmentCodes' | 'programFocuses'
  >,
) {
  const tags: ExerciseFilterTagId[] = [];

  exercise.muscleGroups.forEach((muscleGroup) => {
    if (
      muscleGroup === 'chest' ||
      muscleGroup === 'legs' ||
      muscleGroup === 'back' ||
      muscleGroup === 'shoulders' ||
      muscleGroup === 'arms' ||
      muscleGroup === 'core'
    ) {
      pushUnique(tags, muscleGroup);
    }
  });

  if (exercise.programFocuses.includes('hypertrophy')) {
    pushUnique(tags, 'hypertrophy');
  }

  if (exercise.equipmentCodes.includes('barbell')) {
    pushUnique(tags, 'barbell');
  }

  if (
    exercise.bodyRegions.includes('upper') ||
    exercise.bodyRegions.includes('core')
  ) {
    pushUnique(tags, 'upper');
  }

  return tags;
}
