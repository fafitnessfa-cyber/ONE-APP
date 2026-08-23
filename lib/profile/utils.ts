import type {
  ProfileUnitPreference,
  ProfileWeekday,
  UserProfile,
} from '../../types';
import {
  WEEKDAY_OPTIONS,
  getFitnessGoalLabel,
  getUnitPreferenceLabel,
} from './constants';

export function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

export function poundsToKilograms(value: number) {
  return roundToTwoDecimals(value * 0.45359237);
}

export function kilogramsToPounds(value: number) {
  return roundToTwoDecimals(value * 2.2046226218);
}

export function feetAndInchesToCentimeters(feet: number, inches: number) {
  return roundToTwoDecimals(((feet * 12) + inches) * 2.54);
}

export function centimetersToFeetAndInches(value: number) {
  const totalInches = value / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = roundToTwoDecimals(totalInches - (feet * 12));

  return {
    feet,
    inches,
  };
}

export function normalizeWeekdays(days: readonly string[]) {
  const validDays = new Set(WEEKDAY_OPTIONS.map((option) => option.value));
  const nextDays = new Set<ProfileWeekday>();

  for (const day of days) {
    if (validDays.has(day as ProfileWeekday)) {
      nextDays.add(day as ProfileWeekday);
    }
  }

  return WEEKDAY_OPTIONS.map((option) => option.value).filter((day) =>
    nextDays.has(day),
  );
}

export function formatHeight(
  heightCm: number | null | undefined,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (heightCm == null) {
    return 'Not set';
  }

  if (preferredUnits === 'imperial') {
    const { feet, inches } = centimetersToFeetAndInches(heightCm);
    return `${feet}' ${inches.toFixed(1)}"`;
  }

  return `${heightCm.toFixed(1)} cm`;
}

export function formatWeight(
  weightKg: number | null | undefined,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (weightKg == null) {
    return 'Not set';
  }

  if (preferredUnits === 'imperial') {
    return `${kilogramsToPounds(weightKg).toFixed(1)} lb`;
  }

  return `${weightKg.toFixed(1)} kg`;
}

export function formatTrainingDays(days: readonly string[]) {
  const normalized = normalizeWeekdays(days);

  if (normalized.length === 0) {
    return 'Not set';
  }

  return normalized
    .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day)?.shortLabel ?? day)
    .join(', ');
}

export function formatMeasurementSystem(
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (preferredUnits === 'metric') {
    return 'Metric - kg, cm';
  }

  if (preferredUnits === 'imperial') {
    return 'Imperial - lb, ft/in';
  }

  return getUnitPreferenceLabel(preferredUnits);
}

export function getProfileDisplayName(
  profile: UserProfile | null,
  fallbackEmail?: string | null,
) {
  if (profile?.displayName) {
    return profile.displayName;
  }

  if (fallbackEmail) {
    const [localPart] = fallbackEmail.split('@');
    return localPart || 'User';
  }

  return 'User';
}

export function getProfileInitial(
  profile: UserProfile | null,
  fallbackEmail?: string | null,
) {
  return getProfileDisplayName(profile, fallbackEmail).slice(0, 1).toUpperCase();
}

export function formatGoal(profile: UserProfile | null) {
  return getFitnessGoalLabel(profile?.fitnessGoal ?? null);
}
