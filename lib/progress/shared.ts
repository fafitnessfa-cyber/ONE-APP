import type { User } from '@supabase/supabase-js';
import type { ProfileUnitPreference } from '../../types';
import {
  kilogramsToPounds,
  poundsToKilograms,
  roundToTwoDecimals,
} from '../profile/utils';
import { supabase, supabaseConfigError } from '../supabase';
import type {
  BodyMeasurementEntry,
  BodyMeasurementType,
  BodyWeightEntry,
  DisplayMeasurementValue,
  MeasurementDisplayContext,
  MeasurementOption,
  PersonalRecord,
} from './types';

const CENTIMETERS_PER_INCH = 2.54;

export const BODY_MEASUREMENT_OPTIONS: MeasurementOption[] = [
  { type: 'waist', label: 'Waist' },
  { type: 'chest', label: 'Chest' },
  { type: 'hips', label: 'Hips' },
  { type: 'left_arm', label: 'Left Arm' },
  { type: 'right_arm', label: 'Right Arm' },
  { type: 'left_thigh', label: 'Left Thigh' },
  { type: 'right_thigh', label: 'Right Thigh' },
  { type: 'neck', label: 'Neck' },
  { type: 'body_fat_percentage', label: 'Body Fat' },
];

export function assertProgressSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
}

export async function getRequiredProgressUser(): Promise<{
  client: ReturnType<typeof assertProgressSupabase>;
  user: User;
}> {
  const client = assertProgressSupabase();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    throw new Error('Sign in is required to view Progress.');
  }

  return {
    client,
    user: session.user,
  };
}

export function getFriendlyProgressError(
  error: unknown,
  fallback = 'Unable to sync Progress right now.',
) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error.message.includes('EXPO_PUBLIC_SUPABASE_URL')) {
    return error.message;
  }

  if (error.message.toLowerCase().includes('fetch')) {
    return 'Unable to reach Supabase right now. Please try again.';
  }

  if (error.message.toLowerCase().includes('sign in')) {
    return 'Please sign in again to keep Progress in sync.';
  }

  return error.message;
}

export function getProgressTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getBodyMeasurementLabel(type: BodyMeasurementType) {
  return (
    BODY_MEASUREMENT_OPTIONS.find((option) => option.type === type)?.label ?? type
  );
}

export function convertDisplayWeightToKilograms(
  value: number,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (preferredUnits === 'imperial') {
    return poundsToKilograms(value);
  }

  return roundToTwoDecimals(value);
}

export function convertWeightToDisplayValue(
  valueKg: number,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (preferredUnits === 'imperial') {
    return roundToTwoDecimals(kilogramsToPounds(valueKg));
  }

  return roundToTwoDecimals(valueKg);
}

export function getWeightUnitLabel(
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  return preferredUnits === 'imperial' ? 'lb' : 'kg';
}

export function convertDisplayMeasurementToCanonical({
  measurementType,
  preferredUnits,
  value,
}: MeasurementDisplayContext & {
  value: number;
}) {
  if (measurementType === 'body_fat_percentage') {
    return roundToTwoDecimals(value);
  }

  if (preferredUnits === 'imperial') {
    return roundToTwoDecimals(value * CENTIMETERS_PER_INCH);
  }

  return roundToTwoDecimals(value);
}

export function convertMeasurementToDisplayValue({
  measurementType,
  preferredUnits,
  value,
}: MeasurementDisplayContext & {
  value: number;
}): DisplayMeasurementValue {
  if (measurementType === 'body_fat_percentage') {
    return {
      value: roundToTwoDecimals(value),
      unitLabel: '%',
    };
  }

  if (preferredUnits === 'imperial') {
    return {
      value: roundToTwoDecimals(value / CENTIMETERS_PER_INCH),
      unitLabel: 'in',
    };
  }

  return {
    value: roundToTwoDecimals(value),
    unitLabel: 'cm',
  };
}

