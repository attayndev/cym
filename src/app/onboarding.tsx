import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthPanel } from '@/components/auth-panel';
import { Field } from '@/components/field';
import { DialMark } from '@/components/dial-mark';
import { Body, Button, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { requestNotificationPermission } from '@/lib/notifications';
import { useApp } from '@/state/app-context';
import { useAuth } from '@/state/auth-context';

export default function OnboardingScreen() {
  const {
    db,
    cloudReady,
    completeOnboarding,
    setNotificationsEnabled,
    loadSampleData,
    importDeviceContacts,
  } = useApp();
  const { user, configured } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');

  // Accounts are required: the account step gates the rest of onboarding.
  // (When Supabase isn't configured — bare local dev — the step is skipped.)
  const needsAccount = configured && !user;

  useEffect(() => {
    if (!user || step !== 0) return;
    // Wait for the first cloud pull to settle before deciding whether this is
    // a new or returning account — advancing early made a returning user's
    // device look like a brand-new account while their data was still
    // downloading.
    if (!cloudReady) return;
    // Returning account whose cloud graph is already onboarded: skip the rest
    // of onboarding entirely.
    if (db?.onboarded) {
      router.replace('/');
      return;
    }
    setStep(1);
  }, [user, db?.onboarded, step, cloudReady, router]);

  // Apple/Google sign-ups arrive with a name (profile trigger → sign-in pull);
  // prefill the card step so they don't type it twice.
  useEffect(() => {
    if (db?.profile.name) setName((prev) => prev || db.profile.name);
  }, [db?.profile.name]);
  useEffect(() => {
    if (user?.email) setEmail((prev) => prev || user.email || '');
  }, [user?.email]);

  const profilePatch = {
    name: name.trim(),
    email: email.trim() || undefined,
    phone: phone.trim() || undefined,
    role: role.trim() || undefined,
    company: company.trim() || undefined,
  };

  const finish = (after?: () => void) => {
    completeOnboarding(profilePatch);
    router.replace('/');
    after?.();
  };

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    setStep(3);
  };

  return (
    <Screen>
      {step === 0 && (
        <View style={styles.center}>
          {user && !cloudReady ? (
            <>
              <ActivityIndicator color={colors.ink} />
              <Body muted style={{ textAlign: 'center' }}>
                {t('onboarding.restoring')}
              </Body>
            </>
          ) : (
            <>
              <DialMark size={72} />
              <Eyebrow>{t('onboarding.welcome.eyebrow')}</Eyebrow>
              <Display style={styles.title}>{t('onboarding.welcome.title')}</Display>
              <Body muted>{t('onboarding.welcome.body')}</Body>
              {needsAccount ? (
                <AuthPanel initialMode="signUp" />
              ) : (
                <Button title={t('onboarding.welcome.cta')} onPress={() => setStep(1)} />
              )}
            </>
          )}
        </View>
      )}

      {step === 1 && (
        <View style={styles.center}>
          <Display style={styles.title}>{t('onboarding.card.title')}</Display>
          <Body muted>{t('onboarding.card.body')}</Body>
          <View style={styles.form}>
            <Field
              label={t('field.name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Field
              label={t('field.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label={t('field.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field
              label={t('field.role')}
              value={role}
              onChangeText={setRole}
              autoCapitalize="words"
            />
            <Field
              label={t('field.company')}
              value={company}
              onChangeText={setCompany}
              autoCapitalize="words"
            />
          </View>
          <Button title={t('onboarding.card.cta')} onPress={() => setStep(2)} />
        </View>
      )}

      {step === 2 && (
        <View style={styles.center}>
          <Display style={styles.title}>{t('onboarding.notify.title')}</Display>
          <Body muted>{t('onboarding.notify.body')}</Body>
          {Platform.OS === 'web' ? (
            <Button title={t('onboarding.card.cta')} onPress={() => setStep(3)} />
          ) : (
            <>
              <Button title={t('onboarding.notify.enable')} onPress={enableNotifications} />
              <Button
                title={t('onboarding.notify.later')}
                variant="ghost"
                onPress={() => setStep(3)}
              />
            </>
          )}
        </View>
      )}

      {step === 3 && (
        <View style={styles.center}>
          <Display style={styles.title}>{t('onboarding.start.title')}</Display>
          <Body muted>{t('onboarding.start.body')}</Body>
          <View style={styles.form}>
            <Button
              title={t('onboarding.start.capture')}
              onPress={() => finish(() => router.push('/capture'))}
            />
            {Platform.OS !== 'web' && (
              <Pressable
                onPress={() => finish(() => void importDeviceContacts())}
                style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}>
                <Text style={styles.secondaryText}>{t('onboarding.start.import')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => finish(() => loadSampleData())}
              style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}>
              <Text style={styles.secondaryText}>{t('onboarding.start.sample')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    paddingBottom: 40,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  form: {
    gap: 12,
    marginTop: 4,
  },
  secondary: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.inkSoft,
  },
});
