import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Heading, Screen, ScreenLoading } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { shortDate } from '@/lib/dates';
import { useAuth } from '@/state/auth-context';

interface AdminUserStat {
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  contactsActive: number;
  contactsTotal: number;
  interactions: number;
  nudgesActed: number;
  inboxes: number;
  isPro: boolean;
}

interface AdminStats {
  generatedAt: string;
  totals: { users: number; contacts: number; interactions: number };
  users: AdminUserStat[];
}

type Status =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; data: AdminStats };

export default function AdminScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!session) {
        if (active) setStatus({ kind: 'error' });
        return;
      }
      try {
        const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-stats`;
        const res = await fetch(url, {
          method: 'GET',
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (active) setStatus({ kind: 'error' });
          return;
        }
        const data = (await res.json()) as AdminStats;
        if (active) setStatus({ kind: 'loaded', data });
      } catch {
        if (active) setStatus({ kind: 'error' });
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [session, attempt]);

  if (status.kind === 'loading') {
    return <ScreenLoading />;
  }

  const topRow = (
    <View style={styles.topRow}>
      <Heading>{t('admin.title')}</Heading>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Feather name="x" size={22} color={colors.ink} />
      </Pressable>
    </View>
  );

  if (status.kind === 'error') {
    return (
      <Screen>
        {topRow}
        <Body muted>{t('admin.error')}</Body>
        <Pressable
          onPress={() => {
            setStatus({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
          hitSlop={6}>
          <Text style={styles.link}>{t('admin.retry')}</Text>
        </Pressable>
      </Screen>
    );
  }

  const { data } = status;

  return (
    <Screen>
      {topRow}
      <Body>
        {t('admin.totals', {
          users: data.totals.users,
          contacts: data.totals.contacts,
          interactions: data.totals.interactions,
        })}
      </Body>

      {data.users.map((u) => (
        <View key={u.email} style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.email} numberOfLines={1}>
              {u.email}
            </Text>
            <View style={styles.leftMeta}>
              <Text style={styles.date}>{shortDate(u.createdAt)}</Text>
              {u.isPro && <Text style={styles.badge}>{t('admin.plus')}</Text>}
            </View>
          </View>
          <View style={styles.right}>
            <Text style={styles.statLine}>
              {t('admin.contacts', { n: u.contactsActive })} ·{' '}
              {t('admin.touches', { n: u.interactions })}
            </Text>
            <Text style={styles.subLine}>
              {t('admin.lastSignIn', {
                when: u.lastSignInAt ? shortDate(u.lastSignInAt) : t('admin.never'),
              })}
            </Text>
            {u.inboxes > 0 && (
              <Text style={styles.subLine}>{t('admin.inboxes', { n: u.inboxes })}</Text>
            )}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  link: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.cherryDeep,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: 11,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  leftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  email: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.ink,
  },
  date: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  badge: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.butter,
    backgroundColor: colors.espresso,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statLine: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  subLine: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
});
