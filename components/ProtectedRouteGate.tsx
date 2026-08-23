import React from 'react';
import { Redirect } from 'expo-router';
import { AppStatusScreen } from './AppStatusScreen';
import { useAuthProfile } from '../lib/profile/context';

export function ProtectedRouteGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { error, refreshProfile, status } = useAuthProfile();

  if (status === 'loading' || status === 'profile_loading') {
    return (
      <AppStatusScreen
        loading
        title="Loading Profile"
        message="Checking your session and profile foundation."
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
        title="Profile Unavailable"
        message={error ?? 'We could not load your profile right now.'}
        actionLabel="Try Again"
        onAction={() => {
          void refreshProfile();
        }}
      />
    );
  }

  return <>{children}</>;
}
