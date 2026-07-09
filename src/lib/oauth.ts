import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

/**
 * Social sign-in (Apple + Google) via Supabase. Google runs through the
 * system browser on every platform (same shape as the Gmail connect flow);
 * Apple is native on iOS (identity token) and browser-based on web.
 */

export type OAuthResult = { ok: true } | { ok: false; error: string };

export type OAuthProvider = 'apple' | 'google' | 'azure';

/** Turn a Supabase implicit-flow redirect URL into a live session. */
export async function createSessionFromUrl(url: string): Promise<OAuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'not_configured' };

  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) return { ok: false, error: errorCode };

  const { access_token: accessToken, refresh_token: refreshToken } = params;
  if (!accessToken || !refreshToken) return { ok: false, error: 'no_tokens' };

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Browser-based OAuth. On web this redirects the page; on native it opens a
 *  system auth session and returns to the callyourmom:// scheme. */
export async function signInWithProviderOAuth(provider: OAuthProvider): Promise<OAuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'not_configured' };

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    // On success the page navigates away; only errors return here.
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const redirectTo = Linking.createURL('auth');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, error: error?.message ?? 'no_url' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, error: 'cancelled' };
  return createSessionFromUrl(result.url);
}

/** Native Sign in with Apple (iOS only). Dynamically imported so the module
 *  never lands in Android/web bundles. */
export async function signInWithAppleNative(): Promise<OAuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'not_configured' };
  if (Platform.OS !== 'ios') return { ok: false, error: 'unavailable' };

  const AppleAuthentication = await import('expo-apple-authentication');
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return { ok: false, error: 'no_token' };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { ok: false, error: error.message };

    // Apple only provides the name on the FIRST authorization — persist it.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ');
    if (fullName) {
      await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, error: 'cancelled' };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'apple_failed' };
  }
}
