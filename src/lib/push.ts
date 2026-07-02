import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { requestNotificationPermission } from '@/lib/notifications';
import { getSupabase } from '@/lib/supabase';

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registers this device's Expo push token with the backend so the daily-nudges
 * function can reach it. No-ops cleanly when it can't run (web, simulator,
 * not signed in, no EAS project yet) so it never blocks the app.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const supabase = getSupabase();
  const id = projectId();
  if (!supabase || !id) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  try {
    const { data: tokenResult } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const token = tokenResult;
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user?.id;
    if (!userId || !token) return;
    await supabase
      .from('push_tokens')
      .upsert({ token, user_id: userId, platform: Platform.OS });
  } catch {
    // Best-effort: token registration never blocks the app.
  }
}
