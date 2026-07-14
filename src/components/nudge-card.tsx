import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, hardShadow, radii, shadows } from '@/constants/theme';
import { tx, useTranslation } from '@/i18n';
import type { Contact, Nudge } from '@/lib/types';

export function NudgeCard({
  nudge,
  contact,
  contextLine,
  onSnooze,
  onDismiss,
  emphasis = 'standard',
}: {
  nudge: Nudge;
  contact: Contact;
  /** One remembered fact — where you met, what you discussed — shown on the
   *  card itself. The differentiator, visible at the moment of the nudge. */
  contextLine?: string;
  onSnooze: () => void;
  onDismiss: () => void;
  /** hero = today's single dressed-up card; standard = every other nudge. */
  emphasis?: 'hero' | 'standard';
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const isHook = nudge.kind === 'hook';
  // A promise coming due is the product's hero moment — dress it apart.
  const isPromise = nudge.reason.key.startsWith('nudgec.commitment');
  const isStandard = emphasis === 'standard';

  return (
    <View
      style={[
        styles.card,
        isHook ? styles.cardHook : styles.cardQuiet,
        isPromise && styles.cardPromise,
        isStandard && styles.cardStandard,
      ]}>
      <View style={styles.header}>
        <View
          style={[
            styles.kindBadge,
            !isHook && styles.kindBadgeQuiet,
            isPromise && styles.kindBadgePromise,
            isStandard && !isPromise && styles.kindBadgeNaked,
          ]}>
          <Feather
            name={isPromise ? 'bookmark' : isHook ? 'gift' : 'wind'}
            size={11}
            color={
              isPromise ? colors.cream : isStandard || !isHook ? colors.inkSoft : colors.butter
            }
          />
          <Text
            style={[
              styles.kindText,
              !isHook && { color: colors.inkSoft },
              isPromise && { color: colors.cream },
            ]}>
            {isPromise
              ? t('nudge.kind.promise')
              : isHook
                ? t('nudge.kind.moment')
                : t('nudge.kind.drifting')}
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={t('nudge.dismiss')}>
          <Feather name="x" size={16} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={[styles.headline, isStandard && styles.headlineStandard]}>
        {tx(nudge.headline)}
      </Text>
      {contextLine ? (
        <Text style={styles.context} numberOfLines={1}>
          {contextLine}
        </Text>
      ) : null}
      <Text style={[styles.reason, isStandard && styles.reasonStandard]}>
        {tx(nudge.reason)}
      </Text>
      <View style={styles.actionRow}>
        {isStandard ? (
          <Text style={styles.actionPlain}>→ {tx(nudge.suggestedAction)}</Text>
        ) : (
          <Text style={styles.action}>{tx(nudge.suggestedAction)}</Text>
        )}
      </View>
      <View style={styles.buttons}>
        <Pressable
          onPress={() => router.push(`/nudge/${nudge.id}`)}
          style={({ pressed }) => [
            styles.primaryBtn,
            isStandard && styles.primaryBtnStandard,
            pressed && { opacity: 0.7 },
          ]}>
          <Text style={[styles.primaryBtnText, isStandard && styles.primaryBtnTextStandard]}>
            {t('nudge.draft')}
          </Text>
        </Pressable>
        <Pressable onPress={onSnooze} hitSlop={12}>
          <Text style={styles.quietBtn}>{t('nudge.snooze')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 18,
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.nudge,
  },
  cardHook: {
    backgroundColor: colors.white,
  },
  cardQuiet: {
    backgroundColor: colors.white,
    opacity: 0.85,
  },
  cardPromise: {
    backgroundColor: colors.creamDeep,
  },
  cardStandard: {
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    borderRadius: radii.card,
    boxShadow: 'none',
    padding: 14,
    gap: 6,
  },
  kindBadgePromise: {
    backgroundColor: colors.cherry,
  },
  kindBadgeNaked: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  context: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.cherryDeep,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  kindBadgeQuiet: {
    backgroundColor: colors.blush,
  },
  kindText: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.butter,
  },
  headline: {
    fontFamily: fonts.displayMedium,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  headlineStandard: {
    fontSize: 17,
    lineHeight: 22,
  },
  reason: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  reasonStandard: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  actionRow: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  action: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.espresso,
    backgroundColor: colors.butter,
    borderWidth: 0,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  actionPlain: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
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
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(2),
  },
  primaryBtnStandard: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    boxShadow: 'none',
  },
  primaryBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.cream,
  },
  primaryBtnTextStandard: {
    fontSize: 13,
  },
  quietBtn: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.muted,
  },
});
