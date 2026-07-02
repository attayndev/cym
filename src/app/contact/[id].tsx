import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { HealthBadge } from '@/components/health-badge';
import { Body, Card, Chip, Display, Eyebrow, Row, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { formatShortDate, relativeTime, useTranslation, type TKey } from '@/i18n';
import { contactHealth, lastContactAt } from '@/lib/nudges';
import type { InteractionType } from '@/lib/types';
import { useApp } from '@/state/app-context';

const HISTORY_LABEL: Record<InteractionType, TKey> = {
  met: 'log.met',
  call: 'log.call',
  text: 'log.text',
  email: 'log.email',
  coffee: 'log.coffee',
  meeting: 'log.meeting',
};

const LOG_TYPES: {
  type: InteractionType;
  key: TKey;
  icon: 'phone' | 'message-circle' | 'mail' | 'coffee';
}[] = [
  { type: 'call', key: 'log.call', icon: 'phone' },
  { type: 'text', key: 'log.text', icon: 'message-circle' },
  { type: 'email', key: 'log.email', icon: 'mail' },
  { type: 'coffee', key: 'log.coffee', icon: 'coffee' },
];

export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, logInteraction, deleteContact } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  if (!db) return <Screen scroll={false}>{null}</Screen>;

  const contact = db.contacts.find((c) => c.id === id);
  if (!contact) {
    return (
      <Screen>
        <Body>{t('contact.notFound')}</Body>
      </Screen>
    );
  }

  const now = new Date();
  const context = db.contexts.find((c) => c.contactId === contact.id);
  const interactions = db.interactions
    .filter((i) => i.contactId === contact.id)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const last = lastContactAt(contact, db.interactions);

  const contextRows = [
    { label: t('contact.context.whereMet'), value: context?.whereMet },
    { label: t('contact.context.discussed'), value: context?.discussed },
    { label: t('contact.context.whyMatters'), value: context?.whyMatters },
  ].filter((row) => row.value);

  const confirmDelete = () => {
    Alert.alert(
      t('contact.delete.confirm', { name: contact.firstName }),
      t('contact.delete.confirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteContact(contact.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Pressable onPress={() => router.push(`/contact/edit/${contact.id}`)} hitSlop={10}>
          <Feather name="edit-2" size={19} color={colors.inkSoft} />
        </Pressable>
      </View>

      <View style={styles.header}>
        <Display>
          {contact.firstName} {contact.lastName ?? ''}
        </Display>
        {(contact.role || contact.company) && (
          <Body muted>{[contact.role, contact.company].filter(Boolean).join(' · ')}</Body>
        )}
        <Row style={{ marginTop: 4 }}>
          <HealthBadge health={contactHealth(contact, db.interactions, now)} />
          <Text style={styles.meta}>
            {t('common.lastTouch', { when: relativeTime(last, now) })}
          </Text>
        </Row>
        <Row>
          <Chip label={t(`category.${contact.category}`)} />
          <Chip label={t('contact.cadenceEvery', { n: contact.cadenceDays })} />
          {contact.birthday && <Chip label={`🎂 ${contact.birthday}`} />}
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>{t('contact.logTouchpoint')}</Eyebrow>
        <Row>
          {LOG_TYPES.map((item) => (
            <Pressable
              key={item.type}
              onPress={() => logInteraction(contact.id, item.type)}
              style={({ pressed }) => [styles.logBtn, pressed && { opacity: 0.6 }]}>
              <Feather name={item.icon} size={14} color={colors.ink} />
              <Text style={styles.logBtnText}>{t(item.key)}</Text>
            </Pressable>
          ))}
        </Row>
      </View>

      {contextRows.length > 0 || context?.commitment ? (
        <Card>
          <Eyebrow>{t('contact.context.title')}</Eyebrow>
          {contextRows.map((row) => (
            <View key={row.label} style={{ gap: 2 }}>
              <Text style={styles.ctxLabel}>{row.label}</Text>
              <Body>{row.value}</Body>
            </View>
          ))}
          {context?.commitment && (
            <View style={styles.commitment}>
              <Feather name="flag" size={13} color={colors.cherryDeep} />
              <Body style={{ flex: 1 }}>
                {context.commitmentDueAt
                  ? t('contact.committedDue', {
                      commitment: context.commitment,
                      date: formatShortDate(context.commitmentDueAt),
                    })
                  : t('contact.committedTo', { commitment: context.commitment })}
              </Body>
            </View>
          )}
        </Card>
      ) : (
        <Card>
          <Eyebrow>{t('contact.context.title')}</Eyebrow>
          <Body muted>{t('contact.context.empty')}</Body>
        </Card>
      )}

      <View style={{ gap: 8 }}>
        <Eyebrow>{t('contact.history')}</Eyebrow>
        {interactions.length === 0 && <Body muted>{t('contact.noHistory')}</Body>}
        {interactions.map((i) => (
          <View key={i.id} style={styles.historyRow}>
            <Text style={styles.historyType}>{t(HISTORY_LABEL[i.type])}</Text>
            <Text style={styles.historyDate}>{relativeTime(i.occurredAt, now)}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={confirmDelete} hitSlop={8} style={styles.deleteRow}>
        <Feather name="trash-2" size={14} color={colors.atRisk} />
        <Text style={styles.deleteText}>{t('contact.delete')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    gap: 6,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  logBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.ink,
  },
  ctxLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 11.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  commitment: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.blush,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  historyType: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.ink,
    textTransform: 'capitalize',
  },
  historyDate: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.muted,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    marginTop: 4,
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.atRisk,
  },
});
