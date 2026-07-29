import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import type { ExchangeSubmission } from '@/lib/share';

/** One person whose details arrived through your card's landing page. Purely
 *  presentational — the Inbox tab owns loading, status and the capture hand-off.
 *  Which actions appear follows the submission's status: pending rows can be
 *  added or dismissed, dismissed rows can come back, added rows are a record. */
export function ExchangeRow({
  submission,
  onAccept,
  onDismiss,
  onRestore,
}: {
  submission: ExchangeSubmission;
  onAccept?: () => void;
  onDismiss?: () => void;
  onRestore?: () => void;
}) {
  const { t } = useTranslation();
  const s = submission;

  return (
    <Card style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name}>{[s.firstName, s.lastName].filter(Boolean).join(' ')}</Text>
        {(s.role || s.company) && (
          <Text style={styles.meta}>{[s.role, s.company].filter(Boolean).join(' · ')}</Text>
        )}
        {s.note ? (
          <Text style={styles.note} numberOfLines={2}>
            “{s.note}”
          </Text>
        ) : null}
        <Text style={styles.via}>{t('inbox.viaCard')}</Text>
      </View>
      <View style={styles.actions}>
        {onAccept && (
          <Pressable
            onPress={onAccept}
            style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.8 }]}>
            <Text style={styles.acceptText}>{t('inbox.accept')}</Text>
          </Pressable>
        )}
        {onRestore && (
          <Pressable
            onPress={onRestore}
            style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.8 }]}>
            <Text style={styles.restoreText}>{t('inbox.restore')}</Text>
          </Pressable>
        )}
        {onDismiss && (
          <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismissBtn}>
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        )}
        {!onAccept && !onRestore && !onDismiss && (
          <Feather name="check" size={16} color={colors.muted} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkSoft,
  },
  note: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.muted,
    fontStyle: 'italic',
  },
  via: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.cherryDeep,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  acceptBtn: {
    backgroundColor: colors.espresso,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(2),
  },
  acceptText: {
    fontFamily: fonts.sansBold,
    fontSize: 12.5,
    color: colors.cardText,
  },
  restoreBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: colors.espresso,
  },
  restoreText: {
    fontFamily: fonts.sansBold,
    fontSize: 12.5,
    color: colors.espresso,
  },
  dismissBtn: {
    padding: 2,
  },
});
