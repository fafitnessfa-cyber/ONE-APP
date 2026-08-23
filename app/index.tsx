import React from 'react';
import { Redirect } from 'expo-router';
import { AppStatusScreen } from '../components/AppStatusScreen';
import { useAuthProfile } from '../lib/profile/context';

export default function IndexRoute() {
  const { error, refreshProfile, status } = useAuthProfile();

  if (status === 'loading' || status === 'profile_loading') {
    return (
      <AppStatusScreen
        loading
        title="Loading ONE UP"
        message="Checking your session and onboarding state."
      />
    );
  }

  if (status === 'signed_out') {
    return <Redirect href="/auth" />;
  }

  if (status === 'needs_onboarding') {
    return <Redirect href="/onboarding" />;
  }

  if (status === 'error') {
    return (
      <AppStatusScreen
        title="Unable to Load"
        message={error ?? 'We could not load your profile right now.'}
        actionLabel="Try Again"
        onAction={() => {
          void refreshProfile();
        }}
      />
    );
  }

  return <Redirect href="/(tabs)" />;
}
