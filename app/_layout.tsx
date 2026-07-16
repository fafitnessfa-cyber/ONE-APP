import React from 'react';
import { Stack } from 'expo-router';
import {
  BebasNeue_400Regular,
  useFonts,
} from '@expo-google-fonts/bebas-neue';
import { colors } from '../theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
