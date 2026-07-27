import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { AppScreen } from '../components/AppScreen';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

export type FeatureDetailVariant =
  | 'home-todays-workout'
  | 'home-muscle-explorer'
  | 'home-scan-meal'
  | 'home-form-guide'
  | 'home-recovery-map'
  | 'progress-activity'
  | 'progress-body'
  | 'progress-achievements'
  | 'progress-weight'
  | 'progress-xp'
  | 'progress-streak'
  | 'challenges-detail'
  | 'challenges-store'
  | 'challenges-badges'
  | 'challenges-leaderboards'
  | 'challenges-reward';

interface DetailMetric {
  label: string;
  value: string;
}

interface DetailRow {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface DetailSection {
  title: string;
  rows: DetailRow[];
}

interface DetailAction {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'green' | 'orange' | 'red';
  href?: Href;
}

interface DetailContent {
  area: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  summary: string;
  metrics: DetailMetric[];
  primaryAction?: DetailAction;
  sections: DetailSection[];
  actions: DetailAction[];
}

const DETAIL_CONTENT: Record<FeatureDetailVariant, DetailContent> = {
  'home-todays-workout': {
    area: 'HOME',
    title: "Today's Workout",
    subtitle: 'Push Strength Day',
    icon: 'barbell',
    summary:
      'A guided push session built around chest, shoulders, and triceps with smart weight guidance from the last logged workout.',
    metrics: [
      { label: 'Duration', value: '46m' },
      { label: 'Focus', value: 'Push' },
      { label: 'Exercises', value: '4' },
    ],
    primaryAction: {
      icon: 'play-circle',
      title: 'Start Workout',
      subtitle: 'Open the tracker with sets, reps, and kg ready.',
      href: '/workout?preset=push-strength-day' as Href,
    },
    sections: [
      {
        title: 'Workout Flow',
        rows: [
          { icon: 'barbell-outline', label: 'Bench Press', value: '4 sets x 8-10 reps' },
          { icon: 'body-outline', label: 'Shoulder Press', value: '3 sets x 10 reps' },
          { icon: 'git-branch-outline', label: 'Cable Fly', value: '3 sets x 12 reps' },
          { icon: 'accessibility-outline', label: 'Triceps Pushdown', value: '3 sets x 12 reps' },
        ],
      },
      {
        title: 'Session Notes',
        rows: [
          { icon: 'sparkles-outline', label: 'AI Adjustment', value: '+2.5kg from last session' },
          { icon: 'timer-outline', label: 'Rest Target', value: '75-90 seconds' },
          { icon: 'flag-outline', label: 'Goal', value: 'Hit clean reps before load' },
        ],
      },
    ],
    actions: [
      { icon: 'swap-horizontal-outline', title: 'Swap Exercises', subtitle: 'Replace movements based on equipment or soreness.', href: '/workout' as Href },
    ],
  },
  'home-muscle-explorer': {
    area: 'HOME',
    title: 'Muscle Explorer',
    subtitle: 'Body map and targeted training insight.',
    icon: 'body',
    summary:
      'Explore which muscle groups are recovered, tired, or ready to train before choosing the next workout.',
    metrics: [
      { label: 'Ready', value: 'Legs' },
      { label: 'Partial', value: 'Chest' },
      { label: 'Tired', value: 'Shoulders' },
    ],
    sections: [
      {
        title: 'Current Muscle Status',
        rows: [
          { icon: 'radio-button-on-outline', label: 'Chest', value: 'Partial recovery' },
          { icon: 'checkmark-circle-outline', label: 'Legs', value: 'Recovered' },
          { icon: 'alert-circle-outline', label: 'Shoulders', value: 'Needs lighter load' },
        ],
      },
      {
        title: 'Suggested Training',
        rows: [
          { icon: 'walk-outline', label: 'Best Option', value: 'Lower body or mobility' },
          { icon: 'fitness-outline', label: 'Avoid', value: 'Heavy overhead pressing' },
          { icon: 'refresh-outline', label: 'Recovery Window', value: '24 hours' },
        ],
      },
    ],
    actions: [
      { icon: 'scan-outline', title: 'Open Body Map', subtitle: 'Inspect front and back muscle groups.' },
      { icon: 'barbell-outline', title: 'Build Smart Workout', subtitle: 'Create a session around recovered areas.', href: '/workout' as Href },
    ],
  },
  'home-scan-meal': {
    area: 'HOME',
    title: 'Scan Meal',
    subtitle: 'Fast nutrition logging from the home screen.',
    icon: 'camera',
    summary:
      'Capture a meal, search a food, or scan a barcode so calories and macros can be added to today quickly.',
    metrics: [
      { label: 'Today', value: '982' },
      { label: 'Goal', value: '1600' },
      { label: 'Left', value: '618' },
    ],
    sections: [
      {
        title: 'Capture Options',
        rows: [
          { icon: 'barcode-outline', label: 'Barcode', value: 'Packaged food lookup' },
          { icon: 'search-outline', label: 'Food Search', value: 'Manual food database search' },
          { icon: 'sparkles-outline', label: 'AI Estimate', value: 'Meal suggestion support later' },
        ],
      },
      {
        title: 'Default Save Target',
        rows: [
          { icon: 'sunny-outline', label: 'Meal', value: 'Lunch' },
          { icon: 'restaurant-outline', label: 'Macros', value: 'Protein, carbs, fats' },
          { icon: 'water-outline', label: 'Hydration', value: 'Optional quick add' },
        ],
      },
    ],
    actions: [
      { icon: 'camera-outline', title: 'Open Camera Scanner', subtitle: 'Use camera capture once nutrition backend is connected.', href: '/nutrition' as Href },
      { icon: 'add-circle-outline', title: 'Add Food Manually', subtitle: 'Log a food item without scanning.', href: '/nutrition' as Href },
    ],
  },
  'home-form-guide': {
    area: 'HOME',
    title: 'Watch Form Guide',
    subtitle: 'Technique videos and coaching cues.',
    icon: 'videocam',
    summary:
      'Review exercise form before training so users understand setup, tempo, and common mistakes.',
    metrics: [
      { label: 'Guides', value: '12' },
      { label: 'Focus', value: 'Push' },
      { label: 'Level', value: 'Tier I' },
    ],
    sections: [
      {
        title: 'Recommended Guides',
        rows: [
          { icon: 'play-outline', label: 'Bench Press', value: 'Setup, arch, and bar path' },
          { icon: 'play-outline', label: 'Shoulder Press', value: 'Brace and lockout cues' },
          { icon: 'play-outline', label: 'Cable Fly', value: 'Chest tension and control' },
        ],
      },
      {
        title: 'Form Checklist',
        rows: [
          { icon: 'checkmark-done-outline', label: 'Warm Up', value: '2 ramp sets before working sets' },
          { icon: 'speedometer-outline', label: 'Tempo', value: 'Controlled eccentric' },
          { icon: 'shield-checkmark-outline', label: 'Safety', value: 'Stop before painful reps' },
        ],
      },
    ],
    actions: [
      { icon: 'videocam-outline', title: 'Open Video Library', subtitle: 'Browse tutorials by movement pattern.' },
      { icon: 'bookmark-outline', title: 'Save Guide', subtitle: 'Pin this guide to the next workout.' },
    ],
  },
  'home-recovery-map': {
    area: 'HOME',
    title: 'Recovery Map',
    subtitle: 'Readiness before the next session.',
    icon: 'accessibility',
    summary:
      'A quick readiness view that helps users train hard while avoiding overworked areas.',
    metrics: [
      { label: 'Score', value: '78%' },
      { label: 'Ready', value: '2' },
      { label: 'Watch', value: '1' },
    ],
    sections: [
      {
        title: 'Recovery Summary',
        rows: [
          { icon: 'leaf-outline', label: 'Legs', value: 'Recovered' },
          { icon: 'pulse-outline', label: 'Chest', value: 'Partial' },
          { icon: 'warning-outline', label: 'Shoulders', value: 'Tired' },
        ],
      },
      {
        title: 'Smart Training Advice',
        rows: [
          { icon: 'barbell-outline', label: 'Recommended', value: 'Lower body strength' },
          { icon: 'bed-outline', label: 'Recovery Work', value: 'Mobility and light cardio' },
          { icon: 'calendar-outline', label: 'Next Push Day', value: 'Tomorrow' },
        ],
      },
    ],
    actions: [
      { icon: 'body-outline', title: 'Inspect Muscle Map', subtitle: 'Open the full front and back body view.' },
      { icon: 'refresh-circle-outline', title: 'Recalculate Recovery', subtitle: 'Update readiness after a workout is logged.' },
    ],
  },
  'progress-activity': {
    area: 'PROGRESS',
    title: 'Weekly Activity',
    subtitle: 'Training minutes, frequency, and consistency.',
    icon: 'bar-chart',
    summary:
      'A deeper view of weekly and monthly activity, including workout count, total time, and goal completion.',
    metrics: [
      { label: 'Workouts', value: '5' },
      { label: 'Time', value: '6H 18M' },
      { label: 'Goal', value: '92%' },
    ],
    sections: [
      {
        title: 'Activity Breakdown',
        rows: [
          { icon: 'calendar-outline', label: 'Best Day', value: 'Thursday - 84m active' },
          { icon: 'trending-up-outline', label: 'Trend', value: '+12% from last week' },
          { icon: 'time-outline', label: 'Average Session', value: '75 minutes' },
        ],
      },
      {
        title: 'Next Targets',
        rows: [
          { icon: 'flag-outline', label: 'Workout Goal', value: '6 workouts this week' },
          { icon: 'locate-outline', label: 'Goal Met Target', value: '95%' },
          { icon: 'flame-outline', label: 'Momentum', value: 'Keep 3 active days in a row' },
        ],
      },
    ],
    actions: [
      { icon: 'analytics-outline', title: 'View Full Trend', subtitle: 'Compare week, month, and lifetime activity.', href: '/progress/activity' as Href },
      { icon: 'calendar-number-outline', title: 'Adjust Weekly Goal', subtitle: 'Change target workouts and active minutes.' },
    ],
  },
  'progress-body': {
    area: 'PROGRESS',
    title: 'Body Progress',
    subtitle: 'Primary and secondary muscle development.',
    icon: 'body',
    summary:
      'Track visible body progress, muscle focus history, and recovery balance across front and back views.',
    metrics: [
      { label: 'Primary', value: 'Chest' },
      { label: 'Secondary', value: 'Legs' },
      { label: 'Balance', value: 'Good' },
    ],
    sections: [
      {
        title: 'Current Focus',
        rows: [
          { icon: 'radio-button-on-outline', label: 'Primary Movers', value: 'Chest, shoulders, triceps' },
          { icon: 'ellipse-outline', label: 'Secondary Movers', value: 'Legs and core' },
          { icon: 'image-outline', label: 'Progress Photos', value: 'Placeholder until assets are ready' },
        ],
      },
      {
        title: 'Tracking Plan',
        rows: [
          { icon: 'camera-outline', label: 'Photo Check-In', value: 'Every 2 weeks' },
          { icon: 'scale-outline', label: 'Body Metrics', value: 'Weight and measurements' },
          { icon: 'bar-chart-outline', label: 'Comparison', value: 'Front, side, and back' },
        ],
      },
    ],
    actions: [
      { icon: 'camera-outline', title: 'Add Progress Photo', subtitle: 'Upload front, side, and back photos.' },
      { icon: 'body-outline', title: 'Open Body Map', subtitle: 'Inspect highlighted muscle progress.' },
    ],
  },
  'progress-achievements': {
    area: 'PROGRESS',
    title: 'Achievements',
    subtitle: 'Badges, milestones, and unlocked wins.',
    icon: 'trophy',
    summary:
      'A complete achievement library that gives users a reason to keep training and leveling up.',
    metrics: [
      { label: 'Unlocked', value: '25' },
      { label: 'New', value: '3' },
      { label: 'Next', value: 'PR' },
    ],
    sections: [
      {
        title: 'Recent Unlocks',
        rows: [
          { icon: 'shield-checkmark-outline', label: '10 Workouts', value: 'Keep showing up' },
          { icon: 'star-outline', label: 'New PR', value: 'Personal best' },
          { icon: 'layers-outline', label: 'Level Up', value: 'Reached level 24' },
        ],
      },
      {
        title: 'Next Milestones',
        rows: [
          { icon: 'flame-outline', label: '14 Day Streak', value: '5 days away' },
          { icon: 'barbell-outline', label: 'Strength Tier II', value: 'Complete 2 more push days' },
          { icon: 'nutrition-outline', label: 'Macro Week', value: 'Log food 7 days' },
        ],
      },
    ],
    actions: [
      { icon: 'grid-outline', title: 'View Badge Library', subtitle: 'Browse all locked and unlocked achievements.' },
      { icon: 'share-outline', title: 'Share Achievement', subtitle: 'Prepare a share card for recent wins.' },
    ],
  },
  'progress-weight': {
    area: 'PROGRESS',
    title: 'Weight Detail',
    subtitle: 'Weight movement and body metric trend.',
    icon: 'scale',
    summary:
      'A focused view for weight changes, weekly comparison, and long-term progress toward the user goal.',
    metrics: [
      { label: 'Now', value: '68.4kg' },
      { label: 'Week', value: '-0.8kg' },
      { label: 'Trend', value: 'Down' },
    ],
    sections: [
      {
        title: 'Weight Trend',
        rows: [
          { icon: 'calendar-outline', label: 'Last Check-In', value: 'Today' },
          { icon: 'trending-down-outline', label: 'Weekly Change', value: '-0.8kg' },
          { icon: 'flag-outline', label: 'Goal Range', value: '66-70kg' },
        ],
      },
      {
        title: 'Body Metrics',
        rows: [
          { icon: 'resize-outline', label: 'Height', value: '178 cm' },
          { icon: 'fitness-outline', label: 'Goal', value: 'Build lean strength' },
          { icon: 'analytics-outline', label: 'Context', value: 'Weight plus performance' },
        ],
      },
    ],
    actions: [
      { icon: 'add-circle-outline', title: 'Log Weight', subtitle: 'Add a new scale check-in.' },
      { icon: 'analytics-outline', title: 'Compare Trend', subtitle: 'View weight against workouts and nutrition.' },
    ],
  },
  'progress-xp': {
    area: 'PROGRESS',
    title: 'XP Earned',
    subtitle: 'Level progress and reward momentum.',
    icon: 'sparkles',
    summary:
      'Track where XP came from and what the user needs to do to reach the next level.',
    metrics: [
      { label: 'Earned', value: '1820' },
      { label: 'Week', value: '+320' },
      { label: 'Next', value: '400' },
    ],
    sections: [
      {
        title: 'XP Sources',
        rows: [
          { icon: 'barbell-outline', label: 'Workouts', value: '+900 XP' },
          { icon: 'nutrition-outline', label: 'Nutrition Logs', value: '+420 XP' },
          { icon: 'trophy-outline', label: 'Challenges', value: '+500 XP' },
        ],
      },
      {
        title: 'Next Level Plan',
        rows: [
          { icon: 'flag-outline', label: 'Level 25', value: '400 XP remaining' },
          { icon: 'flame-outline', label: 'Fastest Path', value: '2 workouts + 1 challenge' },
          { icon: 'ribbon-outline', label: 'Reward', value: 'New badge unlock' },
        ],
      },
    ],
    actions: [
      { icon: 'trophy-outline', title: 'Find XP Challenges', subtitle: 'Open challenge tasks that pay more XP.', href: '/challenges' as Href },
      { icon: 'layers-outline', title: 'View Level Rewards', subtitle: 'See what unlocks at upcoming levels.' },
    ],
  },
  'progress-streak': {
    area: 'PROGRESS',
    title: 'Streak Detail',
    subtitle: 'Consistency streak and habit tracking.',
    icon: 'flame',
    summary:
      'A streak view for daily activity, missed-day protection, and motivational streak goals.',
    metrics: [
      { label: 'Current', value: '9d' },
      { label: 'Best', value: '14d' },
      { label: 'Safe', value: '1' },
    ],
    sections: [
      {
        title: 'Streak Status',
        rows: [
          { icon: 'flame-outline', label: 'Current Streak', value: '9 days' },
          { icon: 'medal-outline', label: 'Best Streak', value: '14 days' },
          { icon: 'shield-outline', label: 'Streak Save', value: '1 available' },
        ],
      },
      {
        title: 'Today To Keep Streak',
        rows: [
          { icon: 'barbell-outline', label: 'Workout', value: 'Any logged session' },
          { icon: 'walk-outline', label: 'Cardio', value: '15 active minutes' },
          { icon: 'nutrition-outline', label: 'Nutrition', value: 'Log all meals' },
        ],
      },
    ],
    actions: [
      { icon: 'notifications-outline', title: 'Set Streak Reminder', subtitle: 'Add a daily check-in reminder.' },
      { icon: 'calendar-outline', title: 'View Streak Calendar', subtitle: 'Review active and missed days.' },
    ],
  },
  'challenges-detail': {
    area: 'CHALLENGES',
    title: 'Challenge Detail',
    subtitle: 'Pec-Static Tier II',
    icon: 'trophy',
    summary:
      'A dedicated challenge screen for rules, progress, rewards, and the next action required to finish.',
    metrics: [
      { label: 'Progress', value: '25/50' },
      { label: 'Reward', value: '+20' },
      { label: 'Left', value: '3d' },
    ],
    sections: [
      {
        title: 'Mission Rules',
        rows: [
          { icon: 'barbell-outline', label: 'Exercise', value: 'Barbell Bench Press' },
          { icon: 'repeat-outline', label: 'Target', value: '50 total reps' },
          { icon: 'shield-checkmark-outline', label: 'Quality', value: 'Only completed sets count' },
        ],
      },
      {
        title: 'Reward Path',
        rows: [
          { icon: 'logo-usd', label: 'FitCoins', value: '+20 on completion' },
          { icon: 'sparkles-outline', label: 'XP Bonus', value: '+80 XP' },
          { icon: 'ribbon-outline', label: 'Badge Credit', value: 'Strength challenge progress' },
        ],
      },
    ],
    actions: [
      { icon: 'play-circle-outline', title: 'Continue Challenge', subtitle: 'Start a workout that contributes to this mission.', href: '/workout' as Href },
      { icon: 'gift-outline', title: 'Preview Reward', subtitle: 'See the reward claim screen.', href: '/challenges/reward-claim' as Href },
    ],
  },
  'challenges-store': {
    area: 'CHALLENGES',
    title: 'FitCoin Store',
    subtitle: 'Spend earned coins on boosts and rewards.',
    icon: 'flash',
    summary:
      'The store gives FitCoins a purpose with boosters, cosmetics, and future premium-friendly rewards.',
    metrics: [
      { label: 'Balance', value: '756' },
      { label: 'Boosts', value: '4' },
      { label: 'Featured', value: '120' },
    ],
    sections: [
      {
        title: 'Featured Items',
        rows: [
          { icon: 'flash-outline', label: 'Double XP Token', value: '120 FitCoins' },
          { icon: 'shield-outline', label: 'Streak Save', value: '200 FitCoins' },
          { icon: 'color-palette-outline', label: 'Profile Badge Frame', value: '300 FitCoins' },
        ],
      },
      {
        title: 'Store Rules',
        rows: [
          { icon: 'wallet-outline', label: 'Earn', value: 'Complete challenges' },
          { icon: 'lock-open-outline', label: 'Unlocks', value: 'Some rewards need higher levels' },
          { icon: 'refresh-outline', label: 'Refresh', value: 'Weekly featured items' },
        ],
      },
    ],
    actions: [
      { icon: 'cart-outline', title: 'Buy Featured Boost', subtitle: 'Preview purchase confirmation.', href: '/challenges/reward-claim' as Href },
      { icon: 'receipt-outline', title: 'View Purchase History', subtitle: 'Review redeemed rewards.' },
    ],
  },
  'challenges-badges': {
    area: 'CHALLENGES',
    title: 'Badges',
    subtitle: 'Unlocked identity and milestone awards.',
    icon: 'ribbon',
    summary:
      'A badge collection screen for challenge identity, fitness milestones, and visible user progress.',
    metrics: [
      { label: 'Owned', value: '25' },
      { label: 'Rare', value: '4' },
      { label: 'Next', value: 'Tier II' },
    ],
    sections: [
      {
        title: 'Badge Collection',
        rows: [
          { icon: 'shield-checkmark-outline', label: 'Consistency Badge', value: 'Unlocked' },
          { icon: 'barbell-outline', label: 'Strength Builder', value: 'In progress' },
          { icon: 'flame-outline', label: 'Streak Badge', value: '9 of 14 days' },
        ],
      },
      {
        title: 'Badge Strategy',
        rows: [
          { icon: 'trophy-outline', label: 'Fastest Unlock', value: 'Complete Cardio Tier I' },
          { icon: 'star-outline', label: 'Rare Badge', value: 'New PR streak' },
          { icon: 'eye-outline', label: 'Profile Display', value: 'Choose top 3 badges' },
        ],
      },
    ],
    actions: [
      { icon: 'grid-outline', title: 'View Badge Grid', subtitle: 'Browse all locked and unlocked badges.' },
      { icon: 'person-circle-outline', title: 'Customize Display', subtitle: 'Choose badges shown on profile.' },
    ],
  },
  'challenges-leaderboards': {
    area: 'CHALLENGES',
    title: 'Leaderboards',
    subtitle: 'Community rank and weekly competition.',
    icon: 'podium',
    summary:
      'A competitive view for rank, score, top users, and weekly challenge standings.',
    metrics: [
      { label: 'Rank', value: '#36' },
      { label: 'Score', value: '742' },
      { label: 'Top', value: '1530' },
    ],
    sections: [
      {
        title: 'Top Community Scores',
        rows: [
          { icon: 'medal-outline', label: 'AR', value: '1530 points' },
          { icon: 'medal-outline', label: 'MJ', value: '1364 points' },
          { icon: 'medal-outline', label: 'KL', value: '1297 points' },
        ],
      },
      {
        title: 'Your Standing',
        rows: [
          { icon: 'person-outline', label: 'Current Rank', value: '#36' },
          { icon: 'trending-up-outline', label: 'To Next Rank', value: '58 points' },
          { icon: 'calendar-outline', label: 'Season Reset', value: 'Monday' },
        ],
      },
    ],
    actions: [
      { icon: 'people-outline', title: 'View Full Leaderboard', subtitle: 'Open community rankings.' },
      { icon: 'filter-outline', title: 'Change Division', subtitle: 'Switch between friends, local, and global.' },
    ],
  },
  'challenges-reward': {
    area: 'CHALLENGES',
    title: 'Reward Claim',
    subtitle: 'Confirm rewards from completed missions.',
    icon: 'gift',
    summary:
      'A reward confirmation screen for FitCoins, XP, badges, and booster unlocks after a challenge is completed.',
    metrics: [
      { label: 'FitCoins', value: '+20' },
      { label: 'XP', value: '+80' },
      { label: 'Badge', value: '1' },
    ],
    sections: [
      {
        title: 'Reward Breakdown',
        rows: [
          { icon: 'logo-usd', label: 'FitCoins', value: '+20 added to balance' },
          { icon: 'sparkles-outline', label: 'XP', value: '+80 toward level 25' },
          { icon: 'ribbon-outline', label: 'Badge Progress', value: 'Strength challenge credit' },
        ],
      },
      {
        title: 'After Claim',
        rows: [
          { icon: 'cart-outline', label: 'Store', value: 'Spend coins on boosts' },
          { icon: 'trophy-outline', label: 'Next Mission', value: 'Shoulder Control Tier I' },
          { icon: 'share-outline', label: 'Share', value: 'Optional win card' },
        ],
      },
    ],
    actions: [
      { icon: 'checkmark-circle-outline', title: 'Claim Reward', subtitle: 'Add earned rewards to the account.' },
      { icon: 'trophy-outline', title: 'Find Next Challenge', subtitle: 'Keep momentum with another mission.', href: '/challenges/challenge-detail' as Href },
    ],
  },
};

interface FeatureDetailScreenProps {
  variant: FeatureDetailVariant;
}

export function FeatureDetailScreen({ variant }: FeatureDetailScreenProps) {
  const router = useRouter();
  const content = DETAIL_CONTENT[variant];

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
          <Text style={styles.topLabel}>{content.area}</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name={content.icon} size={30} color={colors.accent} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{content.area}</Text>
            <Text
              allowFontScaling={false}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={1}
              style={styles.title}
            >
              {content.title}
            </Text>
            <Text style={styles.subtitle}>{content.subtitle}</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summary}>{content.summary}</Text>
          <View style={styles.metricsRow}>
            {content.metrics.map((metric) => (
              <View key={metric.label} style={styles.metricPill}>
                <Text
                  allowFontScaling={false}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  numberOfLines={1}
                  style={styles.metricValue}
                >
                  {metric.value}
                </Text>
                <Text numberOfLines={1} style={styles.metricLabel}>
                  {metric.label}
                </Text>
              </View>
            ))}
          </View>

