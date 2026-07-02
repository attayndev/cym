import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { AppleSignInButton } from '@/components/apple-sign-in-button';
import { Field } from '@/components/field';
import { Body, Button, Display, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { createSessionFromUrl } from '@/lib/oauth';
import { useAuth } from '@/state/auth-context';

// Closes the auth popup/tab when the OAuth redirect returns (no-op on native).
WebBrowser.maybeCompleteAuthSession();

// Accounts are created in the mobile apps only; the web app is login-only.
const WEB_LOGIN_ONLY = Platform.OS === 'web';

export default function AuthScreen() {
  const { signIn, signUp, signInWithApple, signInWithGoogle, user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A session appearing (email, native OAuth, or the web OAuth callback landing
  // back on /auth with tokens) means we're done here.
  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  // Android can return from the browser via a cold-start deep link instead of
  // the openAuthSessionAsync result — catch the tokens here as a fallback.
  const linkingUrl = Linking.useURL();
  useEffect(() => {
    if (Platform.OS !== 'web' && linkingUrl?.includes('access_token')) {
      void createSessionFromUrl(linkingUrl);
    }
  }, [linkingUrl]);

  const runOAuth = async (provider: 'apple' | 'google') => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setBusy(false);
    if (!result.ok && result.error !== 'cancelled') {
      setError(t('auth.error'));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.ok) {
      if (mode === 'signUp') {
        setNotice(t('auth.checkEmail'));
      }
      // Signed-in sessions navigate away via the user effect above.
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

      <View style={styles.providers}>
        {Platform.OS !== 'android' && <AppleSignInButton onPress={() => void runOAuth('apple')} />}
        <Pressable
          onPress={() => void runOAuth('google')}
          disabled={busy}
          style={({ pressed }) => [styles.googleBtn, (pressed || busy) && { opacity: 0.7 }]}>
          <Text style={styles.googleText}>{t('auth.continueWithGoogle')}</Text>
        </Pressable>
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.or')}</Text>
        <View style={styles.dividerLine} />
      </View>

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
  providers: {
    gap: 10,
  },
  googleBtn: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 13,
  },
  googleText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.espresso,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.blush,
  },
  dividerText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
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
