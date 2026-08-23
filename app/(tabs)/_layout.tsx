import React from 'react';
import { Tabs } from 'expo-router';
import { BottomNav } from '../../components/BottomNav';
import { ProtectedRouteGate } from '../../components/ProtectedRouteGate';
import { APP_TABS } from '../../navigation/tabs';
import { colors } from '../../theme';

export default function TabLayout() {
  return (
    <ProtectedRouteGate>
      <Tabs
        tabBar={(props) => <BottomNav {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            height: 0,
            position: 'absolute',
          },
        }}
      >
        {APP_TABS.map((tab) => (
          <Tabs.Screen
            key={tab.route}
            name={tab.route}
            options={{
              title: tab.label,
            }}
          />
        ))}
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
            title: 'Profile',
          }}
        />
      </Tabs>
    </ProtectedRouteGate>
  );
}
