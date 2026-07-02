import { StyleSheet, Text, View } from 'react-native';

import { fonts, healthColors } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import type { Health } from '@/lib/types';

const LABEL_KEY = {
  warm: 'health.warm',
  cooling: 'health.cooling',
  'at-risk': 'health.atRisk',
  cold: 'health.cold',
} as const;

export function HealthBadge({ health }: { health: Health }) {
  const { t } = useTranslation();
  const palette = healthColors[health];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <View style={[styles.dot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.text, { color: palette.fg }]}>{t(LABEL_KEY[health])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
});
