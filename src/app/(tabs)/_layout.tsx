import { Feather } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { useApp } from '@/state/app-context';
import { useAuth } from '@/state/auth-context';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { db } = useApp();
  const { configured, user } = useAuth();

  // Accounts are required: new installs onboard (which creates the account),
  // and a signed-out app locks to the sign-in screen until a session returns.
  if (db && !db.onboarded) return <Redirect href="/onboarding" />;
  if (db?.onboarded && configured && !user) return <Redirect href="/auth" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.espresso,
        tabBarInactiveTintColor: 'rgba(59,36,28,0.55)',
        tabBarStyle: {
          backgroundColor: colors.butter,
          borderTopColor: colors.espresso,
          borderTopWidth: 2,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 11,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.today'),
          tabBarIcon: ({ color, size }) => <Feather name="sun" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="card"
        options={{
          title: t('tab.card'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="credit-card" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('tab.scan'),
          tabBarIcon: ({ color, size }) => <Feather name="camera" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tab.health'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="pie-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: t('tab.people'),
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
