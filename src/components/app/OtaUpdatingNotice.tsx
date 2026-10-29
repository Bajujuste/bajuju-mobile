import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../theme/bajujuTheme';
import { useOtaUpdatingNotice } from '../../utils/otaAutoUpdate';

// Scritta mostrata per un attimo mentre l'app si ricarica con l'aggiornamento appena scaricato.
export function OtaUpdatingNotice() {
  const visible = useOtaUpdatingNotice();
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.card}>
        <ActivityIndicator color={BAJUJU_COLORS.pink} />
        <Text style={styles.text}>Bajuju si sta aggiornando…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 249, 252, 0.85)',
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: BAJUJU_COLORS.white,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    ...BAJUJU_SHADOW,
  },
  text: {
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 16,
    color: BAJUJU_COLORS.plum,
  },
});
