import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
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
import { CONTACT_ROW_HEIGHT, ContactRow } from '@/components/contact-row';
import { ExchangeInbox } from '@/components/exchange-inbox';
import { Body, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { isActiveContact } from '@/lib/classify';
import { buildHealthIndex } from '@/lib/nudges';
import { useApp } from '@/state/app-context';
import type { Contact } from '@/lib/types';

/**
 * People: the address book, shaped like one. Alphabetical sections with
 * sticky letter headers and an A–Z rail on the right that jumps to a
 * section. Triage lives on the Health tab; this list is for finding people.
 */

// getItemLayout arithmetic: every row is exactly ROW_H, and rows now abut —
// the bottom hairline divider replaces the old inter-row gap. Headers are
// exactly HEADER_H. The jump rail depends on these being true — ContactRow
// pins its height to match.
const ROW_H = CONTACT_ROW_HEIGHT;
const ITEM_H = ROW_H;
const HEADER_H = 30;

type LetterSection = { key: string; data: Contact[] };

function letterOf(c: Contact): string {
  const ch = (c.firstName || c.lastName || '#').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

export default function PeopleScreen() {
  const { db, syncContacts } = useApp();
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const listRef = useRef<SectionList<Contact, LetterSection>>(null);

  const now = new Date();
  const personaContacts = useMemo(
    () =>
      db ? db.contacts.filter(isActiveContact) : [],
    [db],
  );
  const index = useMemo(
    () => buildHealthIndex(personaContacts, db?.interactions ?? [], now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personaContacts, db?.interactions],
  );

  const sections: LetterSection[] = useMemo(() => {
    const q = query.toLowerCase();
    const shown = personaContacts.filter((c) =>
      `${c.firstName} ${c.lastName ?? ''} ${c.company ?? ''}`.toLowerCase().includes(q),
    );
    const byLetter = new Map<string, Contact[]>();
    for (const c of shown) {
      const k = letterOf(c);
      byLetter.set(k, [...(byLetter.get(k) ?? []), c]);
    }
    const name = (c: Contact) => `${c.firstName} ${c.lastName ?? ''}`.trim();
    return [...byLetter.entries()]
      .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
      .map(([key, data]) => ({
        key,
        data: data.sort((a, b) => name(a).localeCompare(name(b))),
      }));
  }, [personaContacts, query]);

  if (!db) return <Screen scroll={false}>{null}</Screen>;

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

  // Flattened per section: 1 header + N items + 1 footer(0-height).
  const getItemLayout = (_: unknown, target: number) => {
    let i = 0;
    let offset = 0;
    for (const s of sections) {
      if (target === i) return { length: HEADER_H, offset, index: target };
      i += 1;
      offset += HEADER_H;
      if (target < i + s.data.length) {
        const k = target - i;
        return { length: ITEM_H, offset: offset + k * ITEM_H, index: target };
      }
      i += s.data.length;
      offset += s.data.length * ITEM_H;
      if (target === i) return { length: 0, offset, index: target };
      i += 1;
    }
    return { length: 0, offset, index: target };
  };

  const jumpTo = (sectionIndex: number) => {
    listRef.current?.scrollToLocation({
      sectionIndex,
      itemIndex: 0, // 0 = the section header
      animated: false,
    });
  };

  return (
    <Screen scroll={false}>
      <View style={styles.headerRow}>
        <Display>{t('people.title')}</Display>
        <View style={styles.headerActions}>
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

          <View style={styles.listWrap}>
            {/* Virtualized — address books run 10k+ contacts; only visible rows render. */}
            <SectionList
              ref={listRef}
              sections={sections}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <View style={styles.itemWrap}>
                  <ContactRow
                    contact={item}
                    interactions={db.interactions}
                    health={index.get(item.id)!.health}
                  />
                </View>
              )}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLetter}>{section.key}</Text>
                </View>
              )}
              getItemLayout={getItemLayout}
              stickySectionHeadersEnabled
              showsVerticalScrollIndicator={false}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              initialNumToRender={12}
              windowSize={7}
              keyboardShouldPersistTaps="handled"
            />
            {sections.length > 1 && (
              <View style={styles.rail} pointerEvents="box-none">
                {sections.map((s, si) => (
                  <Pressable
                    key={s.key}
                    onPress={() => jumpTo(si)}
                    hitSlop={{ left: 12, right: 12, top: 1, bottom: 1 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Jump to ${s.key}`}>
                    <Text style={styles.railLetter}>{s.key}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
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
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  search: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 9,
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
    borderWidth: 1.5,
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
  listWrap: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
  },
  itemWrap: {
    height: ITEM_H,
    paddingBottom: 0,
  },
  sectionHeader: {
    height: HEADER_H,
    justifyContent: 'flex-end',
    paddingBottom: 4,
    backgroundColor: colors.cream,
  },
  sectionLetter: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    color: colors.cherryDeep,
  },
  rail: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  railLetter: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    color: colors.cherryDeep,
    paddingVertical: 0.5,
    minHeight: 13,
  },
});
