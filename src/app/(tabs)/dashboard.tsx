import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContactRow } from '@/components/contact-row';
import { PersonaSwitcher } from '@/components/persona-switcher';
import { Body, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts, hardShadow, healthColors } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { contactHealth } from '@/lib/nudges';
import { contactsForPersona } from '@/lib/personas';
import type { Health } from '@/lib/types';
import { useApp } from '@/state/app-context';

const BUCKETS: Health[] = ['warm', 'cooling', 'at-risk', 'cold'];
const BUCKET_LABEL = {
  warm: 'health.warm',
  cooling: 'health.cooling',
  'at-risk': 'health.atRisk',
  cold: 'health.cold',
} as const;

export default function DashboardScreen() {
  const { db, activePersonaId } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  if (!db) return <Screen scroll={false}>{null}</Screen>;

  if (!db.profile.isPro) {
    return (
      <Screen>
        <Display>{t('dashboard.title')}</Display>
        <Card dark style={{ gap: 10 }}>
          <Feather name="lock" size={18} color={colors.cardMuted} />
          <Text style={styles.gateHeadline}>{t('dashboard.gate.headline')}</Text>
          <Body style={{ color: colors.cardMuted }}>{t('dashboard.gate.body')}</Body>
          <Pressable
            onPress={() => router.push('/paywall')}
            style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.8 }]}>
            <Text style={styles.gateBtnText}>{t('dashboard.gate.cta')}</Text>
          </Pressable>
        </Card>
      </Screen>
    );
  }

  const now = new Date();
  const personaContacts = contactsForPersona(db.contacts, activePersonaId);
  const byHealth = new Map<Health, typeof db.contacts>(BUCKETS.map((b) => [b, []]));
  for (const contact of personaContacts) {
    byHealth.get(contactHealth(contact, db.interactions, now))!.push(contact);
  }

  const attention = [...byHealth.get('at-risk')!, ...byHealth.get('cold')!];

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Display>{t('dashboard.title')}</Display>
        <PersonaSwitcher />
      </View>

      <View style={styles.grid}>
        {BUCKETS.map((bucket) => {
          const palette = healthColors[bucket];
          const count = byHealth.get(bucket)!.length;
          return (
            <View key={bucket} style={[styles.bucket, { backgroundColor: palette.bg }]}>
              <Text style={[styles.bucketCount, { color: palette.fg }]}>{count}</Text>
              <Text style={[styles.bucketLabel, { color: palette.fg }]}>
                {t(BUCKET_LABEL[bucket])}
              </Text>
            </View>
          );
        })}
      </View>

      {personaContacts.length === 0 ? (
        <Card>
          <Body muted>{t('dashboard.emptyNoContacts')}</Body>
        </Card>
      ) : attention.length > 0 ? (
        <View style={styles.section}>
          <Eyebrow>{t('dashboard.bringBack')}</Eyebrow>
          {attention.map((c) => (
            <ContactRow key={c.id} contact={c} interactions={db.interactions} />
          ))}
        </View>
      ) : (
        <Card>
          <Body>{t('dashboard.empty')}</Body>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bucket: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 18,
    padding: 16,
    gap: 2,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(3, 'rgba(59,36,28,0.12)'),
  },
  bucketCount: {
    fontFamily: fonts.display,
    fontSize: 34,
  },
  bucketLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  section: {
    gap: 10,
  },
  gateHeadline: {
    fontFamily: fonts.displayMedium,
    fontSize: 21,
    lineHeight: 28,
    color: colors.cardText,
  },
  gateBtn: {
    backgroundColor: colors.cherry,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 2,
    borderColor: colors.cream,
    ...hardShadow(3, 'rgba(255,247,232,0.35)'),
  },
  gateBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 14.5,
    color: colors.cream,
  },
});
