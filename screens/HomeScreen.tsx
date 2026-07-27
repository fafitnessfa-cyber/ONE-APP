import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import Svg, { Circle, Line } from 'react-native-svg';
import { AppScreen } from '../components/AppScreen';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

const workoutMoves = [
  { icon: 'barbell', label: 'Bench\nPress' },
  { icon: 'body', label: 'Shoulder\nPress' },
  { icon: 'git-branch', label: 'Cable Fly' },
  { icon: 'accessibility', label: 'Triceps\nPushdown' },
];

const quickTools = [
  {
    icon: 'body',
    title: 'Muscle\nExplorer',
    href: '/home/muscle-explorer',
  },
  {
    icon: 'camera',
    title: 'Scan Meal',
    href: '/home/scan-meal',
  },
  {
    icon: 'videocam',
    title: 'Watch Form\nGuide',
    href: '/home/form-guide',
  },
] as const;

const recoveryMarkers = [
  { label: 'Chest - Partial', status: 'partial' },
  { label: 'Legs - Recovered', status: 'ready' },
  { label: 'Shoulders - Tired', status: 'tired' },
];

export function HomeScreen() {
  const router = useRouter();
  const [activeTool, setActiveTool] = React.useState('Muscle\nExplorer');

  return (
    <AppScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>Good Morning, User</Text>
            <Text style={styles.subtitle}>Ready to Level UP Today?</Text>
          </View>
          <LevelPill />
        </View>

        <View style={styles.scoreCard}>
          <View style={styles.scoreCopy}>
            <Text style={styles.scoreValue}>742</Text>
            <Text style={styles.scoreLabel}>FITNESS SCORE</Text>
            <Text style={styles.scoreDetail}>Builder Tier · <Text style={styles.greenText}>+18</Text> this week</Text>
            <View style={styles.scoreDivider} />
            <View style={styles.nextGoalRow}>
              <Ionicons name="radio-button-on" size={13} color={colors.accent} />
              <Text style={styles.nextGoal}>Next goal: 800 Advanced Tier</Text>
            </View>
          </View>
          <ScoreRing score={74} />
        </View>

        <View style={styles.workoutCard}>
          <View style={styles.cardHeader}> 
            <Ionicons name="barbell" size={17} color={colors.accent} />
            <Text style={styles.cardEyebrow}>Today's Workout</Text>
          </View>
          <Text style={styles.workoutTitle}>Push Strength Day</Text>
          <Text style={styles.cardMeta}>46 min · Chest / Shoulders / Triceps · 4 exercises</Text>

          <View style={styles.moveRow}>
            {workoutMoves.map((move) => (
              <View key={move.label} style={styles.movePill}>
                <Ionicons name={move.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.textPrimary} />
                <Text style={styles.moveLabel}>{move.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.aiNote}>
            <Ionicons name="sparkles" size={16} color="#7C7CFF" />
            <Text style={styles.aiText}>AI adjusted weight <Text style={styles.greenText}>+2.5kg</Text> based on your last session.</Text>
          </View>

          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push('/home/todays-workout' as Href)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Start Workout</Text>
          </Pressable>
        </View>

        <View style={styles.quickRow}>
          {quickTools.map((tool) => {
            const isActive = activeTool === tool.title;
            return (
              <Pressable
                key={tool.title}
                style={[styles.quickCard, isActive && styles.quickCardActive]}
                onPress={() => {
                  setActiveTool(tool.title);
                  router.push(tool.href as Href);
                }}
                accessibilityRole="button"
              >
                <View style={styles.quickIconWrap}>
                  <Ionicons name={tool.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.accent} />
                </View>
                <Text style={styles.quickTitle}>{tool.title}</Text>
                <View style={styles.quickViewRow}>
                  <Text style={styles.quickView}>View</Text>
                  <Ionicons name="chevron-forward" size={10} color={colors.accent} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.recoveryCard}>
          <View style={styles.recoveryCopy}>
            <View style={styles.cardHeader}>
              <Ionicons name="accessibility" size={18} color={colors.accent} />
              <View>
                <Text style={styles.sectionTitle}>Recovery Map</Text>
                <Text style={styles.sectionSubtitle}>Train smart today</Text>
              </View>
            </View>
          </View>
          <View style={styles.bodyMapWrap}>
            <ImagePlaceholder label="Body Image" />
          </View>
          <View style={styles.recoveryLegend}>
            {recoveryMarkers.map((marker) => (
              <View key={marker.label} style={styles.markerRow}>
                <View style={[styles.markerDot, getMarkerStyle(marker.status)]} />
                <Text style={styles.markerLabel}>{marker.label}</Text>
              </View>
            ))}
            <Pressable
              style={styles.muscleExplorerLink}
              onPress={() => router.push('/home/recovery-map' as Href)}
              accessibilityRole="button"
            >
              <Text style={styles.linkText}>View Recovery Map</Text>
              <Ionicons name="chevron-forward" size={10} color={colors.accent} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}


function getMarkerStyle(status: string) {
  if (status === 'ready') {
    return styles.marker_ready;
  }

  if (status === 'tired') {
    return styles.marker_tired;
  }

  return styles.marker_partial;
}

function LevelPill() {
  return (
    <View style={styles.levelPill}>
      <Text style={styles.levelText}>LEVEL 24</Text>
    </View>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radiusValue = 31;
  const circumference = 2 * Math.PI * radiusValue;
  const progress = circumference * (1 - score / 100);

  return (
    <View style={styles.ringWrap}>
      <Svg width={92} height={92} viewBox="0 0 92 92">
        {Array.from({ length: 28 }).map((_, index) => (
          <Line
            key={index}
            x1="46"
            y1="5"
            x2="46"
            y2="7"
            stroke={colors.accentLight}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.82"
            transform={`rotate(${(index / 28) * 360} 46 46)`}
          />
        ))}
        <Circle cx="46" cy="46" r="31" stroke="rgba(168,176,166,0.35)" strokeWidth="7" fill="rgba(13,13,13,0.24)" />
        <Circle
          cx="46"
          cy="46"
          r={radiusValue}
          stroke={colors.accent}
          strokeWidth="7"
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress}
          transform="rotate(-90 46 46)"
        />
      </Svg>
      <Text style={styles.ringOne}>1</Text>
    </View>
  );
}

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <View style={styles.imagePlaceholder}>
      <Ionicons name="image-outline" size={26} color={colors.accent} />
      <Text style={styles.imagePlaceholderText}>{label}</Text>
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
    color: colors.textSecondary,
    fontSize: fontSize.caption,
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
    includeFontPadding: false,
  },
  scoreCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 136,
    padding: spacing.lg,
  },
  scoreCopy: {
    flex: 1,
    minWidth: 0,
  },
  scoreValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 56,
    includeFontPadding: false,
    lineHeight: 56,
  },
  scoreLabel: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
    includeFontPadding: false,
  },
  scoreDetail: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  greenText: {
    color: colors.accent,
    fontWeight: '900',
  },
  scoreDivider: {
    backgroundColor: 'rgba(168,176,166,0.22)',
    height: 1,
    marginTop: spacing.sm,
    width: '92%',
  },
  nextGoalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  nextGoal: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 11,
  },
  ringWrap: {
    alignItems: 'center',
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  ringOne: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 38,
    includeFontPadding: false,
    lineHeight: 40,
    position: 'absolute',
    transform: [{ skewX: '-10deg' }],
  },
  workoutCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cardEyebrow: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  workoutTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.heading,
    fontWeight: '900',
  },
  cardMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
  },
  moveRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  movePill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 38,
    padding: spacing.xs,
  },
  moveLabel: {
    color: colors.textPrimary,
    fontSize: 7,
    fontWeight: '800',
    lineHeight: 8,
    textAlign: 'center',
  },
  aiNote: {
    alignItems: 'center',
    backgroundColor: '#242426',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  aiText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 74,
    padding: spacing.sm,
  },
  quickCardActive: {
    borderColor: 'rgba(106,192,6,0.55)',
  },
  quickIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(106,192,6,0.14)',
    borderRadius: radius.sm,
    height: 30,
    justifyContent: 'center',
    width: 34,
  },
  quickTitle: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 12,
    textAlign: 'center',
  },
  quickViewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  quickView: {
    color: colors.textPrimary,
    fontSize: 8,
    fontWeight: '800',
  },
  recoveryCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 138,
    padding: spacing.lg,
  },
  recoveryCopy: {
    alignSelf: 'flex-start',
    flex: 0.82,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  bodyMapWrap: {
    alignItems: 'center',
    flex: 0.85,
    justifyContent: 'center',
  },
  imagePlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    height: 112,
    justifyContent: 'center',
    width: 84,
  },
  imagePlaceholderText: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  recoveryLegend: {
    flex: 1,
    gap: spacing.sm,
  },
  markerRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  markerDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  marker_partial: {
    backgroundColor: colors.accentLight,
  },
  marker_ready: {
    backgroundColor: colors.accent,
  },
  marker_tired: {
    backgroundColor: colors.levelGlow,
  },
  markerLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 9,
  },
  muscleExplorerLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  linkText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '800',
  },
});
