import type {
  ProfileExperienceLevel,
  ProfileFitnessGoal,
  ProfileUnitPreference,
  ProfileWeekday,
  ProfileWorkoutLocation,
  UserProfile,
} from '../../types';
import type { ProfileSaveInput } from './profile';
import {
  centimetersToFeetAndInches,
  feetAndInchesToCentimeters,
  kilogramsToPounds,
  normalizeWeekdays,
  poundsToKilograms,
  roundToTwoDecimals,
} from './utils';

export interface ProfileFormValues {
  displayName: string;
  phoneNumber: string;
  preferredUnits: ProfileUnitPreference | '';
  ageYears: string;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  currentWeight: string;
  targetWeight: string;
  fitnessGoal: ProfileFitnessGoal | '';
  experienceLevel: ProfileExperienceLevel | '';
  preferredTrainingDaysPerWeek: string;
  preferredTrainingDays: ProfileWeekday[];
  preferredWorkoutLocation: ProfileWorkoutLocation | '';
}

export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

function formatInputNumber(value: number) {
  const normalized = roundToTwoDecimals(value);
  const fixed = normalized.toFixed(2);

  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function parsePositiveNumber(value: string) {
  const normalized = Number.parseFloat(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
}

function parseWholeNumber(value: string) {
  const normalized = Number.parseInt(value, 10);

  if (!Number.isFinite(normalized)) {
    return null;
  }

  return normalized;
}

function resolveHeightCm(values: ProfileFormValues) {
  if (values.preferredUnits === 'imperial') {
    const feet = parseWholeNumber(values.heightFeet);
    const inches = Number.parseFloat(values.heightInches || '0');

    if (feet == null || !Number.isFinite(inches) || inches < 0) {
      return null;
    }

    return feetAndInchesToCentimeters(feet, inches);
  }

  const heightCm = parsePositiveNumber(values.heightCm);
  return heightCm == null ? null : roundToTwoDecimals(heightCm);
}

function resolveWeightKg(
  weightValue: string,
  preferredUnits: ProfileUnitPreference | '',
) {
  const parsed = parsePositiveNumber(weightValue);

  if (parsed == null) {
    return null;
  }

  if (preferredUnits === 'imperial') {
    return poundsToKilograms(parsed);
  }

  return roundToTwoDecimals(parsed);
}

export function createProfileFormValues(profile: UserProfile | null): ProfileFormValues {
  const preferredUnits = profile?.preferredUnits ?? '';
  const heightCmValue = profile?.heightCm ?? null;
  const weightKgValue = profile?.currentWeightKg ?? null;
  const targetWeightKgValue = profile?.targetWeightKg ?? null;

  const imperialHeight =
    preferredUnits === 'imperial' && heightCmValue != null
      ? centimetersToFeetAndInches(heightCmValue)
      : null;

  return {
    displayName: profile?.displayName ?? '',
    phoneNumber: profile?.phoneNumber ?? '',
    preferredUnits,
    ageYears:
      profile?.ageYears == null ? '' : String(profile.ageYears),
    heightCm:
      preferredUnits === 'metric' && heightCmValue != null
        ? formatInputNumber(heightCmValue)
        : '',
    heightFeet:
      imperialHeight == null ? '' : String(imperialHeight.feet),
    heightInches:
      imperialHeight == null ? '' : formatInputNumber(imperialHeight.inches),
    currentWeight:
      weightKgValue == null
        ? ''
        : preferredUnits === 'imperial'
          ? formatInputNumber(kilogramsToPounds(weightKgValue))
          : formatInputNumber(weightKgValue),
    targetWeight:
      targetWeightKgValue == null
        ? ''
        : preferredUnits === 'imperial'
          ? formatInputNumber(kilogramsToPounds(targetWeightKgValue))
          : formatInputNumber(targetWeightKgValue),
    fitnessGoal: profile?.fitnessGoal ?? '',
    experienceLevel: profile?.experienceLevel ?? '',
    preferredTrainingDaysPerWeek:
      profile?.preferredTrainingDaysPerWeek == null
        ? ''
        : String(profile.preferredTrainingDaysPerWeek),
    preferredTrainingDays: profile?.preferredTrainingDays ?? [],
    preferredWorkoutLocation: profile?.preferredWorkoutLocation ?? '',
  };
}

export function switchUnitPreference(
  values: ProfileFormValues,
  nextUnits: ProfileUnitPreference,
): ProfileFormValues {
  if (values.preferredUnits === nextUnits) {
    return values;
  }

  if (nextUnits === 'imperial') {
    const heightCm = parsePositiveNumber(values.heightCm);
    const currentWeightKg = resolveWeightKg(values.currentWeight, 'metric');
    const targetWeightKg = resolveWeightKg(values.targetWeight, 'metric');
    const imperialHeight =
      heightCm == null ? null : centimetersToFeetAndInches(heightCm);

    return {
      ...values,
      preferredUnits: nextUnits,
      heightFeet: imperialHeight == null ? '' : String(imperialHeight.feet),
      heightInches:
        imperialHeight == null ? '' : formatInputNumber(imperialHeight.inches),
      currentWeight:
        currentWeightKg == null ? '' : formatInputNumber(kilogramsToPounds(currentWeightKg)),
      targetWeight:
        targetWeightKg == null ? '' : formatInputNumber(kilogramsToPounds(targetWeightKg)),
    };
  }

  const heightCm = resolveHeightCm({
    ...values,
    preferredUnits: 'imperial',
  });
  const currentWeightKg = resolveWeightKg(values.currentWeight, 'imperial');
  const targetWeightKg = resolveWeightKg(values.targetWeight, 'imperial');

  return {
    ...values,
    preferredUnits: nextUnits,
    heightCm: heightCm == null ? '' : formatInputNumber(heightCm),
    currentWeight:
      currentWeightKg == null ? '' : formatInputNumber(currentWeightKg),
    targetWeight:
      targetWeightKg == null ? '' : formatInputNumber(targetWeightKg),
  };
}

export function validatePersonalProfileValues(values: ProfileFormValues) {
  const errors: ProfileFormErrors = {};
  const ageYears = parseWholeNumber(values.ageYears);
  const heightCm = resolveHeightCm(values);
  const currentWeightKg = resolveWeightKg(values.currentWeight, values.preferredUnits);
  const targetWeightKg = values.targetWeight
    ? resolveWeightKg(values.targetWeight, values.preferredUnits)
    : null;

  if (!values.displayName.trim()) {
    errors.displayName = 'Display name is required.';
  }

  if (!values.preferredUnits) {
    errors.preferredUnits = 'Choose metric or imperial units.';
  }

  if (ageYears == null || ageYears < 1 || ageYears > 120) {
    errors.ageYears = 'Enter a valid age.';
  }

  if (heightCm == null || heightCm <= 0 || heightCm > 300) {
    errors.heightCm = 'Enter a valid height.';
  }

  if (currentWeightKg == null || currentWeightKg <= 0 || currentWeightKg > 1000) {
    errors.currentWeight = 'Enter a valid current weight.';
  }

  if (values.targetWeight && (targetWeightKg == null || targetWeightKg > 1000)) {
    errors.targetWeight = 'Enter a valid target weight.';
  }

  if (!values.fitnessGoal) {
    errors.fitnessGoal = 'Select a primary goal.';
  }

  return errors;
}

export function validatePreferenceValues(values: ProfileFormValues) {
  const errors: ProfileFormErrors = {};
  const trainingDays = parseWholeNumber(values.preferredTrainingDaysPerWeek);
  const normalizedDays = normalizeWeekdays(values.preferredTrainingDays);

  if (!values.preferredUnits) {
    errors.preferredUnits = 'Choose metric or imperial units.';
  }

  if (!values.experienceLevel) {
    errors.experienceLevel = 'Select an experience level.';
  }

  if (trainingDays == null || trainingDays < 1 || trainingDays > 7) {
    errors.preferredTrainingDaysPerWeek = 'Choose 1 to 7 training days.';
  }

  if (!values.preferredWorkoutLocation) {
    errors.preferredWorkoutLocation = 'Select a workout location.';
  }

  if (trainingDays != null && normalizedDays.length !== trainingDays) {
    errors.preferredTrainingDays =
      trainingDays === 1
        ? 'Choose exactly 1 training day.'
        : `Choose exactly ${trainingDays} training days.`;
  }

  return errors;
}

export function validateOnboardingValues(values: ProfileFormValues) {
  return {
    ...validatePersonalProfileValues(values),
    ...validatePreferenceValues(values),
  };
}

function buildCommonPayload(values: ProfileFormValues): ProfileSaveInput {
  const ageYears = parseWholeNumber(values.ageYears);
  const trainingDays = parseWholeNumber(values.preferredTrainingDaysPerWeek);

  return {
    displayName: values.displayName.trim() || null,
    phoneNumber: values.phoneNumber.trim() || null,
    ageYears,
    heightCm: resolveHeightCm(values),
    currentWeightKg: resolveWeightKg(values.currentWeight, values.preferredUnits),
    targetWeightKg: values.targetWeight
      ? resolveWeightKg(values.targetWeight, values.preferredUnits)
      : null,
    fitnessGoal: values.fitnessGoal || null,
    experienceLevel: values.experienceLevel || null,
    preferredTrainingDaysPerWeek: trainingDays,
    preferredTrainingDays: normalizeWeekdays(values.preferredTrainingDays),
    preferredWorkoutLocation: values.preferredWorkoutLocation || null,
    preferredUnits: values.preferredUnits || null,
  };
}

export function buildPersonalProfilePayload(values: ProfileFormValues) {
  const payload = buildCommonPayload(values);

  return {
    displayName: payload.displayName,
    phoneNumber: payload.phoneNumber,
    ageYears: payload.ageYears,
    heightCm: payload.heightCm,
    currentWeightKg: payload.currentWeightKg,
    targetWeightKg: payload.targetWeightKg,
    fitnessGoal: payload.fitnessGoal,
    preferredUnits: payload.preferredUnits,
  } satisfies ProfileSaveInput;
}

export function buildPreferenceProfilePayload(values: ProfileFormValues) {
  const payload = buildCommonPayload(values);

  return {
    preferredUnits: payload.preferredUnits,
    experienceLevel: payload.experienceLevel,
    preferredTrainingDaysPerWeek: payload.preferredTrainingDaysPerWeek,
    preferredTrainingDays: payload.preferredTrainingDays,
    preferredWorkoutLocation: payload.preferredWorkoutLocation,
  } satisfies ProfileSaveInput;
}

export function buildCompletedOnboardingPayload(values: ProfileFormValues) {
  return {
    ...buildCommonPayload(values),
    onboardingCompleted: true,
  } satisfies ProfileSaveInput;
}
