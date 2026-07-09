import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

/**
 * RevenueCat wrapper. Everything is guarded three ways:
 *  - env keys absent → not configured (dev fallback: paywall flips the local flag);
 *  - web → not configured (billing is mobile-first; Stripe web comes later);
 *  - dynamic require → an OLD dev build without the native module must not
 *    crash at import time; purchases simply stay unconfigured until a rebuild.
 * RevenueCat public SDK keys are safe to embed in the bundle by design.
 */

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/** The single Plus entitlement — matches the identifier in the RC dashboard. */
export const ENTITLEMENT_ID = 'plus';

type PurchasesModule = typeof import('react-native-purchases').default;

let cached: PurchasesModule | null | undefined;
function sdk(): PurchasesModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-purchases').default as PurchasesModule;
  } catch {
    cached = null; // native module absent (old build / Expo Go / web)
  }
  return cached;
}

function apiKey(): string | undefined {
  return Platform.OS === 'ios' ? IOS_KEY : Platform.OS === 'android' ? ANDROID_KEY : undefined;
}

export function purchasesConfigured(): boolean {
  return Boolean(apiKey()) && sdk() !== null;
}

function isPro(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active[ENTITLEMENT_ID]);
}

/**
 * Configure RC against the signed-in Supabase user id (so webhooks can map
 * app_user_id → profiles row) and stream entitlement changes to the caller.
 */
export async function configurePurchases(
  appUserId: string,
  onProChange: (isPro: boolean) => void,
): Promise<void> {
  if (!purchasesConfigured()) return;
  const P = sdk()!;
  P.configure({ apiKey: apiKey()!, appUserID: appUserId });
  P.addCustomerInfoUpdateListener((info) => onProChange(isPro(info)));
  try {
    onProChange(isPro(await P.getCustomerInfo()));
  } catch {
    // Offline at launch — the listener catches up when connectivity returns.
  }
}

export interface PlusPackages {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

/** Monthly + annual Plus packages from the current offering ($15/mo, $120/yr,
 *  both with a 7-day free trial — configured store-side). */
export async function getPlusPackages(): Promise<PlusPackages> {
  if (!purchasesConfigured()) return { monthly: null, annual: null };
  try {
    const current = (await sdk()!.getOfferings()).current;
    return { monthly: current?.monthly ?? null, annual: current?.annual ?? null };
  } catch {
    return { monthly: null, annual: null };
  }
}

export async function purchasePlus(
  pkg: PurchasesPackage,
): Promise<{ ok: boolean; cancelled?: boolean }> {
  try {
    const { customerInfo } = await sdk()!.purchasePackage(pkg);
    return { ok: isPro(customerInfo) };
  } catch (e) {
    const cancelled = Boolean((e as { userCancelled?: boolean })?.userCancelled);
    return { ok: false, cancelled };
  }
}

/** Returns whether the Plus entitlement is active after restoring. */
export async function restorePurchases(): Promise<boolean> {
  if (!purchasesConfigured()) return false;
  try {
    return isPro(await sdk()!.restorePurchases());
  } catch {
    return false;
  }
}
