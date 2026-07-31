import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LogoMark, LogoWordmark } from './BrandLogo';
import { colors, fontSize, spacing } from '../theme';

export function Header() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <LogoMark height={30} width={28} />
        <LogoWordmark height={18} width={128} />
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.iconButton} accessibilityRole="button">
          <Ionicons
            name="notifications-outline"
            size={22}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable
          style={styles.avatar}
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Text allowFontScaling={false} style={styles.avatarText}>
            U
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    minHeight: 40,
  },
  logoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#7C6348',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
});
