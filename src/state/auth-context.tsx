import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { signInWithAppleNative, signInWithProviderOAuth } from '@/lib/oauth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthState {
  /** Whether a Supabase backend is wired up at all (env vars present). */
  configured: boolean;
  /** Still resolving the initial session. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signInWithApple: () => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  const value = useMemo<AuthState>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signIn: async (email, password) => {
        const supabase = getSupabase();
        if (!supabase) return { ok: false, error: 'not_configured' };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { ok: false, error: error.message } : { ok: true };
      },
      signUp: async (email, password) => {
        const supabase = getSupabase();
        if (!supabase) return { ok: false, error: 'not_configured' };
        const { error } = await supabase.auth.signUp({ email, password });
        return error ? { ok: false, error: error.message } : { ok: true };
      },
      // Apple: native sheet on iOS, browser OAuth on web, unavailable on Android.
      signInWithApple: async () => {
        if (Platform.OS === 'ios') return signInWithAppleNative();
        if (Platform.OS === 'web') return signInWithProviderOAuth('apple');
        return { ok: false, error: 'unavailable' };
      },
      signInWithGoogle: async () => signInWithProviderOAuth('google'),
      signOut: async () => {
        const supabase = getSupabase();
        await supabase?.auth.signOut();
      },
    }),
    [configured, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
