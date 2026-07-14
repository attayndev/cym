import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, hardShadow, radii, shadows } from '@/constants/theme';

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollOuter}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets>
          <View style={styles.scrollContent}>{children}</View>
        </ScrollView>
      ) : (
        <View style={styles.scrollOuterFixed}>
          <View style={styles.scrollContentFixed}>{children}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

export function Display({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.display, style]}>{children}</Text>;
}

export function Heading({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function Body({
  children,
  muted = false,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.body, muted && { color: colors.muted }, style]}>{children}</Text>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

/** Site-style kicker pill: espresso field, butter uppercase label. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <View style={styles.kicker}>
      <Text style={styles.kickerText}>{children}</Text>
    </View>
  );
}

export function Card({
  children,
  dark = false,
  variant = 'hero',
  style,
}: {
  children: ReactNode;
  dark?: boolean;
  variant?: 'hero' | 'quiet';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.card,
        dark && styles.cardDark,
        variant === 'quiet' && styles.cardQuiet,
        style,
      ]}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'accent';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'accent' && styles.buttonAccent,
        pressed &&
          variant !== 'ghost' && {
            transform: [{ translateX: 2 }, { translateY: 2 }],
            ...shadows.pressed,
          },
        pressed && variant === 'ghost' && { opacity: 0.7 },
        disabled && { opacity: 0.5 },
        style,
      ]}>
      <Text
        style={[
          styles.buttonText,
          variant === 'ghost' && { color: colors.ink },
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && { fontFamily: fonts.sansBold }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Shared quiet loading state for screens waiting on the local DB. */
export function ScreenLoading() {
  return (
    <Screen scroll={false}>
      <View style={styles.loading} accessibilityRole="progressbar">
        <ActivityIndicator color={colors.ink} />
      </View>
    </Screen>
  );
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scrollOuter: {
    alignItems: 'center',
    flexGrow: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 560,
    padding: 20,
    paddingBottom: 48,
    gap: 16,
    flexGrow: 1,
  },
  scrollOuterFixed: {
    alignItems: 'center',
    flex: 1,
    minHeight: 0,
  },
  scrollContentFixed: {
    width: '100%',
    maxWidth: 560,
    padding: 20,
    paddingBottom: 12,
    gap: 16,
    flex: 1,
    minHeight: 0,
  },
  display: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  heading: {
    fontFamily: fonts.displayMedium,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.cherryDeep,
  },
  kicker: {
    alignSelf: 'flex-start',
    backgroundColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  kickerText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.butter,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 18,
    gap: 8,
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.card,
  },
  cardDark: {
    backgroundColor: colors.card,
    borderColor: colors.espresso,
    ...hardShadow(6, 'rgba(59,36,28,0.25)'),
  },
  cardQuiet: {
    borderWidth: 1.5,
    borderColor: colors.lineMid,
    borderRadius: radii.card,
    padding: 16,
    boxShadow: 'none',
  },
  button: {
    backgroundColor: colors.espresso,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.espresso,
    ...shadows.buttonSoft,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    boxShadow: 'none',
  },
  buttonAccent: {
    backgroundColor: colors.cherry,
    ...shadows.button,
  },
  buttonText: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.cream,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineMid,
  },
  chipSelected: {
    backgroundColor: colors.butter,
    borderColor: colors.espresso,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.espresso,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
