import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t, tx } from '@/i18n';
import { nextOccurrence } from '@/lib/dates';
import { pendingNudges } from '@/lib/nudges';
import type { DB } from '@/lib/types';

const isSupported = Platform.OS !== 'web';

if (isSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSupported) return false;
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

/**
 * Rebuild the on-device notification schedule from current data. Local
 * notifications fire without a server: a morning digest when hook-driven
 * nudges are live, plus a heads-up the morning of each birthday. A hosted
 * cron will take this over for cross-device push at the backend milestone.
 */
export async function syncScheduledNotifications(db: DB): Promise<void> {
  if (!isSupported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!db.profile.notificationsEnabled || !db.profile.isPro) return;

    const now = new Date();
    const hookNudges = pendingNudges(db).filter((n) => n.kind === 'hook');

    // Morning digest tomorrow if there are moments worth acting on.
    if (hookNudges.length > 0) {
      const top = hookNudges[0];
      const digest = new Date(now);
      digest.setDate(digest.getDate() + 1);
      digest.setHours(9, 0, 0, 0);
      await Notifications.scheduleNotificationAsync({
        content: {
          title:
            hookNudges.length === 1
              ? tx(top.headline)
              : t('notify.digest.title', { count: hookNudges.length }),
          body:
            hookNudges.length === 1
              ? tx(top.suggestedAction)
              : t('notify.digest.body', { action: tx(top.suggestedAction) }),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: digest },
      });
    }

    // A nudge the morning of each upcoming birthday (next 30 days).
    for (const contact of db.contacts) {
      if (!contact.birthday) continue;
      const next = nextOccurrence(contact.birthday, now);
      const daysAway = Math.round((next.getTime() - now.getTime()) / 86_400_000);
      if (daysAway < 0 || daysAway > 30) continue;
      const fireAt = new Date(next);
      fireAt.setHours(8, 30, 0, 0);
      if (fireAt <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notify.birthday.title', { name: contact.firstName }),
          body: t('notify.birthday.body'),
          data: { contactId: contact.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
    }
  } catch {
    // Scheduling is best-effort; never block the app on it.
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (!isSupported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
