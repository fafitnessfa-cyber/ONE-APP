import React from 'react';
import { Stack } from 'expo-router';
import { ProtectedRouteGate } from '../../components/ProtectedRouteGate';

export default function ChallengesLayout() {
  return (
    <ProtectedRouteGate>
      <Stack screenOptions={{ headerShown: false }} />
    </ProtectedRouteGate>
  );
}
