import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Body, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { LOCALES, useTranslation, type Locale } from '@/i18n';
import { connectGmail, disconnectGmail, syncGmailNow } from '@/lib/gmail';
import { requestNotificationPermission } from '@/lib/notifications';
import { getSupabase } from '@/lib/supabase';
import { useApp } from '@/state/app-context';
import { useAuth } from '@/state/auth-context';

export default function SettingsScreen() {
  const { db, setNotificationsEnabled, exportData, resetAll, loadSampleData, pullNow, syncContacts } = useApp();
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { configured, user, signOut } = useAuth();
  const [gmailBusy, setGmailBusy] = useState(false);
  const [contactsBusy, setContactsBusy] = useState(false);

  const handleSyncContacts = async () => {
    setContactsBusy(true);
    try {
      const { imported, exported } = await syncContacts();
      Alert.alert(
        imported + exported > 0
          ? t('people.sync.result', { imported, exported })
          : t('people.sync.upToDate'),
      );
    } finally {
      setContactsBusy(false);
    }
  };

  if (!db) return <Screen scroll={false}>{null}</Screen>;

  const { profile } = db;

  const toggleNotifications = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (!granted) {
        Alert.alert(t('settings.notifications.label'), t('settings.notifications.web'));
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleExport = async () => {
    const json = exportData();
    await Clipboard.setStringAsync(json);
    Alert.alert(t('settings.data.exported'), undefined);
  };

  const confirmReset = () => {
    Alert.alert(t('settings.data.reset.confirm'), t('settings.data.reset.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void resetAll();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const gmailAccount = db.accounts.find((a) => a.provider === 'gmail' && a.status === 'connected');

  const handleConnectGmail = async () => {
    setGmailBusy(true);
    try {
      const result = await connectGmail();
      if (result === 'connected') {
        await syncGmailNow().catch(() => 0);
        await pullNow();
      } else if (result === 'error') {
        Alert.alert(t('gmail.error'));
      }
    } finally {
      setGmailBusy(false);
    }
  };

  const handleSyncGmail = async () => {
    setGmailBusy(true);
    try {
      const count = await syncGmailNow();
      await pullNow();
      Alert.alert(count > 0 ? t('gmail.synced', { count }) : t('gmail.syncedNone'));
    } catch {
      Alert.alert(t('gmail.error'));
    } finally {
      setGmailBusy(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setGmailBusy(true);
    try {
      await disconnectGmail();
      await pullNow();
    } finally {
      setGmailBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Display>{t('settings.title')}</Display>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="x" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {/* Profile */}
      <View style={styles.section}>
        <Eyebrow>{t('settings.section.profile')}</Eyebrow>
        <Card>
          <Text style={styles.profileName}>{profile.name || '—'}</Text>
          {(profile.role || profile.company) && (
            <Body muted>{[profile.role, profile.company].filter(Boolean).join(' · ')}</Body>
          )}
          <Pressable onPress={() => router.push('/(tabs)/card')} hitSlop={6}>
            <Text style={styles.link}>{t('settings.editProfile')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/personas')} hitSlop={6}>
            <Text style={styles.link}>{t('settings.personas')}</Text>
          </Pressable>
        </Card>
      </View>

      {/* Account & sync — only when a backend is configured */}
      {configured && (
        <View style={styles.section}>
          <Eyebrow>{t('settings.section.account')}</Eyebrow>
          <Card>
            {user ? (
              <>
                <Text style={styles.profileName}>
                  {t('settings.account.signedInAs', { email: user.email ?? '' })}
                </Text>
                <Body muted>{t('settings.account.syncBody')}</Body>
                <Pressable onPress={() => void signOut()} hitSlop={6}>
                  <Text style={styles.link}>{t('settings.account.signOut')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Body muted>{t('settings.account.localOnly')}</Body>
                <Pressable onPress={() => router.push('/auth')} hitSlop={6}>
                  <Text style={styles.link}>{t('settings.account.signIn')}</Text>
                </Pressable>
              </>
            )}
          </Card>
        </View>
      )}

      {/* Email sync — signed-in only, and a mobile-only feature (web shows a note) */}
      {configured && user && (
        <View style={styles.section}>
          <Eyebrow>{t('settings.section.gmail')}</Eyebrow>
          <Card>
            {Platform.OS === 'web' ? (
              <Body muted>{t('gmail.mobileOnly')}</Body>
            ) : gmailAccount ? (
              <>
                <Text style={styles.profileName}>
                  {t('gmail.connected', { email: gmailAccount.email })}
                </Text>
                <Body muted>{t('gmail.body')}</Body>
                <View style={styles.gmailRow}>
                  <Pressable onPress={handleSyncGmail} disabled={gmailBusy} hitSlop={6}>
                    <Text style={styles.link}>
                      {gmailBusy ? t('gmail.syncing') : t('gmail.syncNow')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={handleDisconnectGmail} disabled={gmailBusy} hitSlop={6}>
                    <Text style={styles.linkMuted}>{t('gmail.disconnect')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Body muted>{t('gmail.body')}</Body>
                <Pressable onPress={handleConnectGmail} disabled={gmailBusy} hitSlop={6}>
                  <Text style={styles.link}>
                    {gmailBusy ? t('gmail.connecting') : t('gmail.connect')}
                  </Text>
                </Pressable>
              </>
            )}
          </Card>
        </View>
      )}

      {/* Language */}
      <View style={styles.section}>
        <Eyebrow>{t('settings.section.language')}</Eyebrow>
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {(Object.keys(LOCALES) as Locale[]).map((loc) => (
            <Pressable
              key={loc}
              onPress={() => {
                void setLocale(loc);
                // Mirror to the profile so server-sent push uses the right language.
                if (user) void getSupabase()?.from('profiles').update({ locale: loc }).eq('user_id', user.id);
              }}
              style={styles.langRow}>
              <Text style={styles.langLabel}>{LOCALES[loc]}</Text>
              {locale === loc && <Feather name="check" size={18} color={colors.cherryDeep} />}
            </Pressable>
          ))}
        </Card>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Eyebrow>{t('settings.section.notifications')}</Eyebrow>
        <Card>
          {Platform.OS === 'web' ? (
            <Body muted>{t('settings.notifications.web')}</Body>
          ) : !profile.isPro ? (
            <Body muted>{t('settings.notifications.needsPro')}</Body>
          ) : (
            <View style={styles.switchRow}>
              <Body style={{ flex: 1 }}>{t('settings.notifications.label')}</Body>
              <Switch
                value={profile.notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ true: colors.espresso, false: colors.blush }}
              />
            </View>
          )}
        </Card>
      </View>

      {/* Subscription */}
      <View style={styles.section}>
        <Eyebrow>{t('settings.section.subscription')}</Eyebrow>
        <Card>
          {profile.isPro ? (
            <>
              <Text style={styles.profileName}>{t('settings.subscription.pro')}</Text>
              <Body muted>{t('settings.subscription.proBody')}</Body>
            </>
          ) : (
            <>
              <Text style={styles.profileName}>{t('settings.subscription.free')}</Text>
              <Pressable onPress={() => router.push('/paywall')} hitSlop={6}>
                <Text style={styles.link}>{t('settings.subscription.upgrade')}</Text>
              </Pressable>
            </>
          )}
        </Card>
      </View>

      {/* Privacy */}
      <View style={styles.section}>
        <Eyebrow>{t('settings.section.privacy')}</Eyebrow>
        <Card>
          <Body muted>{t('settings.privacy.statement')}</Body>
        </Card>
      </View>

      {/* Data */}
      <View style={styles.section}>
        <Eyebrow>{t('settings.section.data')}</Eyebrow>
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {Platform.OS !== 'web' && (
            <Pressable onPress={handleSyncContacts} disabled={contactsBusy} style={styles.dataRow}>
              <Feather name="refresh-cw" size={16} color={colors.inkSoft} />
              <Text style={styles.dataLabel}>
                {contactsBusy ? t('people.syncing') : t('people.sync')}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={handleExport} style={styles.dataRow}>
            <Feather name="download" size={16} color={colors.inkSoft} />
            <Text style={styles.dataLabel}>{t('settings.data.export')}</Text>
          </Pressable>
          <Pressable onPress={loadSampleData} style={styles.dataRow}>
            <Feather name="package" size={16} color={colors.inkSoft} />
            <Text style={styles.dataLabel}>{t('settings.data.sample')}</Text>
          </Pressable>
          <Pressable onPress={confirmReset} style={styles.dataRow}>
            <Feather name="trash-2" size={16} color={colors.atRisk} />
            <Text style={[styles.dataLabel, { color: colors.atRisk }]}>
              {t('settings.data.reset')}
            </Text>
          </Pressable>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    gap: 8,
  },
  profileName: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.ink,
  },
  link: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.cherryDeep,
    marginTop: 4,
  },
  linkMuted: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  gmailRow: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  langLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  dataLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
});
