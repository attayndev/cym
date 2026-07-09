import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Eyebrow } from '@/components/ui';
import { colors, fonts, shadows } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import {
  dailyRefreshSweep,
  pruneProposals,
  resolveProposals,
  UPDATES_DECK_SIZE,
} from '@/lib/refresh';
import type { RefreshState, UpdateProposal } from '@/lib/store';
import { useApp } from '@/state/app-context';

/**
 * The updates deck on Today (Plus): up to 10 contacts a day where public
 * sources disagree with stored details. Each card shows the diff; Update
 * overwrites on your tap, Keep dismisses that proposal for good.
 */
export function UpdatesDeck() {
  const { db, updateContact } = useApp();
  const { t } = useTranslation();
  const [state, setState] = useState<RefreshState | null>(null);
  const [filledToday, setFilledToday] = useState(0);
  const sweepStarted = useRef(false);
  const isPro = db?.profile.isPro ?? false;

  useEffect(() => {
    if (!db || !isPro || sweepStarted.current) return;
    sweepStarted.current = true;
    let cancelled = false;
    void dailyRefreshSweep(db).then(({ state: next, fills }) => {
      for (const f of fills) updateContact(f.contactId, f.patch);
      if (!cancelled) {
        setState(next);
        setFilledToday(fills.length);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, isPro, updateContact]);

  if (!db || !isPro || !state) return null;

  const byContact = new Map<string, UpdateProposal[]>();
  for (const p of pruneProposals(state, db)) {
    byContact.set(p.contactId, [...(byContact.get(p.contactId) ?? []), p]);
  }
  const cards = [...byContact.entries()].slice(0, UPDATES_DECK_SIZE);
  if (cards.length === 0) {
    // No conflicts to judge — but say when the sweep quietly filled blanks,
    // so enrichment is visibly alive.
    if (filledToday > 0) {
      return (
        <View style={styles.section}>
          <Body muted>{t('deck.updates.filledQuietly', { n: filledToday })}</Body>
        </View>
      );
    }
    return null;
  }

  const resolve = (proposals: UpdateProposal[], action: 'update' | 'keep') => {
    if (action === 'update') {
      for (const p of proposals) updateContact(p.contactId, { [p.field]: p.proposed });
    }
    void resolveProposals(proposals, action).then(setState);
  };

  return (
    <View style={styles.section}>
      <Eyebrow>{t('deck.updates.title')}</Eyebrow>
      <Body muted>{t('deck.updates.sub')}</Body>
      {cards.map(([contactId, proposals]) => {
        const contact = db.contacts.find((c) => c.id === contactId);
        if (!contact) return null;
        return (
          <View key={contactId} style={styles.card}>
            <Text style={styles.name}>
              {contact.firstName} {contact.lastName ?? ''}
            </Text>
            {proposals.map((p) => (
              <Text key={p.field} style={styles.diff}>
                {t(`field.${p.field}`)}: <Text style={styles.old}>{p.current}</Text>
                {'  →  '}
                <Text style={styles.new}>{p.proposed}</Text>
              </Text>
            ))}
            <View style={styles.buttons}>
              <Pressable
                onPress={() => resolve(proposals, 'update')}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}>
                <Text style={styles.primaryBtnText}>{t('deck.updates.apply')}</Text>
              </Pressable>
              <Pressable onPress={() => resolve(proposals, 'keep')} hitSlop={8}>
                <Text style={styles.quietBtn}>{t('deck.updates.keep')}</Text>
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
    gap: 5,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.nudge,
  },
  name: {
    fontFamily: fonts.displayMedium,
    fontSize: 18,
    color: colors.ink,
  },
  diff: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.inkSoft,
  },
  old: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  new: {
    fontFamily: fonts.sansBold,
    color: colors.cherryDeep,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 8,
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
