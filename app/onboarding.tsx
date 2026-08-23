import React from 'react';
import { Redirect } from 'expo-router';
import { AppStatusScreen } from '../components/AppStatusScreen';
import { useAuthProfile } from '../lib/profile/context';
import { OnboardingScreen } from '../screens/OnboardingScreen';

export default function OnboardingRoute() {
  const { error, refreshProfile, status } = useAuthProfile();

  if (status === 'loading' || status === 'profile_loading') {
    return (
      <AppStatusScreen
        loading
        title="Preparing Onboarding"
        message="Loading your private profile foundation."
      />
    );
  }

  if (status === 'signed_out') {
    return <Redirect href="/auth" />;
  }

  if (status === 'ready') {
    return <Redirect href="/(tabs)" />;
  }

  if (status === 'error') {
    return (
      <AppStatusScreen
        title="Onboarding Unavailable"
        message={error ?? 'We could not load onboarding right now.'}
        actionLabel="Try Again"
        onAction={() => {
          void refreshProfile();
        }}
      />
    );
  }

  return <OnboardingScreen />;
}
