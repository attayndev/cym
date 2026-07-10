import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { notify } from '@/lib/alert';
import { Body, Display, Screen } from '@/components/ui';
import { colors, fonts, hardShadow } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { runCardScan } from '@/lib/scan';

/**
 * Scan tab: point the camera at a business card or conference badge; the
 * extracted fields land in the capture flow for review — same ten-second
 * promise as manual capture, minus the typing.
 */
export default function ScanScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const outcome = await runCardScan();
      if (outcome.kind === 'needsUpdate') notify(t('capture.scan.needsUpdate'));
      else if (outcome.kind === 'noPermission') notify(t('capture.scan.noPermission'));
      else if (outcome.kind === 'limit') notify(t('capture.scan.limit'));
      else if (outcome.kind === 'nothing') notify(t('capture.scan.nothing'));
      else if (outcome.kind === 'fields') {
        const f = outcome.fields;
        router.push({
          pathname: '/capture',
          params: {
            firstName: f.firstName ?? '',
            lastName: f.lastName ?? '',
            email: f.email ?? '',
            phone: f.phone ?? '',
            company: f.company ?? '',
            role: f.role ?? '',
          },
        });
      }
    } catch {
      notify(t('capture.scan.nothing'));
    } finally {
      setScanning(false);
    }
  };

  return (
    <Screen>
      <Display>{t('scan.title')}</Display>
      <Body muted>{t('scan.sub')}</Body>

      <Pressable
        onPress={() => void handleScan()}
        disabled={scanning}
        style={({ pressed }) => [styles.big, (pressed || scanning) && { opacity: 0.75 }]}>
        <Feather name="camera" size={44} color={colors.cream} />
        <Text style={styles.bigText}>
          {scanning ? t('capture.scan.working') : t('capture.scan.button')}
        </Text>
      </Pressable>

      <View style={styles.tips}>
        <Text style={styles.tip}>{t('scan.tip1')}</Text>
        <Text style={styles.tip}>{t('scan.tip2')}</Text>
        <Text style={styles.tip}>{t('scan.tip3')}</Text>
      </View>

      <Pressable onPress={() => router.push('/capture')} hitSlop={8} style={styles.manualRow}>
        <Text style={styles.manual}>{t('scan.manual')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: colors.cherry,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.espresso,
    paddingVertical: 52,
    marginTop: 18,
    ...hardShadow(5),
  },
  bigText: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.cream,
  },
  tips: {
    marginTop: 22,
    gap: 8,
  },
  tip: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkSoft,
  },
  manualRow: {
    marginTop: 22,
  },
  manual: {
    fontFamily: fonts.sansBold,
    fontSize: 14.5,
    color: colors.cherryDeep,
  },
});
