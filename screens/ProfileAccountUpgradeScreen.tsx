import React from 'react';
import {
  ActivityIndicator,
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
import {
  FormSection,
  ProfileTextInput,
} from '../components/profile/ProfileFormControls';
import { useAuthProfile } from '../lib/profile/context';
import {
  finalizeAnonymousAccountUpgrade,
  hasPendingGuestUpgrade,
  requestAnonymousAccountUpgrade,
  resendAnonymousAccountUpgrade,
} from '../lib/profile/account-upgrade';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

function getFriendlyUpgradeError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Something went wrong while securing this account.';
  }

  const normalizedMessage = error.message.toLowerCase();

  if (normalizedMessage.includes('rate limit')) {
    return 'Too many confirmation emails were sent recently. Wait a moment, then try again.';
  }

  if (normalizedMessage.includes('already secured')) {
    return error.message;
  }

  if (normalizedMessage.includes('already registered')) {
    return error.message;
  }

  if (normalizedMessage.includes('identity') && normalizedMessage.includes('linked')) {
    return 'That email already belongs to another account. Use a different email for this guest upgrade.';
  }

  if (normalizedMessage.includes('email') && normalizedMessage.includes('already')) {
    return 'That email already belongs to another account. Use a different email for this guest upgrade.';
  }

  return error.message;
}

export function ProfileAccountUpgradeScreen() {
  const router = useRouter();
  const { isAnonymous, refreshProfile, status, user } = useAuthProfile();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [verificationInput, setVerificationInput] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [hasRequestedConfirmation, setHasRequestedConfirmation] = React.useState(
    () => hasPendingGuestUpgrade(user),
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (user?.new_email && !email.trim()) {
      setEmail(user.new_email);
    } else if (!email.trim() && !isAnonymous && user?.email && hasRequestedConfirmation) {
      setEmail(user.email);
    }
  }, [email, hasRequestedConfirmation, isAnonymous, user?.email, user?.new_email]);

  const isBusy =
    isSubmitting || status === 'loading' || status === 'profile_loading';
  const canSubmitConfirmation = Boolean(email.trim());
  const canFinish =
    Boolean(email.trim()) &&
    password.length >= 6 &&
    (Boolean(verificationInput.trim()) || hasRequestedConfirmation);
  const shouldShowSecureAccountNotice =
    !isAnonymous && !hasRequestedConfirmation && !user?.new_email && !user?.email_change_sent_at;

  async function handleSendConfirmation() {
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const result = await requestAnonymousAccountUpgrade(email);
      setEmail(result.email);
      setHasRequestedConfirmation(true);
      setNotice(
        'Confirmation sent. Paste the code or full confirmation link from your email below, or tap the email link and come back here to finish.',
      );
    } catch (error) {
      setErrorMessage(getFriendlyUpgradeError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      await resendAnonymousAccountUpgrade(email);
      setNotice('A fresh confirmation email was sent.');
    } catch (error) {
      setErrorMessage(getFriendlyUpgradeError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFinishUpgrade() {
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      await finalizeAnonymousAccountUpgrade({
        email,
        password,
        verificationInput,
      });
      await refreshProfile();
      Alert.alert(
        'Account Secured',
        'This guest profile is now linked to your email login without changing its existing data.',
      );
      router.replace('/profile/account-settings' as Href);
    } catch (error) {
      setErrorMessage(getFriendlyUpgradeError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

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
            accessibilityLabel="Go back to account settings"
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topLabel}>Profile</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={30}
              color={colors.accent}
            />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>ACCOUNT SECURITY</Text>
            <Text style={styles.title}>Secure This Guest Account</Text>
            <Text style={styles.subtitle}>
              Link this existing guest identity to an email login so the same
              Supabase user keeps your Profile, Nutrition, Workout, and Progress
              history.
            </Text>
          </View>
        </View>

        {shouldShowSecureAccountNotice ? (
          <FormSection
            title="Already Secured"
            subtitle="This account already has an email identity, so the guest upgrade flow is no longer needed."
          >
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
              onPress={() => router.replace('/profile/account-settings' as Href)}
              accessibilityRole="button"
              accessibilityLabel="Return to account settings"
            >
              <Text style={styles.secondaryButtonText}>Back to Account Settings</Text>
            </Pressable>
          </FormSection>
        ) : (
          <>
            <FormSection
              title="Send Confirmation"
              subtitle="Enter the email you want to attach to this current guest UUID. Supabase will send a confirmation email before a password can be added."
            >
              <ProfileTextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel="Upgrade email"
              />
              {notice && !hasRequestedConfirmation ? (
                <Text style={styles.noticeText}>{notice}</Text>
              ) : null}
              {errorMessage && !hasRequestedConfirmation ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!canSubmitConfirmation || isBusy) && styles.buttonDisabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void handleSendConfirmation();
                }}
                disabled={!canSubmitConfirmation || isBusy}
                accessibilityRole="button"
                accessibilityLabel="Send confirmation email"
              >
                {isSubmitting ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Confirmation</Text>
                )}
              </Pressable>
            </FormSection>

            {hasRequestedConfirmation ? (
              <FormSection
                title="Finish Upgrade"
                subtitle="Paste the 6-digit code, raw token hash, or full confirmation link from the email. If you already tapped the email link, leave that field blank and try finishing here."
              >
                <ProfileTextInput
                  label="Confirmation Code or Link"
                  value={verificationInput}
                  onChangeText={setVerificationInput}
                  placeholder="Paste code, token hash, or confirmation link"
                  autoCapitalize="none"
                  accessibilityLabel="Confirmation code or link"
                />
                <ProfileTextInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  accessibilityLabel="Upgrade password"
                />

                {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
                {errorMessage ? (
                  <Text style={styles.errorText}>{errorMessage}</Text>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (!canFinish || isBusy) && styles.buttonDisabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    void handleFinishUpgrade();
                  }}
                  disabled={!canFinish || isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Finish guest account upgrade"
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.background} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Finish Upgrade</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    isBusy && styles.buttonDisabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    void handleResendConfirmation();
                  }}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Resend confirmation email"
                >
                  <Text style={styles.secondaryButtonText}>Resend Email</Text>
                </Pressable>
              </FormSection>
            ) : null}
          </>
        )}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
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
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.84,
  },
  topLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  heroText: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 34,
    textTransform: 'uppercase',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 22,
  },
  noticeText: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '800',
  },
});
