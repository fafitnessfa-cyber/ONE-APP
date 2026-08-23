import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  buildPersonalProfilePayload,
  buildPreferenceProfilePayload,
  createProfileFormValues,
  switchUnitPreference,
  validatePersonalProfileValues,
  validatePreferenceValues,
} from '../lib/profile/form';
import { saveCurrentProfile } from '../lib/profile/profile';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

type ProfileEditVariant = 'personal' | 'preferences';

interface ProfileEditScreenProps {
  variant: ProfileEditVariant;
}

export function ProfileEditScreen({ variant }: ProfileEditScreenProps) {
  const router = useRouter();
  const { applyProfile, profile, user } = useAuthProfile();
  const [values, setValues] = React.useState(() => createProfileFormValues(profile));
  const [errors, setErrors] = React.useState<ProfileFormErrors>({});
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setValues(createProfileFormValues(profile));
  }, [profile?.updatedAt]);

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
    setSaveError(null);
  }

  function toggleTrainingDay(day: (typeof values.preferredTrainingDays)[number]) {
    const nextDays = values.preferredTrainingDays.includes(day)
      ? values.preferredTrainingDays.filter((currentDay) => currentDay !== day)
      : [...values.preferredTrainingDays, day];

    updateValue('preferredTrainingDays', nextDays);
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
              accessibilityLabel="Edit profile height feet"
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
              accessibilityLabel="Edit profile height inches"
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
        accessibilityLabel="Edit profile height centimeters"
      />
    );
  }

  async function handleSave() {
    if (!user) {
      setSaveError('Your session expired. Please sign in again.');
      return;
    }

    const nextErrors =
      variant === 'personal'
        ? validatePersonalProfileValues(values)
        : validatePreferenceValues(values);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSaving(true);
    setSaveError(null);

    try {
      const savedProfile = await saveCurrentProfile(
        user.id,
        variant === 'personal'
          ? buildPersonalProfilePayload(values)
          : buildPreferenceProfilePayload(values),
      );
      applyProfile(savedProfile);
      Alert.alert('Saved', 'Your profile has been updated.');
      router.back();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Unable to save your changes right now.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.topRow}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topLabel}>
            {variant === 'personal' ? 'Edit Personal Details' : 'Edit Preferences'}
          </Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>
            {variant === 'personal' ? 'PROFILE' : 'PREFERENCES'}
          </Text>
          <Text style={styles.title}>
            {variant === 'personal' ? 'Update Personal Details' : 'Update Preferences'}
          </Text>
          <Text style={styles.subtitle}>
            {variant === 'personal'
              ? 'Edit body metrics and goals without repeating onboarding.'
              : 'Adjust measurement units and training preferences anytime.'}
          </Text>
        </View>

        {variant === 'personal' ? (
          <FormSection
            title="Personal Information"
            subtitle="These changes save directly to your private Supabase profile."
          >
            <ProfileTextInput
              label="Display Name"
              value={values.displayName}
              onChangeText={(value) => updateValue('displayName', value)}
              placeholder="Your display name"
              error={errors.displayName}
              autoCapitalize="words"
              accessibilityLabel="Edit profile display name"
            />
            <ProfileTextInput
              label="Phone (optional)"
              value={values.phoneNumber}
              onChangeText={(value) => updateValue('phoneNumber', value)}
              placeholder="Add later if you want"
              accessibilityLabel="Edit profile phone"
            />
            <ProfileTextInput
              label="Age"
              value={values.ageYears}
              onChangeText={(value) => updateValue('ageYears', value)}
              placeholder="34"
              keyboardType="numeric"
              error={errors.ageYears}
              accessibilityLabel="Edit profile age"
            />
            {renderHeightFields()}
            <ProfileTextInput
              label={values.preferredUnits === 'imperial' ? 'Current Weight (lb)' : 'Current Weight (kg)'}
              value={values.currentWeight}
              onChangeText={(value) => updateValue('currentWeight', value)}
              placeholder={values.preferredUnits === 'imperial' ? '176.4' : '80'}
              keyboardType="numeric"
              error={errors.currentWeight}
              accessibilityLabel="Edit profile current weight"
            />
            <ProfileTextInput
              label={values.preferredUnits === 'imperial' ? 'Target Weight (lb, optional)' : 'Target Weight (kg, optional)'}
              value={values.targetWeight}
              onChangeText={(value) => updateValue('targetWeight', value)}
              placeholder="Optional"
              keyboardType="numeric"
              error={errors.targetWeight}
              accessibilityLabel="Edit profile target weight"
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
        ) : (
          <FormSection
            title="Training Preferences"
            subtitle="These preferences power future workout personalization."
          >
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
              accessibilityLabel="Edit profile training days per week"
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
        )}

        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            isSaving && styles.buttonDisabled,
            pressed && styles.pressed,
          ]}
          onPress={() => {
            void handleSave();
          }}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          {isSaving ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  topLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '800',
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
  splitRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  splitColumn: {
    flex: 1,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  saveButtonText: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 28,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.82,
  },
});
