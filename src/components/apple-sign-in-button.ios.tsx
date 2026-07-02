import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet } from 'react-native';

/** Sign in with Apple — iOS uses Apple's own button component (HIG-compliant). */
export function AppleSignInButton({ onPress }: { onPress: () => void }) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={24}
      style={styles.btn}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 48,
    width: '100%',
  },
});
