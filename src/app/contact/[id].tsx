import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { confirmAction, notify } from '@/lib/alert';
import { HealthBadge } from '@/components/health-badge';
import { Body, Button, Card, Display, Eyebrow, Row, Screen, ScreenLoading } from '@/components/ui';
import { colors, fonts, radii } from '@/constants/theme';
import { formatMonthDay, formatShortDate, relativeTime, useTranslation, type TKey } from '@/i18n';
import { addDays, isoDate } from '@/lib/dates';
import { composerNote, draftSubject, generateDraft, toneCycle } from '@/lib/drafts';
import { enrichFromHunter, hunterConflicts, hunterPatch } from '@/lib/enrich';
import { applyCard, fetchCards, parseCardToken } from '@/lib/living-cards';
import { diag } from '@/lib/log';
import { dismissMemory, extractMemory, fetchContactMemory, liveMemory, memoryLines } from '@/lib/memory';
import { addProposals, resolveProposals } from '@/lib/refresh';
import { loadRefreshState, type UpdateProposal } from '@/lib/store';
import { contactHealth, lastTouchAt } from '@/lib/nudges';
import type { Channel, Contact, ContactMemory, InteractionType, Nudge } from '@/lib/types';
import { useApp } from '@/state/app-context';

/** A synthetic no-occasion "nudge" so the draft engine can write a
 *  keep-in-touch note outside the Today flow. Never stored. */
function keepInTouchNudge(contact: Contact): Nudge {
  const name = contact.firstName;
  return {
    id: 'compose-adhoc',
    contactId: contact.id,
    kind: 'decay',
    headline: { key: 'compose.idea.headline', params: { name } },
    reason: { key: 'compose.idea.reason' },
    suggestedAction: { key: 'compose.idea.action', params: { name } },
    state: 'pending',
    createdAt: new Date().toISOString(),
    score: 0,
  };
}

const HISTORY_LABEL: Record<InteractionType, TKey> = {
  met: 'log.met',
  call: 'log.call',
  text: 'log.text',
  email: 'log.email',
  coffee: 'log.coffee',
  meeting: 'log.meeting',
};

const LOG_TYPES: {
  type: InteractionType;
  key: TKey;
  icon: 'phone' | 'message-circle' | 'mail' | 'coffee';
}[] = [
  { type: 'call', key: 'log.call', icon: 'phone' },
  { type: 'text', key: 'log.text', icon: 'message-circle' },
  { type: 'email', key: 'log.email', icon: 'mail' },
  { type: 'coffee', key: 'log.coffee', icon: 'coffee' },
];

/** Composer channels: the two OS-native ones plus messenger deep links.
 *  WhatsApp supports prefilled text; Telegram and Signal deliberately don't,
 *  so those two get clipboard + open-the-chat. */
type ComposeChannel = Channel | 'whatsapp' | 'telegram' | 'signal';

