import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppScreen } from '../components/AppScreen';
import { LogoMark, LogoWordmark } from '../components/BrandLogo';
import {
  FormSection,
  ProfileTextInput,
} from '../components/profile/ProfileFormControls';
import { useAuthProfile } from '../lib/profile/context';
import {
  signInAsGuest,
  signInWithPassword,
  signUpWithEmail,
} from '../lib/profile/profile';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme';

type AuthMode = 'sign-in' | 'sign-up';

function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Something went wrong. Please try again.';
  }

  if (error.message === 'Email not confirmed') {
    return 'Check your inbox and confirm your email before signing in.';
  }

  if (error.message.toLowerCase().includes('invalid login credentials')) {
    return 'That email or password did not match.';
  }

  return error.message;
}

export function AuthScreen() {
  const { status } = useAuthProfile();
  const [mode, setMode] = React.useState<AuthMode>('sign-in');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isBusy = isSubmitting || status === 'loading' || status === 'profile_loading';

  async function handleSubmit(nextMode: AuthMode) {
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      if (nextMode === 'sign-in') {
        await signInWithPassword(email.trim(), password);
      } else {
        const result = await signUpWithEmail(email.trim(), password);

        if (result.session) {
          setNotice('Account created. Finishing sign-in now.');
        } else {
          setNotice(
            'Account created. Confirm the email address, then sign in to continue.',
          );
        }
      }
    } catch (error) {
      setErrorMessage(getFriendlyAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGuestAccess() {
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      await signInAsGuest();
      setNotice('Guest session ready. Loading onboarding.');
    } catch (error) {
      setErrorMessage(getFriendlyAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen showHeader={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <LogoMark height={42} width={40} />
            <LogoWordmark height={24} width={160} />
          </View>
          <Text style={styles.eyebrow}>PROFILE FOUNDATION</Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            Sign in, create an account, or continue as a guest. Your onboarding
            and profile state now live in Supabase instead of device-only flags.
          </Text>
        </View>

        <View style={styles.modeRow}>
          {([
            ['sign-in', 'Sign In'],
            ['sign-up', 'Create Account'],
          ] as const).map(([value, label]) => {
            const isSelected = mode === value;

            return (
              <Pressable
                key={value}
                style={({ pressed }) => [
                  styles.modeButton,
                  isSelected && styles.modeButtonSelected,
                  pressed && styles.modeButtonPressed,
                ]}
                onPress={() => setMode(value)}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <Text
                  style={[
                    styles.modeLabel,
                    isSelected && styles.modeLabelSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FormSection
          title={mode === 'sign-in' ? 'Account Access' : 'Create an Account'}
          subtitle={
            mode === 'sign-in'
              ? 'Use an existing email account to restore your profile.'
              : 'Email accounts in this project currently require inbox confirmation before the first sign-in.'
          }
        >
          <ProfileTextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Auth email"
          />
          <ProfileTextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel="Auth password"
          />

          {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (isBusy || !email.trim() || password.length < 6) &&
                styles.buttonDisabled,
              pressed && styles.modeButtonPressed,
            ]}
            onPress={() => {
              void handleSubmit(mode);
            }}
            disabled={isBusy || !email.trim() || password.length < 6}
            accessibilityRole="button"
            accessibilityLabel={mode === 'sign-in' ? 'Sign in' : 'Create account'}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </Pressable>
        </FormSection>

        <FormSection
          title="Guest Access"
          subtitle="Anonymous guest sessions still work, so existing Nutrition behavior stays available while we add full profile persistence."
        >
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              isBusy && styles.buttonDisabled,
              pressed && styles.modeButtonPressed,
            ]}
            onPress={() => {
              void handleGuestAccess();
            }}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Continue as guest"
          >
            <Text style={styles.secondaryButtonText}>Continue as Guest</Text>
          </Pressable>
        </FormSection>
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
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
    lineHeight: 20,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modeButtonSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  modeButtonPressed: {
    opacity: 0.82,
  },
  modeLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  modeLabelSelected: {
    color: colors.accent,
  },
  noticeText: {
    color: colors.accentLight,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: {
    color: colors.background,
    fontFamily: fontFamily.display,
    fontSize: 28,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: 28,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
