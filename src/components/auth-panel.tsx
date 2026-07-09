import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { AppleSignInButton } from '@/components/apple-sign-in-button';
import { Field } from '@/components/field';
import { Body, Button } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { createSessionFromUrl } from '@/lib/oauth';
import { useAuth } from '@/state/auth-context';

// Closes the auth popup/tab when the OAuth redirect returns (no-op on native).
WebBrowser.maybeCompleteAuthSession();

// Accounts are created in the mobile apps only; the web app is login-only.
const WEB_LOGIN_ONLY = Platform.OS === 'web';

/**
 * The account form shared by the onboarding account step and the /auth modal:
 * Apple + Google providers, email/password with a sign-in/sign-up toggle.
 * Navigation on success belongs to the parent (watch `user` from useAuth).
 */
export function AuthPanel({ initialMode = 'signIn' }: { initialMode?: 'signIn' | 'signUp' }) {
  const { signIn, signUp, signInWithApple, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { t } = useTranslation();

  const [mode, setMode] = useState<'signIn' | 'signUp'>(WEB_LOGIN_ONLY ? 'signIn' : initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Android can return from the browser via a cold-start deep link instead of
  // the openAuthSessionAsync result — catch the tokens here as a fallback.
  const linkingUrl = Linking.useURL();
  useEffect(() => {
    if (Platform.OS !== 'web' && linkingUrl?.includes('access_token')) {
      void createSessionFromUrl(linkingUrl);
    }
  }, [linkingUrl]);

  const runOAuth = async (provider: 'apple' | 'google' | 'microsoft') => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result =
      provider === 'apple'
        ? await signInWithApple()
        : provider === 'microsoft'
          ? await signInWithMicrosoft()
          : await signInWithGoogle();
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
      // Signed-in sessions navigate away via the parent's user effect.
    } else {
      setError(result.error ?? t('auth.error'));
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.providers}>
        {Platform.OS !== 'android' && <AppleSignInButton onPress={() => void runOAuth('apple')} />}
        <Pressable
          onPress={() => void runOAuth('google')}
          disabled={busy}
          style={({ pressed }) => [styles.googleBtn, (pressed || busy) && { opacity: 0.7 }]}>
          <Text style={styles.googleText}>{t('auth.continueWithGoogle')}</Text>
        </Pressable>
        <Pressable
          onPress={() => void runOAuth('microsoft')}
          disabled={busy}
          style={({ pressed }) => [styles.googleBtn, (pressed || busy) && { opacity: 0.7 }]}>
          <Text style={styles.googleText}>{t('auth.continueWithMicrosoft')}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 14,
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
