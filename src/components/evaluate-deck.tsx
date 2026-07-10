import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Eyebrow } from '@/components/ui';
import { colors, fonts, shadows } from '@/constants/theme';
import { relativeTime, useTranslation } from '@/i18n';
import { DECK_SIZE, evaluateRanked, localDayKey, type EvaluateCandidate } from '@/lib/deck';
import {
  dismissInboxSuggestion,
  enrichFromHunter,
  fetchInboxSuggestions,
  hunterPatch,
  type InboxSuggestion,
} from '@/lib/enrich';
import { looseNameKey } from '@/lib/dedupe';
import { loadDeckCollapsed, loadDeckSkips, saveDeckCollapsed, saveDeckSkips } from '@/lib/store';
import { canTrackMore } from '@/lib/tier';
import type { Category } from '@/lib/types';
import { useApp } from '@/state/app-context';

const CATEGORIES: Category[] = ['family', 'friend', 'professional', 'client', 'mentor', 'other'];
const CADENCES = [30, 90, 180] as const;

/**
 * The evaluate deck on Today: up to DECK_SIZE unevaluated imports per day,
 * correspondence-ranked. Verdicts: Track (inline category+cadence pick),
 * Skip (not today — the daily rotation resurfaces them), Never (archive,
 * CYM-only). The deck visibly burns down as verdicts land.
 */
