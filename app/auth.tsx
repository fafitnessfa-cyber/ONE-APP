import React from 'react';
import { Redirect } from 'expo-router';
import { AppStatusScreen } from '../components/AppStatusScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { useAuthProfile } from '../lib/profile/context';

export default function AuthRoute() {
  const { error, refreshProfile, status } = useAuthProfile();

  if (status === 'loading' || status === 'profile_loading') {
    return (
      <AppStatusScreen
        loading
        title="Loading Session"
        message="Checking whether you already have an account or guest session."
      />
    );
  }

  if (status === 'needs_onboarding') {
    return <Redirect href="/onboarding" />;
  }

  if (status === 'ready') {
    return <Redirect href="/(tabs)" />;
  }

  if (status === 'error' && error) {
    return (
      <AppStatusScreen
        title="Auth Unavailable"
        message={error}
        actionLabel="Try Again"
        onAction={() => {
          void refreshProfile();
        }}
      />
    );
  }

  return <AuthScreen />;
}
