import type { ProfileUnitPreference } from '../../types';
import type { Tables } from '../../types/database.types';
import {
  assertProgressSupabase,
  buildMeasurementTrendSummary,
  buildBodyWeightTrendSummary,
  convertDisplayMeasurementToCanonical,
  convertDisplayWeightToKilograms,
  getRequiredProgressUser,
} from './shared';
import type {
  BodyMeasurementEntry,
  BodyMeasurementType,
  BodyWeightEntry,
} from './types';

type BodyWeightEntryRow = Tables<'body_weight_entries'>;
type BodyMeasurementEntryRow = Tables<'body_measurements'>;

function isBodyWeightSource(value: string): value is BodyWeightEntry['source'] {
  return ['manual', 'profile_sync', 'backfill'].includes(value);
}

function isBodyMeasurementType(value: string): value is BodyMeasurementType {
  return [
    'waist',
    'chest',
    'hips',
    'left_arm',
    'right_arm',
    'left_thigh',
    'right_thigh',
    'neck',
    'body_fat_percentage',
  ].includes(value);
}

function isBodyMeasurementUnit(
  value: string,
): value is BodyMeasurementEntry['unit'] {
  return ['cm', 'percent'].includes(value);
}

function mapBodyWeightEntryRow(row: BodyWeightEntryRow): BodyWeightEntry {
  if (!isBodyWeightSource(row.source)) {
    throw new Error(`Unexpected body weight source: ${row.source}`);
  }

  return {
    id: row.id,
    userId: row.user_id,
    weightKg: Number(row.weight_kg),
    measuredAt: row.measured_at,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBodyMeasurementEntryRow(
  row: BodyMeasurementEntryRow,
): BodyMeasurementEntry {
  if (!isBodyMeasurementType(row.measurement_type)) {
    throw new Error(
      `Unexpected body measurement type: ${row.measurement_type}`,
    );
  }

  if (!isBodyMeasurementUnit(row.unit)) {
    throw new Error(`Unexpected body measurement unit: ${row.unit}`);
  }

  return {
    id: row.id,
    userId: row.user_id,
    measurementType: row.measurement_type,
    value: Number(row.value),
    unit: row.unit,
    measuredAt: row.measured_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getBodyWeightHistory(limit = 30) {
  const { client, user } = await getRequiredProgressUser();
  const { data, error } = await client
    .from('body_weight_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('measured_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as BodyWeightEntryRow[]).map(mapBodyWeightEntryRow);
}

export async function addBodyWeightEntry({
  displayWeight,
  measuredAt,
  notes,
  preferredUnits,
}: {
  displayWeight: number;
  measuredAt?: string;
  notes?: string | null;
  preferredUnits: ProfileUnitPreference | null | undefined;
}) {
  const { client, user } = await getRequiredProgressUser();
  const { data, error } = await client
    .from('body_weight_entries')
    .insert({
      user_id: user.id,
      weight_kg: convertDisplayWeightToKilograms(displayWeight, preferredUnits),
      measured_at: measuredAt ?? new Date().toISOString(),
      source: 'manual',
      notes: notes?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapBodyWeightEntryRow(data);
}

export async function updateBodyWeightEntry({
  entryId,
  displayWeight,
  notes,
  preferredUnits,
}: {
  entryId: string;
  displayWeight: number;
  notes?: string | null;
  preferredUnits: ProfileUnitPreference | null | undefined;
}) {
  const client = assertProgressSupabase();
  const { data, error } = await client
    .from('body_weight_entries')
    .update({
      weight_kg: convertDisplayWeightToKilograms(displayWeight, preferredUnits),
      notes: notes?.trim() || null,
    })
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapBodyWeightEntryRow(data);
}

export async function deleteBodyWeightEntry(entryId: string) {
  const client = assertProgressSupabase();
  const { error } = await client
    .from('body_weight_entries')
    .delete()
    .eq('id', entryId);

  if (error) {
    throw error;
  }
}

export async function getBodyMeasurements({
  limit = 48,
  measurementType,
}: {
  limit?: number;
  measurementType?: BodyMeasurementType;
} = {}) {
  const { client, user } = await getRequiredProgressUser();
  let query = client
    .from('body_measurements')
    .select('*')
    .eq('user_id', user.id)
    .order('measured_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (measurementType) {
    query = query.eq('measurement_type', measurementType);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as BodyMeasurementEntryRow[]).map(
    mapBodyMeasurementEntryRow,
  );
}

export async function addBodyMeasurement({
  displayValue,
  measurementType,
  measuredAt,
  notes,
  preferredUnits,
}: {
  displayValue: number;
  measurementType: BodyMeasurementType;
  measuredAt?: string;
  notes?: string | null;
  preferredUnits: ProfileUnitPreference | null | undefined;
}) {
  const { client, user } = await getRequiredProgressUser();
  const canonicalValue = convertDisplayMeasurementToCanonical({
    measurementType,
    preferredUnits,
    value: displayValue,
  });
  const { data, error } = await client
    .from('body_measurements')
    .insert({
      user_id: user.id,
      measurement_type: measurementType,
      value: canonicalValue,
      unit: measurementType === 'body_fat_percentage' ? 'percent' : 'cm',
      measured_at: measuredAt ?? new Date().toISOString(),
      notes: notes?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapBodyMeasurementEntryRow(data);
}

export async function updateBodyMeasurement({
  entryId,
  displayValue,
  measurementType,
  notes,
  preferredUnits,
}: {
  entryId: string;
  displayValue: number;
  measurementType: BodyMeasurementType;
  notes?: string | null;
  preferredUnits: ProfileUnitPreference | null | undefined;
}) {
  const client = assertProgressSupabase();
  const canonicalValue = convertDisplayMeasurementToCanonical({
    measurementType,
    preferredUnits,
    value: displayValue,
  });
  const { data, error } = await client
    .from('body_measurements')
    .update({
      value: canonicalValue,
      notes: notes?.trim() || null,
    })
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapBodyMeasurementEntryRow(data);
}

export async function deleteBodyMeasurement(entryId: string) {
  const client = assertProgressSupabase();
  const { error } = await client
    .from('body_measurements')
    .delete()
    .eq('id', entryId);

  if (error) {
    throw error;
  }
}

export function summarizeBodyWeightTrend(
  entries: BodyWeightEntry[],
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  return buildBodyWeightTrendSummary(entries, preferredUnits);
}

export function summarizeMeasurementTrend({
  entries,
  measurementType,
  preferredUnits,
}: {
  entries: BodyMeasurementEntry[];
  measurementType: BodyMeasurementType;
  preferredUnits: ProfileUnitPreference | null | undefined;
}) {
  return buildMeasurementTrendSummary(entries, {
    measurementType,
    preferredUnits,
  });
}
