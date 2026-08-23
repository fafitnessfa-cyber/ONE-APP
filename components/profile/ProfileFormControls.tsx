import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ProfileWeekday } from '../../types';
import { colors, fontSize, radius, spacing } from '../../theme';

interface FormSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

interface ProfileTextInputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  error?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  accessibilityLabel?: string;
}

interface OptionButton {
  value: string;
  label: string;
  description?: string;
}

interface OptionGridProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: OptionButton[];
  error?: string;
}

interface WeekdayPickerProps {
  selectedDays: ProfileWeekday[];
  onToggleDay: (value: ProfileWeekday) => void;
  error?: string;
}

const WEEKDAY_BUTTONS: Array<{ value: ProfileWeekday; label: string }> = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

export function FormSection({ title, subtitle, children }: FormSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function ProfileTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  error,
  autoCapitalize = 'sentences',
  autoCorrect = false,
  secureTextEntry = false,
  accessibilityLabel,
}: ProfileTextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        allowFontScaling={false}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        accessibilityLabel={accessibilityLabel ?? label}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        style={[styles.input, error && styles.inputError]}
        value={value}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function OptionGrid({
  label,
  value,
  onChange,
  options,
  error,
}: OptionGridProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.optionGrid}>
        {options.map((option) => {
          const isSelected = option.value === value;

          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.optionButton,
                isSelected && styles.optionButtonSelected,
                pressed && styles.optionButtonPressed,
              ]}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  styles.optionTitle,
                  isSelected && styles.optionTitleSelected,
                ]}
              >
                {option.label}
              </Text>
              {option.description ? (
                <Text
                  style={[
                    styles.optionDescription,
                    isSelected && styles.optionDescriptionSelected,
                  ]}
                >
                  {option.description}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function WeekdayPicker({
  selectedDays,
  onToggleDay,
  error,
}: WeekdayPickerProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Preferred Training Days</Text>
      <View style={styles.weekdayRow}>
        {WEEKDAY_BUTTONS.map((day) => {
          const isSelected = selectedDays.includes(day.value);

          return (
            <Pressable
              key={day.value}
              style={({ pressed }) => [
                styles.weekdayButton,
                isSelected && styles.weekdayButtonSelected,
                pressed && styles.optionButtonPressed,
              ]}
              onPress={() => onToggleDay(day.value)}
              accessibilityRole="button"
              accessibilityLabel={day.label}
            >
              <Text
                style={[
                  styles.weekdayLabel,
                  isSelected && styles.weekdayLabelSelected,
                ]}
              >
                {day.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  sectionBody: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '700',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  optionGrid: {
    gap: spacing.sm,
  },
  optionButton: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionButtonSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  optionButtonPressed: {
    opacity: 0.8,
  },
  optionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  optionTitleSelected: {
    color: colors.accent,
  },
  optionDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    lineHeight: 16,
  },
  optionDescriptionSelected: {
    color: colors.textPrimary,
  },
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  weekdayButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  weekdayButtonSelected: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.accent,
  },
  weekdayLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  weekdayLabelSelected: {
    color: colors.accent,
  },
});