export function EvaluateDeck() {
  const { db, activePersonaId, trackContact, archiveContacts, captureContact, updateContact } =
    useApp();
  const { t } = useTranslation();
  const router = useRouter();

  const day = localDayKey(new Date());
  const [skips, setSkips] = useState<string[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('friend');
  const [cadence, setCadence] = useState<number>(90);
  const [inbox, setInbox] = useState<InboxSuggestion[]>([]);

  useEffect(() => {
    void loadDeckSkips(day).then(setSkips);
  }, [day]);

  useEffect(() => {
    void fetchInboxSuggestions(10)
      .then(setInbox)
      .catch(() => {});
  }, []);

  const deck: EvaluateCandidate[] = useMemo(() => {
    if (!db || !skips) return [];
    const skipped = new Set(skips);
    return evaluateRanked(db, new Date(), activePersonaId)
      .filter((e) => !skipped.has(e.contact.id))
      .slice(0, DECK_SIZE);
  }, [db, skips, activePersonaId]);

  // Re-check suggestions against local contacts: one may have been added on
  // another device, or the address may live in someone's alt emails.
  const { knownEmails, knownNames } = useMemo(() => {
    const emails = new Set<string>();
    const names = new Set<string>();
    for (const c of db?.contacts ?? []) {
      if (c.email) emails.add(c.email.toLowerCase());
      for (const e of c.altEmails ?? []) emails.add(e.toLowerCase());
      if (c.status !== 'archived') {
        const key = looseNameKey(c.firstName, c.lastName);
        if (key) names.add(key);
      }
    }
    return { knownEmails: emails, knownNames: names };
  }, [db]);
  // Filter by address AND name: someone already tracked under a different
  // email is not an "add" — re-asking is exactly the bug this guards.
  const inboxCards = inbox
    .filter((s) => {
      if (knownEmails.has(s.email.toLowerCase())) return false;
      const tokens = (s.name ?? '').trim().split(/\s+/);
      const key = looseNameKey(tokens[0], tokens.slice(1).join(' '));
      return !(key && knownNames.has(key));
    })
    .slice(0, 3);

  // Plus: background-enrich today's candidates that lack role/company, so the
  // card meta line shows "VP Eng · Stripe" before you judge. Sequential (the
  // server caps and caches anyway); attempted-set stops re-fires when the db
  // updates underneath us.
  const attempted = useRef<Set<string>>(new Set());
  const isPro = db?.profile.isPro ?? false;
  useEffect(() => {
    if (!isPro) return;
    const targets = deck
      .map((e) => e.contact)
      .filter((c) => c.email && !c.role && !c.company && !attempted.current.has(c.id));
    if (targets.length === 0) return;
    for (const c of targets) attempted.current.add(c.id);
    void (async () => {
      let first = true;
      for (const c of targets) {
        if (!first) await new Promise((r) => setTimeout(r, 350));
        first = false;
        const result = await enrichFromHunter(c.email!);
        const patch = result ? hunterPatch(c, result) : null;
        if (patch) updateContact(c.id, patch);
      }
    })();
  }, [deck, isPro, updateContact]);

  if (!db || !skips || (deck.length === 0 && inboxCards.length === 0)) return null;

  const addSuggestion = (s: InboxSuggestion) => {
    if (db && !canTrackMore(db)) {
      router.push('/paywall');
      return;
    }
    const tokens = (s.name ?? '').trim().split(/\s+/).filter(Boolean);
    const first = tokens[0] ?? s.email.split('@')[0];
    const last = tokens.length > 1 ? tokens.slice(1).join(' ') : undefined;
    // If this person already exists by name (their contact just lacked this
    // email address), attach the address instead of minting a twin. Loose
    // matching: a middle initial in the email display name is still them.
    const key = looseNameKey(first, last);
    const existing = db?.contacts.find(
      (c) => c.status !== 'archived' && key !== null && looseNameKey(c.firstName, c.lastName) === key,
    );
    if (existing) {
      updateContact(
        existing.id,
        existing.email
          ? { altEmails: [...(existing.altEmails ?? []), s.email] }
          : { email: s.email },
      );
    } else {
      captureContact({
        firstName: first,
        lastName: last,
        email: s.email,
        category: 'other',
        importance: 2,
        cadenceDays: 90,
      });
    }
    setInbox((prev) => prev.filter((x) => x.email !== s.email));
    void dismissInboxSuggestion(s.email);
  };

  const dismissSuggestion = (email: string) => {
    setInbox((prev) => prev.filter((x) => x.email !== email));
    void dismissInboxSuggestion(email);
  };

  const skip = (id: string) => {
    const next = [...skips, id];
    setSkips(next);
    void saveDeckSkips(day, next);
    if (picking === id) setPicking(null);
  };

  const startTracking = (id: string) => {
    setPicking(id);
    setCategory('friend');
    setCadence(90);
  };

  const confirmTrack = (id: string) => {
    if (db && !canTrackMore(db)) {
      router.push('/paywall');
      return;
    }
    const tracked = deck.find((e) => e.contact.id === id)?.contact;
    trackContact(id, category, cadence);
    setPicking(null);
    // Newly tracked contacts earn a lookup even if they had partial details.
    if (isPro && tracked?.email) {
      void enrichFromHunter(tracked.email).then((result) => {
        const patch = result ? hunterPatch(tracked, result) : null;
        if (patch) updateContact(id, patch);
      });
    }
  };

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    void loadDeckCollapsed().then(setCollapsed);
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((v) => {
      void saveDeckCollapsed(!v);
      return !v;
    });

  const signal = (e: EvaluateCandidate) =>
    e.emailCount > 0
      ? t('deck.signal.emails', {
          count: e.emailCount,
          when: relativeTime(e.lastEmailAt!, new Date()),
        })
      : t('deck.signal.imported', { when: relativeTime(e.contact.createdAt, new Date()) });

  return (
    <View style={styles.section}>
      {inboxCards.length > 0 && (
        <>
          <Eyebrow>{t('deck.inbox.title')}</Eyebrow>
          {inboxCards.map((s) => (
            <View key={s.email} style={styles.card}>
              <Text style={styles.name}>{s.name ?? s.email.split('@')[0]}</Text>
              <Text style={styles.meta}>{s.email}</Text>
              <Text style={styles.signal}>
                {t('deck.signal.emails', {
                  count: s.messageCount,
                  when: relativeTime(s.lastSeenAt ?? new Date().toISOString(), new Date()),
                })}
              </Text>
              <View style={styles.buttons}>
                <Pressable
                  onPress={() => addSuggestion(s)}
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.primaryBtnText}>{t('deck.add')}</Text>
                </Pressable>
                <Pressable onPress={() => dismissSuggestion(s.email)} hitSlop={8}>
                  <Text style={styles.quietBtn}>{t('deck.dismiss')}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}
      {deck.length > 0 && (
        <>
          <Pressable onPress={toggleCollapsed} style={styles.collapseHeader} hitSlop={6}>
            <Eyebrow>
              {t('deck.evaluate.title')}
              {collapsed ? `  (${deck.length})` : ''}
            </Eyebrow>
            <Feather
              name={collapsed ? 'chevron-down' : 'chevron-up'}
              size={18}
              color={colors.espresso}
            />
          </Pressable>
          {!collapsed && <Body muted>{t('deck.evaluate.sub')}</Body>}
        </>
      )}
      {(collapsed ? [] : deck).map((e) => {
        const c = e.contact;
        const meta = [c.role, c.company].filter(Boolean).join(' · ');
        return (
          <View key={c.id} style={styles.card}>
            <Text style={styles.name}>
              {c.firstName} {c.lastName ?? ''}
            </Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            <Text style={styles.signal}>{signal(e)}</Text>

            {picking === c.id ? (
              <View style={styles.picker}>
                <View style={styles.chipRow}>
                  {CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(cat)}
                      style={[styles.chip, category === cat && styles.chipActive]}>
                      <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                        {t(`category.${cat}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.chipRow}>
                  {CADENCES.map((days) => (
                    <Pressable
                      key={days}
                      onPress={() => setCadence(days)}
                      style={[styles.chip, cadence === days && styles.chipActive]}>
                      <Text style={[styles.chipText, cadence === days && styles.chipTextActive]}>
                        {t(`deck.cadence.${days}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.buttons}>
                  <Pressable
                    onPress={() => confirmTrack(c.id)}
                    style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}>
                    <Text style={styles.primaryBtnText}>{t('deck.track.confirm')}</Text>
                  </Pressable>
                  <Pressable onPress={() => setPicking(null)} hitSlop={8}>
                    <Text style={styles.quietBtn}>{t('common.cancel')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.buttons}>
                <Pressable
                  onPress={() => startTracking(c.id)}
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.primaryBtnText}>{t('deck.track')}</Text>
                </Pressable>
                <Pressable onPress={() => skip(c.id)} hitSlop={8}>
                  <Text style={styles.quietBtn}>{t('deck.skip')}</Text>
                </Pressable>
                <Pressable onPress={() => archiveContacts([c.id])} hitSlop={8}>
                  <Text style={styles.quietBtn}>{t('deck.never')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    gap: 10,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    gap: 4,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.nudge,
  },
  name: {
    fontFamily: fonts.displayMedium,
    fontSize: 18,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkSoft,
  },
  signal: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: colors.cherryDeep,
    marginTop: 2,
  },
  picker: {
    gap: 8,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.espresso,
    backgroundColor: colors.white,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  chipActive: {
    backgroundColor: colors.butter,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.inkSoft,
  },
  chipTextActive: {
    fontFamily: fonts.sansBold,
    color: colors.espresso,
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
