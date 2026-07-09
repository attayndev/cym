import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { AuthPanel } from '@/components/auth-panel';
import { Body, Display, Screen } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/state/auth-context';

// Accounts are required, so this screen is a lock: there is no dismiss —
// the only way out is a session appearing.
export default function AuthScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  // A session appearing (email, native OAuth, or the web OAuth callback landing
  // back on /auth with tokens) means we're done here.
  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  return (
    <Screen>
      <Display>{t('auth.title')}</Display>
      <Body muted>{t('auth.subtitle')}</Body>
      <AuthPanel initialMode="signIn" />
    </Screen>
  );
}
