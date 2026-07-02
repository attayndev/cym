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
import { generateDraft } from '@/lib/drafts';
import type { Channel } from '@/lib/types';
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

  const nudge = db?.nudges.find((n) => n.id === id);
  const contact = db?.contacts.find((c) => c.id === nudge?.contactId);
  const context = db?.contexts.find((c) => c.contactId === contact?.id);

  useEffect(() => {
    if (!db || !nudge || !contact) return;
    let cancelled = false;
    setLoading(true);
    generateDraft({ contact, context, nudge, channel, profile: db.profile }).then(
      (result) => {
        if (!cancelled) {
          setDraft(result.text);
          setSource(result.source);
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // Regenerate when the channel or language flips; nudge/contact are stable here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, id, locale, db === null]);

  if (!db || !nudge || !contact) {
    return (
      <Screen>
        <Body>{t('compose.notFound')}</Body>
      </Screen>
    );
  }

  const canEmail = Boolean(contact.email);
  const canText = Boolean(contact.phone);

  const openInApp = () => {
    const encoded = encodeURIComponent(draft);
    if (channel === 'email' && contact.email) {
      Linking.openURL(`mailto:${contact.email}?body=${encoded}`);
    } else if (contact.phone) {
      const sep = Platform.OS === 'ios' ? '&' : '?';
      Linking.openURL(`sms:${contact.phone}${sep}body=${encoded}`);
    }
  };

  const markSent = () => {
    markNudgeActed(nudge.id, channel);
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
