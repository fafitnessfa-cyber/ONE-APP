import React from 'react';
import { Stack } from 'expo-router';
import {
  BebasNeue_400Regular,
  useFonts,
} from '@expo-google-fonts/bebas-neue';
import { AuthProfileProvider } from '../lib/profile/context';
import { colors } from '../theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProfileProvider>
      <Stack
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="exercises" />
        <Stack.Screen name="home" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="progress" />
        <Stack.Screen name="challenges" />
      </Stack>
    </AuthProfileProvider>
  );
}
