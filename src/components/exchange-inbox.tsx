import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow } from '@/components/ui';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { listPendingSubmissions, markSubmission, type ExchangeSubmission } from '@/lib/share';
import { useAuth } from '@/state/auth-context';

/** People whose details arrived through your card's landing page, waiting for
 *  review. Accepting one runs the normal capture ritual, prefilled. */
export function ExchangeInbox() {
  const { session } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [pending, setPending] = useState<ExchangeSubmission[]>([]);

  const userId = session?.user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setPending([]);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const rows = await listPendingSubmissions();
          if (!cancelled) setPending(rows);
        } catch {
          // Offline: the inbox just stays hidden.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  if (!userId || pending.length === 0) return null;

  const accept = (s: ExchangeSubmission) => {
    router.push({
      pathname: '/capture',
      params: {
        firstName: s.firstName,
        lastName: s.lastName ?? '',
        email: s.email ?? '',
        phone: s.phone ?? '',
        company: s.company ?? '',
        role: s.role ?? '',
        note: s.note ?? '',
        source: 'qr',
        submissionId: s.id,
      },
    });
  };

  const dismiss = async (s: ExchangeSubmission) => {
    setPending((rows) => rows.filter((r) => r.id !== s.id));
    try {
      await markSubmission(s.id, 'dismissed');
    } catch {
      // If this failed we'll see it again on next focus — fine.
    }
  };

  return (
    <View style={styles.wrap}>
      <Eyebrow>{t('inbox.title', { n: pending.length })}</Eyebrow>
      {pending.map((s) => (
        <Card key={s.id} style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name}>
              {[s.firstName, s.lastName].filter(Boolean).join(' ')}
            </Text>
            {(s.role || s.company) && (
              <Text style={styles.meta}>
                {[s.role, s.company].filter(Boolean).join(' · ')}
              </Text>
            )}
            {s.note ? (
              <Text style={styles.note} numberOfLines={2}>
                “{s.note}”
              </Text>
            ) : null}
            <Text style={styles.via}>{t('inbox.viaCard')}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => accept(s)}
              style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.8 }]}>
              <Text style={styles.acceptText}>{t('inbox.accept')}</Text>
            </Pressable>
            <Pressable onPress={() => void dismiss(s)} hitSlop={8} style={styles.dismissBtn}>
              <Feather name="x" size={16} color={colors.muted} />
            </Pressable>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkSoft,
  },
  note: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.muted,
    fontStyle: 'italic',
  },
  via: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.cherryDeep,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  acceptBtn: {
    backgroundColor: colors.espresso,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(2),
  },
  acceptText: {
    fontFamily: fonts.sansBold,
    fontSize: 12.5,
    color: colors.cardText,
  },
  dismissBtn: {
    padding: 2,
  },
});
