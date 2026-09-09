import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import Svg, { Circle, Line } from 'react-native-svg';
import { AppScreen } from '../components/AppScreen';
import { useAuthProfile } from '../lib/profile/context';
import {
  calculateGoalCompletionForRange,
  getActivityBuckets,
  getTrainingSummary,
} from '../lib/progress/analytics';
import {
  getBodyMeasurements,
  getBodyWeightHistory,
  summarizeBodyWeightTrend,
} from '../lib/progress/measurements';
import { getPersonalRecords } from '../lib/progress/records';
import {
  formatDurationMinutes,
  formatRecordTypeLabel,
  formatRecordValue,
  getFriendlyProgressError,
} from '../lib/progress/shared';
import type {
  PersonalRecord,
  ProgressActivityBucket,
  ProgressActivityRange,
  ProgressDashboardSnapshot,
} from '../lib/progress/types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

type BodyFocus = 'primary' | 'secondary';

const CHART_HEIGHT = 96;

const FALLBACK_ACTIVITY_DATA: Record<ProgressActivityRange, ProgressActivityBucket[]> = {
  week: [
    { label: 'Mon', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'Tue', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'Wed', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'Thu', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'Fri', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'Sat', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'Sun', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
  ],
  month: [
    { label: 'W1', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'W2', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'W3', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
    { label: 'W4', bucketStart: '', bucketEnd: '', totalMinutes: 0, workoutCount: 0, completedWorkingSets: 0, externalVolumeKg: 0 },
  ],
};

function getChartMaxValue(data: ProgressActivityBucket[], range: ProgressActivityRange) {
  const maxMinutes = data.reduce(
    (currentMax, item) => Math.max(currentMax, item.totalMinutes),
    0,
  );

  if (maxMinutes <= 0) {
    return range === 'week' ? 90 : 360;
  }

  const step = range === 'week' ? 30 : 60;
  return Math.max(step, Math.ceil(maxMinutes / step) * step);
}

function formatSignedDelta(value: number | null, unitLabel: string) {
  if (value == null) {
    return 'Log your first check-in';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}${unitLabel} vs last check`;
}

function getWorkoutLabel(count: number) {
  return `${count} workout${count === 1 ? '' : 's'}`;
}

function getMuscleSummaryLabel(items: Array<{ name: string; setCount?: number; setScore?: number }>) {
  if (items.length === 0) {
    return 'Log workouts to surface trends';
  }

  return items
    .slice(0, 2)
    .map((item) =>
      item.setCount != null
        ? `${item.name} ${item.setCount}`
        : `${item.name} ${item.setScore?.toFixed(1) ?? '0'}`,
    )
    .join(' · ');
}

function getRecordIcon(recordType: PersonalRecord['recordType']) {
  switch (recordType) {
    case 'heaviest_load':
      return 'barbell-outline';
    case 'estimated_one_rep_max':
      return 'speedometer-outline';
    case 'max_reps':
      return 'repeat-outline';
    case 'least_assistance':
      return 'trending-down-outline';
    case 'longest_duration':
      return 'timer-outline';
    case 'longest_distance':
      return 'walk-outline';
    default:
      return 'trophy-outline';
  }
}

export function ProgressScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { profile } = useAuthProfile();
  const [range, setRange] = React.useState<ProgressActivityRange>('week');
  const [selectedIndex, setSelectedIndex] = React.useState(6);
  const [bodyFocus, setBodyFocus] = React.useState<BodyFocus>('primary');
  const [dashboard, setDashboard] = React.useState<ProgressDashboardSnapshot | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(() => {
    let isActive = true;

    setIsLoading(true);

    void Promise.all([
      getActivityBuckets('week'),
      getActivityBuckets('month'),
      getTrainingSummary(),
      getBodyWeightHistory(12),
      getBodyMeasurements({ limit: 18 }),
      getPersonalRecords({ limit: 8 }),
    ])
      .then(([weekActivity, monthActivity, summary, weightHistory, measurements, records]) => {
        if (!isActive) {
          return;
        }

        React.startTransition(() => {
          setDashboard({
            activity: {
              week: weekActivity,
              month: monthActivity,
            },
            summary,
            weightHistory,
            measurements,
            records,
          });
          setErrorMessage(null);
          setIsLoading(false);
        });
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

  useFocusEffect(loadDashboard);

  React.useEffect(() => {
    setSelectedIndex(range === 'week' ? 6 : 3);
  }, [range]);

  const currentData = dashboard?.activity[range] ?? FALLBACK_ACTIVITY_DATA[range];
  const selectedActivity =
    currentData[Math.min(selectedIndex, currentData.length - 1)] ?? currentData[0];
  const totalMinutes = currentData.reduce((sum, item) => sum + item.totalMinutes, 0);
  const workoutCount = currentData.reduce((sum, item) => sum + item.workoutCount, 0);
  const goalMet = calculateGoalCompletionForRange({
    buckets: currentData,
    range,
    workoutGoalPerWeek: dashboard?.summary.workoutGoalPerWeek ?? null,
    weeklyGoalCompletionPercent:
      dashboard?.summary.weeklyGoalCompletionPercent ?? null,
  });
  const visibleRecords = dashboard?.records.slice(0, 3) ?? [];
  const weightTrend = summarizeBodyWeightTrend(
    dashboard?.weightHistory ?? [],
    profile?.preferredUnits ?? null,
  );
  const primaryMuscleLabel = getMuscleSummaryLabel(
    dashboard?.summary.primaryMuscleSets ?? [],
  );
  const secondaryMuscleLabel = getMuscleSummaryLabel(
    dashboard?.summary.secondaryMuscleSets ?? [],
  );
  const chartMaxValue = getChartMaxValue(currentData, range);
  const yAxisLabels = [
    `${chartMaxValue}m`,
    `${Math.round((chartMaxValue * 2) / 3)}m`,
    `${Math.round(chartMaxValue / 3)}m`,
    '0m',
  ];

  const toggleRange = () => {
    setRange((currentRange) => (currentRange === 'week' ? 'month' : 'week'));
  };

  function runWhenFocused(action: () => void) {
    if (!isFocused) {
      return;
    }

    action();
  }

  const goalMetLabel = goalMet == null ? '--' : `${Math.round(goalMet)}%`;
  const weightValue =
    weightTrend.latestDisplayValue == null
      ? '--'
      : weightTrend.latestDisplayValue.toFixed(1);
  const weightUnit = weightTrend.latestDisplayValue == null ? '' : weightTrend.unitLabel;

  return (
    <AppScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>Your Progress</Text>
            <Text style={styles.subtitle}>Track how far you've come.</Text>
          </View>
          <View style={styles.levelPill}>
            <Text style={styles.levelText}>LEVEL --</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroScoreBlock}>
            <Text style={styles.heroValue}>--</Text>
            <Text style={styles.heroLabel}>FITNESS SCORE</Text>
            <Text style={styles.heroTrend}>Formula arrives in a later gamification stage</Text>
            <View style={styles.heroDivider} />
            <View style={styles.heroNoteRow}>
              <Ionicons name="radio-button-on" size={14} color={colors.accent} />
              <Text style={styles.heroNote}>
                Workouts, body metrics, and personal records are live below.
              </Text>
            </View>
          </View>
          <ProgressRing score={0} />
        </View>

        {errorMessage ? (
          <View style={styles.statusCard}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.statusText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.activityCard}>
          <View style={styles.sectionHeader}>
            <Pressable
              style={styles.sectionTitleRow}
              onPress={() =>
                runWhenFocused(() => router.push('/progress/activity' as Href))
              }
              accessibilityRole="button"
            >
              <Ionicons name="bar-chart" size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>Weekly Activity</Text>
            </Pressable>
            <View style={styles.sectionHeaderActions}>
              <Pressable
                style={styles.rangePill}
                onPress={() => runWhenFocused(toggleRange)}
              >
                <Text style={styles.rangeText}>
                  {range === 'week' ? 'This Week' : 'This Month'}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.accent} />
              </Pressable>
              <Pressable
                style={styles.detailIconButton}
                onPress={() =>
                  runWhenFocused(() => router.push('/progress/activity' as Href))
                }
                accessibilityRole="button"
                accessibilityLabel="Open weekly activity details"
              >
                <Ionicons name="chevron-forward" size={15} color={colors.accent} />
              </Pressable>
            </View>
          </View>

          <View style={styles.chartArea}>
            <View style={styles.yAxis}>
              <Text style={[styles.axisLabel, { top: -7 }]}>{yAxisLabels[0]}</Text>
              <Text style={[styles.axisLabel, { top: 25 }]}>{yAxisLabels[1]}</Text>
              <Text style={[styles.axisLabel, { top: 57 }]}>{yAxisLabels[2]}</Text>
              <Text style={[styles.axisLabel, { top: 89 }]}>{yAxisLabels[3]}</Text>
            </View>

            <View style={styles.plotArea}>
              <View style={[styles.gridLine, { top: 0 }]} />
              <View style={[styles.gridLine, { top: 32 }]} />
              <View style={[styles.gridLine, { top: 64 }]} />
              <View style={[styles.gridLine, styles.baseline, { top: CHART_HEIGHT }]} />

              <View style={styles.barRow}>
                {currentData.map((item, index) => {
                  const isSelected =
                    index === Math.min(selectedIndex, currentData.length - 1);
                  const height =
                    item.totalMinutes <= 0
                      ? 8
                      : Math.max(
                          8,
                          Math.round((item.totalMinutes / chartMaxValue) * CHART_HEIGHT),
                        );

                  return (
                    <Pressable
                      key={`${item.label}-${item.bucketStart}-${index}`}
                      style={styles.barColumn}
                      onPress={() =>
                        runWhenFocused(() => setSelectedIndex(index))
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${item.label} activity`}
                    >
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { height },
                            isSelected && styles.barFillSelected,
                          ]}
                        />
                      </View>
                      <Text style={[styles.barLabel, isSelected && styles.barLabelActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.selectedActivityRow}>
            <Text style={styles.selectedActivityText}>
              {selectedActivity?.label ?? '--'}: {selectedActivity?.totalMinutes ?? 0}m active
            </Text>
            <Text style={styles.selectedActivityText}>
              {getWorkoutLabel(selectedActivity?.workoutCount ?? 0)}
            </Text>
          </View>

          <View style={styles.activityStatsRow}>
            <MiniStat icon="barbell" value={String(workoutCount)} label="Workouts" />
            <MiniStat icon="time" value={formatDurationMinutes(totalMinutes * 60)} label="Total Time" />
            <MiniStat icon="locate" value={goalMetLabel} label="Goal Met" />
          </View>

          {isLoading && !dashboard ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}
        </View>

        <View style={styles.statGrid}>
          <ProgressStatCard
            icon="scale"
            label="Weight"
            value={weightValue}
            unit={weightUnit}
            detail={formatSignedDelta(weightTrend.deltaDisplayValue, weightTrend.unitLabel)}
            onPress={() =>
              runWhenFocused(() => router.push('/progress/weight' as Href))
            }
          />
          <ProgressStatCard
            icon="sparkles"
            label="XP Earned"
            value="--"
            unit=""
            detail="Gamification not enabled yet"
            onPress={() =>
              runWhenFocused(() => router.push('/progress/xp' as Href))
            }
          />
          <ProgressStatCard
            icon="flame"
            label="Streak"
            value="--"
            unit=""
            detail="Streaks arrive with gamification"
            onPress={() =>
              runWhenFocused(() => router.push('/progress/streak' as Href))
            }
            warning
          />
        </View>

        <View style={styles.bodyCard}>
          <View style={styles.bodyCopy}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="body" size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>Body Progress</Text>
            </View>
            <Pressable
              style={styles.legendRow}
              onPress={() => runWhenFocused(() => setBodyFocus('primary'))}
              accessibilityRole="button"
            >
              <View style={[styles.legendDot, bodyFocus === 'primary' && styles.legendDotActive]} />
              <Text
                numberOfLines={1}
                style={[styles.legendText, bodyFocus === 'primary' && styles.legendTextActive]}
              >
                {primaryMuscleLabel}
              </Text>
            </Pressable>
            <Pressable
              style={styles.legendRow}
              onPress={() => runWhenFocused(() => setBodyFocus('secondary'))}
              accessibilityRole="button"
            >
              <View
                style={[styles.legendDot, bodyFocus === 'secondary' && styles.legendDotActive]}
              />
              <Text
                numberOfLines={1}
                style={[styles.legendText, bodyFocus === 'secondary' && styles.legendTextActive]}
              >
                {secondaryMuscleLabel}
              </Text>
            </Pressable>
          </View>

          <View style={styles.bodyVisuals}>
            <BodyPlaceholder label="Front" active={bodyFocus === 'primary'} />
            <BodyPlaceholder label="Back" active={bodyFocus === 'secondary'} />
          </View>

          <Pressable
            style={styles.viewButton}
            onPress={() =>
              runWhenFocused(() => router.push('/progress/body-progress' as Href))
            }
            accessibilityRole="button"
          >
            <Text style={styles.viewButtonText}>View</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.accent} />
          </Pressable>
        </View>

        <View style={styles.achievementCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="trophy" size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>Personal Records</Text>
            </View>
            <Pressable
              style={styles.viewAllButton}
              onPress={() =>
                runWhenFocused(() =>
                  router.push('/progress/personal-records' as Href),
                )
              }
              accessibilityRole="button"
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.accent} />
            </Pressable>
          </View>

          {visibleRecords.length > 0 ? (
            <View style={styles.achievementRow}>
              {visibleRecords.map((record) => (
                <RecordPill
                  key={`${record.exerciseId}-${record.recordType}`}
                  record={record}
                  preferredUnits={profile?.preferredUnits ?? null}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Complete a workout and your best sets will show up here automatically.
            </Text>
          )}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function ProgressRing({ score }: { score: number }) {
  const radiusValue = 39;
  const circumference = 2 * Math.PI * radiusValue;
  const progress = circumference * (1 - score / 100);

  return (
    <View style={styles.ringWrap}>
      <Svg width={118} height={118} viewBox="0 0 118 118">
        {Array.from({ length: 36 }).map((_, index) => {
          const angle = (index / 36) * 360;
          return (
            <Line
              key={index}
              x1="59"
              y1="7"
              x2="59"
              y2="9"
              stroke={colors.accentLight}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.85"
              transform={`rotate(${angle} 59 59)`}
            />
          );
        })}
        <Circle
          cx="59"
          cy="59"
          r="39"
          stroke="rgba(168,176,166,0.35)"
          strokeWidth="8"
          fill="rgba(13,13,13,0.2)"
        />
        <Circle
          cx="59"
          cy="59"
          r={radiusValue}
          stroke={colors.accent}
          strokeWidth="8"
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress}
          transform="rotate(-90 59 59)"
        />
      </Svg>
      <View style={styles.ringLogo}>
        <Text style={styles.ringOne}>1</Text>
      </View>
    </View>
  );
}

function MiniStat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.miniStat}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <View style={styles.miniStatText}>
        <Text style={styles.miniStatValue}>{value}</Text>
        <Text style={styles.miniStatLabel}>{label}</Text>
      </View>
    </View>
  );
}

