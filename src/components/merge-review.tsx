import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Eyebrow } from '@/components/ui';
import { colors, fonts, shadows } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { findMergeCandidates } from '@/lib/dedupe';
import { loadMergeKeeps, saveMergeKeeps } from '@/lib/store';
import type { Contact } from '@/lib/types';
import { useApp } from '@/state/app-context';

const MAX_CARDS = 3;

function line(c: Contact): string {
  return [c.email, c.phone, c.company].filter(Boolean).join(' · ') || '—';
}

/**
 * Possible-duplicates review: loose name matches WITHOUT shared email/phone
 * evidence never auto-merge — the human decides. Merge combines additively;
 * Keep separate is remembered so the pair never re-asks.
 */
export function MergeReview() {
  const { db, mergeContacts } = useApp();
  const { t } = useTranslation();
  const [keeps, setKeeps] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    void loadMergeKeeps().then(setKeeps);
  }, []);

  if (!db || !keeps) return null;

  const byId = new Map(db.contacts.map((c) => [c.id, c]));
  const cards = findMergeCandidates(db)
    .filter((cand) => !keeps[cand.pairKey])
    .slice(0, MAX_CARDS);
  if (cards.length === 0) return null;

  const keepSeparate = (pairKey: string) => {
    const next = { ...keeps, [pairKey]: new Date().toISOString() };
    setKeeps(next);
    void saveMergeKeeps(next);
  };

  return (
    <View style={styles.section}>
      <Eyebrow>{t('merge.title')}</Eyebrow>
      <Body muted>{t('merge.sub')}</Body>
      {cards.map((cand) => {
        const a = byId.get(cand.keeperId);
        const b = byId.get(cand.dupeId);
        if (!a || !b) return null;
        return (
          <View key={cand.pairKey} style={styles.card}>
            {[a, b].map((c) => (
              <View key={c.id} style={styles.person}>
                <Text style={styles.name}>
                  {c.firstName} {c.lastName ?? ''}
                </Text>
                <Text style={styles.detail}>{line(c)}</Text>
              </View>
            ))}
            <View style={styles.buttons}>
              <Pressable
                onPress={() => mergeContacts(cand.keeperId, cand.dupeId)}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}>
                <Text style={styles.primaryBtnText}>{t('merge.merge')}</Text>
              </Pressable>
              <Pressable onPress={() => keepSeparate(cand.pairKey)} hitSlop={8}>
                <Text style={styles.quietBtn}>{t('merge.keep')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.nudge,
  },
  person: {
    gap: 1,
  },
  name: {
    fontFamily: fonts.displayMedium,
    fontSize: 17,
    color: colors.ink,
  },
  detail: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.inkSoft,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: colors.cherry,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.espresso,
  },
  primaryBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.cream,
  },
  quietBtn: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.muted,
  },
});