          {content.primaryAction && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryActionButton,
                pressed && styles.pressed,
              ]}
              onPress={() =>
                content.primaryAction?.href
                  ? router.push(content.primaryAction.href as Href)
                  : undefined
              }
              accessibilityRole="button"
              accessibilityLabel={content.primaryAction.title}
            >
              <Ionicons
                name={content.primaryAction.icon}
                size={22}
                color={colors.background}
              />
              <View style={styles.primaryActionCopy}>
                <Text allowFontScaling={false} style={styles.primaryActionTitle}>
                  {content.primaryAction.title}
                </Text>
                <Text numberOfLines={1} style={styles.primaryActionSubtitle}>
                  {content.primaryAction.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.background} />
            </Pressable>
          )}
        </View>

        {content.sections.map((section) => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.rows}>
              {section.rows.map((row) => (
                <View key={`${section.title}-${row.label}`} style={styles.infoRow}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={row.icon} size={17} color={colors.accent} />
                  </View>
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowLabel}>
                      {row.label}
                    </Text>
                    <Text numberOfLines={2} style={styles.rowValue}>
                      {row.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.rows}>
            {content.actions.map((action) => (
              <Pressable
                key={action.title}
                style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                onPress={action.href ? () => router.push(action.href as Href) : undefined}
                accessibilityRole="button"
                accessibilityLabel={action.title}
              >
                <View
                  style={[
                    styles.actionIcon,
                    action.tone === 'orange' && styles.orangeIcon,
                    action.tone === 'red' && styles.redIcon,
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={20}
                    color={
                      action.tone === 'orange'
                        ? colors.warning
                        : action.tone === 'red'
                          ? colors.danger
                          : colors.accent
                    }
                  />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: 112,
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
    fontWeight: '900',
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
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
    lineHeight: 38,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricPill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 66,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  metricValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    width: '100%',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryActionCopy: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  primaryActionTitle: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 30,
    textAlign: 'center',
  },
  primaryActionSubtitle: {
    color: 'rgba(13, 13, 13, 0.72)',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
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
  rows: {
    gap: spacing.sm,
  },
  infoRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(106, 192, 6, 0.14)',
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  rowValue: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 70,
    padding: spacing.md,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(106, 192, 6, 0.14)',
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  orangeIcon: {
    backgroundColor: 'rgba(255, 107, 31, 0.14)',
  },
  redIcon: {
    backgroundColor: 'rgba(229, 75, 75, 0.14)',
  },
  actionCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  actionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.72,
  },
});