export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, logInteraction, removeContact, updateContact, updateContext } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  // Inline reach-out composer: null = collapsed.
  const [channel, setChannel] = useState<ComposeChannel | null>(null);
  const [noteContext, setNoteContext] = useState('');
  const [copied, setCopied] = useState(false);
  const [draftLimited, setDraftLimited] = useState(false);
  const [linkingCard, setLinkingCard] = useState(false);
  const [cardUrl, setCardUrl] = useState('');
  const [cardBusy, setCardBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<'ai' | 'template' | null>(null);
  const [writing, setWriting] = useState(false);
  // Tone is chosen via the chips and STAYS PUT; refresh regenerates a fresh
  // idea within the current tone (variant bumps the prompt for a new angle).
  const [toneIndex, setToneIndex] = useState(0);
  const [variant, setVariant] = useState(0);
  const [enriching, setEnriching] = useState(false);
  // Pending update proposals (from the daily sweep or a manual lookup) —
  // highlighted on this screen so a contact you look up shows its diffs.
  const [proposals, setProposals] = useState<UpdateProposal[]>([]);
  // Relationship Memory (Plus): per-contact facts/threads fetched on mount.
  const [memory, setMemory] = useState<ContactMemory[]>([]);
  const isPro = db?.profile.isPro ?? false;

  useEffect(() => {
    let cancelled = false;
    void loadRefreshState().then((s) => {
      if (!cancelled) setProposals(s.proposals);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!isPro || !id) {
      setMemory([]);
      return;
    }
    let cancelled = false;
    void fetchContactMemory(id).then((rows) => {
      if (!cancelled) setMemory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isPro]);

  if (!db) return <ScreenLoading />;

  const contact = db.contacts.find((c) => c.id === id);
  if (!contact || contact.status === 'archived') {
    return (
      <Screen>
        <Body>{t('contact.notFound')}</Body>
      </Screen>
    );
  }

  const now = new Date();
  const context = db.contexts.find((c) => c.contactId === contact.id);
  const interactions = db.interactions
    .filter((i) => i.contactId === contact.id)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const last = lastTouchAt(contact, db.interactions);
  const health = contactHealth(contact, db.interactions, now);

  const activeProposals = proposals.filter(
    (p) => p.contactId === contact.id && (contact[p.field] ?? '') === p.current,
  );

  const resolveUpdates = (action: 'update' | 'keep') => {
    if (action === 'update') {
      for (const p of activeProposals) updateContact(contact.id, { [p.field]: p.proposed });
    }
    void resolveProposals(activeProposals, action).then((s) => setProposals(s.proposals));
  };

  const contextRows = [
    { label: t('contact.context.whereMet'), value: context?.whereMet },
    { label: t('contact.context.discussed'), value: context?.discussed },
    { label: t('contact.context.whyMatters'), value: context?.whyMatters },
  ].filter((row) => row.value);

  // "Recent threads": the last few notes this person's interactions carry —
  // Plus-gated display (Phase 0: verbatim notes, no extraction yet).
  const threadNotes = interactions.filter((i) => i.note?.trim()).slice(0, 3);

  // Personal wins over work when both exist — contact.email/phone stay the
  // primary; workEmail/workPhone are only a fallback for reaching someone
  // who's only given us their work address.
  const bestEmail = contact.email || contact.workEmail;
  const bestPhone = contact.phone || contact.workPhone;
  const canText = Boolean(bestPhone);
  const canEmail = Boolean(bestEmail);

  const tones = toneCycle(contact);
  const tone = tones[toneIndex % tones.length];
  const hasDraft = draft !== '' || source !== null;

  // Plus-only memory signal (Phase 0): the last few notes this person's
  // interactions carry, verbatim, newest first — `interactions` is already
  // sorted that way above.
  const recentNotes = interactions
    .map((i) => i.note?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 3);

  // Relationship Memory (Plus): live rows (expired threads dropped) for both
  // the "What you know" display and the composer prompt.
  const liveMem = liveMemory(memory, now);
  const memLines = isPro ? memoryLines(liveMem) : [];
  const memoryRows = liveMem.slice(0, 6);

  const composeInput = (ch: ComposeChannel, toneIdx = toneIndex, variantN = variant) => ({
    contact,
    context,
    nudge: keepInTouchNudge(contact),
    // Messenger drafts read like texts, not emails.
    channel: (ch === 'email' ? 'email' : 'text') as Channel,
    userContext: noteContext,
    profile: db.profile,
    tone: tones[toneIdx % tones.length],
    variant: variantN,
    ...(db.profile.isPro && recentNotes.length > 0 ? { recentNotes } : {}),
    ...(memLines.length > 0 ? { memoryLines: memLines } : {}),
  });

  // One tap converts "I should reach out" into a dated promise the engine
  // will make sure you keep — the hero line, as a mechanic.
  const promiseNextWeek = () => {
    const commitment = t('contact.promiseWeek.commitment', { name: contact.firstName });
    updateContext(contact.id, {
      commitment,
      commitmentDueAt: isoDate(addDays(new Date(), 7)),
    });
    if (db.profile.isPro) {
      extractMemory({ contactId: contact.id, text: commitment, source: 'commitment' });
    }
    notify(t('contact.promiseWeek.done', { name: contact.firstName }));
  };

  const dismissMemoryRow = (memId: string) => {
    setMemory((prev) => prev.filter((m) => m.id !== memId));
    void dismissMemory(memId);
  };

  const writeDraft = async (ch: ComposeChannel, toneIdx = toneIndex, variantN = 0) => {
    setChannel(ch);
    setCopied(false);
    setToneIndex(toneIdx);
    setVariant(variantN);
    setWriting(true);
    const result = await generateDraft(composeInput(ch, toneIdx, variantN));
    setDraft(result.text);
    setSource(result.source);
    setDraftLimited(Boolean(result.limitReached));
    setWriting(false);
  };

  // Opening (or switching) the composer never generates — the person hits
  // the generate button when they're ready.
  const openComposer = (ch: ComposeChannel) => {
    setChannel(ch);
    setDraft('');
    setSource(null);
    setCopied(false);
    setToneIndex(0);
    setVariant(0);
  };

  // E.164-ish digits for messenger links (bare 10-digit numbers assume US).
  const msgrDigits = () => {
    let d = (bestPhone ?? '').replace(/\D/g, '');
    if (d.length === 10) d = `1${d}`;
    return d;
  };

  const openInApp = () => {
    if (!channel) return;
    const encoded = encodeURIComponent(draft);
    if (channel === 'email' && bestEmail) {
      const subject = encodeURIComponent(draftSubject(composeInput(channel)));
      Linking.openURL(`mailto:${bestEmail}?subject=${subject}&body=${encoded}`);
    } else if (channel === 'whatsapp' && bestPhone) {
      Linking.openURL(`https://wa.me/${msgrDigits()}?text=${encoded}`);
    } else if (channel === 'telegram' && bestPhone) {
      // No prefill support — carry the draft on the clipboard.
      void Clipboard.setStringAsync(draft);
      setCopied(true);
      Linking.openURL(`https://t.me/+${msgrDigits()}`);
    } else if (channel === 'signal' && bestPhone) {
      void Clipboard.setStringAsync(draft);
      setCopied(true);
      Linking.openURL(`https://signal.me/#p/+${msgrDigits()}`);
    } else if (bestPhone) {
      // Query form — current iOS stopped percent-decoding the legacy `&body=`.
      Linking.openURL(`sms:${bestPhone}?body=${encoded}`);
    }
  };

  const closeComposer = () => {
    setChannel(null);
    setCopied(false);
    setNoteContext('');
    setDraft('');
    setSource(null);
    setToneIndex(0);
    setVariant(0);
  };

  const markSent = () => {
    if (!channel) return;
    const note = composerNote(noteContext, draft);
    logInteraction(contact.id, channel === 'email' ? 'email' : 'text', note);
    if (note) diag('composer-note', { contactId: contact.id, len: note.length });
    if (db.profile.isPro) {
      const text = [noteContext, draft].filter(Boolean).join('\n');
      extractMemory({ contactId: contact.id, text, source: 'draft' });
    }
    closeComposer();
  };

  // Hunter enrichment (Plus): send the email, fill only blank fields.
  const handleEnrich = async () => {
    if (!db.profile.isPro) {
      router.push('/paywall');
      return;
    }
    if (!contact.email) return;
    setEnriching(true);
    try {
      const result = await enrichFromHunter(contact.email);
      const patch = result ? hunterPatch(contact, result) : null;
      const conflicts = result ? hunterConflicts(contact, result) : [];
      if (patch) updateContact(contact.id, patch);
      if (conflicts.length > 0) {
        const found = conflicts.map((c) => ({
          contactId: contact.id,
          ...c,
          foundAt: new Date().toISOString(),
        }));
        const next = await addProposals(found);
        setProposals(next.proposals);
      }
      if (patch) {
        notify(t('contact.enrich.filled', { fields: Object.keys(patch).join(', ') }));
      } else if (conflicts.length === 0) {
        notify(t('contact.enrich.nothing'));
      }
    } finally {
      setEnriching(false);
    }
  };

  // Living card: paste their share link once; their card updates flow in.
  const linkCard = async () => {
    const token = parseCardToken(cardUrl);
    if (!token) {
      notify(t('contact.card.error'));
      return;
    }
    setCardBusy(true);
    try {
      const [card] = await fetchCards([token]);
      if (!card || card.gone) {
        notify(t('contact.card.error'));
        return;
      }
      const next = applyCard({ ...contact, cardToken: token }, card);
      updateContact(contact.id, {
        firstName: next.firstName,
        lastName: next.lastName,
        role: next.role,
        company: next.company,
        city: next.city,
        email: next.email,
        phone: next.phone,
        altEmails: next.altEmails,
        altPhones: next.altPhones,
        cardToken: token,
      });
      setLinkingCard(false);
      setCardUrl('');
    } finally {
      setCardBusy(false);
    }
  };

  const confirmRemove = () => {
    confirmAction(
      {
        title: t('contact.remove.confirm', { name: contact.firstName }),
        body: t('contact.remove.confirmBody'),
        confirmText: t('common.remove'),
        cancelText: t('common.cancel'),
        destructive: true,
      },
      () => {
        removeContact(contact.id);
        // back() is a silent no-op on web when there's no history entry —
        // land on People explicitly so the removal is visible.
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/people');
      },
    );
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Pressable onPress={() => router.push(`/contact/edit/${contact.id}`)} hitSlop={10}>
          <Feather name="edit-2" size={19} color={colors.inkSoft} />
        </Pressable>
      </View>

      <View style={styles.header}>
        <Display>
          {contact.firstName} {contact.lastName ?? ''}
        </Display>
        {(contact.role || contact.company) && (
          <Body muted>{[contact.role, contact.company].filter(Boolean).join(' · ')}</Body>
        )}
        <Row style={{ marginTop: 4 }}>
          <HealthBadge health={health} />
          <Text style={styles.meta}>
            {last === null
              ? t('common.noTouchYet')
              : t('common.lastTouch', { when: relativeTime(last, now) })}
          </Text>
        </Row>
        <Text style={styles.headerMeta}>
          {[
            t(`category.${contact.category}`),
            t('contact.cadenceEvery', { n: contact.cadenceDays }),
            contact.birthday && `🎂 ${formatMonthDay(contact.birthday)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Row style={{ marginTop: 2 }}>
          {contact.linkedin && (
            <Pressable
              onPress={() => void Linking.openURL(`https://www.linkedin.com/in/${contact.linkedin}`)}
              hitSlop={6}>
              <Text style={styles.inlineLink}>LinkedIn ↗</Text>
            </Pressable>
          )}
          {contact.email && (
            <Pressable onPress={() => void handleEnrich()} disabled={enriching} hitSlop={6}>
              <Text style={styles.inlineLink}>
                {enriching ? t('contact.enriching') : t('contact.enrich')}
              </Text>
            </Pressable>
          )}
          {contact.cardToken ? (
            <Text style={styles.livingBadge}>{t('contact.card.linked')}</Text>
          ) : (
            <Pressable onPress={() => setLinkingCard((v) => !v)} hitSlop={6}>
              <Text style={styles.inlineLink}>{t('contact.card.link')}</Text>
            </Pressable>
          )}
        </Row>
        {linkingCard && !contact.cardToken && (
          <Row style={{ marginTop: 6 }}>
            <TextInput
              style={[styles.contextInput, { flex: 1 }]}
              value={cardUrl}
              onChangeText={setCardUrl}
              placeholder={t('contact.card.placeholder')}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!cardBusy}
              onSubmitEditing={() => void linkCard()}
              returnKeyType="done"
            />
          </Row>
        )}
      </View>

      {activeProposals.length > 0 && (
        <View style={styles.updateCard}>
          <Text style={styles.updateTitle}>{t('deck.updates.title')}</Text>
          {activeProposals.map((p) => (
            <Text key={p.field} style={styles.updateDiff}>
              {t(`field.${p.field}`)}: <Text style={styles.updateOld}>{p.current}</Text>
              {'  →  '}
              <Text style={styles.updateNew}>{p.proposed}</Text>
            </Text>
          ))}
          <View style={styles.updateBtns}>
            <Pressable
              onPress={() => resolveUpdates('update')}
              style={({ pressed }) => [styles.updateApply, pressed && { opacity: 0.8 }]}>
              <Text style={styles.updateApplyText}>{t('deck.updates.apply')}</Text>
            </Pressable>
            <Pressable onPress={() => resolveUpdates('keep')} hitSlop={8}>
              <Text style={styles.updateKeep}>{t('deck.updates.keep')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Eyebrow>{t('contact.reachOut')}</Eyebrow>
        <Row>
          <Pressable
            onPress={() => openComposer('text')}
            disabled={!canText || writing}
            style={({ pressed }) => [
              styles.reachBtn,
              channel === 'text' && styles.reachBtnActive,
              (!canText || pressed) && { opacity: canText ? 0.7 : 0.35 },
            ]}>
            <Feather
              name="message-circle"
              size={14}
              color={channel === 'text' ? colors.cream : colors.ink}
            />
            <Text style={[styles.reachBtnText, channel === 'text' && styles.reachBtnTextActive]}>
              {t('contact.sendText')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => openComposer('email')}
            disabled={!canEmail || writing}
            style={({ pressed }) => [
              styles.reachBtn,
              channel === 'email' && styles.reachBtnActive,
              (!canEmail || pressed) && { opacity: canEmail ? 0.7 : 0.35 },
            ]}>
            <Feather
              name="mail"
              size={14}
              color={channel === 'email' ? colors.cream : colors.ink}
            />
            <Text style={[styles.reachBtnText, channel === 'email' && styles.reachBtnTextActive]}>
              {t('contact.sendEmail')}
            </Text>
          </Pressable>
        </Row>
        <Pressable onPress={promiseNextWeek} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
          <Text style={styles.promiseLink}>{t('contact.promiseWeek')}</Text>
        </Pressable>
        {canText && (
          <Row>
            {(
              [
                { ch: 'whatsapp', icon: 'message-square', label: 'compose.channel.whatsapp' },
                { ch: 'telegram', icon: 'send', label: 'compose.channel.telegram' },
                { ch: 'signal', icon: 'lock', label: 'compose.channel.signal' },
              ] as const
            ).map(({ ch, icon, label }) => (
              <Pressable
                key={ch}
                onPress={() => openComposer(ch)}
                disabled={writing}
                style={({ pressed }) => [
                  styles.reachBtn,
                  channel === ch && styles.reachBtnActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <Feather name={icon} size={14} color={channel === ch ? colors.cream : colors.ink} />
                <Text style={[styles.reachBtnText, channel === ch && styles.reachBtnTextActive]}>
                  {t(label)}
                </Text>
              </Pressable>
            ))}
          </Row>
        )}

        {channel && (
          <View style={styles.composer}>
            <View style={styles.composerHeader}>
              <View style={{ flex: 1 }}>
                {(writing || source !== null) && (
                  <Text style={styles.sourceTag}>
                    {writing
                      ? t('compose.writing')
                      : source === 'ai'
                        ? t('compose.source.ai')
                        : t('compose.source.template')}
                  </Text>
                )}
              </View>
              <Pressable onPress={closeComposer} hitSlop={8}>
                <Feather name="x" size={17} color={colors.inkSoft} />
              </Pressable>
            </View>
            <Text style={styles.ctxLabel}>{t('compose.context.label')}</Text>
            <TextInput
              style={[styles.contextInput, styles.composerContextBox]}
              value={noteContext}
              onChangeText={setNoteContext}
              placeholder={t('compose.context.hint')}
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.toneRow}>
              {tones.map((tn, i) => {
                const active = tn === tone;
                return (
                  <Pressable
                    key={tn}
                    onPress={() => (hasDraft ? void writeDraft(channel, i) : setToneIndex(i))}
                    disabled={writing}
                    style={[styles.toneChip, active && styles.toneChipActive]}>
                    <Text style={[styles.toneChipText, active && styles.toneChipTextActive]}>
                      {t(`tone.${tn}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={() => void writeDraft(channel, toneIndex, hasDraft ? variant + 1 : 0)}
              disabled={writing}
              style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}>
              <Feather name={hasDraft ? 'refresh-cw' : 'feather'} size={15} color={colors.cream} />
              <Text style={styles.generateBtnText}>
                {hasDraft ? t('compose.regen') : t('compose.generate')}
              </Text>
            </Pressable>
            {writing && (
              <View style={styles.writingBox}>
                <ActivityIndicator color={colors.ink} />
              </View>
            )}
            {!writing && hasDraft && (
              <TextInput
                style={styles.draftInput}
                value={draft}
                onChangeText={setDraft}
                multiline
              />
            )}
            {hasDraft && (
              <Button
                title={
                  channel === 'email'
                    ? t('compose.openMail')
                    : channel === 'whatsapp'
                      ? t('compose.openWhatsApp')
                      : channel === 'telegram'
                        ? t('compose.openTelegram')
                        : channel === 'signal'
                          ? t('compose.openSignal')
                          : t('compose.openMessages')
                }
                onPress={openInApp}
                disabled={writing}
              />
            )}
            {draftLimited && (
              <Pressable onPress={() => router.push('/paywall')} hitSlop={6}>
                <Text style={styles.copiedHint}>{t('compose.draftLimit')}</Text>
              </Pressable>
            )}
            {copied && <Text style={styles.copiedHint}>{t('compose.copiedHint')}</Text>}
            {hasDraft && (
              <Button
                title={t('compose.markSent')}
                variant="ghost"
                onPress={markSent}
                disabled={writing}
              />
            )}
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>{t('contact.logTouchpoint')}</Eyebrow>
        <Body muted style={{ fontSize: 13, lineHeight: 18 }}>
          {t('contact.logHint')}
        </Body>
        <Row>
          {LOG_TYPES.map((item) => (
            <Pressable
              key={item.type}
              onPress={() => logInteraction(contact.id, item.type)}
              style={({ pressed }) => [styles.logBtn, pressed && { opacity: 0.6 }]}>
              <Feather name={item.icon} size={14} color={colors.ink} />
              <Text style={styles.logBtnText}>{t(item.key)}</Text>
            </Pressable>
          ))}
        </Row>
      </View>

      {isPro && memoryRows.length > 0 && (
        <Card variant="quiet">
          <Eyebrow>{t('contact.memory.title')}</Eyebrow>
          {memoryRows.map((m) => (
            <View key={m.id} style={styles.memoryRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.memoryContent} numberOfLines={2}>
                  {m.content}
                </Text>
                {m.kind === 'thread' && m.expiresAt && (
                  <Text style={styles.memoryMeta}>
                    {t('contact.memory.until', { date: formatShortDate(m.expiresAt) })}
                  </Text>
                )}
              </View>
              <Pressable onPress={() => dismissMemoryRow(m.id)} hitSlop={8}>
                <Feather name="x" size={14} color={colors.inkSoft} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {threadNotes.length > 0 &&
        (db.profile.isPro ? (
          <Card variant="quiet">
            <Eyebrow>{t('contact.threads.title')}</Eyebrow>
            {threadNotes.map((i) => (
              <View key={i.id} style={{ gap: 2 }}>
                <Text style={styles.ctxLabel}>{relativeTime(i.occurredAt, now)}</Text>
                <Text style={styles.threadNote} numberOfLines={3}>
                  {i.note}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <Pressable
            onPress={() => router.push('/paywall')}
            style={({ pressed }) => [styles.lockedRow, pressed && { opacity: 0.8 }]}>
            <Feather name="lock" size={13} color={colors.cherryDeep} />
            <Text style={styles.lockedRowText}>{t('contact.threads.locked')}</Text>
          </Pressable>
        ))}

      {contextRows.length > 0 || context?.commitment ? (
        <Card variant="quiet">
          <Eyebrow>{t('contact.context.title')}</Eyebrow>
          {contextRows.map((row) => (
            <View key={row.label} style={{ gap: 2 }}>
              <Text style={styles.ctxLabel}>{row.label}</Text>
              <Body>{row.value}</Body>
            </View>
          ))}
          {context?.commitment && (
            <View style={styles.commitment}>
              <Feather name="flag" size={13} color={colors.cherryDeep} />
              <Body style={{ flex: 1 }}>
                {context.commitmentDueAt
                  ? t('contact.committedDue', {
                      commitment: context.commitment,
                      date: formatShortDate(context.commitmentDueAt),
                    })
                  : t('contact.committedTo', { commitment: context.commitment })}
              </Body>
            </View>
          )}
        </Card>
      ) : (
        <Card variant="quiet">
          <Eyebrow>{t('contact.context.title')}</Eyebrow>
          <Body muted>{t('contact.context.empty')}</Body>
        </Card>
      )}

      <View style={{ gap: 8 }}>
        <Eyebrow>{t('contact.history')}</Eyebrow>
        {interactions.length === 0 && <Body muted>{t('contact.noHistory')}</Body>}
        {interactions.map((i) => (
          <View key={i.id} style={styles.historyRow}>
            <Text style={styles.historyType}>{t(HISTORY_LABEL[i.type])}</Text>
            <Text style={styles.historyDate}>{relativeTime(i.occurredAt, now)}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={confirmRemove} hitSlop={8} style={styles.deleteRow}>
        <Feather name="trash-2" size={14} color={colors.atRisk} />
        <Text style={styles.deleteText}>{t('contact.remove')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  promiseLink: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.cherryDeep,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    gap: 6,
  },
  headerMeta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  contextInput: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    borderRadius: radii.control,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  composerContextBox: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: colors.cherry,
    borderWidth: 1.5,
    borderColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 10,
  },
  generateBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.cream,
  },
  copiedHint: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.cherryDeep,
    textAlign: 'center',
  },
  updateCard: {
    backgroundColor: colors.butter,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.espresso,
    padding: 16,
    gap: 5,
  },
  updateTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.espresso,
  },
  updateDiff: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.ink,
  },
  updateOld: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  updateNew: {
    fontFamily: fonts.sansBold,
    color: colors.cherryDeep,
  },
  updateBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 8,
  },
  updateApply: {
    backgroundColor: colors.cherry,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderWidth: 1.5,
    borderColor: colors.espresso,
  },
  updateApplyText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.cream,
  },
  updateKeep: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.espresso,
  },
  livingBadge: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: colors.cream,
    backgroundColor: colors.avocado,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  inlineLink: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.cherryDeep,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  reachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  reachBtnActive: {
    backgroundColor: colors.cherry,
  },
  reachBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  reachBtnTextActive: {
    color: colors.cream,
  },
  composer: {
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceTag: {
    fontFamily: fonts.sansMedium,
    fontSize: 11.5,
    color: colors.cherryDeep,
  },
  writingBox: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  toneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toneChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    backgroundColor: colors.white,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  toneChipActive: {
    backgroundColor: colors.butter,
    borderColor: colors.espresso,
  },
  toneChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.inkSoft,
  },
  toneChipTextActive: {
    fontFamily: fonts.sansBold,
    color: colors.espresso,
  },
  draftInput: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    backgroundColor: colors.blush,
    borderRadius: 12,
    padding: 12,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.blush,
    borderWidth: 0,
    borderRadius: radii.control,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  logBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.ink,
  },
  ctxLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 11.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  commitment: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.blush,
    borderWidth: 1.5,
    borderColor: colors.espresso,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineSoft,
  },
  historyType: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.ink,
    textTransform: 'capitalize',
  },
  historyDate: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.muted,
  },
  threadNote: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  memoryContent: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  memoryMeta: {
    fontFamily: fonts.sansMedium,
    fontSize: 11.5,
    color: colors.muted,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.espresso,
    backgroundColor: colors.butter,
  },
  lockedRowText: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.espresso,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    marginTop: 4,
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.atRisk,
  },
});
