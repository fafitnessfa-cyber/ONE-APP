import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppScreen } from '../components/AppScreen';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

type DetailVariant =
  | 'personal-information'
  | 'account-settings'
  | 'plan-subscription'
  | 'settings'
  | 'help-support';

interface InfoRow {
  label: string;
  value: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface ActionRow {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: 'green' | 'orange' | 'red';
}

interface ProfileDetailContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  summary: string;
  stats?: InfoRow[];
  sections: Array<{
    title: string;
    rows: InfoRow[];
  }>;
  actions: ActionRow[];
}

const DETAIL_CONTENT: Record<DetailVariant, ProfileDetailContent> = {
  'personal-information': {
    eyebrow: 'PROFILE',
    title: 'Personal Information',
    subtitle: 'Your body, goal, and training baseline.',
    icon: 'person',
    summary:
      'These details power workout difficulty, calorie estimates, progress tracking, and future AI recommendations.',
    stats: [
      { label: 'Level', value: '24' },
      { label: 'Tier', value: 'Builder I' },
      { label: 'Score', value: '742' },
    ],
    sections: [
      {
        title: 'Account Identity',
        rows: [
          { label: 'Display Name', value: 'User', icon: 'person-outline' },
          { label: 'Email', value: 'user@oneup.app', icon: 'mail-outline' },
          { label: 'Phone', value: '+1 555 010 2488', icon: 'call-outline' },
        ],
      },
      {
        title: 'Fitness Profile',
        rows: [
          { label: 'Age', value: '34', icon: 'calendar-outline' },
          { label: 'Height', value: '178 cm', icon: 'resize-outline' },
          { label: 'Weight', value: '68.4 kg', icon: 'scale-outline' },
          { label: 'Primary Goal', value: 'Build lean strength', icon: 'flag-outline' },
        ],
      },
    ],
    actions: [
      {
        title: 'Edit Personal Details',
        subtitle: 'Update identity, body metrics, and training goal.',
        icon: 'create-outline',
      },
      {
        title: 'Update Profile Photo',
        subtitle: 'Replace the avatar used across ONE UP.',
        icon: 'camera-outline',
      },
    ],
  },
  'account-settings': {
    eyebrow: 'SECURITY',
    title: 'Account Settings',
    subtitle: 'Login, privacy, and account protection.',
    icon: 'shield-checkmark',
    summary:
      'Keep the account secure with password recovery, privacy controls, and connected sign-in options.',
    stats: [
      { label: 'Status', value: 'Verified' },
      { label: 'Login', value: 'Email' },
      { label: '2FA', value: 'Planned' },
    ],
    sections: [
      {
        title: 'Login Access',
        rows: [
          { label: 'Email Login', value: 'Enabled', icon: 'mail-outline' },
          { label: 'Password', value: 'Last changed 32 days ago', icon: 'key-outline' },
          { label: 'Apple Sign In', value: 'Ready for setup', icon: 'logo-apple' },
          { label: 'Google Sign In', value: 'Ready for setup', icon: 'logo-google' },
        ],
      },
      {
        title: 'Privacy Controls',
        rows: [
          { label: 'Profile Visibility', value: 'Private', icon: 'eye-off-outline' },
          { label: 'Leaderboard Name', value: 'User', icon: 'trophy-outline' },
          { label: 'Data Export', value: 'Available on request', icon: 'download-outline' },
        ],
      },
    ],
    actions: [
      {
        title: 'Change Password',
        subtitle: 'Send a secure reset flow to the registered email.',
        icon: 'lock-closed-outline',
      },
      {
        title: 'Delete Account',
        subtitle: 'Request permanent removal of profile and history.',
        icon: 'trash-outline',
        accent: 'red',
      },
    ],
  },
  'plan-subscription': {
    eyebrow: 'MEMBERSHIP',
    title: 'Plan & Subscription',
    subtitle: 'Premium access, billing, and unlocks.',
    icon: 'card',
    summary:
      'This area will manage premium access, billing status, and member-only feature unlocks.',
    stats: [
      { label: 'Plan', value: 'Free' },
      { label: 'Trial', value: 'Not started' },
      { label: 'Premium', value: 'Locked' },
    ],
    sections: [
      {
        title: 'Current Plan',
        rows: [
          { label: 'Membership', value: 'ONE UP Free', icon: 'id-card-outline' },
          { label: 'Renewal', value: 'No active billing', icon: 'refresh-outline' },
          { label: 'Entitlements', value: 'Basic workout tools', icon: 'star-outline' },
        ],
      },
      {
        title: 'Premium Preview',
        rows: [
          { label: 'AI Meal Suggestions', value: 'Premium planned', icon: 'sparkles-outline' },
          { label: 'Advanced Analytics', value: 'Premium planned', icon: 'analytics-outline' },
          { label: 'Custom Programs', value: 'Premium planned', icon: 'barbell-outline' },
        ],
      },
    ],
    actions: [
      {
        title: 'View Upgrade Options',
        subtitle: 'Compare premium benefits before connecting payments.',
        icon: 'arrow-up-circle-outline',
      },
      {
        title: 'Restore Purchases',
        subtitle: 'Use later when App Store and Play billing are active.',
        icon: 'cloud-download-outline',
      },
    ],
  },
  settings: {
    eyebrow: 'PREFERENCES',
    title: 'Settings',
    subtitle: 'Units, notifications, and app behavior.',
    icon: 'settings',
    summary:
      'These settings give users control over how ONE UP tracks progress and sends training reminders.',
    stats: [
      { label: 'Units', value: 'Metric' },
      { label: 'Alerts', value: 'On' },
      { label: 'Theme', value: 'Dark' },
    ],
    sections: [
      {
        title: 'Training Preferences',
        rows: [
          { label: 'Measurement Units', value: 'Metric - kg, cm, liters', icon: 'options-outline' },
          { label: 'Workout Reminders', value: 'Weekdays at 7:00 AM', icon: 'alarm-outline' },
          { label: 'Rest Timer Sound', value: 'Enabled', icon: 'volume-high-outline' },
          { label: 'Weekly Summary', value: 'Every Sunday', icon: 'calendar-number-outline' },
        ],
      },
      {
        title: 'App Experience',
        rows: [
          { label: 'Theme', value: 'Dark first', icon: 'moon-outline' },
          { label: 'Haptics', value: 'Enabled', icon: 'phone-portrait-outline' },
          { label: 'Language', value: 'English', icon: 'language-outline' },
        ],
      },
    ],
    actions: [
      {
        title: 'Manage Notifications',
        subtitle: 'Choose which reminders and streak alerts are sent.',
        icon: 'notifications-outline',
      },
      {
        title: 'Reset App Preferences',
        subtitle: 'Return units and reminders to default settings.',
        icon: 'reload-outline',
        accent: 'orange',
      },
    ],
  },
  'help-support': {
    eyebrow: 'SUPPORT',
    title: 'Help & Support',
    subtitle: 'Guides, contact, and app policies.',
    icon: 'help-circle',
    summary:
      'A support center keeps users confident while the app grows into real billing, nutrition, and AI features.',
    stats: [
      { label: 'Status', value: 'Online' },
      { label: 'Reply', value: '24-48h' },
      { label: 'Version', value: '1.0.0' },
    ],
    sections: [
      {
        title: 'Support Topics',
        rows: [
          { label: 'Getting Started', value: 'Workout, nutrition, and progress basics', icon: 'map-outline' },
          { label: 'Subscription Help', value: 'Billing, plans, and restore purchases', icon: 'card-outline' },
          { label: 'Report a Bug', value: 'Send device and app details', icon: 'bug-outline' },
          { label: 'Contact Support', value: 'support@oneup.app', icon: 'chatbubble-ellipses-outline' },
        ],
      },
      {
        title: 'Legal',
        rows: [
          { label: 'Terms of Service', value: 'Ready for final legal copy', icon: 'document-text-outline' },
          { label: 'Privacy Policy', value: 'Ready for final legal copy', icon: 'shield-outline' },
          { label: 'Health Disclaimer', value: 'Required before launch', icon: 'medical-outline' },
        ],
      },
    ],
    actions: [
      {
        title: 'Open Help Center',
        subtitle: 'Browse common questions and app guides.',
        icon: 'book-outline',
      },
      {
        title: 'Send Support Request',
        subtitle: 'Create a ticket for account or app issues.',
        icon: 'send-outline',
      },
    ],
  },
};

