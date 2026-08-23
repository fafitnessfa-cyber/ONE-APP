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
import { ProfileTextInput } from '../components/profile/ProfileFormControls';
import { AppScreen } from '../components/AppScreen';
import { useAuthProfile } from '../lib/profile/context';
import {
  getTrainingSummary,
} from '../lib/progress/analytics';
import {
  addBodyMeasurement,
  deleteBodyMeasurement,
  getBodyMeasurements,
  summarizeMeasurementTrend,
  updateBodyMeasurement,
} from '../lib/progress/measurements';
import {
  BODY_MEASUREMENT_OPTIONS,
  formatLocalDateTime,
  formatMeasurementDisplayValue,
  getBodyMeasurementLabel,
  getFriendlyProgressError,
  getMeasurementUnitLabel,
} from '../lib/progress/shared';
import type {
  BodyMeasurementEntry,
  BodyMeasurementType,
  ProgressTrainingSummary,
} from '../lib/progress/types';
import {
  normalizeDecimalInput,
  parseDecimalInput,
} from '../lib/workouts/calculations';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

type BodyFocus = 'primary' | 'secondary';

export function ProgressBodyProgressScreen() {
  const router = useRouter();
  const { profile } = useAuthProfile();
  const preferredUnits = profile?.preferredUnits ?? null;
  const [bodyFocus, setBodyFocus] = React.useState<BodyFocus>('primary');
  const [measurementType, setMeasurementType] =
    React.useState<BodyMeasurementType>('waist');
  const [summary, setSummary] = React.useState<ProgressTrainingSummary | null>(null);
  const [entries, setEntries] = React.useState<BodyMeasurementEntry[]>([]);
  const [inputValue, setInputValue] = React.useState('');
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const loadBodyProgress = React.useCallback(() => {
    let isActive = true;
    setIsLoading(true);

    void Promise.all([
      getTrainingSummary(),
      getBodyMeasurements({
        measurementType,
        limit: 18,
      }),
    ])
      .then(([nextSummary, nextEntries]) => {
        if (!isActive) {
          return;
        }

        setSummary(nextSummary);
        setEntries(nextEntries);
        setErrorMessage(null);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(getFriendlyProgressError(error));
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [measurementType]);

  React.useEffect(() => loadBodyProgress(), [loadBodyProgress]);

  const trend = summarizeMeasurementTrend({
    entries,
    measurementType,
    preferredUnits,
  });
  const activeMuscles =
    bodyFocus === 'primary'
      ? summary?.primaryMuscleSets ?? []
      : summary?.secondaryMuscleSets ?? [];

  async function handleSave() {
    const parsedValue = parseDecimalInput(inputValue);

    if (parsedValue == null || parsedValue <= 0) {
      setErrorMessage('Enter a valid measurement before saving.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (editingEntryId) {
        await updateBodyMeasurement({
          entryId: editingEntryId,
          displayValue: parsedValue,
          measurementType,
          preferredUnits,
        });
      } else {
        await addBodyMeasurement({
          displayValue: parsedValue,
          measurementType,
          preferredUnits,
        });
      }

      setInputValue('');
      setEditingEntryId(null);
      loadBodyProgress();
    } catch (error) {
      setErrorMessage(getFriendlyProgressError(error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleEdit(entry: BodyMeasurementEntry) {
    setEditingEntryId(entry.id);
    const displayLabel = formatMeasurementDisplayValue(entry, preferredUnits);
    setInputValue(displayLabel.split(' ')[0] ?? '');
    setErrorMessage(null);
  }

  function handleCancelEdit() {
    setEditingEntryId(null);
    setInputValue('');
    setErrorMessage(null);
  }

  function handleDelete(entry: BodyMeasurementEntry) {
    Alert.alert(
      'Delete Measurement',
      `Remove ${getBodyMeasurementLabel(entry.measurementType)} from ${formatLocalDateTime(
        entry.measuredAt,
      )}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteBodyMeasurement(entry.id);
                if (editingEntryId === entry.id) {
                  handleCancelEdit();
                }
                loadBodyProgress();
              } catch (error) {
                setErrorMessage(getFriendlyProgressError(error));
              }
            })();
          },
        },
      ],
    );
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
          <Text style={styles.topLabel}>PROGRESS</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>BODY PROGRESS</Text>
          <Text style={styles.title}>Muscles + Measurements</Text>
          <Text style={styles.subtitle}>
            Weekly muscle-group analytics come from completed workout sets, while body measurements remain private and editable.
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.statusCard}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.statusText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Training Focus This Week</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.togglePill,
                  bodyFocus === 'primary' && styles.togglePillActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => setBodyFocus('primary')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    bodyFocus === 'primary' && styles.toggleTextActive,
                  ]}
                >
                  Primary
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.togglePill,
                  bodyFocus === 'secondary' && styles.togglePillActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => setBodyFocus('secondary')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    bodyFocus === 'secondary' && styles.toggleTextActive,
                  ]}
                >
                  Secondary
                </Text>
              </Pressable>
            </View>
          </View>

          {activeMuscles.length > 0 ? (
            <View style={styles.itemList}>
              {activeMuscles.map((muscle) => (
                <View key={muscle.muscleId} style={styles.itemRow}>
                  <View>
                    <Text style={styles.itemTitle}>{muscle.name}</Text>
                    <Text style={styles.itemDetail}>{muscle.muscleGroup}</Text>
                  </View>
                  <Text style={styles.itemValue}>
                    {'setCount' in muscle
                      ? `${muscle.setCount} sets`
                      : `${muscle.setScore.toFixed(1)} score`}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Complete workouts to populate muscle analytics.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Measurements</Text>
          <View style={styles.measurementChipWrap}>
            {BODY_MEASUREMENT_OPTIONS.map((option) => {
              const isSelected = measurementType === option.type;

              return (
                <Pressable
                  key={option.type}
                  style={({ pressed }) => [
                    styles.measurementChip,
                    isSelected && styles.measurementChipActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setMeasurementType(option.type);
                    setEditingEntryId(null);
                    setInputValue('');
                  }}
                >
                  <Text
                    style={[
                      styles.measurementChipText,
                      isSelected && styles.measurementChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.measurementSummary}>
            <MetricCard
              label="Latest"
              value={
                trend.latestDisplayValue == null
                  ? 'Not set'
                  : `${trend.latestDisplayValue.toFixed(1)} ${trend.unitLabel}`
              }
              detail={trend.latestEntry ? formatLocalDateTime(trend.latestEntry.measuredAt) : 'No entries yet'}
            />
            <MetricCard
              label="Change"
              value={
                trend.deltaDisplayValue == null
                  ? '--'
                  : `${trend.deltaDisplayValue > 0 ? '+' : ''}${trend.deltaDisplayValue.toFixed(1)} ${trend.unitLabel}`
              }
              detail={trend.previousEntry ? 'vs last entry' : 'Need 2 entries'}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {editingEntryId ? 'Edit Measurement' : `Log ${getBodyMeasurementLabel(measurementType)}`}
          </Text>
          <ProfileTextInput
            label={`${getBodyMeasurementLabel(measurementType)} (${getMeasurementUnitLabel({
              measurementType,
              preferredUnits,
            })})`}
            value={inputValue}
            onChangeText={(value) => setInputValue(normalizeDecimalInput(value, 3, 2))}
            placeholder={measurementType === 'body_fat_percentage' ? '18.5' : preferredUnits === 'imperial' ? '34.5' : '88.0'}
            keyboardType="numeric"
            accessibilityLabel="Progress body measurement input"
          />
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <View style={styles.actionRow}>
            {editingEntryId ? (
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                onPress={handleCancelEdit}
                accessibilityRole="button"
                accessibilityLabel="Cancel measurement edit"
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={() => void handleSave()}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel={editingEntryId ? 'Save measurement changes' : 'Save Measurement'}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {editingEntryId ? 'Save Changes' : 'Save Measurement'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent Entries</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : entries.length > 0 ? (
            <View style={styles.itemList}>
              {entries.map((entry) => (
                <View key={entry.id} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>
                      {formatMeasurementDisplayValue(entry, preferredUnits)}
                    </Text>
                    <Text style={styles.itemDetail}>
                      {formatLocalDateTime(entry.measuredAt)}
                    </Text>
                  </View>
                  <View style={styles.entryActions}>
                    <Pressable
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                      onPress={() => handleEdit(entry)}
                      accessibilityRole="button"
                      accessibilityLabel="Edit measurement entry"
                    >
                      <Ionicons name="create-outline" size={16} color={colors.accent} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                      onPress={() => handleDelete(entry)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete measurement entry"
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.warning} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              No {getBodyMeasurementLabel(measurementType).toLowerCase()} entries yet.
            </Text>
          )}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: 118,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  backButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  topLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
    letterSpacing: 1,
  },
  pressed: {
    opacity: 0.72,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.heading,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  statusText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  togglePill: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  togglePillActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(106,192,6,0.12)',
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
  },
  toggleTextActive: {
    color: colors.accent,
  },
  itemList: {
    gap: spacing.sm,
  },
  itemRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  itemCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  itemDetail: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  itemValue: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: fontSize.display,
  },
  measurementChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  measurementChip: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  measurementChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(106,192,6,0.12)',
  },
  measurementChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
  },
  measurementChipTextActive: {
    color: colors.accent,
  },
  measurementSummary: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 84,
    padding: spacing.md,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  metricValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 28,
  },
  metricDetail: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 152,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  entryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    lineHeight: 18,
  },
  errorText: {
    color: colors.warning,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  loadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
});
