import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HealthBadge } from '@/components/health-badge';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { relativeTime, t } from '@/i18n';
import { contactHealth, lastContactAt } from '@/lib/nudges';
import type { Contact, Health, Interaction } from '@/lib/types';

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
  const last = lastContactAt(contact, interactions);
  const subtitle = [contact.role, contact.company].filter(Boolean).join(' · ');
  const palette = avatarPalette(contact.id);

  return (
    <Pressable
      onPress={() => router.push(`/contact/${contact.id}`)}
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
        <Text style={styles.meta} numberOfLines={1}>
          {subtitle ? `${subtitle} · ` : ''}
          {health === 'new'
            ? t('common.noTouchYet')
            : t('common.lastTouch', { when: relativeTime(last, now) })}
        </Text>
      </View>
      <HealthBadge health={health} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.espresso,
    padding: 14,
    // Fixed height: the People list's getItemLayout (A-Z jump rail) depends
    // on every row measuring exactly this.
    height: 74,
    ...hardShadow(3, 'rgba(59,36,28,0.15)'),
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
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
    fontSize: 12.5,
    color: colors.muted,
  },
});
