import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, hardShadow, shadows } from '@/constants/theme';
import { tx, useTranslation } from '@/i18n';
import type { Contact, Nudge } from '@/lib/types';

export function NudgeCard({
  nudge,
  contact,
  contextLine,
  onSnooze,
  onDismiss,
}: {
  nudge: Nudge;
  contact: Contact;
  /** One remembered fact — where you met, what you discussed — shown on the
   *  card itself. The differentiator, visible at the moment of the nudge. */
  contextLine?: string;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const isHook = nudge.kind === 'hook';
  // A promise coming due is the product's hero moment — dress it apart.
  const isPromise = nudge.reason.key.startsWith('nudgec.commitment');

  return (
    <View
      style={[
        styles.card,
        isHook ? styles.cardHook : styles.cardQuiet,
        isPromise && styles.cardPromise,
      ]}>
      <View style={styles.header}>
        <View
          style={[
            styles.kindBadge,
            !isHook && styles.kindBadgeQuiet,
            isPromise && styles.kindBadgePromise,
          ]}>
          <Feather
            name={isPromise ? 'bookmark' : isHook ? 'gift' : 'wind'}
            size={11}
            color={isPromise ? colors.cream : isHook ? colors.butter : colors.inkSoft}
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
      </View>
      <Text style={styles.headline}>{tx(nudge.headline)}</Text>
      {contextLine ? (
        <Text style={styles.context} numberOfLines={1}>
          {contextLine}
        </Text>
      ) : null}
      <Text style={styles.reason}>{tx(nudge.reason)}</Text>
      <View style={styles.actionRow}>
        <Text style={styles.action}>{tx(nudge.suggestedAction)}</Text>
      </View>
      <View style={styles.buttons}>
        <Pressable
          onPress={() => router.push(`/nudge/${nudge.id}`)}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.primaryBtnText}>{t('nudge.writeIt')}</Text>
        </Pressable>
        <Pressable onPress={onSnooze} hitSlop={8}>
          <Text style={styles.quietBtn}>{t('nudge.snooze')}</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text style={styles.quietBtn}>{t('nudge.notNow')}</Text>
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
  kindBadgePromise: {
    backgroundColor: colors.cherry,
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
  reason: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  actionRow: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  action: {
    fontFamily: fonts.sansBold,
    fontSize: 12.5,
    color: colors.espresso,
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    overflow: 'hidden',
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
  primaryBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 13.5,
    color: colors.cream,
  },
  quietBtn: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.muted,
  },
});
