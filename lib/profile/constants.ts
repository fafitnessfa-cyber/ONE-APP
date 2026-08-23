import type {
  ProfileExperienceLevel,
  ProfileFitnessGoal,
  ProfileUnitPreference,
  ProfileWeekday,
  ProfileWorkoutLocation,
} from '../../types';

interface ProfileOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
}

export const FITNESS_GOAL_OPTIONS: ProfileOption<ProfileFitnessGoal>[] = [
  {
    value: 'lose_weight',
    label: 'Lose Weight',
    description: 'Lean out while keeping training consistency.',
  },
  {
    value: 'build_muscle',
    label: 'Build Muscle',
    description: 'Prioritize muscle gain and recovery.',
  },
  {
    value: 'maintain',
    label: 'Maintain',
    description: 'Stay consistent and hold current progress.',
  },
  {
    value: 'improve_strength',
    label: 'Improve Strength',
    description: 'Push heavier lifts and progressive overload.',
  },
  {
    value: 'improve_fitness',
    label: 'Improve Fitness',
    description: 'Boost overall conditioning and health.',
  },
];

export const EXPERIENCE_LEVEL_OPTIONS: ProfileOption<ProfileExperienceLevel>[] = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'New to structured training or getting restarted.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Training consistently and comfortable with fundamentals.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Experienced with higher training volume and intensity.',
  },
];

export const UNIT_PREFERENCE_OPTIONS: ProfileOption<ProfileUnitPreference>[] = [
  {
    value: 'metric',
    label: 'Metric',
    description: 'Use kilograms and centimeters.',
  },
  {
    value: 'imperial',
    label: 'Imperial',
    description: 'Use pounds and feet/inches.',
  },
];

export const WORKOUT_LOCATION_OPTIONS: ProfileOption<ProfileWorkoutLocation>[] = [
  {
    value: 'home',
    label: 'Home',
    description: 'Mostly train from home.',
  },
  {
    value: 'gym',
    label: 'Gym',
    description: 'Mostly train in a gym.',
  },
  {
    value: 'both',
    label: 'Both',
    description: 'Switch between home and gym.',
  },
];

export const WEEKDAY_OPTIONS: Array<{
  value: ProfileWeekday;
  label: string;
  shortLabel: string;
}> = [
  { value: 'monday', label: 'Monday', shortLabel: 'Mon' },
  { value: 'tuesday', label: 'Tuesday', shortLabel: 'Tue' },
  { value: 'wednesday', label: 'Wednesday', shortLabel: 'Wed' },
  { value: 'thursday', label: 'Thursday', shortLabel: 'Thu' },
  { value: 'friday', label: 'Friday', shortLabel: 'Fri' },
  { value: 'saturday', label: 'Saturday', shortLabel: 'Sat' },
  { value: 'sunday', label: 'Sunday', shortLabel: 'Sun' },
];

function getOptionLabel<TValue extends string>(
  value: TValue | null | undefined,
  options: ProfileOption<TValue>[],
  fallback: string,
) {
  if (!value) {
    return fallback;
  }

  return options.find((option) => option.value === value)?.label ?? fallback;
}

export function getFitnessGoalLabel(value: ProfileFitnessGoal | null | undefined) {
  return getOptionLabel(value, FITNESS_GOAL_OPTIONS, 'Not set');
}

export function getExperienceLevelLabel(
  value: ProfileExperienceLevel | null | undefined,
) {
  return getOptionLabel(value, EXPERIENCE_LEVEL_OPTIONS, 'Not set');
}

export function getUnitPreferenceLabel(
  value: ProfileUnitPreference | null | undefined,
) {
  return getOptionLabel(value, UNIT_PREFERENCE_OPTIONS, 'Not set');
}

export function getWorkoutLocationLabel(
  value: ProfileWorkoutLocation | null | undefined,
) {
  return getOptionLabel(value, WORKOUT_LOCATION_OPTIONS, 'Not set');
}