function ProgressStatCard({
  icon,
  label,
  value,
  unit,
  detail,
  onPress,
  warning = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit: string;
  detail: string;
  onPress?: () => void;
  warning?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.statCard, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${label} details`}
    >
      <View style={styles.statLabelRow}>
        <Ionicons
          name={icon}
          size={15}
          color={warning ? colors.warning : colors.accent}
        />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={[styles.statDetail, warning && styles.statDetailWarning]}>
        {detail}
      </Text>
    </Pressable>
  );
}

function BodyPlaceholder({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={[styles.bodyPlaceholder, active && styles.bodyPlaceholderActive]}>
      <Ionicons
        name="image-outline"
        size={20}
        color={active ? colors.accent : colors.textSecondary}
      />
      <Text
        style={[styles.bodyPlaceholderText, active && styles.bodyPlaceholderTextActive]}
      >
        {label}
      </Text>
    </View>
  );
}

function RecordPill({
  record,
  preferredUnits,
}: {
  record: PersonalRecord;
  preferredUnits: 'metric' | 'imperial' | null;
}) {
  return (
    <View style={[styles.achievementPillBase, styles.achievementPill]}>
      <View style={styles.achievementIcon}>
        <Ionicons
          name={getRecordIcon(record.recordType)}
          size={16}
          color={colors.accent}
        />
      </View>
      <View style={styles.achievementTextBlock}>
        <Text style={styles.achievementTitle} numberOfLines={1}>
          {record.exerciseName}
        </Text>
        <Text style={styles.achievementDetail} numberOfLines={2}>
          {formatRecordTypeLabel(record.recordType)} ·{' '}
          {formatRecordValue(record, preferredUnits)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: 118,
  },
  titleRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.heading,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  levelPill: {
    borderColor: colors.accent,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  levelText: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 132,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  heroScoreBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 52,
    lineHeight: 54,
  },
  heroLabel: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
  },
  heroTrend: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  heroDivider: {
    backgroundColor: 'rgba(168,176,166,0.22)',
    height: 1,
    marginTop: spacing.sm,
    width: '88%',
  },
  heroNoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  heroNote: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: fontSize.caption,
  },
  ringWrap: {
    alignItems: 'center',
    height: 118,
    justifyContent: 'center',
    width: 118,
  },
  ringLogo: {
    alignItems: 'center',
    backgroundColor: 'rgba(13,13,13,0.45)',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    position: 'absolute',
    width: 50,
  },
  ringOne: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 42,
    includeFontPadding: false,
    lineHeight: 50,
    textAlign: 'center',
    transform: [{ skewX: '-10deg' }],
    width: 50,
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
  activityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailIconButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  rangePill: {
    alignItems: 'center',
    borderColor: 'rgba(168,176,166,0.6)',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rangeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  chartArea: {
    flexDirection: 'row',
    height: 122,
  },
  yAxis: {
    height: CHART_HEIGHT,
    position: 'relative',
    width: 32,
  },
  plotArea: {
    flex: 1,
    height: CHART_HEIGHT + 22,
    position: 'relative',
  },
  axisLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    left: 0,
    lineHeight: 14,
    position: 'absolute',
    width: 30,
  },
  gridLine: {
    backgroundColor: 'rgba(168,176,166,0.2)',
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  baseline: {
    backgroundColor: 'rgba(168,176,166,0.36)',
  },
  barRow: {
    flexDirection: 'row',
    height: CHART_HEIGHT + 22,
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'flex-start',
  },
  barTrack: {
    alignItems: 'center',
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    width: 18,
  },
  barFill: {
    backgroundColor: colors.accent,
    borderRadius: 2,
    opacity: 0.82,
    width: 9,
  },
  barFillSelected: {
    backgroundColor: colors.levelGlow,
    opacity: 1,
    width: 11,
  },
  barLabel: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  barLabelActive: {
    color: colors.textPrimary,
    fontWeight: '900',
  },
  selectedActivityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectedActivityText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  activityStatsRow: {
    borderTopColor: 'rgba(168,176,166,0.22)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -spacing.sm,
    paddingTop: spacing.md,
  },
  miniStat: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
  },
  miniStatText: {
    alignItems: 'center',
    minWidth: 0,
  },
  miniStatValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
  },
  miniStatLabel: {
    color: colors.textSecondary,
    fontSize: 9,
    textAlign: 'center',
  },
  loadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  statGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 74,
    padding: spacing.md,
  },
  statLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  statValueRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 32,
  },
  statUnit: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    paddingBottom: 5,
  },
  statDetail: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
  },
  statDetailWarning: {
    color: colors.textSecondary,
  },
  cardPressed: {
    opacity: 0.72,
  },
  bodyCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 98,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  bodyCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  legendDot: {
    backgroundColor: colors.accentLight,
    borderRadius: 4,
    height: 7,
    opacity: 0.75,
    width: 7,
  },
  legendDotActive: {
    backgroundColor: colors.accent,
    opacity: 1,
  },
  legendText: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: fontSize.caption,
  },
  legendTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  bodyVisuals: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    width: 88,
  },
  bodyPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    height: 72,
    justifyContent: 'center',
    width: 40,
  },
  bodyPlaceholderActive: {
    backgroundColor: 'rgba(106,192,6,0.12)',
    borderColor: colors.accent,
  },
  bodyPlaceholderText: {
    color: colors.textSecondary,
    fontSize: 8,
    fontWeight: '800',
  },
  bodyPlaceholderTextActive: {
    color: colors.accent,
  },
  viewButton: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  viewButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  achievementCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  viewAllButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  viewAllText: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  achievementRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  achievementPillBase: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  achievementPill: {
    flex: 1,
  },
  achievementIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(106,192,6,0.14)',
    borderRadius: radius.sm,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  achievementTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  achievementTitle: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '900',
  },
  achievementDetail: {
    color: colors.textSecondary,
    fontSize: 8,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    lineHeight: 18,
  },
});
