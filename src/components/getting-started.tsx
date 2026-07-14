import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import { useTranslation, type TKey } from '@/i18n';
import { isActiveContact } from '@/lib/classify';
import { loadChecklistPrefs, saveChecklistPrefs, type ChecklistPrefs } from '@/lib/store';
import { useApp } from '@/state/app-context';

/**
 * Collapsing "getting started" checklist on Today. Teaches by doing: every
 * item deep-links to the real feature and checks itself off when the actual
 * data appears in the graph — no stored progress, no "mark as read" theater.
 * View state (collapsed/dismissed) is device-local; the card retires itself
 * once everything is done.
 */
export function GettingStarted() {
  const { db } = useApp();
  const router = useRouter();
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<ChecklistPrefs | null | undefined>(undefined);

  useEffect(() => {
    void loadChecklistPrefs().then(setPrefs);
  }, []);

  if (!db || prefs === undefined) return null;

  const hasImports = db.contacts.some((c) => c.source === 'import');
  const sweepPending = db.contacts.some((c) => c.kind === 'business' && isActiveContact(c));

  const items: { key: string; title: TKey; body: TKey; done: boolean; href?: string }[] = [
    {
      key: 'person',
      title: 'checklist.person.title',
      body: 'checklist.person.body',
      done: db.contacts.some((c) => c.source !== 'import' && isActiveContact(c)),
      href: '/capture',
    },
    ...(hasImports
      ? [
          {
            key: 'sweep',
            title: 'checklist.sweep.title' as TKey,
            body: 'checklist.sweep.body' as TKey,
            done: !sweepPending,
            href: '/sweep',
          },
        ]
      : []),
    {
      key: 'touch',
      title: 'checklist.touch.title',
      body: 'checklist.touch.body',
      done: db.interactions.some((i) => i.source === 'manual'),
      href: '/people',
    },
    {
      key: 'nudge',
      title: 'checklist.nudge.title',
      body: 'checklist.nudge.body',
      done: db.nudges.some((n) => n.state === 'acted'),
    },
    {
      key: 'card',
      title: 'checklist.card.title',
      body: 'checklist.card.body',
      done: Boolean(db.profile.email || db.profile.phone || db.profile.role),
      href: '/card',
    },
  ];

  const doneCount = items.filter((i) => i.done).length;

  // Returning users who've made real progress default to the collapsed,
  // one-line header; a brand-new user sees the checklist expanded.
  const collapsed = prefs ? prefs.collapsed : doneCount >= 3;
  const dismissed = prefs?.dismissed ?? false;

  if (dismissed) return null;
  if (doneCount === items.length) return null;

  const setAndSave = (next: ChecklistPrefs) => {
    setPrefs(next);
    void saveChecklistPrefs(next);
  };

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setAndSave({ collapsed: !collapsed, dismissed })}
        style={styles.headerRow}>
        <Feather name="map" size={15} color={colors.espresso} />
        <Text style={styles.title}>{t('checklist.title')}</Text>
        <Text style={styles.progress}>
          {t('checklist.progress', { done: doneCount, total: items.length })}
        </Text>
        <Feather
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={colors.espresso}
        />
      </Pressable>

      {!collapsed && (
        <>
          {items.map((item) => (
            <Pressable
              key={item.key}
              disabled={item.done || !item.href}
              onPress={() => item.href && router.push(item.href as never)}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
              <Feather
                name={item.done ? 'check-circle' : 'circle'}
                size={17}
                color={item.done ? colors.warm : colors.muted}
              />
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, item.done && styles.itemDone]}>
                  {t(item.title)}
                </Text>
                {!item.done && <Text style={styles.itemBody}>{t(item.body)}</Text>}
              </View>
              {!item.done && item.href && (
                <Feather name="chevron-right" size={16} color={colors.muted} />
              )}
            </Pressable>
          ))}
          <Pressable
            onPress={() => setAndSave({ collapsed, dismissed: true })}
            hitSlop={6}
            style={styles.hide}>
            <Text style={styles.hideText}>{t('checklist.hide')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    borderRadius: 14,
    padding: 14,
    gap: 9,
    boxShadow: 'none',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  progress: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.muted,
    marginRight: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  itemText: {
    flex: 1,
    gap: 1,
  },
  itemTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  itemDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  itemBody: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.inkSoft,
  },
  hide: {
    alignSelf: 'center',
    paddingTop: 2,
  },
  hideText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.muted,
  },
});
