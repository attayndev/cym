import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Eyebrow } from '@/components/ui';
import { colors, fonts, shadows } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import {
  addProposals,
  dailyRefreshSweep,
  pruneProposals,
  resolveProposals,
  UPDATES_DECK_SIZE,
} from '@/lib/refresh';
import { rhythmProposals } from '@/lib/rhythm';
import type { RefreshState, UpdateProposal } from '@/lib/store';
import { useApp } from '@/state/app-context';

/**
 * The updates deck on Today: up to 10 contacts a day where a signal disagrees
 * with stored details. Two sources feed it — the enrichment sweep (Plus),
 * and rhythm learning (everyone): when the cadence someone actually keeps
 * disagrees with the one set, the deck proposes matching it. Each card shows
 * the diff; Update overwrites on your tap, Keep dismisses for good.
 */
export function UpdatesDeck() {
  const { db, updateContact, celebrateRoleChange } = useApp();
  const { t } = useTranslation();
  const [state, setState] = useState<RefreshState | null>(null);
  const [filledToday, setFilledToday] = useState(0);
  const sweepStarted = useRef(false);
  const isPro = db?.profile.isPro ?? false;

  useEffect(() => {
    if (!db || sweepStarted.current) return;
    sweepStarted.current = true;
    let cancelled = false;
    const run = async () => {
      let fills: Awaited<ReturnType<typeof dailyRefreshSweep>>['fills'] = [];
      if (isPro) {
        const sweep = await dailyRefreshSweep(db);
        fills = sweep.fills;
        for (const f of fills) updateContact(f.contactId, f.patch);
      }
      // Rhythm learning is free-tier too — it's local math, not a lookup.
      const next = await addProposals(rhythmProposals(db, new Date()));
      if (!cancelled) {
        setState(next);
        setFilledToday(fills.length);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [db, isPro, updateContact]);

  if (!db || !state) return null;

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
      for (const p of proposals) {
        updateContact(
          p.contactId,
          p.field === 'cadenceDays' ? { cadenceDays: Number(p.proposed) } : { [p.field]: p.proposed },
        );
      }
      // Accepting a role/company update = a confirmed job change; queue the
      // congrats nudge after the patch so its copy carries the new details.
      if (proposals.some((p) => p.field === 'role' || p.field === 'company')) {
        celebrateRoleChange(proposals[0].contactId);
      }
    }
    void resolveProposals(proposals, action).then(setState);
  };

  const valueLabel = (p: UpdateProposal, v: string) =>
    p.field === 'cadenceDays' ? t('contact.cadenceEvery', { n: Number(v) }) : v;

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
              <View key={p.field}>
                <Text style={styles.diff}>
                  {t(`field.${p.field}`)}: <Text style={styles.old}>{valueLabel(p, p.current)}</Text>
                  {'  →  '}
                  <Text style={styles.new}>{valueLabel(p, p.proposed)}</Text>
                </Text>
                {p.field === 'cadenceDays' && p.observed != null && (
                  <Text style={styles.note}>{t('deck.updates.rhythmNote', { n: p.observed })}</Text>
                )}
              </View>
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
  note: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.muted,
    marginTop: 2,
  },
  quietBtn: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.muted,
  },
});