interface ProfileDetailScreenProps {
  variant: DetailVariant;
}

export function ProfileDetailScreen({ variant }: ProfileDetailScreenProps) {
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
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back to profile"
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topLabel}>Profile</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name={content.icon} size={30} color={colors.accent} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>{content.eyebrow}</Text>
            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.subtitle}>{content.subtitle}</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summary}>{content.summary}</Text>
          {content.stats && (
            <View style={styles.statsRow}>
              {content.stats.map((stat) => (
                <View key={stat.label} style={styles.statItem}>
                  <Text
                    allowFontScaling={false}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={styles.statValue}
                  >
                    {stat.value}
                  </Text>
                  <Text numberOfLines={1} style={styles.statLabel}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {content.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.rows}>
              {section.rows.map((row) => (
                <View key={`${section.title}-${row.label}`} style={styles.infoRow}>
                  <View style={styles.rowLeft}>
                    {row.icon && (
                      <View style={styles.smallIcon}>
                        <Ionicons
                          name={row.icon}
                          size={17}
                          color={colors.accent}
                        />
                      </View>
                    )}
                    <Text style={styles.rowLabel}>{row.label}</Text>
                  </View>
                  <Text style={styles.rowValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actions}>
            {content.actions.map((action) => (
              <Pressable
                key={action.title}
                style={({ pressed }) => [
                  styles.actionRow,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.title}
              >
                <View
                  style={[
                    styles.actionIcon,
                    action.accent === 'orange' && styles.orangeIcon,
                    action.accent === 'red' && styles.redIcon,
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={21}
                    color={
                      action.accent === 'orange'
                        ? colors.warning
                        : action.accent === 'red'
                          ? colors.danger
                          : colors.accent
                    }
                  />
                </View>
                <View style={styles.actionText}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
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
    fontWeight: '800',
  },
  hero: {
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
  heroText: {
    flex: 1,
    gap: spacing.xs,
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
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '700',
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statItem: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 68,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 23,
    lineHeight: 28,
    textAlign: 'center',
    width: '100%',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  section: {
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
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  smallIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  rowLabel: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  rowValue: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '700',
    textAlign: 'right',
  },
  actions: {
    gap: spacing.sm,
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
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
  actionText: {
    flex: 1,
    gap: spacing.xs,
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
