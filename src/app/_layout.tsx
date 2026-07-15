import {
  Fraunces_600SemiBold,
  Fraunces_900Black,
} from '@expo-google-fonts/fraunces';
import {
  Karla_400Regular,
  Karla_500Medium,
  Karla_700Bold,
  useFonts,
} from '@expo-google-fonts/karla';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { colors } from '@/constants/theme';
import { I18nProvider, resolveInitialLocale, type Locale } from '@/i18n';
import { AppProvider } from '@/state/app-context';
import { AuthProvider } from '@/state/auth-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_900Black,
    Karla_400Regular,
    Karla_500Medium,
    Karla_700Bold,
  });
  const [initialLocale, setInitialLocale] = useState<Locale | null>(null);

  useEffect(() => {
    resolveInitialLocale().then(setInitialLocale);
  }, []);

  const ready = fontsLoaded && initialLocale !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <I18nProvider initialLocale={initialLocale}>
    <AuthProvider>
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.cream },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="personas" options={{ presentation: 'modal' }} />
        <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sweep" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="contact/edit/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </AppProvider>
    </AuthProvider>
    </I18nProvider>
  );
}
