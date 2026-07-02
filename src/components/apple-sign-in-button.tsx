import { Pressable, StyleSheet, Text } from 'react-native';

import { fonts } from '@/constants/theme';
import { useTranslation } from '@/i18n';

/** Sign in with Apple — web/default variant. Black button per Apple's
 *  approved styles (the iOS build uses Apple's own native component via
 *  apple-sign-in-button.ios.tsx). */
export function AppleSignInButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
      <Text style={styles.label}>{t('auth.continueWithApple')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    borderRadius: 999,
    paddingVertical: 14,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
