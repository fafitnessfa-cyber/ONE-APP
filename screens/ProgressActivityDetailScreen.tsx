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
import { useFocusEffect, useRouter } from 'expo-router';
import { AppScreen } from '../components/AppScreen';
import {
  calculateGoalCompletionForRange,
  getActivityBuckets,
  getTrainingSummary,
} from '../lib/progress/analytics';
import {
  formatDurationMinutes,
  getFriendlyProgressError,
} from '../lib/progress/shared';
import type {
  ProgressActivityBucket,
  ProgressActivityRange,
  ProgressTrainingSummary,
} from '../lib/progress/types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

const CHART_HEIGHT = 120;

const FALLBACK_BUCKETS: Record<ProgressActivityRange, ProgressActivityBucket[]> = {
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

export function ProgressActivityDetailScreen() {
  const router = useRouter();
  const [range, setRange] = React.useState<ProgressActivityRange>('week');
  const [selectedIndex, setSelectedIndex] = React.useState(6);
  const [summary, setSummary] = React.useState<ProgressTrainingSummary | null>(null);
  const [activity, setActivity] = React.useState<Record<ProgressActivityRange, ProgressActivityBucket[]>>(FALLBACK_BUCKETS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const loadActivity = React.useCallback(() => {
    let isActive = true;
    setIsLoading(true);

    void Promise.all([
      getActivityBuckets('week'),
      getActivityBuckets('month'),
      getTrainingSummary(),
    ])
      .then(([week, month, nextSummary]) => {
        if (!isActive) {
          return;
        }

        setActivity({ week, month });
        setSummary(nextSummary);
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

  useFocusEffect(loadActivity);

  React.useEffect(() => {
    setSelectedIndex(range === 'week' ? 6 : 3);
  }, [range]);

  const currentData = activity[range];
  const selectedActivity =
    currentData[Math.min(selectedIndex, currentData.length - 1)] ?? currentData[0];
  const totalMinutes = currentData.reduce((sum, item) => sum + item.totalMinutes, 0);
  const totalWorkouts = currentData.reduce((sum, item) => sum + item.workoutCount, 0);
  const chartMaxValue = getChartMaxValue(currentData, range);
  const goalCompletion = calculateGoalCompletionForRange({
    buckets: currentData,
    range,
    workoutGoalPerWeek: summary?.workoutGoalPerWeek ?? null,
    weeklyGoalCompletionPercent: summary?.weeklyGoalCompletionPercent ?? null,
  });

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
          <Text style={styles.eyebrow}>ACTIVITY</Text>
          <Text style={styles.title}>Training Analytics</Text>
          <Text style={styles.subtitle}>
            Workout frequency, working sets, volume, and the muscle groups you trained this week.
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.statusCard}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.statusText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.summaryGrid}>
          <MetricCard
            label="This Week"
            value={String(summary?.completedWorkoutsThisWeek ?? 0)}
            detail="Completed workouts"
          />
          <MetricCard
            label="Working Sets"
            value={String(summary?.completedWorkingSetsThisWeek ?? 0)}
            detail="Non-warmup completed sets"
          />
          <MetricCard
            label="Volume"
            value={`${Math.round(summary?.externalVolumeKgThisWeek ?? 0)} kg`}
            detail="External load x reps"
          />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Activity Buckets</Text>
              <Text style={styles.sectionSubtitle}>
                {range === 'week' ? 'Monday to Sunday' : 'Rolling 4-week view'}
              </Text>
            </View>
            <Pressable
              style={styles.rangePill}
              onPress={() =>
                setRange((currentRange) =>
                  currentRange === 'week' ? 'month' : 'week',
                )
              }
            >
              <Text style={styles.rangeText}>
                {range === 'week' ? 'This Week' : 'This Month'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.accent} />
            </Pressable>
          </View>

          <View style={styles.chartArea}>
            <View style={styles.yAxis}>
              <Text style={[styles.axisLabel, { top: -7 }]}>{chartMaxValue}m</Text>
              <Text style={[styles.axisLabel, { top: 33 }]}>{Math.round((chartMaxValue * 2) / 3)}m</Text>
              <Text style={[styles.axisLabel, { top: 73 }]}>{Math.round(chartMaxValue / 3)}m</Text>
              <Text style={[styles.axisLabel, { top: 113 }]}>{0}m</Text>
            </View>

            <View style={styles.plotArea}>
              <View style={[styles.gridLine, { top: 0 }]} />
              <View style={[styles.gridLine, { top: 40 }]} />
              <View style={[styles.gridLine, { top: 80 }]} />
              <View style={[styles.gridLine, styles.baseline, { top: CHART_HEIGHT }]} />

              <View style={styles.barRow}>
                {currentData.map((bucket, index) => {
                  const isSelected =
                    index === Math.min(selectedIndex, currentData.length - 1);
                  const height =
                    bucket.totalMinutes <= 0
                      ? 8
                      : Math.max(
                          8,
                          Math.round((bucket.totalMinutes / chartMaxValue) * CHART_HEIGHT),
                        );

                  return (
                    <Pressable
                      key={`${bucket.label}-${bucket.bucketStart}-${index}`}
                      style={styles.barColumn}
                      onPress={() => setSelectedIndex(index)}
                      accessibilityRole="button"
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
                        {bucket.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.activityFooter}>
            <Text style={styles.activityText}>
              {selectedActivity?.label}: {selectedActivity?.totalMinutes ?? 0}m,{' '}
              {selectedActivity?.workoutCount ?? 0} workouts
            </Text>
            <Text style={styles.activityText}>
              Goal completion {goalCompletion == null ? '--' : `${Math.round(goalCompletion)}%`}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryMetric}>Total time: {formatDurationMinutes(totalMinutes * 60)}</Text>
            <Text style={styles.summaryMetric}>Total workouts: {totalWorkouts}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top Muscles This Week</Text>
          {summary?.primaryMuscleSets.length ? (
            <View style={styles.itemList}>
              {summary.primaryMuscleSets.map((muscle) => (
                <View key={muscle.muscleId} style={styles.itemRow}>
                  <View>
                    <Text style={styles.itemTitle}>{muscle.name}</Text>
                    <Text style={styles.itemDetail}>{muscle.muscleGroup}</Text>
                  </View>
                  <Text style={styles.itemValue}>{muscle.setCount} sets</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Primary muscle analytics appear after completed workouts.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top Exercises This Week</Text>
          {summary?.topExercises.length ? (
            <View style={styles.itemList}>
              {summary.topExercises.map((exercise) => (
                <View key={exercise.exerciseId} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>{exercise.exerciseName}</Text>
                    <Text style={styles.itemDetail}>
                      {exercise.completedWorkingSets} working sets
                    </Text>
                  </View>
                  <Text style={styles.itemValue}>
                    {Math.round(exercise.externalVolumeKg)} kg
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Volume analytics appear after completed workouts.</Text>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
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
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
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
    minHeight: CHART_HEIGHT + 8,
  },
  yAxis: {
    height: CHART_HEIGHT,
    position: 'relative',
    width: 34,
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
    width: 32,
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
    width: 10,
  },
  barFillSelected: {
    backgroundColor: colors.levelGlow,
    opacity: 1,
    width: 12,
  },
  barLabel: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  barLabelActive: {
    color: colors.textPrimary,
    fontWeight: '900',
  },
  activityFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  activityText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  summaryRow: {
    borderTopColor: 'rgba(168,176,166,0.22)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  summaryMetric: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '800',
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
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    lineHeight: 18,
  },
  loadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
});
