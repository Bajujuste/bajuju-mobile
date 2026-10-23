import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { BAJUJU_COLORS } from '../../theme/bajujuTheme';

type BajujuBackButtonProps = {
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Freccia tonda uguale a quella della pagina evento: da usare in ogni testata.
export function BajujuBackButton({ onPress, accessibilityLabel = 'Indietro', disabled, style }: BajujuBackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed, style]}
    >
      <Ionicons name="chevron-back" size={20} color={BAJUJU_COLORS.plum} />
    </Pressable>
  );
}

export function BajujuRoundIconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = BAJUJU_COLORS.plum,
  style,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <Ionicons name={icon} size={19} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.white,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
});
