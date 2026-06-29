import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line } from 'react-native-svg';
import { AppScreen } from '../components/AppScreen';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

type ActivityRange = 'week' | 'month';
type BodyFocus = 'primary' | 'secondary';

const activityData = {
  week: [
    { label: 'Mon', minutes: 52, workouts: 1 },
    { label: 'Tue', minutes: 74, workouts: 1 },
    { label: 'Wed', minutes: 58, workouts: 1 },
    { label: 'Thu', minutes: 84, workouts: 1 },
    { label: 'Fri', minutes: 66, workouts: 1 },
    { label: 'Sat', minutes: 36, workouts: 0 },
    { label: 'Sun', minutes: 8, workouts: 0 },
  ],
  month: [
    { label: 'W1', minutes: 260, workouts: 4 },
    { label: 'W2', minutes: 315, workouts: 5 },
    { label: 'W3', minutes: 280, workouts: 4 },
    { label: 'W4', minutes: 340, workouts: 5 },
  ],
};

const CHART_HEIGHT = 96;

const achievements = [
  { icon: 'shield-checkmark', title: '10 Workouts', detail: 'Keep showing up' },
  { icon: 'star', title: 'New PR', detail: 'Personal best' },
  { icon: 'layers', title: 'Level Up', detail: 'Reach lvl 24' },
  { icon: 'flame', title: '9 Day Streak', detail: 'Best: 14 days' },
];

