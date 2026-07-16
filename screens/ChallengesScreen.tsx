import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line } from 'react-native-svg';
import { AppScreen } from '../components/AppScreen';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

const challengeCards = [
  {
    category: 'Strength',
    difficulty: 'Tier II',
    icon: 'barbell',
    title: 'Pec-Static Tier II',
    subtitle: 'Complete 50 Barbell Bench Press.',
    progress: 25,
    target: 50,
    unit: 'REPS',
    reward: '+20 FITCOINS',
    daysLeft: '3 days left',
  },
  {
    category: 'Cardio',
    difficulty: 'Tier I',
    icon: 'walk',
    title: 'Cardio Like You Mean It Tier I',
    subtitle: 'Do Any Cardio for 1 Hour',
    progress: 30,
    target: 60,
    unit: 'MINUTES',
    reward: '+10 FITCOINS',
    daysLeft: 'Today',
  },
  {
    category: 'Strength',
    difficulty: 'Tier I',
    icon: 'body',
    title: 'Shoulder Control Tier I',
    subtitle: 'Finish 35 controlled shoulder reps.',
    progress: 18,
    target: 35,
    unit: 'REPS',
    reward: '+12 FITCOINS',
    daysLeft: '5 days left',
  },
];

const challengeFilters = ['All', 'Strength', 'Cardio'] as const;
type ChallengeFilter = (typeof challengeFilters)[number];

const leaders = [
  { initials: 'AR', score: 1530, rank: 1 },
  { initials: 'MJ', score: 1364, rank: 2 },
  { initials: 'KL', score: 1297, rank: 3 },
];

