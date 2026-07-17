import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radii } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { birthdaySweepCandidates } from '@/lib/birthday-sweep';
import { loadBirthdaySkips, saveBirthdaySkips } from '@/lib/store';
import { maskBirthday } from '@/lib/format';
import { useApp } from '@/state/app-context';

const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Birthday sweep deck (Today): a bounded, self-retiring nudge to backfill
 * birthdays for people already tracked. One-tap simpler than the evaluate
 * deck — type MM-DD or skip; skips are device-local and expire after
 * BDAY_SKIP_DAYS so a "not now" never becomes a permanent no.
 */
export function BirthdayDeck() {
  const { db, updateContact } = useApp();
  const { t } = useTranslation();
  const [skips, setSkips] = useState<Record<string, string> | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadBirthdaySkips().then(setSkips);
  }, []);

  const candidates = useMemo(() => {
    if (!db || !skips) return [];
    return birthdaySweepCandidates(db, skips, new Date());
  }, [db, skips]);

  if (!db || !skips || candidates.length === 0) return null;

  const skip = (contactId: string) => {
    const next = { ...skips, [contactId]: new Date().toISOString() };
    setSkips(next);
    void saveBirthdaySkips(next);
  };

  const onChangeDraft = (contactId: string, text: string) => {
    setDrafts((prev) => ({ ...prev, [contactId]: text }));
    if (BIRTHDAY_RE.test(text)) updateContact(contactId, { birthday: text });
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setCollapsed((v) => !v)} style={styles.headerRow}>
        <Text style={styles.title}>
          {t('bday.deck.title')}
          {'  '}
          <Text style={styles.count}>({candidates.length})</Text>
        </Text>
        <Feather
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={colors.espresso}
        />
      </Pressable>

      {!collapsed && (
        <>
          <Text style={styles.sub}>{t('bday.deck.sub')}</Text>
          {candidates.map((c) => {
            const draft = drafts[c.id] ?? '';
            const valid = draft === '' || BIRTHDAY_RE.test(draft);
            return (
              <View key={c.id} style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.firstName} {c.lastName ?? ''}
                </Text>
                <TextInput
                  style={[styles.input, !valid && styles.inputError]}
                  value={draft}
                  onChangeText={(text) => onChangeDraft(c.id, maskBirthday(text))}
                  placeholder="MM-DD"
                  keyboardType="number-pad"
                  placeholderTextColor={colors.muted}
                  maxLength={5}
                />
                <Pressable onPress={() => skip(c.id)} hitSlop={8}>
                  <Text style={styles.skip}>{t('bday.deck.skip')}</Text>
                </Pressable>
              </View>
            );
          })}
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
    borderRadius: radii.card,
    padding: 14,
    gap: 10,
    boxShadow: 'none',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.ink,
  },
  count: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.inkSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.ink,
  },
  input: {
    width: 90,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  inputError: {
    borderColor: colors.danger,
  },
  skip: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
  },
});
