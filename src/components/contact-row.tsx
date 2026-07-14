import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, healthColors } from '@/constants/theme';
import { relativeTime, t } from '@/i18n';
import { contactHealth, lastTouchAt } from '@/lib/nudges';
import type { Contact, Health, Interaction } from '@/lib/types';

// Utility row: bare, dense, one line per contact. Fixed height so the
// People list's getItemLayout (A-Z jump rail) can virtualize without
// measuring — ContactRow pins its height to CONTACT_ROW_HEIGHT.
export const CONTACT_ROW_HEIGHT = 56;

const HEALTH_LABEL_KEY = {
  never: 'health.never',
  warm: 'health.warm',
  cooling: 'health.cooling',
  'at-risk': 'health.atRisk',
  cold: 'health.cold',
} as const;

// Site avatars: solid brand circles with contrasting initials, picked
// deterministically per contact so the same person keeps their color.
const AVATAR_PALETTE = [
  { bg: colors.cherry, fg: colors.cream },
  { bg: colors.avocado, fg: colors.cream },
  { bg: colors.cherryDeep, fg: colors.cream },
  { bg: colors.butter, fg: colors.espresso },
] as const;

function avatarPalette(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function ContactRow({
  contact,
  interactions,
  health: healthProp,
}: {
  contact: Contact;
  interactions: Interaction[];
  /** Precomputed health (from buildHealthIndex) to skip the per-row scan in long lists. */
  health?: Health;
}) {
  const router = useRouter();
  const now = new Date();
  const health = healthProp ?? contactHealth(contact, interactions, now);
  const last = lastTouchAt(contact, interactions);
  const subtitle = [contact.role, contact.company].filter(Boolean).join(' · ');
  const palette = avatarPalette(contact.id);
  const hasSubtitle = subtitle.length > 0;
  const metaLine = hasSubtitle ? subtitle : last === null ? t('common.noTouchYet') : null;
  const fullName = `${contact.firstName} ${contact.lastName ?? ''}`.trim();

  return (
    <Pressable
      onPress={() => router.push(`/contact/${contact.id}`)}
      accessibilityRole="button"
      accessibilityLabel={fullName}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={[styles.avatar, { backgroundColor: palette.bg }]}>
        <Text style={[styles.avatarText, { color: palette.fg }]}>
          {contact.firstName[0]}
          {contact.lastName?.[0] ?? ''}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {contact.firstName} {contact.lastName ?? ''}
        </Text>
        {metaLine !== null && (
          <Text style={styles.meta} numberOfLines={1}>
            {metaLine}
          </Text>
        )}
      </View>
      <View style={styles.healthCol}>
        <View style={styles.healthStatus}>
          <View style={[styles.healthDot, { backgroundColor: healthColors[health].fg }]} />
          <Text style={[styles.healthLabel, { color: healthColors[health].fg }]}>
            {t(HEALTH_LABEL_KEY[health])}
          </Text>
        </View>
        {last !== null && <Text style={styles.healthLastTouch}>{relativeTime(last, now)}</Text>}
      </View>
      <View style={styles.divider} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: CONTACT_ROW_HEIGHT,
    paddingHorizontal: 4,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 52,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineSoft,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  healthCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  healthStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  healthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  healthLastTouch: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
  },
});
