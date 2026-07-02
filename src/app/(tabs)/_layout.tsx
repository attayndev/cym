import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';

export default function TabsLayout() {
  const { t } = useTranslation();
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
        name="people"
        options={{
          title: t('tab.people'),
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
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
        name="card"
        options={{
          title: t('tab.card'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="credit-card" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
