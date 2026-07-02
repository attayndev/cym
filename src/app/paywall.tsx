import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Screen } from '@/components/ui';
import { colors, fonts, hardShadow, shadows } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { useApp } from '@/state/app-context';

const FEATURES = [
  { icon: 'gift' as const, title: 'paywall.feature.nudges.title', body: 'paywall.feature.nudges.body' },
  { icon: 'edit-3' as const, title: 'paywall.feature.drafts.title', body: 'paywall.feature.drafts.body' },
  { icon: 'pie-chart' as const, title: 'paywall.feature.dashboard.title', body: 'paywall.feature.dashboard.body' },
  { icon: 'mail' as const, title: 'paywall.feature.email.title', body: 'paywall.feature.email.body' },
  { icon: 'users' as const, title: 'paywall.feature.personas.title', body: 'paywall.feature.personas.body' },
] as const;

export default function PaywallScreen() {
  const { setPro } = useApp();
  const router = useRouter();
  const { t } = useTranslation();

  const subscribe = () => {
    // Demo build: flips the subscription flag locally. Real billing lands with the backend.
    setPro(true);
    router.back();
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
        <Text style={styles.price}>{t('paywall.price')}</Text>
        <Text style={styles.priceSub}>{t('paywall.priceSub')}</Text>
        <Pressable
          onPress={subscribe}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
          <Text style={styles.ctaText}>{t('paywall.cta')}</Text>
        </Pressable>
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
  price: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.espresso,
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
  fine: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 4,
  },
});
