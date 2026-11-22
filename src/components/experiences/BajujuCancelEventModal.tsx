import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BAJUJU_COLORS as C, BAJUJU_FONTS as F } from '../../theme/bajujuTheme';
import { CANCEL_REASON_MAX_LENGTH, cancelExperienceWithReason } from '../../utils/cancelExperienceWithReason';

type Props = {
  visible: boolean;
  activityId: string | null;
  eventTitle?: string;
  onClose: () => void;
  onDeleted: () => void;
};

// Finestra "Elimina evento": motivo obbligatorio, Annulla / Conferma.
// Alla conferma l'evento viene eliminato e i partecipanti ricevono il motivo.
export function BajujuCancelEventModal({ visible, activityId, eventTitle, onClose, onDeleted }: Props) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const canConfirm = reason.trim().length > 0 && !saving;

  const confirm = async () => {
    if (!activityId || !canConfirm) return;
    setSaving(true);
    try {
      const result = await cancelExperienceWithReason(activityId, reason);
      if (!result.ok) {
        Alert.alert('Eliminazione non riuscita', result.message);
        return;
      }
      onClose();
      Alert.alert('Evento eliminato', 'I partecipanti riceveranno il motivo.');
      onDeleted();
    } catch (error: any) {
      Alert.alert('Eliminazione non riuscita', error?.message || 'Riprova tra poco.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <Pressable style={styles.backdrop} onPress={() => !saving && onClose()}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>Eliminare l’evento?</Text>
          {eventTitle ? <Text style={styles.eventTitle} numberOfLines={2}>{eventTitle}</Text> : null}
          <Text style={styles.label}>Per quale motivo lo elimini?</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Scrivi il motivo"
            placeholderTextColor={C.muted}
            style={styles.input}
            multiline
            maxLength={CANCEL_REASON_MAX_LENGTH}
            editable={!saving}
            autoFocus
          />
          <Text style={styles.hint}>I partecipanti riceveranno questo motivo.</Text>
          <View style={styles.row}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Annulla</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.confirmButton, !canConfirm && styles.disabled]}
              onPress={confirm}
              disabled={!canConfirm}
            >
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={styles.confirmText}>Conferma</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Finestra in alto: resta visibile anche con la tastiera aperta.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 10, 28, 0.55)',
    justifyContent: 'flex-start',
    paddingTop: 90,
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 18,
  },
  title: { fontFamily: F.bold, fontSize: 20, color: C.plum },
  eventTitle: { marginTop: 4, fontFamily: F.medium, fontSize: 15, color: C.muted },
  label: { marginTop: 14, fontFamily: F.semiBold, fontSize: 15, color: C.plum },
  input: {
    marginTop: 8,
    minHeight: 84,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 12,
    fontFamily: F.regular,
    fontSize: 15,
    color: C.plum,
    textAlignVertical: 'top',
    backgroundColor: C.backgroundSoft,
  },
  hint: { marginTop: 6, fontFamily: F.regular, fontSize: 13, color: C.muted },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { backgroundColor: C.softPink },
  confirmButton: { backgroundColor: C.hotPink },
  disabled: { opacity: 0.45 },
  cancelText: { fontFamily: F.semiBold, fontSize: 16, color: C.plum },
  confirmText: { fontFamily: F.semiBold, fontSize: 16, color: C.white },
});
