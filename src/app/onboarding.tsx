import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/field';
import { DialMark } from '@/components/dial-mark';
import { Body, Button, Display, Eyebrow, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { requestNotificationPermission } from '@/lib/notifications';
import { useApp } from '@/state/app-context';

export default function OnboardingScreen() {
  const { completeOnboarding, setNotificationsEnabled, loadSampleData, importDeviceContacts } =
    useApp();
  const router = useRouter();
  const { t } = useTranslation();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');

  const profilePatch = {
    name: name.trim(),
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
          <DialMark size={96} />
          <Eyebrow>{t('onboarding.welcome.eyebrow')}</Eyebrow>
          <Display style={styles.title}>{t('onboarding.welcome.title')}</Display>
          <Body muted>{t('onboarding.welcome.body')}</Body>
          <Button title={t('onboarding.welcome.cta')} onPress={() => setStep(1)} />
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
