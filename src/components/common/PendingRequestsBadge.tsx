import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

// Pallino rosso con il numero di persone che chiedono di entrare (solo per l'organizzatore).
export function PendingRequestsBadge({ count, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const value = Number(count || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  const label = value > 99 ? '99+' : String(value);
  return (
    <View
      style={[styles.badge, style]}
      pointerEvents="none"
      accessible
      accessibilityLabel={value === 1 ? '1 richiesta di partecipazione in attesa' : `${value} richieste di partecipazione in attesa`}
    >
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5252A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
    zIndex: 5,
  },
  text: {
    color: '#FFFFFF',
    fontFamily: 'FredokaSemiBold',
    fontSize: 13,
    lineHeight: 16,
    includeFontPadding: false,
  },
});
