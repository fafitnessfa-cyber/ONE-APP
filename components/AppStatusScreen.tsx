import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark, LogoWordmark } from './BrandLogo';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

interface AppStatusScreenProps {
  title: string;
  message: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export function AppStatusScreen({
  title,
  message,
  loading = false,
  actionLabel,
  onAction,
}: AppStatusScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.logoRow}>
          <LogoMark height={34} width={32} />
          <LogoWordmark height={20} width={140} />
        </View>

        <View style={styles.card}>
          {loading && <ActivityIndicator color={colors.accent} size="small" />}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {actionLabel && onAction && (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
            >
              <Text style={styles.buttonText}>{actionLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  logoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 32,
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    minWidth: 180,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonText: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 24,
  },
});