export function formatLocalDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatLocalDateTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDurationMinutes(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) {
    return '0m';
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function formatRecordTypeLabel(recordType: PersonalRecord['recordType']) {
  switch (recordType) {
    case 'heaviest_load':
      return 'Heaviest Load';
    case 'estimated_one_rep_max':
      return 'Estimated 1RM';
    case 'max_reps':
      return 'Rep PR';
    case 'least_assistance':
      return 'Least Assistance';
    case 'longest_duration':
      return 'Longest Duration';
    case 'longest_distance':
      return 'Longest Distance';
    default:
      return recordType;
  }
}

export function formatRecordValue(
  record: PersonalRecord,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  switch (record.unit) {
    case 'kg': {
      const displayValue = convertWeightToDisplayValue(record.value, preferredUnits);
      return `${displayValue.toFixed(1)} ${getWeightUnitLabel(preferredUnits)}`;
    }
    case 'meters':
      return `${roundToTwoDecimals(record.value)} m`;
    case 'seconds':
      return `${Math.round(record.value)} sec`;
    case 'reps':
    default:
      return `${Math.round(record.value)} reps`;
  }
}

export function buildBodyWeightTrendSummary(
  entries: BodyWeightEntry[],
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  const latestEntry = entries[0] ?? null;
  const previousEntry = entries[1] ?? null;
  const latestDisplayValue =
    latestEntry == null
      ? null
      : convertWeightToDisplayValue(latestEntry.weightKg, preferredUnits);
  const previousDisplayValue =
    previousEntry == null
      ? null
      : convertWeightToDisplayValue(previousEntry.weightKg, preferredUnits);

  return {
    latestEntry,
    previousEntry,
    latestDisplayValue,
    previousDisplayValue,
    deltaDisplayValue:
      latestDisplayValue == null || previousDisplayValue == null
        ? null
        : roundToTwoDecimals(latestDisplayValue - previousDisplayValue),
    unitLabel: getWeightUnitLabel(preferredUnits),
  };
}

export function buildMeasurementTrendSummary(
  entries: BodyMeasurementEntry[],
  context: MeasurementDisplayContext,
) {
    const latestEntry = entries[0] ?? null;
    const previousEntry = entries[1] ?? null;
    const latestDisplay = latestEntry
      ? convertMeasurementToDisplayValue({
          measurementType: latestEntry.measurementType,
          preferredUnits: context.preferredUnits,
          value: latestEntry.value,
        })
      : null;
    const previousDisplay = previousEntry
      ? convertMeasurementToDisplayValue({
          measurementType: previousEntry.measurementType,
          preferredUnits: context.preferredUnits,
          value: previousEntry.value,
        })
      : null;

    return {
      latestEntry,
      previousEntry,
      latestDisplayValue: latestDisplay?.value ?? null,
      previousDisplayValue: previousDisplay?.value ?? null,
      deltaDisplayValue:
        latestDisplay == null || previousDisplay == null
          ? null
          : roundToTwoDecimals(latestDisplay.value - previousDisplay.value),
      unitLabel: latestDisplay?.unitLabel ?? getMeasurementUnitLabel(context),
    };
}

export function getMeasurementUnitLabel(context: MeasurementDisplayContext) {
  return convertMeasurementToDisplayValue({
    measurementType: context.measurementType,
    preferredUnits: context.preferredUnits,
    value: context.measurementType === 'body_fat_percentage' ? 1 : 10,
  }).unitLabel;
}

export function formatMeasurementDisplayValue(
  entry: BodyMeasurementEntry,
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  const displayValue = convertMeasurementToDisplayValue({
    measurementType: entry.measurementType,
    preferredUnits,
    value: entry.value,
  });

  return `${displayValue.value.toFixed(1)} ${displayValue.unitLabel}`;
}

export function groupLatestMeasurementByType(entries: BodyMeasurementEntry[]) {
  const latestByType = new Map<BodyMeasurementType, BodyMeasurementEntry>();

  entries.forEach((entry) => {
    if (!latestByType.has(entry.measurementType)) {
      latestByType.set(entry.measurementType, entry);
    }
  });

  return latestByType;
}
