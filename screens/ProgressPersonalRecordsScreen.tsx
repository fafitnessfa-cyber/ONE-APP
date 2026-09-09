import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppScreen } from '../components/AppScreen';
import { useAuthProfile } from '../lib/profile/context';
import { getPersonalRecords } from '../lib/progress/records';
import {
  formatLocalDateTime,
  formatRecordTypeLabel,
  formatRecordValue,
  getFriendlyProgressError,
} from '../lib/progress/shared';
import type { PersonalRecord } from '../lib/progress/types';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

export function ProgressPersonalRecordsScreen() {
  const router = useRouter();
  const { profile } = useAuthProfile();
  const [records, setRecords] = React.useState<PersonalRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const loadRecords = React.useCallback(() => {
    let isActive = true;
    setIsLoading(true);

    void getPersonalRecords({ limit: 60 })
      .then((nextRecords) => {
        if (!isActive) {
          return;
        }

        setRecords(nextRecords);
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

  useFocusEffect(loadRecords);

  const latestRecord = records[0] ?? null;
  const recordTypeCount = new Set(records.map((record) => record.recordType)).size;

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
          <Text style={styles.eyebrow}>PERSONAL RECORDS</Text>
          <Text style={styles.title}>Current Bests</Text>
          <Text style={styles.subtitle}>
            Derived from completed workout history, excluding warmups and incomplete sets.
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.statusCard}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.statusText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.summaryGrid}>
          <MetricCard label="Records" value={String(records.length)} detail="Current best rows" />
          <MetricCard label="Types" value={String(recordTypeCount)} detail="Distinct PR categories" />
          <MetricCard
            label="Latest"
            value={latestRecord ? latestRecord.exerciseName : 'Not yet'}
            detail={latestRecord ? formatLocalDateTime(latestRecord.achievedAt) : 'Complete a workout'}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Record Library</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : records.length > 0 ? (
            <View style={styles.recordList}>
              {records.map((record) => (
                <View key={`${record.exerciseId}-${record.recordType}`} style={styles.recordRow}>
                  <View style={styles.recordCopy}>
                    <Text style={styles.recordTitle}>{record.exerciseName}</Text>
                    <Text style={styles.recordSubtitle}>
                      {formatRecordTypeLabel(record.recordType)}
                    </Text>
                    <Text style={styles.recordMeta}>
                      Achieved {formatLocalDateTime(record.achievedAt)}
                    </Text>
                    {record.previousValue != null ? (
                      <Text style={styles.recordMeta}>
                        Previous best: {formatRecordValue({
                          ...record,
                          value: record.previousValue,
                        }, profile?.preferredUnits ?? null)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.recordValue}>
                    {formatRecordValue(record, profile?.preferredUnits ?? null)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              No PRs yet. Complete workouts and your best completed sets will appear here.
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
  recordList: {
    gap: spacing.sm,
  },
  recordRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  recordCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  recordTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  recordSubtitle: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  recordMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: spacing.xs,
  },
  recordValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.display,
    maxWidth: 120,
    textAlign: 'right',
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
