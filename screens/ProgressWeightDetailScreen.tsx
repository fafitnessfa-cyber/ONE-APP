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
import Svg, { Circle, Polyline } from 'react-native-svg';
import { ProfileTextInput } from '../components/profile/ProfileFormControls';
import { AppScreen } from '../components/AppScreen';
import { useAuthProfile } from '../lib/profile/context';
import { getCurrentProfile } from '../lib/profile/profile';
import { formatWeight } from '../lib/profile/utils';
import type { ProfileUnitPreference } from '../types';
import {
  addBodyWeightEntry,
  deleteBodyWeightEntry,
  getBodyWeightHistory,
  summarizeBodyWeightTrend,
  updateBodyWeightEntry,
} from '../lib/progress/measurements';
import {
  convertWeightToDisplayValue,
  formatLocalDateTime,
  getFriendlyProgressError,
  getWeightUnitLabel,
} from '../lib/progress/shared';
import type { BodyWeightEntry } from '../lib/progress/types';
import {
  formatWeightInputFromKilograms,
  normalizeDecimalInput,
  parseDecimalInput,
} from '../lib/workouts/calculations';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

function buildChartPoints(
  entries: BodyWeightEntry[],
  preferredUnits: ProfileUnitPreference | null | undefined,
) {
  if (entries.length === 0) {
    return null;
  }

  const width = 300;
  const height = 120;
  const padding = 18;
  const chartableEntries = [...entries].slice(0, 8).reverse();
  const values = chartableEntries.map((entry) =>
    convertWeightToDisplayValue(entry.weightKg, preferredUnits),
  );
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(maxValue - minValue, 1);

  const points = chartableEntries.map((entry, index) => {
    const value = convertWeightToDisplayValue(entry.weightKg, preferredUnits);
    const x =
      padding +
      (index * (width - (padding * 2))) / Math.max(chartableEntries.length - 1, 1);
    const y =
      padding +
      ((maxValue - value) / valueRange) * (height - (padding * 2));
    return { x, y };
  });

  return {
    width,
    height,
    points,
    labels: {
      min: minValue.toFixed(1),
      max: maxValue.toFixed(1),
    },
  };
}