export function ChallengesScreen() {
  const [selectedChallenge, setSelectedChallenge] = React.useState(challengeCards[0].title);
  const [challengeFilter, setChallengeFilter] = React.useState<ChallengeFilter>('All');
  const [showStore, setShowStore] = React.useState(false);

  const filteredChallenges = challengeFilter === 'All'
    ? challengeCards
    : challengeCards.filter((challenge) => challenge.category === challengeFilter);
  const selectedChallengeData = challengeCards.find(
    (challenge) => challenge.title === selectedChallenge,
  ) ?? challengeCards[0];
  const selectedProgress = Math.round(
    (selectedChallengeData.progress / selectedChallengeData.target) * 100,
  );

  return (
    <AppScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.levelCard}>
          <LevelRing />
          <View style={styles.levelCopy}>
            <Text style={styles.levelTitle}>LEVEL 24</Text>
            <Text style={styles.xpText}>XP: 800 / 1200</Text>
            <View style={styles.xpTrack}>
              <View style={styles.xpFill} />
            </View>
            <Text style={styles.nextXp}>400 XP TO LEVEL 25</Text>
            <View style={styles.streakRow}>
              <View>
                <Text style={styles.streakLabel}>DAILY STREAK:</Text>
                <Text style={styles.streakValue}>9 DAYS</Text>
              </View>
              <Ionicons name="flame" size={34} color={colors.warning} />
            </View>
          </View>
        </View>

        <View style={styles.currencyRow}>
          <CurrencyPill icon="logo-usd" label="FITCOINS" value="756" />
          <CurrencyPill icon="ribbon" label="BADGES" value="25" />
        </View>

        <View style={styles.challengeSection}>
          <SectionHeader icon="trophy" title="On Going Challenges" />

          <View style={styles.filterRow}>
            {challengeFilters.map((filter) => {
              const isActive = filter === challengeFilter;
              return (
                <Pressable
                  key={filter}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setChallengeFilter(filter)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                    {filter}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.featuredChallenge}>
            <View style={styles.featuredTopRow}>
              <View style={styles.featuredIcon}>
                <Ionicons
                  name={selectedChallengeData.icon as keyof typeof Ionicons.glyphMap}
                  size={22}
                  color={colors.accent}
                />
              </View>
              <View style={styles.featuredCopy}>
                <Text style={styles.featuredLabel}>SELECTED MISSION</Text>
                <Text style={styles.featuredTitle} numberOfLines={1}>{selectedChallengeData.title}</Text>
              </View>
              <Text style={styles.featuredPercent}>{selectedProgress}%</Text>
            </View>
            <View style={styles.featuredTrack}>
              <View style={[styles.featuredFill, { width: `${selectedProgress}%` }]} />
            </View>
            <View style={styles.featuredFooter}>
              <Text style={styles.featuredMeta}>{selectedChallengeData.daysLeft} · {selectedChallengeData.difficulty}</Text>
              <Pressable style={styles.continueButton} accessibilityRole="button">
                <Text style={styles.continueButtonText}>Continue</Text>
              </Pressable>
            </View>
          </View>

          {filteredChallenges.map((challenge) => (
            <Pressable
              key={challenge.title}
              style={[
                styles.challengeItem,
                selectedChallenge === challenge.title && styles.challengeItemActive,
              ]}
              onPress={() => setSelectedChallenge(challenge.title)}
              accessibilityRole="button"
            >
              <View style={styles.challengeIconWrap}>
                <Ionicons name={challenge.icon as keyof typeof Ionicons.glyphMap} size={35} color={colors.accent} />
              </View>
              <View style={styles.challengeContent}>
                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <Text style={styles.challengeSubtitle}>{challenge.subtitle}</Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round((challenge.progress / challenge.target) * 100)}%` },
                    ]}
                  />
                </View>
                <View style={styles.challengeFooter}>
                  <Text style={styles.challengeProgress}>{challenge.progress}/{challenge.target} {challenge.unit}</Text>
                  <Text style={styles.rewardText}>{challenge.reward}</Text>
                </View>
              </View>
            </Pressable>
          ))}

          {showStore ? (
            <View style={styles.storePreview}>
              <View style={styles.storePreviewIcon}>
                <Ionicons name="flash" size={18} color={colors.background} />
              </View>
              <View style={styles.storePreviewCopy}>
                <Text style={styles.storePreviewTitle}>Featured Boost</Text>
                <Text style={styles.storePreviewDetail}>Double XP token · 120 Fitcoins</Text>
              </View>
            </View>
          ) : null}

          <Pressable
            style={[styles.storeButton, showStore && styles.storeButtonActive]}
            onPress={() => setShowStore((value) => !value)}
            accessibilityRole="button"
          >
            <Text style={styles.storeButtonText}>{showStore ? 'FIT STORE READY' : 'BROWSE FIT STORE'}</Text>
          </Pressable>
        </View>

        <View style={styles.leaderboardCard}>
          <SectionHeader icon="podium" title="Community Leaderboards" />
          <View style={styles.leadersRow}>
            {leaders.map((leader) => {
              const isFirst = leader.rank === 1;
              return (
                <View key={leader.initials} style={[styles.leader, isFirst && styles.leaderFirst]}>
                  <View style={[styles.avatarBubble, isFirst && styles.avatarBubbleFirst]}>
                    <Text style={[styles.avatarInitials, isFirst && styles.avatarInitialsFirst]}>
                      {leader.initials}
                    </Text>
                    <View style={[styles.rankBadge, isFirst && styles.rankBadgeFirst]}>
                      <Text style={styles.rankText}>{leader.rank}</Text>
                    </View>
                  </View>
                  <Text style={styles.scoreText}>Score: {leader.score}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.userRank}>You: Rank 36, Score 742</Text>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function LevelRing() {
  const radiusValue = 48;
  const circumference = 2 * Math.PI * radiusValue;
  const progress = circumference * 0.22;

  return (
    <View style={styles.levelRingWrap}>
      <Svg width={132} height={132} viewBox="0 0 132 132">
        {Array.from({ length: 40 }).map((_, index) => (
          <Line
            key={index}
            x1="66"
            y1="8"
            x2="66"
            y2="10"
            stroke={colors.accentLight}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.85"
            transform={`rotate(${(index / 40) * 360} 66 66)`}
          />
        ))}
        <Circle cx="66" cy="66" r="48" stroke="rgba(168,176,166,0.35)" strokeWidth="9" fill="rgba(13,13,13,0.25)" />
        <Circle
          cx="66"
          cy="66"
          r={radiusValue}
          stroke={colors.accent}
          strokeWidth="9"
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress}
          transform="rotate(-90 66 66)"
        />
        <Circle cx="101" cy="33" r="6" fill={colors.textPrimary} />
      </Svg>
      <Text style={styles.levelInsideLabel}>LEVEL</Text>
      <Text style={styles.levelInsideNumber}>24</Text>
    </View>
  );
}

function CurrencyPill({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.currencyPill}>
      <View style={styles.currencyIcon}>
        <Ionicons name={icon} size={22} color={colors.background} />
      </View>
      <Text style={styles.currencyLabel}>{label}: <Text style={styles.currencyValue}>{value}</Text></Text>
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: 118,
  },
  levelCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 176,
    padding: spacing.lg,
  },
  levelRingWrap: {
    alignItems: 'center',
    height: 132,
    justifyContent: 'center',
    width: 132,
  },
  levelInsideLabel: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
    includeFontPadding: false,
    position: 'absolute',
    top: 45,
  },
  levelInsideNumber: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 48,
    includeFontPadding: false,
    lineHeight: 50,
    position: 'absolute',
    top: 60,
  },
  levelCopy: {
    flex: 1,
    minWidth: 0,
  },
  levelTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 30,
    includeFontPadding: false,
  },
  xpText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  xpTrack: {
    backgroundColor: 'rgba(168,176,166,0.5)',
    borderRadius: radius.pill,
    height: 6,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  xpFill: {
    backgroundColor: colors.accent,
    height: '100%',
    width: '66%',
  },
  nextXp: {
    color: colors.textSecondary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
    includeFontPadding: false,
    marginTop: spacing.sm,
  },
  streakRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  streakLabel: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 26,
    includeFontPadding: false,
  },
  streakValue: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: 26,
    includeFontPadding: false,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  currencyPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  currencyIcon: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  currencyLabel: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 23,
    includeFontPadding: false,
  },
  currencyValue: {
    color: colors.accent,
  },
  challengeSection: {
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
  sectionTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterPill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  filterPillActive: {
    backgroundColor: 'rgba(106,192,6,0.16)',
    borderColor: colors.accent,
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  filterTextActive: {
    color: colors.accent,
  },
  featuredChallenge: {
    backgroundColor: colors.surfaceAlt,
    borderColor: 'rgba(106,192,6,0.28)',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  featuredTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  featuredIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(106,192,6,0.14)',
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  featuredCopy: {
    flex: 1,
    minWidth: 0,
  },
  featuredLabel: {
    color: colors.accent,
    fontFamily: fontFamily.display,
    fontSize: fontSize.caption,
    includeFontPadding: false,
  },
  featuredTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  featuredPercent: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 28,
    includeFontPadding: false,
  },
  featuredTrack: {
    backgroundColor: 'rgba(168,176,166,0.32)',
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
  },
  featuredFill: {
    backgroundColor: colors.levelGlow,
    height: '100%',
  },
  featuredFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  featuredMeta: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  continueButton: {
    borderColor: colors.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  continueButtonText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  challengeItem: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  challengeItemActive: {
    backgroundColor: 'rgba(106,192,6,0.06)',
    borderColor: 'rgba(106,192,6,0.35)',
  },
  challengeIconWrap: {
    alignItems: 'center',
    width: 54,
  },
  challengeContent: {
    flex: 1,
    minWidth: 0,
  },
  challengeTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  challengeSubtitle: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  progressTrack: {
    backgroundColor: 'rgba(168,176,166,0.7)',
    borderRadius: radius.pill,
    height: 5,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.accent,
    height: '100%',
  },
  challengeFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  challengeProgress: {
    color: colors.textSecondary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
    includeFontPadding: false,
  },
  rewardText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
  },
  storePreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(184,255,61,0.1)',
    borderColor: 'rgba(184,255,61,0.25)',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  storePreviewIcon: {
    alignItems: 'center',
    backgroundColor: colors.levelGlow,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  storePreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  storePreviewTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '900',
  },
  storePreviewDetail: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  storeButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  storeButtonActive: {
    backgroundColor: colors.levelGlow,
  },
  storeButtonText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.heading,
    includeFontPadding: false,
  },
  leaderboardCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  leadersRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    minHeight: 74,
  },
  leader: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  leaderFirst: {
    flex: 1.25,
  },
  avatarBubble: {
    alignItems: 'center',
    backgroundColor: '#7C6348',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
  },
  avatarBubbleFirst: {
    height: 58,
    width: 58,
  },
  avatarInitials: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  avatarInitialsFirst: {
    fontSize: 15,
  },
  rankBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    bottom: -3,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: -3,
    width: 16,
  },
  rankBadgeFirst: {
    bottom: -2,
    height: 18,
    right: 0,
    width: 18,
  },
  rankText: {
    color: colors.textPrimary,
    fontSize: 8,
    fontWeight: '900',
  },
  scoreText: {
    color: colors.textSecondary,
    fontSize: 8,
  },
  userRank: {
    color: colors.textSecondary,
    fontSize: 9,
    textAlign: 'center',
  },
});
