import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/field';
import { Body, Button, Display, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/state/auth-context';

// Accounts are created in the mobile apps only; the web app is login-only.
const WEB_LOGIN_ONLY = Platform.OS === 'web';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.ok) {
      if (mode === 'signUp') {
        setNotice(t('auth.checkEmail'));
      } else {
        router.back();
      }
    } else {
      setError(result.error ?? t('auth.error'));
    }
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Display>{t('auth.title')}</Display>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="x" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <Body muted>{t('auth.subtitle')}</Body>

      {WEB_LOGIN_ONLY ? (
        <Body muted>{t('auth.webOnlyNote')}</Body>
      ) : (
        <View style={styles.toggle}>
          <Pressable
            onPress={() => setMode('signIn')}
            style={[styles.toggleBtn, mode === 'signIn' && styles.toggleActive]}>
            <Text style={[styles.toggleText, mode === 'signIn' && styles.toggleTextActive]}>
              {t('auth.signIn')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('signUp')}
            style={[styles.toggleBtn, mode === 'signUp' && styles.toggleActive]}>
            <Text style={[styles.toggleText, mode === 'signUp' && styles.toggleTextActive]}>
              {t('auth.signUp')}
            </Text>
          </Pressable>
        </View>
      )}

      <Field
        label={t('field.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field label={t('auth.password')} value={password} onChangeText={setPassword} autoCapitalize="none" />

      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}

      <Button
        title={busy ? t('auth.working') : mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
        onPress={submit}
        disabled={busy || !email.trim() || !password.trim()}
      />
      <Body muted style={styles.fine}>
        {t('auth.privacyNote')}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.blush,
    borderRadius: 999,
    padding: 4,
    gap: 4,
    borderWidth: 2,
    borderColor: colors.espresso,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: colors.ink,
  },
  toggleText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.inkSoft,
  },
  toggleTextActive: {
    color: colors.cardText,
  },
  error: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.atRisk,
  },
  notice: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.warm,
  },
  fine: {
    fontSize: 12.5,
    marginTop: 4,
  },
});
