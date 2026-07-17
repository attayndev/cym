import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { en } from '@/i18n/en';
import { es } from '@/i18n/es';

export type Dict = { [K in keyof typeof en]: string };
export type TKey = keyof Dict;

export const LOCALES = {
  en: 'English',
  es: 'Español',
} as const;

export type Locale = keyof typeof LOCALES;

const dicts: Record<Locale, Partial<Dict>> = { en, es };
const STORAGE_KEY = 'cym.locale.v1';

// Module mirror of the active locale so non-React callers (the notification
// scheduler, the draft generator) can translate without a hook.
let current: Locale = 'en';

export function getLocale(): Locale {
  return current;
}

/** Resolve the saved or device locale. Returns it so the provider can seed state. */
export async function resolveInitialLocale(): Promise<Locale> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved in dicts) return saved as Locale;
    const device = getLocales()?.[0]?.languageCode;
    if (device && device in dicts) return device as Locale;
  } catch {
    // fall through to default
  }
  return 'en';
}

async function persistLocale(loc: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, loc);
  } catch {
    // best-effort
  }
}

/** Translate a key, with {placeholder} interpolation. Falls back to English. */
export function t(key: TKey, params?: Record<string, string | number>): string {
  const template = (dicts[current] as Partial<Dict>)[key] ?? en[key] ?? String(key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

/** Resolve a LocalizedText descriptor (engine-generated nudge content, etc.). */
export function tx(text: { key: string; params?: Record<string, string | number> }): string {
  return t(text.key as TKey, text.params);
}

interface I18nValue {
  locale: Locale;
  setLocale: (loc: Locale) => void;
}

const I18nContext = createContext<I18nValue>({ locale: 'en', setLocale: () => {} });

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initialLocale) current = initialLocale;
    return initialLocale ?? current;
  });

  useEffect(() => {
    if (initialLocale) return;
    resolveInitialLocale().then((loc) => {
      current = loc;
      setLocaleState(loc);
    });
  }, [initialLocale]);

  const setLocale = (loc: Locale) => {
    current = loc;
    setLocaleState(loc);
    void persistLocale(loc);
  };

  return createElement(I18nContext.Provider, { value: { locale, setLocale } }, children);
}

/** Hook for components: re-renders on locale change via context. */
export function useTranslation() {
  const { locale, setLocale } = useContext(I18nContext);
  return { t, tx, locale, setLocale };
}

const DAY_MS = 86_400_000;

/** Locale-aware "last touch" / "due in" phrasing built from translation keys. */
export function relativeTime(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) {
    const ahead = -days;
    if (ahead === 0) return t('time.today');
    if (ahead === 1) return t('time.tomorrow');
    return t('time.inDays', { n: ahead });
  }
  if (days === 1) return t('time.yesterday');
  if (days < 30) return t('time.daysAgo', { n: days });
  const months = Math.round(days / 30);
  if (months < 12) {
    return months === 1 ? t('time.monthAgo') : t('time.monthsAgo', { n: months });
  }
  const years = Math.round(months / 12);
  return years === 1 ? t('time.yearAgo') : t('time.yearsAgo', { n: years });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(current, { month: 'short', day: 'numeric' });
}

const MMDD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** MM-DD (no year) → localized "Mar 22" / "22 mar". Invalid input echoes back. */
export function formatMonthDay(mmdd: string): string {
  const m = MMDD_RE.exec(mmdd);
  if (!m) return mmdd;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return new Date(2000, month - 1, day).toLocaleDateString(current, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateline(date: Date): string {
  return date.toLocaleDateString(current, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
