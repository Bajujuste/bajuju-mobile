import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';

export type BajujuSheetAction = {
  key: string;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  header?: React.ReactNode;
  actions: BajujuSheetAction[];
  footer?: React.ReactNode;
  onClose: () => void;
};

// Menu dal basso (stesso stile del menu "⋯" della pagina gruppo).
export function BajujuActionSheet({ visible, title, subtitle, header, actions, footer, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi" />
      <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.handle} />
        {header}
        {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        {actions.map((action) => (
          <Pressable
            key={action.key}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            accessibilityRole="button"
          >
            <View style={[styles.iconBox, action.destructive && styles.iconBoxDanger]}>
              <Ionicons
                name={action.icon}
                size={20}
                color={action.destructive ? '#B42318' : BAJUJU_COLORS.pink}
              />
            </View>
            <View style={styles.itemCopy}>
              <Text style={[styles.itemLabel, action.destructive && styles.itemLabelDanger]}>{action.label}</Text>
              {action.description ? <Text style={styles.itemDescription}>{action.description}</Text> : null}
            </View>
          </Pressable>
        ))}
        {footer}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(75,12,45,0.35)' },
  sheet: { backgroundColor: BAJUJU_COLORS.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: BAJUJU_COLORS.line, marginBottom: 14 },
  title: { marginBottom: 2, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 20 },
  subtitle: { marginBottom: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BAJUJU_COLORS.palePink },
  pressed: { opacity: 0.7 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.softPink },
  iconBoxDanger: { backgroundColor: '#FDECEC' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemLabel: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 16 },
  itemLabelDanger: { color: '#B42318' },
  itemDescription: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12 },
});
