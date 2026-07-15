import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { confirmAction, notify } from '@/lib/alert';
import { Field } from '@/components/field';
import { Body, Button, Card, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { LOCALES, useTranslation, type Locale } from '@/i18n';
import { deleteAccount } from '@/lib/account';
import { connectImap, disconnectEmail, IMAP_PRESETS, syncAllEmail } from '@/lib/email';
import { connectGmail } from '@/lib/gmail';
import { requestNotificationPermission } from '@/lib/notifications';
import { getSupabase } from '@/lib/supabase';
import { ADMIN_EMAILS } from '@/lib/tier';
import { useApp } from '@/state/app-context';
import { useAuth } from '@/state/auth-context';

export default function SettingsScreen() {
  const { db, setNotificationsEnabled, exportData, resetAll, loadSampleData, pullNow, syncContacts, pushContactsToDevice } = useApp();
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { configured, user, signOut } = useAuth();
  const [gmailBusy, setGmailBusy] = useState(false);
  const [imapOpen, setImapOpen] = useState(false);
  const [imapEmail, setImapEmail] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [imapPreset, setImapPreset] = useState<'icloud' | 'yahoo' | 'outlook' | 'custom'>('icloud');
  const [imapHost, setImapHost] = useState('');
  const [contactsBusy, setContactsBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(false);
    // Order matters: the server deletion needs the JWT, so it goes first;
    // a pending push debounce firing mid-flight fails harmlessly (FK to the
    // deleted auth user) and after signOut the sync ref is nulled, so the
    // local reset below can't push anything back up.
    const ok = await deleteAccount();
    if (!ok) {
      setDeleteError(true);
      setDeleting(false);
      return;
    }
    await signOut();
    await resetAll();
    router.replace('/onboarding');
  };

  const handleSyncContacts = async () => {
    setContactsBusy(true);
    try {
      const { imported, exported, deviceTotal, access } = await syncContacts();
      notify(
        imported + exported > 0
          ? t('people.sync.result', { imported, exported })
          : t('people.sync.upToDate'),
        t('people.sync.device', { n: deviceTotal, access: access ?? '—' }),
      );
    } finally {
      setContactsBusy(false);
    }
  };

  const handleUpdateDeviceContacts = async () => {
    setContactsBusy(true);
    try {
      const updated = await pushContactsToDevice();
      notify(
        updated > 0
          ? t('settings.updateDevice.result', { count: updated })
          : t('settings.updateDevice.none'),
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
        notify(t('settings.notifications.label'), t('settings.notifications.web'));
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleExport = async () => {
    const json = exportData();
    await Clipboard.setStringAsync(json);
    notify(t('settings.data.exported'));
  };

  const confirmReset = () => {
    confirmAction(
      {
        title: t('settings.data.reset.confirm'),
        body: t('settings.data.reset.confirmBody'),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
        destructive: true,
      },
      () => {
        void resetAll();
        router.replace('/onboarding');
      },
    );
  };

  const emailAccounts = db.accounts.filter(
    (a) => ['gmail', 'imap'].includes(a.provider) && a.status === 'connected',
  );

  const handleConnectGmail = async () => {
    setGmailBusy(true);
    try {
      const result = await connectGmail();
      if (result === 'connected') {
        await syncAllEmail().catch(() => 0);
        await pullNow();
      } else if (result === 'error') {
        notify(t('gmail.error'));
      }
    } finally {
      setGmailBusy(false);
    }
  };

  const handleSyncEmail = async () => {
    setGmailBusy(true);
    try {
      const count = await syncAllEmail();
      await pullNow();
      notify(count > 0 ? t('gmail.synced', { count }) : t('gmail.syncedNone'));
    } catch {
      notify(t('gmail.error'));
    } finally {
      setGmailBusy(false);
    }
  };

  const handleDisconnect = async (provider: string, email: string) => {
    setGmailBusy(true);
    try {
      await disconnectEmail(provider, email);
      await pullNow();
    } finally {
      setGmailBusy(false);
    }
  };

  // Multi-inbox is a Plus feature: the first inbox is free, adding a second
  // routes through the paywall.
  const gateInbox = (connect: () => void) => {
    if (emailAccounts.length >= 1 && !db.profile.isPro) {
      router.push('/paywall');
      return;
    }
    connect();
  };

  const handleConnectImap = async () => {
    const preset = IMAP_PRESETS.find((p) => p.key === imapPreset)!;
    const host = imapPreset === 'custom' ? imapHost.trim() : preset.host;
    if (!imapEmail.trim() || !imapPassword || !host) return;
    setGmailBusy(true);
    try {
      const result = await connectImap({
        email: imapEmail.trim(),
        password: imapPassword,
        host,
        port: preset.port,
      });
      if (result === 'connected') {
        setImapOpen(false);
        setImapEmail('');
        setImapPassword('');
        await syncAllEmail().catch(() => 0);
        await pullNow();
      } else {
        notify(t('email.imap.failed'));
      }
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
          {user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()) && (
            <Pressable onPress={() => router.push('/admin')} hitSlop={6}>
              <Text style={styles.link}>{t('settings.admin')}</Text>
            </Pressable>
          )}
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
                <Pressable
                  onPress={async () => {
                    await signOut();
                    // Signed-out usage is locked — land on the sign-in screen.
                    router.replace('/auth');
                  }}
                  hitSlop={6}>
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
            ) : (
              <>
                {emailAccounts.map((account) => (
                  <View key={account.id} style={styles.gmailAccountRow}>
                    <Text style={styles.gmailEmail} numberOfLines={1}>
                      {account.email}
                      <Text style={styles.providerTag}>
                        {'  '}
                        {account.provider === 'gmail'
                          ? 'Gmail'
                          : 'IMAP'}
                      </Text>
                    </Text>
                    <Pressable
                      onPress={() => handleDisconnect(account.provider, account.email)}
                      disabled={gmailBusy}
                      hitSlop={6}>
                      <Text style={styles.linkMuted}>{t('gmail.disconnect')}</Text>
                    </Pressable>
                  </View>
                ))}
                <Body muted>{t('email.body')}</Body>
                {emailAccounts.length > 0 && (
                  <Pressable onPress={handleSyncEmail} disabled={gmailBusy} hitSlop={6}>
                    <Text style={styles.link}>
                      {gmailBusy ? t('gmail.syncing') : t('gmail.syncNow')}
                    </Text>
                  </Pressable>
                )}
                <View style={styles.gmailRow}>
                  <Pressable
                    onPress={() => gateInbox(() => void handleConnectGmail())}
                    disabled={gmailBusy}
                    hitSlop={6}>
                    <Text style={styles.link}>{t('email.connect.gmail')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => gateInbox(() => setImapOpen((v) => !v))}
                    disabled={gmailBusy}
                    hitSlop={6}>
                    <Text style={styles.link}>{t('email.connect.imap')}</Text>
                  </Pressable>
                </View>
                {imapOpen && (
                  <View style={{ gap: 8, marginTop: 6 }}>
                    <View style={styles.gmailRow}>
                      {(['icloud', 'yahoo', 'outlook', 'custom'] as const).map((k) => (
                        <Pressable key={k} onPress={() => setImapPreset(k)} hitSlop={6}>
                          <Text style={imapPreset === k ? styles.link : styles.linkMuted}>
                            {k === 'icloud' ? 'iCloud' : k === 'yahoo' ? 'Yahoo' : k === 'outlook' ? 'Outlook' : t('email.imap.custom')}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Field
                      label={t('field.email')}
                      value={imapEmail}
                      onChangeText={setImapEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <Field
                      label={t('email.imap.password')}
                      value={imapPassword}
                      onChangeText={setImapPassword}
                      secureTextEntry
                    />
                    {imapPreset === 'custom' && (
                      <Field
                        label={t('email.imap.host')}
                        value={imapHost}
                        onChangeText={setImapHost}
                        autoCapitalize="none"
                      />
                    )}
                    <Body muted>{t('email.imap.hint')}</Body>
                    <Button
                      title={gmailBusy ? t('gmail.connecting') : t('email.imap.cta')}
                      onPress={() => void handleConnectImap()}
                    />
                  </View>
                )}
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
          {Platform.OS !== 'web' && (
            <Pressable
              onPress={handleUpdateDeviceContacts}
              disabled={contactsBusy}
              style={styles.dataRow}>
              <Feather name="upload" size={16} color={colors.inkSoft} />
              <Text style={styles.dataLabel}>{t('settings.updateDevice')}</Text>
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
          {configured && user && (
            <Pressable
              onPress={() => {
                setDeleteOpen((open) => !open);
                setDeleteWord('');
                setDeleteError(false);
              }}
              style={styles.dataRow}>
              <Feather name="user-x" size={16} color={colors.atRisk} />
              <Text style={[styles.dataLabel, { color: colors.atRisk }]}>
                {t('settings.account.delete')}
              </Text>
            </Pressable>
          )}
        </Card>
        {deleteOpen && configured && user && (
          <Card style={{ gap: 10, borderColor: colors.cherryDeep }}>
            <Body>{t('settings.account.delete.body')}</Body>
            <Field
              label={t('settings.account.delete.placeholder')}
              value={deleteWord}
              onChangeText={setDeleteWord}
              autoCapitalize="none"
            />
            {deleteError && (
              <Body style={{ color: colors.danger }}>{t('settings.account.delete.error')}</Body>
            )}
            <Button
              title={deleting ? t('settings.account.deleting') : t('settings.account.delete.cta')}
              variant="accent"
              disabled={
                deleting ||
                deleteWord.trim().toUpperCase() !== t('settings.account.delete.word')
              }
              onPress={() => void handleDeleteAccount()}
            />
          </Card>
        )}
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
  gmailAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  providerTag: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.muted,
  },
  gmailEmail: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.ink,
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
