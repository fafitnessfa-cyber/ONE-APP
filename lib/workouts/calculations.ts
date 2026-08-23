import type { ProfileUnitPreference } from '../../types';
import type {
  WorkoutLoadType,
  WorkoutPlanExerciseTargets,
  WorkoutTrackingMetric,
} from './types';
import {
  kilogramsToPounds,
  metersToMiles,
  milesToMeters,
  poundsToKilograms,
} from './unit-conversion.mjs';

function trimTrailingZeroes(value: number, maxFractionDigits: number) {
  return value
    .toFixed(maxFractionDigits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}

export function formatWeightInputFromKilograms(
  weightKg: number | null | undefined,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (weightKg == null) {
    return '';
  }

  if (preferredUnits === 'imperial') {
    return trimTrailingZeroes(kilogramsToPounds(weightKg), 1);
  }

  return trimTrailingZeroes(weightKg, 1);
}

export function formatDistanceInputFromMeters(
  distanceMeters: number | null | undefined,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (distanceMeters == null) {
    return '';
  }

  if (preferredUnits === 'imperial') {
    return trimTrailingZeroes(metersToMiles(distanceMeters), 2);
  }

  return trimTrailingZeroes(distanceMeters, 1);
}

export function convertDisplayWeightToKilograms(
  value: number | null,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (value == null) {
    return null;
  }

  if (preferredUnits === 'imperial') {
    return poundsToKilograms(value);
  }

  return Number(trimTrailingZeroes(value, 3));
}

export function convertDisplayDistanceToMeters(
  value: number | null,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (value == null) {
    return null;
  }

  if (preferredUnits === 'imperial') {
    return Number(milesToMeters(value).toFixed(2));
  }

  return Number(value.toFixed(2));
}

export function normalizeIntegerInput(value: string, maxDigits = 4) {
  return value.replace(/\D/g, '').slice(0, maxDigits);
}

export function normalizeDecimalInput(
  value: string,
  maxWholeDigits = 4,
  maxFractionDigits = 2,
) {
  const numeric = value.replace(/[^0-9.]/g, '');
  const [whole = '', ...rest] = numeric.split('.');
  const decimal = rest.join('').slice(0, maxFractionDigits);

  return rest.length > 0
    ? `${whole.slice(0, maxWholeDigits)}.${decimal}`
    : whole.slice(0, maxWholeDigits);
}

export function parseIntegerInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDecimalInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getWeightUnitLabel(
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  return preferredUnits === 'imperial' ? 'LB' : 'KG';
}

export function getDistanceUnitLabel(
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  return preferredUnits === 'imperial' ? 'MI' : 'M';
}

export function needsBodyweightSnapshot(loadType: WorkoutLoadType) {
  return (
    loadType === 'bodyweight' ||
    loadType === 'bodyweight_plus_load' ||
    loadType === 'assisted'
  );
}

export function buildDefaultTargetsForMetric(
  trackingMetric: WorkoutTrackingMetric,
): WorkoutPlanExerciseTargets {
  if (trackingMetric === 'duration') {
    return {
      targetSets: 1,
      targetRepsMin: null,
      targetRepsMax: null,
      targetWeightKg: null,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
      restSeconds: null,
    };
  }

  if (trackingMetric === 'distance_duration') {
    return {
      targetSets: 1,
      targetRepsMin: null,
      targetRepsMax: null,
      targetWeightKg: null,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
      restSeconds: null,
    };
  }

  return {
    targetSets: 1,
    targetRepsMin: 12,
    targetRepsMax: 12,
    targetWeightKg: null,
    targetDurationSeconds: null,
    targetDistanceMeters: null,
    restSeconds: null,
  };
}