export function ProgressWeightDetailScreen() {
  const router = useRouter();
  const { applyProfile, profile, user } = useAuthProfile();
  const preferredUnits = profile?.preferredUnits ?? null;
  const [entries, setEntries] = React.useState<BodyWeightEntry[]>([]);
  const [inputWeight, setInputWeight] = React.useState('');
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const loadEntries = React.useCallback(() => {
    let isActive = true;
    setIsLoading(true);

    void getBodyWeightHistory(24)
      .then((history) => {
        if (!isActive) {
          return;
        }

        setEntries(history);
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
  }, []);

  React.useEffect(() => loadEntries(), [loadEntries]);

  const trend = summarizeBodyWeightTrend(entries, preferredUnits);
  const chartData = buildChartPoints(entries, preferredUnits);

  async function syncProfileWeightSnapshot() {
    if (!user) {
      return;
    }

    const nextProfile = await getCurrentProfile(user.id);

    if (nextProfile) {
      applyProfile(nextProfile);
    }
  }

  async function handleSave() {
    const parsedWeight = parseDecimalInput(inputWeight);

    if (parsedWeight == null || parsedWeight <= 0) {
      setErrorMessage('Enter a valid body weight before saving.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (editingEntryId) {
        await updateBodyWeightEntry({
          entryId: editingEntryId,
          displayWeight: parsedWeight,
          preferredUnits,
        });
      } else {
        await addBodyWeightEntry({
          displayWeight: parsedWeight,
          preferredUnits,
        });
      }

      setInputWeight('');
      setEditingEntryId(null);
      await syncProfileWeightSnapshot();
      loadEntries();
    } catch (error) {
      setErrorMessage(getFriendlyProgressError(error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleEdit(entry: BodyWeightEntry) {
    setEditingEntryId(entry.id);
    setInputWeight(formatWeightInputFromKilograms(entry.weightKg, preferredUnits));
    setErrorMessage(null);
  }

  function handleCancelEdit() {
    setEditingEntryId(null);
    setInputWeight('');
    setErrorMessage(null);
  }

  function handleDelete(entry: BodyWeightEntry) {
    Alert.alert(
      'Delete Weight Entry',
      `Remove ${formatWeight(entry.weightKg, preferredUnits)} from ${formatLocalDateTime(
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
                await deleteBodyWeightEntry(entry.id);
                if (editingEntryId === entry.id) {
                  handleCancelEdit();
                }
                await syncProfileWeightSnapshot();
                loadEntries();
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
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>WEIGHT</Text>
            <Text style={styles.title}>Weight History</Text>
            <Text style={styles.subtitle}>
              Raw check-ins stored canonically in kilograms and shown in your preferred units.
            </Text>
          </View>
          <View style={styles.heroMetricBlock}>
            <Text style={styles.heroValue}>
              {trend.latestDisplayValue == null ? '--' : trend.latestDisplayValue.toFixed(1)}
            </Text>
            <Text style={styles.heroUnit}>{trend.unitLabel}</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <MetricCard
            label="Latest"
            value={
              trend.latestEntry
                ? formatWeight(trend.latestEntry.weightKg, preferredUnits)
                : 'Not set'
            }
            detail={trend.latestEntry ? formatLocalDateTime(trend.latestEntry.measuredAt) : 'Log your first weight'}
          />
          <MetricCard
            label="Change"
            value={
              trend.deltaDisplayValue == null
                ? '--'
                : `${trend.deltaDisplayValue > 0 ? '+' : ''}${trend.deltaDisplayValue.toFixed(1)} ${trend.unitLabel}`
            }
            detail={trend.previousEntry ? 'vs last check-in' : 'Need 2 entries'}
          />
          <MetricCard
            label="Goal"
            value={formatWeight(profile?.targetWeightKg ?? null, preferredUnits)}
            detail="Target from your profile"
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Trend</Text>
          {chartData ? (
            <View style={styles.chartWrap}>
              <View style={styles.chartLabels}>
                <Text style={styles.chartLabel}>{chartData.labels.max} {trend.unitLabel}</Text>
                <Text style={styles.chartLabel}>{chartData.labels.min} {trend.unitLabel}</Text>
              </View>
              <Svg width="100%" height={chartData.height} viewBox={`0 0 ${chartData.width} ${chartData.height}`}>
                <Polyline
                  points={chartData.points.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {chartData.points.map((point, index) => (
                  <Circle
                    key={`${point.x}-${point.y}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill={colors.levelGlow}
                  />
                ))}
              </Svg>
            </View>
          ) : (
            <Text style={styles.emptyText}>Your chart appears after the first saved check-in.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {editingEntryId ? 'Edit Weight Entry' : 'Log Weight'}
          </Text>
          <ProfileTextInput
            label={`Body Weight (${getWeightUnitLabel(preferredUnits)})`}
            value={inputWeight}
            onChangeText={(value) => setInputWeight(normalizeDecimalInput(value, 3, 2))}
            placeholder={preferredUnits === 'imperial' ? '176.4' : '80.0'}
            keyboardType="numeric"
            accessibilityLabel="Progress weight input"
          />
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <View style={styles.actionRow}>
            {editingEntryId ? (
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                onPress={handleCancelEdit}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={() => void handleSave()}
              accessibilityRole="button"
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {editingEntryId ? 'Save Changes' : 'Save Weight'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent Check-Ins</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : entries.length > 0 ? (
            <View style={styles.entryList}>
              {entries.map((entry) => (
                <View key={entry.id} style={styles.entryRow}>
                  <View style={styles.entryCopy}>
                    <Text style={styles.entryTitle}>
                      {formatWeight(entry.weightKg, preferredUnits)}
                    </Text>
                    <Text style={styles.entryDetail}>
                      {formatLocalDateTime(entry.measuredAt)}
                    </Text>
                  </View>
                  <View style={styles.entryActions}>
                    <Pressable
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                      onPress={() => handleEdit(entry)}
                      accessibilityRole="button"
                      accessibilityLabel="Edit weight entry"
                    >
                      <Ionicons name="create-outline" size={16} color={colors.accent} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                      onPress={() => handleDelete(entry)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete weight entry"
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.warning} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No weight entries yet.</Text>
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
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
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
  heroMetricBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  heroValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 44,
  },
  heroUnit: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 88,
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
  sectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  chartWrap: {
    gap: spacing.sm,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
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
    minWidth: 132,
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
  entryList: {
    gap: spacing.sm,
  },
  entryRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  entryCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  entryTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  entryDetail: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
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
