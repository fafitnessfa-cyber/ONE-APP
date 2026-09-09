import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { AppScreen } from '../components/AppScreen';
import { getFitnessGoalLabel } from '../lib/profile/constants';
import { useAuthProfile } from '../lib/profile/context';
import { formatMeasurementSystem, getProfileDisplayName } from '../lib/profile/utils';
import { colors, fontSize, radius, spacing } from '../theme';

const PROFILE_ITEMS = [
  {
    icon: 'person',
    label: 'Personal Information',
    href: '/profile/personal-information',
  },
  {
    icon: 'shield-checkmark',
    label: 'Account Settings',
    href: '/profile/account-settings',
  },
  {
    icon: 'card',
    label: 'Plan & Subscription',
    href: '/profile/plan-subscription',
  },
  { icon: 'settings', label: 'Settings', href: '/profile/settings' },
  { icon: 'help-circle', label: 'Help & Support', href: '/profile/help-support' },
] as const;

export function ProfileScreen() {
  const router = useRouter();
  const { profile, signOut, user } = useAuthProfile();
  const displayName = getProfileDisplayName(profile, user?.email ?? null);
  const goalLabel = getFitnessGoalLabel(profile?.fitnessGoal ?? null).toUpperCase();
  const unitsLabel = formatMeasurementSystem(profile?.preferredUnits ?? null).toUpperCase();

  return (
    <AppScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={44} color={colors.textPrimary} />
          </View>
          <View style={styles.profileText}>
            <Text style={styles.name}>{displayName.toUpperCase()}</Text>
            <Text style={styles.level}>{unitsLabel}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, styles.progressFillComplete]} />
            </View>
            <Text style={styles.tier}>{goalLabel}</Text>
          </View>
        </View>

        <View style={styles.menu}>
          {PROFILE_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
              onPress={() => router.push(item.href as Href)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
            >
              <Ionicons name={item.icon} size={24} color={colors.accent} />
              <Text style={styles.menuText}>{item.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              styles.logout,
              pressed && styles.menuItemPressed,
            ]}
            onPress={() => {
              void signOut().catch((error) => {
                Alert.alert(
                  'Unable to Sign Out',
                  error instanceof Error
                    ? error.message
                    : 'Please try again in a moment.',
                );
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutText}>LOG OUT</Text>
          </Pressable>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xl,
    padding: spacing.xl,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    width: 100,
  },
  profileText: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.display,
    fontWeight: '900',
  },
  level: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  progressTrack: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.pill,
    height: 5,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.accent,
    height: '100%',
    width: '58%',
  },
  progressFillComplete: {
    width: '100%',
  },
  tier: {
    color: colors.accent,
    fontSize: fontSize.title,
    fontWeight: '900',
  },
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  menuItem: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: spacing.lg,
  },
  menuItemPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  menuText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSize.title,
    fontWeight: '700',
  },
  logout: {
    borderColor: colors.danger,
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.danger,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
});
