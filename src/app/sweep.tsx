import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { notify } from '@/lib/alert';
import { Body, Button, Display, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { isActiveContact } from '@/lib/classify';
import { getSupabase } from '@/lib/supabase';
import type { Contact, ContactKind } from '@/lib/types';
import { useApp } from '@/state/app-context';

// Per classify-contacts invocation; the loop below batches through the rest.
const AI_BATCH = 150;

/**
 * Noise sweep: review contacts the classifier flagged as businesses and
 * archive them in bulk. Archiving is CYM-only — the device address book is
 * never touched. "Keep" marks a flagged contact as a person for good.
 */
export default function SweepScreen() {
  const { db, archiveContacts, keepContact, applyContactKinds } = useApp();
  const router = useRouter();
  const { t } = useTranslation();
  const [archivedCount, setArchivedCount] = useState<number | null>(null);
  const [sorting, setSorting] = useState<{ done: number; total: number } | null>(null);

  const suspects = useMemo(
    () => (db?.contacts ?? []).filter((c) => c.kind === 'business' && isActiveContact(c)),
    [db?.contacts],
  );
  const unclear = useMemo(
    () =>
      (db?.contacts ?? []).filter(
        (c) => (c.kind ?? 'unclear') === 'unclear' && isActiveContact(c),
      ),
    [db?.contacts],
  );

  if (!db) return <Screen scroll={false}>{null}</Screen>;

  const sortWithAI = async () => {
    const supabase = getSupabase();
    if (!supabase || sorting) return;
    const queue = unclear.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      email: c.email,
    }));
    setSorting({ done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i += AI_BATCH) {
      const { data, error } = await supabase.functions.invoke('classify-contacts', {
        body: { contacts: queue.slice(i, i + AI_BATCH) },
      });
      if (error) {
        setSorting(null);
        notify(t('sweep.ai.error'));
        return;
      }
      applyContactKinds((data as { kinds: { id: string; kind: ContactKind }[] }).kinds ?? []);
      setSorting({ done: Math.min(i + AI_BATCH, queue.length), total: queue.length });
    }
    setSorting(null);
  };

  const archiveAll = () => {
    setArchivedCount(suspects.length);
    archiveContacts(suspects.map((c) => c.id));
  };

  const detail = (c: Contact) =>
    [c.company, c.email, c.phone].filter(Boolean).join(' · ');

  return (
    <Screen scroll={false}>
      <View style={styles.topRow}>
        <Display>{t('sweep.title')}</Display>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="x" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {unclear.length > 0 && (
        <Pressable
          onPress={() => void sortWithAI()}
          disabled={Boolean(sorting)}
          style={({ pressed }) => [styles.aiRow, (pressed || sorting) && { opacity: 0.7 }]}>
          <Feather name="zap" size={14} color={colors.espresso} />
          <Text style={styles.aiText}>
            {sorting
              ? t('sweep.ai.progress', { done: sorting.done, total: sorting.total })
              : t('sweep.ai.cta', { count: unclear.length })}
          </Text>
        </Pressable>
      )}

      {suspects.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={28} color={colors.warm} />
          <Body muted style={{ textAlign: 'center' }}>
            {archivedCount
              ? t('sweep.done', { count: archivedCount })
              : t('sweep.clean')}
          </Body>
          <Button title={t('common.close')} variant="ghost" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <Body muted>{t('sweep.body', { count: suspects.length })}</Body>
          <Button title={t('sweep.archiveAll', { count: suspects.length })} onPress={archiveAll} />
          <FlatList
            data={suspects}
            keyExtractor={(c) => c.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={14}
            ItemSeparatorComponent={RowGap}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.firstName} {item.lastName ?? ''}
                  </Text>
                  {detail(item) ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {detail(item)}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => keepContact(item.id)} hitSlop={8}>
                  <Text style={styles.keep}>{t('sweep.keep')}</Text>
                </Pressable>
                <Pressable onPress={() => archiveContacts([item.id])} hitSlop={8}>
                  <Feather name="archive" size={17} color={colors.inkSoft} />
                </Pressable>
              </View>
            )}
          />
        </>
      )}
    </Screen>
  );
}

function RowGap() {
  return <View style={{ height: 8 }} />;
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  aiRow: {
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
  aiText: {
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
    paddingRight: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: fonts.sansBold,
    fontSize: 14.5,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  keep: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.cherryDeep,
  },
});
