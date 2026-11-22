import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BAJUJU_COLORS as C, BAJUJU_FONTS as F } from '../../theme/bajujuTheme';
import { supabase } from '../../lib/supabase';

const REMOVE_REASON_MAX_LENGTH = 150;

type Props = {
  visible: boolean;
  activityId: string | null;
  userId: string | null;
  userName?: string;
  onClose: () => void;
  onRemoved: () => void;
};

// Finestra "Rimuovi partecipante": motivo obbligatorio, Annulla / Conferma.
// Alla conferma (funzione bajuju_remove_participant_with_reason) la persona esce dall'evento,
// in chat compare "L'organizzatore ha rimosso Nome" e alla persona arriva il motivo.
export function BajujuRemoveParticipantModal({ visible, activityId, userId, userName, onClose, onRemoved }: Props) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const canConfirm = reason.trim().length > 0 && !saving;

  const confirm = async () => {
    if (!activityId || !userId || !canConfirm) return;
    setSaving(true);
    try {
      const result = await supabase.rpc('bajuju_remove_participant_with_reason' as any, {
        p_activity_id: activityId,
        p_user_id: userId,
        p_reason: reason.trim().slice(0, REMOVE_REASON_MAX_LENGTH),
      });
      if (result.error) {
        Alert.alert('Rimozione non riuscita', result.error.message || 'Riprova tra poco.');
        return;
      }
      onClose();
      Alert.alert('Partecipante rimosso', 'Riceverà il motivo che hai scritto.');
      onRemoved();
    } catch (error: any) {
      Alert.alert('Rimozione non riuscita', error?.message || 'Riprova tra poco.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <Pressable style={styles.backdrop} onPress={() => !saving && onClose()}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>Rimuovere il partecipante?</Text>
          {userName ? <Text style={styles.eventTitle} numberOfLines={1}>{userName}</Text> : null}
          <Text style={styles.label}>Per quale motivo lo rimuovi?</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Scrivi il motivo"
            placeholderTextColor={C.muted}
            style={styles.input}
            multiline
            maxLength={REMOVE_REASON_MAX_LENGTH}
            editable={!saving}
            autoFocus
          />
          <Text style={styles.hint}>Solo questa persona riceverà il motivo.</Text>
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
