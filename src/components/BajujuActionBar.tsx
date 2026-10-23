import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../theme/bajujuTheme';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import { useBajujuBottomNavSpace } from './navigation/BajujuBottomNav';

type BajujuButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

// Tasto standard Bajuju, uguale a "Modifica evento" nella pagina evento.
export function BajujuButton({ label, onPress, variant = 'primary', disabled, loading, style, accessibilityLabel }: BajujuButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? BAJUJU_COLORS.white : BAJUJU_COLORS.pink} />
      ) : (
        <Text numberOfLines={1} style={primary ? styles.primaryText : styles.secondaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

type BajujuActionBarProps = {
  children: React.ReactNode;
  // true sulle schermate che mostrano anche la barra di navigazione in basso.
  withBottomNav?: boolean;
};

/**
 * Barra bianca in fondo alla schermata con il tasto principale, come nella pagina evento.
 * Va messa dopo la ScrollView (non dentro). Con la tastiera aperta resta compatta.
 */
export function BajujuActionBar({ children, withBottomNav }: BajujuActionBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const navSpace = useBajujuBottomNavSpace();
  const baseBottom = Platform.OS === 'android' ? Math.max(14, insets.bottom + 8) : 8;
  const paddingBottom = keyboardVisible ? 10 : withBottomNav ? navSpace + 10 : baseBottom;

  return <View style={[styles.bar, { paddingBottom }]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: BAJUJU_COLORS.white,
    borderTopWidth: 1,
    borderTopColor: BAJUJU_COLORS.line,
  },
  button: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: BAJUJU_COLORS.pink,
    ...BAJUJU_SHADOW,
  },
  secondary: {
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.pink,
    backgroundColor: BAJUJU_COLORS.white,
  },
  primaryText: {
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 16,
    color: BAJUJU_COLORS.white,
  },
  secondaryText: {
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 15,
    color: BAJUJU_COLORS.pink,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
