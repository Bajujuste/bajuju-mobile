import React from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import type { BajujuReactionSummary } from '../../hooks/useBajujuMessageReactions';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';

export const BAJUJU_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

const PINK = BAJUJU_COLORS.brightPink;
const PALE_PINK = BAJUJU_COLORS.palePink;
const PLUM = BAJUJU_COLORS.plum;

/** Pallini sotto al messaggio: emoji + quante persone. Tocco = metti/togli la stessa emoji. */
export function BajujuReactionChips({
  reactions,
  alignRight,
  onToggle,
  style,
}: {
  reactions?: BajujuReactionSummary[];
  alignRight?: boolean;
  onToggle: (emoji: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <View style={[styles.chipsRow, alignRight ? styles.chipsRight : styles.chipsLeft, style]}>
      {reactions.map((reaction) => (
        <Pressable
          key={reaction.emoji}
          onPress={() => onToggle(reaction.emoji)}
          hitSlop={4}
          style={[styles.chip, reaction.mine && styles.chipMine]}
          accessibilityRole="button"
          accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
        >
          <Text style={styles.chipEmoji}>{reaction.emoji}</Text>
          {reaction.count > 1 || !reaction.mine ? <Text style={styles.chipCount}>{reaction.count}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Finestrella con le emoji che si apre tenendo premuto un messaggio. */
export function BajujuReactionPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected?: string | null;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Reagisci al messaggio</Text>
          <View style={styles.emojiGrid}>
            {BAJUJU_REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onSelect(emoji)}
                style={[styles.emojiButton, selected === emoji && styles.emojiButtonSelected]}
                accessibilityRole="button"
                accessibilityLabel={`Reagisci con ${emoji}`}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {selected ? (
            <Pressable onPress={() => onSelect(selected)} hitSlop={6} style={styles.removeButton}>
              <Text style={styles.removeText}>Togli la mia reazione</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onClose} hitSlop={6} style={styles.closeButton}>
            <Text style={styles.closeText}>Annulla</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, maxWidth: '84%' },
  chipsRight: { alignSelf: 'flex-end', justifyContent: 'flex-end', marginRight: 6 },
  chipsLeft: { alignSelf: 'flex-start', marginLeft: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PALE_PINK,
    backgroundColor: '#fff',
  },
  chipMine: { borderColor: PINK, backgroundColor: '#FFF0F7' },
  chipEmoji: { fontSize: 13 },
  chipCount: { color: PLUM, fontSize: 11, fontFamily: BAJUJU_FONTS.bold },
  backdrop: { flex: 1, backgroundColor: 'rgba(30,0,15,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderRadius: 24, backgroundColor: '#fff', paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center' },
  title: { color: PLUM, fontSize: 15, fontFamily: BAJUJU_FONTS.bold, marginBottom: 12 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  emojiButton: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5FA' },
  emojiButtonSelected: { backgroundColor: PALE_PINK, borderWidth: 2, borderColor: PINK },
  emojiText: { fontSize: 28 },
  removeButton: { marginTop: 14 },
  removeText: { color: PINK, fontSize: 13, fontFamily: BAJUJU_FONTS.bold, textDecorationLine: 'underline' },
  closeButton: { marginTop: 12 },
  closeText: { color: BAJUJU_COLORS.muted, fontSize: 13, fontFamily: BAJUJU_FONTS.semiBold },
});