export function ProgressScreen() {
  const [range, setRange] = React.useState<ActivityRange>('week');
  const [selectedIndex, setSelectedIndex] = React.useState(3);
  const [bodyFocus, setBodyFocus] = React.useState<BodyFocus>('primary');
  const [showAllAchievements, setShowAllAchievements] = React.useState(false);

  const currentData = activityData[range];
  const selectedActivity = currentData[Math.min(selectedIndex, currentData.length - 1)];
  const totalMinutes = currentData.reduce((sum, item) => sum + item.minutes, 0);
  const workoutCount = currentData.reduce((sum, item) => sum + item.workouts, 0);
  const goalMet = range === 'week' ? 92 : 88;
  const visibleAchievements = achievements.slice(0, 3);
  const achievementRows = [achievements.slice(0, 2), achievements.slice(2, 4)];

  const toggleRange = () => {
    const nextRange = range === 'week' ? 'month' : 'week';
    setRange(nextRange);
    setSelectedIndex(nextRange === 'week' ? 3 : 1);
  };

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
            <Text style={styles.levelText}>LEVEL 24</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroScoreBlock}>
            <Text style={styles.heroValue}>86</Text>
            <Text style={styles.heroLabel}>CONSISTENCY SCORE</Text>
            <Text style={styles.heroTrend}>Up +12 this month</Text>
            <View style={styles.heroDivider} />
            <View style={styles.heroNoteRow}>
              <Ionicons name="radio-button-on" size={14} color={colors.accent} />
              <Text style={styles.heroNote}>Keep it up! Building momentum.</Text>
            </View>
          </View>
          <ProgressRing score={86} />
        </View>

        <View style={styles.activityCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="bar-chart" size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>Weekly Activity</Text>
            </View>
            <Pressable style={styles.rangePill} onPress={toggleRange}>
              <Text style={styles.rangeText}>{range === 'week' ? 'This Week' : 'This Month'}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.accent} />
            </Pressable>
          </View>

          <View style={styles.chartArea}>
            <View style={styles.yAxis}>
              <Text style={[styles.axisLabel, { top: -7 }]}>90m</Text>
              <Text style={[styles.axisLabel, { top: 25 }]}>60m</Text>
              <Text style={[styles.axisLabel, { top: 57 }]}>30m</Text>
              <Text style={[styles.axisLabel, { top: 89 }]}>0m</Text>
            </View>

            <View style={styles.plotArea}>
              <View style={[styles.gridLine, { top: 0 }]} />
              <View style={[styles.gridLine, { top: 32 }]} />
              <View style={[styles.gridLine, { top: 64 }]} />
              <View style={[styles.gridLine, styles.baseline, { top: CHART_HEIGHT }]} />

              <View style={styles.barRow}>
                {currentData.map((item, index) => {
                  const maxValue = range === 'week' ? 90 : 360;
                  const isSelected = index === Math.min(selectedIndex, currentData.length - 1);
                  const height = Math.max(8, Math.round((item.minutes / maxValue) * CHART_HEIGHT));

                  return (
                    <Pressable
                      key={item.label}
                      style={styles.barColumn}
                      onPress={() => setSelectedIndex(index)}
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
              {selectedActivity.label}: {selectedActivity.minutes}m active
            </Text>
            <Text style={styles.selectedActivityText}>{selectedActivity.workouts} workout</Text>
          </View>

          <View style={styles.activityStatsRow}>
            <MiniStat icon="barbell" value={String(workoutCount)} label="Workouts" />
            <MiniStat icon="time" value={`${Math.floor(totalMinutes / 60)}H ${totalMinutes % 60}M`} label="Total Time" />
            <MiniStat icon="locate" value={`${goalMet}%`} label="Goal Met" />
          </View>
        </View>

        <View style={styles.statGrid}>
          <ProgressStatCard
            icon="scale"
            label="Weight"
            value="68.4"
            unit="kg"
            detail="-0.8kg vs week"
          />
          <ProgressStatCard
            icon="sparkles"
            label="XP Earned"
            value="1820"
            unit=""
            detail="+320 vs last week"
          />
          <ProgressStatCard
            icon="flame"
            label="Streak"
            value="9"
            unit="days"
            detail="Best: 14 days"
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
              onPress={() => setBodyFocus('primary')}
              accessibilityRole="button"
            >
              <View style={[styles.legendDot, bodyFocus === 'primary' && styles.legendDotActive]} />
              <Text
                numberOfLines={1}
                style={[styles.legendText, bodyFocus === 'primary' && styles.legendTextActive]}
              >
                Primary movers
              </Text>
            </Pressable>
            <Pressable
              style={styles.legendRow}
              onPress={() => setBodyFocus('secondary')}
              accessibilityRole="button"
            >
              <View style={[styles.legendDot, bodyFocus === 'secondary' && styles.legendDotActive]} />
              <Text
                numberOfLines={1}
                style={[styles.legendText, bodyFocus === 'secondary' && styles.legendTextActive]}
              >
                Secondary movers
              </Text>
            </Pressable>
          </View>

          <View style={styles.bodyVisuals}>
            <BodyPlaceholder label="Front" active={bodyFocus === 'primary'} />
            <BodyPlaceholder label="Back" active={bodyFocus === 'secondary'} />
          </View>

          <Pressable
            style={styles.viewButton}
            onPress={() => setBodyFocus(bodyFocus === 'primary' ? 'secondary' : 'primary')}
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
              <Text style={styles.sectionTitle}>Achievements</Text>
            </View>
            <Pressable
              style={styles.viewAllButton}
              onPress={() => setShowAllAchievements((current) => !current)}
              accessibilityRole="button"
            >
              <Text style={styles.viewAllText}>{showAllAchievements ? 'Show Less' : 'View All'}</Text>
              <Ionicons
                name={showAllAchievements ? 'chevron-up' : 'chevron-forward'}
                size={12}
                color={colors.accent}
              />
            </Pressable>
          </View>

          {showAllAchievements ? (
            <View style={styles.achievementGrid}>
              {achievementRows.map((row) => (
                <View key={row.map((achievement) => achievement.title).join('-')} style={styles.achievementGridRow}>
                  {row.map((achievement) => (
                    <AchievementPill key={achievement.title} achievement={achievement} expanded />
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.achievementRow}>
              {visibleAchievements.map((achievement) => (
                <AchievementPill key={achievement.title} achievement={achievement} />
              ))}
            </View>
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
        <Circle cx="59" cy="59" r="39" stroke="rgba(168,176,166,0.35)" strokeWidth="8" fill="rgba(13,13,13,0.2)" />
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

function MiniStat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
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
  warning = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statLabelRow}>
        <Ionicons name={icon} size={15} color={warning ? colors.warning : colors.accent} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={[styles.statDetail, warning && styles.statDetailWarning]}>{detail}</Text>
    </View>
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
      <Text style={[styles.bodyPlaceholderText, active && styles.bodyPlaceholderTextActive]}>
        {label}
      </Text>
    </View>
  );
}

function AchievementPill({
  achievement,
  expanded = false,
}: {
  achievement: (typeof achievements)[number];
  expanded?: boolean;
}) {
  return (
    <View
      style={[
        styles.achievementPillBase,
        expanded ? styles.achievementPillExpanded : styles.achievementPill,
      ]}
    >
      <View style={styles.achievementIcon}>
        <Ionicons
          name={achievement.icon as keyof typeof Ionicons.glyphMap}
          size={16}
          color={colors.accent}
        />
      </View>
      <View style={styles.achievementTextBlock}>
        <Text style={styles.achievementTitle} numberOfLines={1}>
          {achievement.title}
        </Text>
        <Text style={styles.achievementDetail} numberOfLines={1}>
          {achievement.detail}
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
  achievementGrid: {
    gap: spacing.sm,
  },
  achievementGridRow: {
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
  achievementPillExpanded: {
    flex: 1,
    minHeight: 42,
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
});
