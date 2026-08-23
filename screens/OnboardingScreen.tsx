import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen } from '../components/AppScreen';
import {
  FormSection,
  OptionGrid,
  ProfileTextInput,
  WeekdayPicker,
} from '../components/profile/ProfileFormControls';
import {
  EXPERIENCE_LEVEL_OPTIONS,
  FITNESS_GOAL_OPTIONS,
  UNIT_PREFERENCE_OPTIONS,
  WORKOUT_LOCATION_OPTIONS,
} from '../lib/profile/constants';
import { useAuthProfile } from '../lib/profile/context';
import {
  ProfileFormErrors,
  ProfileFormValues,
  buildCompletedOnboardingPayload,
  createProfileFormValues,
  switchUnitPreference,
  validatePersonalProfileValues,
  validatePreferenceValues,
} from '../lib/profile/form';
import { saveCurrentProfile } from '../lib/profile/profile';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

const STEP_TITLES = ['Basics', 'Body', 'Training'] as const;

function buildStepErrors(stepIndex: number, values: ProfileFormValues) {
  const errors: ProfileFormErrors = {};

  if (stepIndex === 0) {
    if (!values.displayName.trim()) {
      errors.displayName = 'Display name is required.';
    }

    if (!values.preferredUnits) {
      errors.preferredUnits = 'Choose metric or imperial units.';
    }

    return errors;
  }

  if (stepIndex === 1) {
    return validatePersonalProfileValues(values);
  }

  return validatePreferenceValues(values);
}

