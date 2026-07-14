import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContactRow } from '@/components/contact-row';
import { Body, Card, Display, Eyebrow, Screen, ScreenLoading } from '@/components/ui';
import { colors, fonts, hardShadow, healthColors, radii } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { buildHealthIndex } from '@/lib/nudges';
import { healthEligibleContacts } from '@/lib/tier';
import type { Health } from '@/lib/types';
import { useApp } from '@/state/app-context';

const BUCKETS: Health[] = ['warm', 'cooling', 'at-risk', 'cold', 'never'];
const BUCKET_LABEL = {
  never: 'health.never',
  warm: 'health.warm',
  cooling: 'health.cooling',
  'at-risk': 'health.atRisk',
  cold: 'health.cold',
} as const;

export default function DashboardScreen() {
  const { db } = useApp();
  const router = useRouter();
  const { t } = useTranslation();
  // Tapping a bucket filters the list below to exactly that health state;
  // tapping it again returns to the default "bring back" view.
  const [selected, setSelected] = useState<Health | null>(null);

  if (!db) return <ScreenLoading />;

  // Health is ungated for the beta (Yan, July 10) — restore the isPro gate
  // when RevenueCat billing goes live.

  const now = new Date();
  // One relationship graph: personas are cards you present, not partitions
  // of who you know. Health only counts tracked relationships — untracked
  // imports/businesses aren't being managed yet, so they leave the Health
  // counts entirely (eligibility lives in tier.ts, not decided here).
  const personaContacts = healthEligibleContacts(db);
  const index = buildHealthIndex(personaContacts, db.interactions, now);
  const byHealth = new Map<Health, typeof db.contacts>(BUCKETS.map((b) => [b, []]));
  for (const contact of personaContacts) {
    byHealth.get(index.get(contact.id)!.health)!.push(contact);
  }

  // Worst first, hard-capped: this default view renders unvirtualized, and
  // the cold bucket runs to hundreds — uncapped it hangs the JS thread on
  // device (the buckets above are the way to browse the full list).
  const attention = [...byHealth.get('at-risk')!, ...byHealth.get('cold')!]
    .sort((a, b) => (index.get(b.id)?.ratio ?? 0) - (index.get(a.id)?.ratio ?? 0))
    .slice(0, 25);
  const attentionTotal = byHealth.get('at-risk')!.length + byHealth.get('cold')!.length;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Display>{t('dashboard.title')}</Display>
      </View>

      <View style={styles.grid}>
        {BUCKETS.map((bucket) => {
          const palette = healthColors[bucket];
          const count = byHealth.get(bucket)!.length;
          const isSelected = selected === bucket;
          return (
            <Pressable
              key={bucket}
              onPress={() => setSelected(isSelected ? null : bucket)}
              style={({ pressed }) => [
                styles.bucket,
                { backgroundColor: palette.bg },
                isSelected && styles.bucketSelected,
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={[styles.bucketCount, { color: palette.fg }]}>{count}</Text>
              <Text style={[styles.bucketLabel, { color: palette.fg }]}>
                {t(BUCKET_LABEL[bucket])}
                {isSelected ? ' ✕' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <View style={styles.section}>
          <Eyebrow>
            {t(BUCKET_LABEL[selected])} · {byHealth.get(selected)!.length}
          </Eyebrow>
          {byHealth.get(selected)!.length === 0 ? (
            <Card variant="quiet">
              <Body muted>{t('dashboard.bucketEmpty')}</Body>
            </Card>
          ) : (
            <>
              {[...byHealth.get(selected)!]
                .sort((a, b) => (index.get(b.id)?.ratio ?? 0) - (index.get(a.id)?.ratio ?? 0))
                .slice(0, 100)
                .map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    interactions={db.interactions}
                    health={selected}
                  />
                ))}
              {byHealth.get(selected)!.length > 100 && (
                <Body muted>
                  {t('dashboard.more', { n: byHealth.get(selected)!.length - 100 })}
                </Body>
              )}
            </>
          )}
        </View>
      ) : personaContacts.length === 0 ? (
        <Card variant="quiet">
          <Body muted>{t('dashboard.emptyNoContacts')}</Body>
        </Card>
      ) : attention.length > 0 ? (
        <View style={styles.section}>
          <Eyebrow>{t('dashboard.bringBack')}</Eyebrow>
          {attention.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              interactions={db.interactions}
              health={index.get(c.id)!.health}
            />
          ))}
          {attentionTotal > attention.length && (
            <Body muted>{t('dashboard.more', { n: attentionTotal - attention.length })}</Body>
          )}
        </View>
      ) : (
        <Card variant="quiet">
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
    borderRadius: radii.card,
    padding: 12,
    gap: 2,
    borderWidth: 1.5,
    borderColor: colors.lineMid,
  },
  bucketCount: {
    fontFamily: fonts.display,
    fontSize: 28,
  },
  bucketLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  bucketSelected: {
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(3, 'rgba(59,36,28,0.25)'),
  },
  section: {
    gap: 10,
  },
});
