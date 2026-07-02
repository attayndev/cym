import { Feather } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DialMark } from '@/components/dial-mark';
import { NudgeCard } from '@/components/nudge-card';
import { PersonaSwitcher } from '@/components/persona-switcher';
import { Body, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts, hardShadow, shadows } from '@/constants/theme';
import { formatDateline, useTranslation } from '@/i18n';
import { pendingNudges } from '@/lib/nudges';
import { useApp } from '@/state/app-context';

export default function TodayScreen() {
  const { db, activePersonaId, snoozeNudge, dismissNudge } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  if (!db) return <Screen scroll={false}>{null}</Screen>;
  if (!db.onboarded) return <Redirect href="/onboarding" />;

  const contactsById = new Map(db.contacts.map((c) => [c.id, c]));
  // The engine stays persona-global; Today just presents the active persona's slice.
  const nudges = pendingNudges(db).filter(
    (n) => contactsById.get(n.contactId)?.personaId === activePersonaId,
  );
  const hookNudges = nudges.filter((n) => n.kind === 'hook');
  const decayNudges = nudges.filter((n) => n.kind === 'decay').slice(0, 2);
  const hasContacts = db.contacts.some((c) => c.personaId === activePersonaId);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Eyebrow>{formatDateline(new Date())}</Eyebrow>
          <View style={styles.headerActions}>
            <PersonaSwitcher />
            <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
              <Feather name="settings" size={20} color={colors.inkSoft} />
            </Pressable>
          </View>
        </View>
        <Display>{t('today.title')}</Display>
      </View>

      {!db.profile.isPro ? (
        <Card dark style={styles.teaser}>
          <View style={styles.teaserBadge}>
            <Feather name="lock" size={12} color={colors.butter} />
            <Text style={styles.teaserBadgeText}>
              {t('today.teaser.badge', { count: Math.max(nudges.length, hasContacts ? 1 : 0) })}
            </Text>
          </View>
          <Text style={styles.teaserHeadline}>{t('today.teaser.headline')}</Text>
          <Text style={styles.teaserBody}>{t('today.teaser.body')}</Text>
          <Pressable
            onPress={() => router.push('/paywall')}
            style={({ pressed }) => [styles.teaserBtn, pressed && { opacity: 0.8 }]}>
            <Text style={styles.teaserBtnText}>{t('today.teaser.cta')}</Text>
          </Pressable>
        </Card>
      ) : nudges.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
          <DialMark size={56} variant="outline" />
          <Body style={{ textAlign: 'center' }}>
            {hasContacts ? t('today.empty.allWarm') : t('today.empty.noContacts')}
          </Body>
        </Card>
      ) : (
        <>
          {hookNudges.length > 0 && (
            <View style={styles.section}>
              <Eyebrow>{t('today.section.worthActingOn')}</Eyebrow>
              {hookNudges.map((nudge) => {
                const contact = contactsById.get(nudge.contactId);
                if (!contact) return null;
                return (
                  <NudgeCard
                    key={nudge.id}
                    nudge={nudge}
                    contact={contact}
                    onSnooze={() => snoozeNudge(nudge.id)}
                    onDismiss={() => dismissNudge(nudge.id)}
                  />
                );
              })}
            </View>
          )}
          {decayNudges.length > 0 && (
            <View style={styles.section}>
              <Eyebrow>{t('today.section.whenMinute')}</Eyebrow>
              {decayNudges.map((nudge) => {
                const contact = contactsById.get(nudge.contactId);
                if (!contact) return null;
                return (
                  <NudgeCard
                    key={nudge.id}
                    nudge={nudge}
                    contact={contact}
                    onSnooze={() => snoozeNudge(nudge.id)}
                    onDismiss={() => dismissNudge(nudge.id)}
                  />
                );
              })}
            </View>
          )}
        </>
      )}

      <Pressable
        onPress={() => router.push('/capture')}
        style={({ pressed }) => [styles.captureBtn, pressed && { opacity: 0.8 }]}>
        <Feather name="plus" size={16} color={colors.cardText} />
        <Text style={styles.captureBtnText}>{t('today.capture')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 8,
    marginBottom: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  section: {
    gap: 10,
  },
  teaser: {
    gap: 10,
  },
  teaserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,247,232,0.12)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  teaserBadgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.butter,
  },
  teaserHeadline: {
    fontFamily: fonts.displayMedium,
    fontSize: 21,
    lineHeight: 28,
    color: colors.cardText,
  },
  teaserBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.cardMuted,
  },
  teaserBtn: {
    backgroundColor: colors.cherry,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 2,
    borderColor: colors.cream,
    ...hardShadow(3, 'rgba(255,247,232,0.35)'),
  },
  teaserBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 14.5,
    color: colors.cream,
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 15,
    marginTop: 8,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.buttonSoft,
  },
  captureBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.cream,
  },
});
