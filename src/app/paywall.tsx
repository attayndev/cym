import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { notify } from '@/lib/alert';
import { Body, Screen } from '@/components/ui';
import { colors, fonts, hardShadow, shadows } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import {
  getPlusPackages,
  purchasePlus,
  purchasesConfigured,
  restorePurchases,
  type PlusPackages,
} from '@/lib/purchases';
import { useApp } from '@/state/app-context';

const FEATURES = [
  { icon: 'heart' as const, title: 'paywall.feature.memory.title', body: 'paywall.feature.memory.body' },
  { icon: 'gift' as const, title: 'paywall.feature.nudges.title', body: 'paywall.feature.nudges.body' },
  { icon: 'edit-3' as const, title: 'paywall.feature.drafts.title', body: 'paywall.feature.drafts.body' },
  { icon: 'type' as const, title: 'paywall.feature.voice.title', body: 'paywall.feature.voice.body' },
  { icon: 'pie-chart' as const, title: 'paywall.feature.dashboard.title', body: 'paywall.feature.dashboard.body' },
  { icon: 'mail' as const, title: 'paywall.feature.email.title', body: 'paywall.feature.email.body' },
  { icon: 'user-check' as const, title: 'paywall.feature.enrich.title', body: 'paywall.feature.enrich.body' },
  { icon: 'users' as const, title: 'paywall.feature.personas.title', body: 'paywall.feature.personas.body' },
] as const;

export default function PaywallScreen() {
  const { setPro } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  const billing = purchasesConfigured();
  const [plan, setPlan] = useState<'annual' | 'monthly'>('annual');
  const [pkgs, setPkgs] = useState<PlusPackages>({ monthly: null, annual: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (billing) void getPlusPackages().then(setPkgs);
  }, [billing]);

  const selectedPkg: PurchasesPackage | null = plan === 'annual' ? pkgs.annual : pkgs.monthly;
  const priceFor = (p: 'annual' | 'monthly') => {
    const pk = p === 'annual' ? pkgs.annual : pkgs.monthly;
    return (
      pk?.product.priceString ??
      t(p === 'annual' ? 'paywall.price.annual' : 'paywall.price.monthly')
    );
  };

  const subscribe = async () => {
    if (!billing || !selectedPkg) {
      if (__DEV__) {
        // No store billing in dev builds (simulator, Expo Go, web): flip the
        // local flag so the app remains testable end to end.
        setPro(true);
        router.back();
      } else {
        // Production must never grant Plus without a store transaction —
        // packages can be missing here when the store is unreachable.
        notify(t('paywall.storeUnavailable'));
      }
      return;
    }
    setBusy(true);
    const result = await purchasePlus(selectedPkg);
    setBusy(false);
    if (result.ok) {
      // The entitlement listener flips isPro; just leave the paywall.
      router.back();
    } else if (!result.cancelled) {
      notify(t('paywall.error'));
    }
  };

  const restore = async () => {
    setBusy(true);
    const active = await restorePurchases();
    setBusy(false);
    if (active) router.back();
    else notify(t('paywall.restoreNone'));
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
        <Feather name="x" size={22} color={colors.ink} />
      </Pressable>

      <Text style={styles.headline}>{t('paywall.headline')}</Text>
      <Body muted>{t('paywall.body')}</Body>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Feather name={f.icon} size={16} color={colors.cherryDeep} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.featureTitle}>{t(f.title)}</Text>
              <Text style={styles.featureBody}>{t(f.body)}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.priceCard}>
        {(['annual', 'monthly'] as const).map((p) => {
          const active = plan === p;
          return (
            <Pressable
              key={p}
              onPress={() => setPlan(p)}
              disabled={busy}
              style={[styles.planRow, active && styles.planRowActive]}>
              <View style={styles.planLabelWrap}>
                <Text style={[styles.planLabel, active && styles.planTextActive]}>
                  {t(p === 'annual' ? 'paywall.plan.annual' : 'paywall.plan.monthly')}
                </Text>
                {p === 'annual' && (
                  <View style={styles.bestValue}>
                    <Text style={styles.bestValueText}>{t('paywall.bestValue')}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.planPrice, active && styles.planTextActive]}>
                {priceFor(p)}
              </Text>
            </Pressable>
          );
        })}
        <Text style={styles.priceSub}>{t('paywall.priceSub')}</Text>
        <Pressable
          onPress={() => void subscribe()}
          disabled={busy}
          style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.8 }]}>
          <Text style={styles.ctaText}>{busy ? t('paywall.processing') : t('paywall.cta')}</Text>
        </Pressable>
        <Text style={styles.fine}>{t('paywall.trialFine', { price: priceFor(plan) })}</Text>
        {billing && (
          <Pressable onPress={() => void restore()} disabled={busy} hitSlop={6}>
            <Text style={styles.restore}>{t('paywall.restore')}</Text>
          </Pressable>
        )}
        <Text style={styles.fine}>{t('paywall.fine')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: {
    alignSelf: 'flex-end',
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 37,
    color: colors.ink,
  },
  features: {
    gap: 16,
    marginVertical: 8,
  },
  feature: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.blush,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.espresso,
  },
  featureTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.ink,
  },
  featureBody: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  priceCard: {
    backgroundColor: colors.butter,
    borderRadius: 20,
    padding: 22,
    gap: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.espresso,
    ...hardShadow(8, colors.cherry),
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  planRowActive: {
    backgroundColor: colors.espresso,
  },
  planLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.ink,
  },
  planPrice: {
    fontFamily: fonts.displayMedium,
    fontSize: 17,
    color: colors.ink,
  },
  planTextActive: {
    color: colors.cream,
  },
  bestValue: {
    backgroundColor: colors.cherry,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  bestValueText: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.cream,
  },
  priceSub: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  cta: {
    backgroundColor: colors.cherry,
    borderRadius: 999,
    paddingVertical: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.button,
  },
  ctaText: {
    fontFamily: fonts.sansBold,
    fontSize: 15.5,
    color: colors.cream,
  },
  restore: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.espresso,
    textDecorationLine: 'underline',
    marginTop: 2,
  },
  fine: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 4,
  },
});