export function OnboardingScreen() {
  const router = useRouter();
  const { applyProfile, isAnonymous, profile, user } = useAuthProfile();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [values, setValues] = React.useState(() => createProfileFormValues(profile));
  const [errors, setErrors] = React.useState<ProfileFormErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setValues(createProfileFormValues(profile));
  }, [profile?.id]);

  function updateValue<TKey extends keyof ProfileFormValues>(
    key: TKey,
    value: ProfileFormValues[TKey],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [key]: value,
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      [key]: undefined,
    }));
    setSubmitError(null);
  }

  function toggleTrainingDay(day: (typeof values.preferredTrainingDays)[number]) {
    const nextDays = values.preferredTrainingDays.includes(day)
      ? values.preferredTrainingDays.filter((currentDay) => currentDay !== day)
      : [...values.preferredTrainingDays, day];

    updateValue('preferredTrainingDays', nextDays);
  }

  async function handleContinue() {
    const nextErrors = buildStepErrors(stepIndex, values);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});

    if (stepIndex < STEP_TITLES.length - 1) {
      setStepIndex((currentStep) => currentStep + 1);
      return;
    }

    if (!user) {
      setSubmitError('Your session expired. Please sign in again.');
      return;
    }

    setIsSaving(true);
    setSubmitError(null);

    try {
      const savedProfile = await saveCurrentProfile(
        user.id,
        buildCompletedOnboardingPayload(values),
      );
      applyProfile(savedProfile);
      router.replace('/(tabs)');
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to finish onboarding right now.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function renderHeightFields() {
    if (values.preferredUnits === 'imperial') {
      return (
        <View style={styles.splitRow}>
          <View style={styles.splitColumn}>
            <ProfileTextInput
              label="Height (ft)"
              value={values.heightFeet}
              onChangeText={(value) => updateValue('heightFeet', value)}
              placeholder="5"
              keyboardType="numeric"
              error={errors.heightCm}
              accessibilityLabel="Onboarding height feet"
            />
          </View>
          <View style={styles.splitColumn}>
            <ProfileTextInput
              label="Height (in)"
              value={values.heightInches}
              onChangeText={(value) => updateValue('heightInches', value)}
              placeholder="10"
              keyboardType="numeric"
              error={errors.heightCm}
              accessibilityLabel="Onboarding height inches"
            />
          </View>
        </View>
      );
    }

    return (
      <ProfileTextInput
        label="Height (cm)"
        value={values.heightCm}
        onChangeText={(value) => updateValue('heightCm', value)}
        placeholder="178"
        keyboardType="numeric"
        error={errors.heightCm}
        accessibilityLabel="Onboarding height centimeters"
      />
    );
  }

  function renderStepContent() {
    if (stepIndex === 0) {
      return (
        <>
          <FormSection
            title="Account Basics"
            subtitle={
              isAnonymous
                ? 'You are finishing setup in a guest session. This still gets a private server profile.'
                : 'These basics identify the profile that future features will personalize against.'
            }
          >
            <ProfileTextInput
              label="Display Name"
              value={values.displayName}
              onChangeText={(value) => updateValue('displayName', value)}
              placeholder="How should ONE UP address you?"
              error={errors.displayName}
              autoCapitalize="words"
              accessibilityLabel="Onboarding display name"
            />
            <ProfileTextInput
              label="Phone (optional)"
              value={values.phoneNumber}
              onChangeText={(value) => updateValue('phoneNumber', value)}
              placeholder="Add later if you want"
              accessibilityLabel="Onboarding phone"
            />
            <OptionGrid
              label="Measurement Units"
              value={values.preferredUnits}
              onChange={(value) => {
                setValues((currentValues) =>
                  switchUnitPreference(
                    currentValues,
                    value as 'metric' | 'imperial',
                  ),
                );
                setErrors((currentErrors) => ({
                  ...currentErrors,
                  preferredUnits: undefined,
                }));
              }}
              options={UNIT_PREFERENCE_OPTIONS}
              error={errors.preferredUnits}
            />
          </FormSection>

          <FormSection
            title="How Saving Works"
            subtitle="ONE UP saves the profile to Supabase only after you finish the final step. Closing the app before then will not mark onboarding complete."
          >
            <Text style={styles.noteText}>
              Server profile completion happens only after validation and a
              successful database write.
            </Text>
          </FormSection>
        </>
      );
    }

    if (stepIndex === 1) {
      return (
        <FormSection
          title="Body Metrics"
          subtitle="These values are stored canonically in cm and kg, then displayed using your preferred unit system."
        >
          <ProfileTextInput
            label="Age"
            value={values.ageYears}
            onChangeText={(value) => updateValue('ageYears', value)}
            placeholder="34"
            keyboardType="numeric"
            error={errors.ageYears}
            accessibilityLabel="Onboarding age"
          />
          {renderHeightFields()}
          <ProfileTextInput
            label={values.preferredUnits === 'imperial' ? 'Current Weight (lb)' : 'Current Weight (kg)'}
            value={values.currentWeight}
            onChangeText={(value) => updateValue('currentWeight', value)}
            placeholder={values.preferredUnits === 'imperial' ? '176.4' : '80'}
            keyboardType="numeric"
            error={errors.currentWeight}
            accessibilityLabel="Onboarding current weight"
          />
          <ProfileTextInput
            label={values.preferredUnits === 'imperial' ? 'Target Weight (lb, optional)' : 'Target Weight (kg, optional)'}
            value={values.targetWeight}
            onChangeText={(value) => updateValue('targetWeight', value)}
            placeholder="Optional"
            keyboardType="numeric"
            error={errors.targetWeight}
            accessibilityLabel="Onboarding target weight"
          />
          <OptionGrid
            label="Primary Goal"
            value={values.fitnessGoal}
            onChange={(value) =>
              updateValue('fitnessGoal', value as ProfileFormValues['fitnessGoal'])
            }
            options={FITNESS_GOAL_OPTIONS}
            error={errors.fitnessGoal}
          />
        </FormSection>
      );
    }

    return (
      <FormSection
        title="Training Preferences"
        subtitle="These fields become the authoritative source for later workout recommendations and plan generation."
      >
        <OptionGrid
          label="Experience Level"
          value={values.experienceLevel}
          onChange={(value) =>
            updateValue(
              'experienceLevel',
              value as ProfileFormValues['experienceLevel'],
            )
          }
          options={EXPERIENCE_LEVEL_OPTIONS}
          error={errors.experienceLevel}
        />
        <ProfileTextInput
          label="Preferred Training Days Per Week"
          value={values.preferredTrainingDaysPerWeek}
          onChangeText={(value) =>
            updateValue('preferredTrainingDaysPerWeek', value)
          }
          placeholder="4"
          keyboardType="numeric"
          error={errors.preferredTrainingDaysPerWeek}
          accessibilityLabel="Onboarding training days per week"
        />
        <WeekdayPicker
          selectedDays={values.preferredTrainingDays}
          onToggleDay={toggleTrainingDay}
          error={errors.preferredTrainingDays}
        />
        <OptionGrid
          label="Preferred Workout Location"
          value={values.preferredWorkoutLocation}
          onChange={(value) =>
            updateValue(
              'preferredWorkoutLocation',
              value as ProfileFormValues['preferredWorkoutLocation'],
            )
          }
          options={WORKOUT_LOCATION_OPTIONS}
          error={errors.preferredWorkoutLocation}
        />
      </FormSection>
    );
  }

  return (
    <AppScreen showHeader={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ONBOARDING</Text>
          <Text style={styles.title}>Build Your Foundation</Text>
          <Text style={styles.subtitle}>
            Complete setup once, store it on the server, and keep the same
            profile across reloads and future devices.
          </Text>
        </View>

        <View style={styles.progressRow}>
          {STEP_TITLES.map((title, index) => {
            const isActive = index === stepIndex;
            const isComplete = index < stepIndex;

            return (
              <View
                key={title}
                style={[
                  styles.progressPill,
                  (isActive || isComplete) && styles.progressPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.progressText,
                    (isActive || isComplete) && styles.progressTextActive,
                  ]}
                >
                  {index + 1}. {title}
                </Text>
              </View>
            );
          })}
        </View>

        {renderStepContent()}

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              stepIndex === 0 && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => setStepIndex((currentStep) => Math.max(0, currentStep - 1))}
            disabled={stepIndex === 0 || isSaving}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              isSaving && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => {
              void handleContinue();
            }}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={
              stepIndex === STEP_TITLES.length - 1
                ? 'Finish onboarding'
                : 'Continue'
            }
          >
            {isSaving ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {stepIndex === STEP_TITLES.length - 1 ? 'Finish Setup' : 'Continue'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 34,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  progressPill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  progressPillActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.accent,
  },
  progressText: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  progressTextActive: {
    color: colors.accent,
  },
  noteText: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  splitRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  splitColumn: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 28,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 28,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
