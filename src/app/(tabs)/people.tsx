import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { notify } from '@/lib/alert';
import { ContactRow } from '@/components/contact-row';
import { ExchangeInbox } from '@/components/exchange-inbox';
import { PersonaSwitcher } from '@/components/persona-switcher';
import { Body, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { isActiveContact } from '@/lib/classify';
import { buildHealthIndex } from '@/lib/nudges';
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
  // Archived contacts (noise sweep) stay out of the list; a dedicated
  // archived view arrives with the sweep UI.
  const personaContacts = contactsForPersona(db.contacts, activePersonaId).filter(
    isActiveContact,
  );
  const index = buildHealthIndex(personaContacts, db.interactions, now);
  const filtered = personaContacts
    .filter((c) =>
      `${c.firstName} ${c.lastName ?? ''} ${c.company ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => index.get(b.id)!.ratio * b.importance - index.get(a.id)!.ratio * a.importance,
    );

  const needsAttention = filtered.filter((c) => {
    const h = index.get(c.id)!.health;
    return h === 'at-risk' || h === 'cold';
  });
  const doingFine = filtered.filter((c) => {
    const h = index.get(c.id)!.health;
    return h === 'warm' || h === 'cooling';
  });
  const notYetInTouch = filtered.filter((c) => index.get(c.id)!.health === 'new');

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { imported, exported } = await syncContacts();
      notify(
        imported + exported > 0
          ? t('people.sync.result', { imported, exported })
          : t('people.sync.upToDate'),
        imported > 0 ? t('people.import.importedBody') : undefined,
      );
    } finally {
      setSyncing(false);
    }
  };

  // Sweep suspects are counted across all personas — the sweep is global.
  const sweepCount = db.contacts.filter(
    (c) => c.kind === 'business' && isActiveContact(c),
  ).length;

  const sections = [
    { key: 'attention', title: t('people.section.needsAttention'), data: needsAttention },
    { key: 'fine', title: t('people.section.doingFine'), data: doingFine },
    { key: 'new', title: t('people.section.new'), data: notYetInTouch },
  ].filter((s) => s.data.length > 0);

  return (
    <Screen scroll={false}>
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

      {sweepCount > 0 && (
        <Pressable
          onPress={() => router.push('/sweep')}
          style={({ pressed }) => [styles.sweepBanner, pressed && { opacity: 0.8 }]}>
          <Feather name="archive" size={14} color={colors.espresso} />
          <Text style={styles.sweepText}>{t('people.sweepBanner', { count: sweepCount })}</Text>
          <Feather name="chevron-right" size={16} color={colors.espresso} />
        </Pressable>
      )}

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

          {/* Virtualized — address books run 10k+ contacts; only visible rows render. */}
          <SectionList
            sections={sections}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <ContactRow
                contact={item}
                interactions={db.interactions}
                health={index.get(item.id)!.health}
              />
            )}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Eyebrow>{section.title}</Eyebrow>
              </View>
            )}
            ItemSeparatorComponent={ItemGap}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            initialNumToRender={12}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}
    </Screen>
  );
}

function ItemGap() {
  return <View style={{ height: 10 }} />;
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
  sweepBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sweepText: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.espresso,
  },
  list: {
    flex: 1,
    alignSelf: 'stretch',
  },
  listContent: {
    paddingBottom: 32,
    // Rows carry 3px hard offset shadows; keep them from clipping at the edge.
    paddingRight: 3,
  },
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 10,
  },
});
