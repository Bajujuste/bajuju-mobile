import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text } from 'react-native';

import { pickAndUploadChatPhoto } from '../../lib/bajujuChatPhotos';
import { BajujuPhotoViewer } from './BajujuPhotoViewer';

const THUMB_WIDTH = 210;

/** Foto dentro un messaggio: tocco = schermo intero con zoom. */
export function BajujuChatPhoto({ uri, onLongPress }: { uri: string; onLongPress?: () => void }) {
  const [ratio, setRatio] = useState(1);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} onLongPress={onLongPress} delayLongPress={350} accessibilityRole="imagebutton" accessibilityLabel="Apri foto">
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={[styles.thumb, { height: THUMB_WIDTH / ratio }]}
          onLoad={(event) => {
            const source = event.nativeEvent?.source;
            if (source?.width && source?.height) {
              setRatio(Math.max(0.65, Math.min(1.8, source.width / source.height)));
            }
          }}
        />
      </Pressable>
      <BajujuPhotoViewer uri={open ? uri : null} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Tasto 📷 accanto al campo di testo. Sceglie, comprime e carica la foto,
 * poi chiama onUploaded con l'indirizzo pubblico (la chat salva il messaggio).
 */
export function BajujuChatPhotoButton({
  userId,
  disabled,
  onUploaded,
  color = '#F32189',
  background = '#FFDDEB',
}: {
  userId: string;
  disabled?: boolean;
  onUploaded: (imageUrl: string) => Promise<void> | void;
  color?: string;
  background?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handlePress() {
    if (busy || disabled || !userId) return;
    setBusy(true);
    try {
      const url = await pickAndUploadChatPhoto(userId);
      if (url) await onUploaded(url);
    } catch (error: any) {
      Alert.alert('Foto non inviata', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={() => { void handlePress(); }}
      disabled={busy || disabled}
      style={[styles.button, { backgroundColor: background }, (busy || disabled) && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel="Invia una foto"
      hitSlop={4}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : <Text style={styles.icon}>📷</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: { width: THUMB_WIDTH, borderRadius: 12, marginTop: 2, marginBottom: 4, backgroundColor: '#00000010' },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 20 },
  disabled: { opacity: 0.5 },
});
