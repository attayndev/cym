import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Body, Button, Eyebrow, Heading, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { tx, useTranslation } from '@/i18n';
import { composerNote, draftSubject, generateDraft } from '@/lib/drafts';
import { diag } from '@/lib/log';
import { extractMemory, fetchContactMemory, liveMemory, memoryLines } from '@/lib/memory';
import type { Channel, ContactMemory } from '@/lib/types';
import { useApp } from '@/state/app-context';

export default function NudgeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, markNudgeActed } = useApp();
  const router = useRouter();
  const { t, locale } = useTranslation();

  const [channel, setChannel] = useState<Channel>('text');
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<'ai' | 'template' | null>(null);
  const [loading, setLoading] = useState(false);
  const [noteContext, setNoteContext] = useState('');
  const [draftLimited, setDraftLimited] = useState(false);
  const [regen, setRegen] = useState(0);
  // Relationship Memory (Plus): fetched independently of the contact screen's
  // own state — this composer can be reached without ever visiting it.
  const [memory, setMemory] = useState<ContactMemory[]>([]);

  const nudge = db?.nudges.find((n) => n.id === id);
  const contact = db?.contacts.find((c) => c.id === nudge?.contactId);
  const context = db?.contexts.find((c) => c.contactId === contact?.id);
  const isPro = db?.profile.isPro ?? false;

  useEffect(() => {
    if (!isPro || !contact?.id) {
      setMemory([]);
      return;
    }
    let cancelled = false;
    void fetchContactMemory(contact.id).then((rows) => {
      if (!cancelled) setMemory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [isPro, contact?.id]);

  useEffect(() => {
    if (!db || !nudge || !contact) return;
    let cancelled = false;
    setLoading(true);
    // Plus-only memory signal (Phase 0): the last few notes this person's
    // interactions carry, verbatim, newest first.
    const recentNotes = db.profile.isPro
      ? db.interactions
          .filter((i) => i.contactId === contact.id)
          .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
          .map((i) => i.note?.trim())
          .filter((n): n is string => Boolean(n))
          .slice(0, 3)
      : [];
    const memLines = db.profile.isPro ? memoryLines(liveMemory(memory, new Date())) : [];
    generateDraft({
      contact,
      context,
      nudge,
      channel,
      profile: db.profile,
      userContext: noteContext,
      variant: regen,
      ...(recentNotes.length > 0 ? { recentNotes } : {}),
      ...(memLines.length > 0 ? { memoryLines: memLines } : {}),
    }).then(
      (result) => {
        if (!cancelled) {
          setDraft(result.text);
          setSource(result.source);
          setDraftLimited(Boolean(result.limitReached));
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // Regenerate when the channel/language flips, the user asks for a
    // rewrite (regen bumps after adding context), or memory finishes loading
    // after the initial draft already went out; nudge/contact are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, id, locale, db === null, regen, memory]);

  if (!db || !nudge || !contact) {
    return (
      <Screen>
        <Body>{t('compose.notFound')}</Body>
      </Screen>
    );
  }

  // Personal wins over work when both exist — see contact/[id].tsx.
  const bestEmail = contact.email || contact.workEmail;
  const bestPhone = contact.phone || contact.workPhone;
  const canEmail = Boolean(bestEmail);
  const canText = Boolean(bestPhone);

  const openInApp = () => {
    const encoded = encodeURIComponent(draft);
    if (channel === 'email' && bestEmail) {
      const subject = encodeURIComponent(
        draftSubject({ contact, context, nudge, channel, profile: db.profile }),
      );
      Linking.openURL(`mailto:${bestEmail}?subject=${subject}&body=${encoded}`);
    } else if (bestPhone) {
      // iOS's sms: handler stopped percent-decoding the legacy `&body=` form;
      // the query form decodes correctly on current iOS and Android alike.
      Linking.openURL(`sms:${bestPhone}?body=${encoded}`);
    }
  };

  const markSent = () => {
    const note = composerNote(noteContext, draft);
    markNudgeActed(nudge.id, channel, note);
    if (note) diag('composer-note', { contactId: contact.id, len: note.length });
    if (db.profile.isPro) {
      const text = [noteContext, draft].filter(Boolean).join('\n');
      extractMemory({ contactId: contact.id, text, source: 'draft' });
    }
    router.back();
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Feather name="arrow-left" size={22} color={colors.ink} />
      </Pressable>

      <Heading>{tx(nudge.headline)}</Heading>
      <Body muted>{tx(nudge.reason)}</Body>

      <View style={styles.channelRow}>
        <Pressable
          onPress={() => setChannel('text')}
          style={[styles.channelBtn, channel === 'text' && styles.channelBtnActive]}>
          <Text style={[styles.channelText, channel === 'text' && styles.channelTextActive]}>
            {canText ? t('compose.channel.text') : t('compose.channel.text.disabled')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setChannel('email')}
          style={[styles.channelBtn, channel === 'email' && styles.channelBtnActive]}>
          <Text style={[styles.channelText, channel === 'email' && styles.channelTextActive]}>
            {canEmail ? t('compose.channel.email') : t('compose.channel.email.disabled')}
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.contextInput}
        value={noteContext}
        onChangeText={setNoteContext}
        placeholder={t('compose.context.placeholder')}
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        onSubmitEditing={() => setRegen((n) => n + 1)}
        editable={!loading}
      />

      <View style={{ gap: 8 }}>
        <View style={styles.draftHeader}>
          <Eyebrow>{t('compose.yourDraft')}</Eyebrow>
          {source && (
            <Text style={styles.sourceTag}>
              {source === 'ai' ? t('compose.source.ai') : t('compose.source.template')}
            </Text>
          )}
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.ink} />
            <Body muted>{t('compose.writing')}</Body>
          </View>
        ) : (
          <TextInput
            style={styles.draftInput}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
        )}
      </View>

      {draftLimited && (
        <Pressable onPress={() => router.push('/paywall')} hitSlop={6}>
          <Text style={styles.limitHint}>{t('compose.draftLimit')}</Text>
        </Pressable>
      )}
      <Button
        title={channel === 'email' ? t('compose.openMail') : t('compose.openMessages')}
        onPress={openInApp}
        disabled={loading || (channel === 'email' ? !canEmail : !canText)}
      />
      <Button title={t('compose.markSent')} variant="ghost" onPress={markSent} disabled={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
  },
  channelRow: {
    flexDirection: 'row',
    backgroundColor: colors.creamDeep,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  channelBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
  },
  channelBtnActive: {
    backgroundColor: colors.ink,
  },
  channelText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.inkSoft,
  },
  channelTextActive: {
    color: colors.cardText,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceTag: {
    fontFamily: fonts.sansMedium,
    fontSize: 11.5,
    color: colors.cherryDeep,
  },
  loading: {
    gap: 10,
    alignItems: 'center',
    paddingVertical: 32,
  },
  contextInput: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  limitHint: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.cherryDeep,
    textAlign: 'center',
  },
  draftInput: {
    fontFamily: fonts.sans,
    fontSize: 15.5,
    lineHeight: 23,
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 16,
    padding: 16,
    minHeight: 160,
    textAlignVertical: 'top',
  },
});
