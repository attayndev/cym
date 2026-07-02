import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ContactRow } from '@/components/contact-row';
import { ExchangeInbox } from '@/components/exchange-inbox';
import { PersonaSwitcher } from '@/components/persona-switcher';
import { Body, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { contactHealth, decayRatio } from '@/lib/nudges';
import { contactsForPersona } from '@/lib/personas';
import { useApp } from '@/state/app-context';

export default function PeopleScreen() {
  const { db, activePersonaId, syncContacts } = useApp();
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  if (!db) return <Screen scroll={false}>{null}</Screen>;

  const now = new Date();
  const personaContacts = contactsForPersona(db.contacts, activePersonaId);
  const filtered = personaContacts
    .filter((c) =>
      `${c.firstName} ${c.lastName ?? ''} ${c.company ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        decayRatio(b, db.interactions, now) * b.importance -
        decayRatio(a, db.interactions, now) * a.importance,
    );

  const needsAttention = filtered.filter((c) => {
    const h = contactHealth(c, db.interactions, now);
    return h === 'at-risk' || h === 'cold';
  });
  const doingFine = filtered.filter((c) => {
    const h = contactHealth(c, db.interactions, now);
    return h === 'warm' || h === 'cooling';
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { imported, exported } = await syncContacts();
      Alert.alert(
        imported + exported > 0
          ? t('people.sync.result', { imported, exported })
          : t('people.sync.upToDate'),
        imported > 0 ? t('people.import.importedBody') : undefined,
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Display>{t('people.title')}</Display>
        <View style={styles.headerActions}>
          <PersonaSwitcher />
          <Pressable
            onPress={() => router.push('/capture')}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}>
            <Feather name="plus" size={20} color={colors.cardText} />
          </Pressable>
        </View>
      </View>

      <ExchangeInbox />

      {personaContacts.length === 0 ? (
        <Card style={{ gap: 6 }}>
          <Eyebrow>{t('people.empty.title')}</Eyebrow>
          <Body muted>{t('people.empty.body')}</Body>
        </Card>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Feather name="search" size={15} color={colors.muted} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={t('people.search')}
              placeholderTextColor={colors.muted}
            />
          </View>

          {Platform.OS !== 'web' && (
            <Pressable
              onPress={handleSync}
              disabled={syncing}
              style={({ pressed }) => [
                styles.importRow,
                (pressed || syncing) && { opacity: 0.6 },
              ]}>
              <Feather name="refresh-cw" size={14} color={colors.inkSoft} />
              <Text style={styles.importText}>
                {syncing ? t('people.syncing') : t('people.sync')}
              </Text>
            </Pressable>
          )}

          {needsAttention.length > 0 && (
            <View style={styles.section}>
              <Eyebrow>{t('people.section.needsAttention')}</Eyebrow>
              {needsAttention.map((c) => (
                <ContactRow key={c.id} contact={c} interactions={db.interactions} />
              ))}
            </View>
          )}

          {doingFine.length > 0 && (
            <View style={styles.section}>
              <Eyebrow>{t('people.section.doingFine')}</Eyebrow>
              {doingFine.map((c) => (
                <ContactRow key={c.id} contact={c} interactions={db.interactions} />
              ))}
            </View>
          )}
        </>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.espresso,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(2),
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  search: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 11,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  importText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.inkSoft,
  },
  section: {
    gap: 10,
  },
});
