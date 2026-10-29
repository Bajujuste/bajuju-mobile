import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';

const LABEL = 'ADMIN';

type BajujuAdminRingProps = {
  // Diametro della foto che sta dentro al cerchio.
  size: number;
  isAdmin: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Cerchio oro con "ADMIN" scritto sul bordo e stellina: fa riconoscere gli admin ovunque c'è la loro foto.
// Se l'utente non è admin restituisce la foto così com'è.
export function BajujuAdminRing({ size, isAdmin, children, style }: BajujuAdminRingProps) {
  if (!isAdmin) {
    return style ? <View style={style}>{children}</View> : <>{children}</>;
  }

  const ring = Math.min(22, Math.max(9, Math.round(size * 0.24)));
  const outer = size + ring * 2;
  const center = outer / 2;
  const letterRadius = size / 2 + ring / 2;
  const fontSize = Math.max(6, ring * 0.72);
  const letterStep = (fontSize * 0.95) / letterRadius;
  const badge = Math.min(34, Math.max(14, Math.round(size * 0.36)));
  const badgeOffset = center + (outer / 2) * 0.72 - badge / 2;

  return (
    <View
      style={[{ width: outer, height: outer }, style]}
      accessibilityLabel="Admin Bajuju"
    >
      <View style={[styles.ring, { width: outer, height: outer, borderRadius: outer / 2 }]}>
        {children}
      </View>

      {LABEL.split('').map((letter, index) => {
        const angle = (index - (LABEL.length - 1) / 2) * letterStep;
        return (
          <Text
            key={`${letter}-${index}`}
            allowFontScaling={false}
            style={[
              styles.letter,
              {
                width: ring,
                height: ring,
                lineHeight: ring,
                fontSize,
                left: center + letterRadius * Math.sin(angle) - ring / 2,
                top: center - letterRadius * Math.cos(angle) - ring / 2,
                transform: [{ rotate: `${angle}rad` }],
              },
            ]}
          >
            {letter}
          </Text>
        );
      })}

      <View
        style={[
          styles.badge,
          { width: badge, height: badge, borderRadius: badge / 2, left: badgeOffset, top: badgeOffset },
        ]}
      >
        <Ionicons name="star" size={Math.round(badge * 0.55)} color={BAJUJU_COLORS.white} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.gold,
  },
  letter: {
    position: 'absolute',
    textAlign: 'center',
    includeFontPadding: false,
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.white,
    backgroundColor: BAJUJU_COLORS.gold,
  },
});
