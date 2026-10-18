import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

type PhotoResult = { uri: string; width: number; height: number };
type PhotoOptions = { aspect?: [number, number]; quality?: number };
type PendingPhoto = PhotoResult & { aspect?: [number, number] };
type Position = { x: number; y: number };

const PINK = '#e43f98';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Evita il ritaglio di sistema Android: il suo tasto "RITAGLIA" può essere
 * quasi invisibile su alcuni dispositivi. Il comando di conferma è sempre
 * un pulsante grande, in primo piano, con contrasto elevato.
 */
function PhotoReview({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingPhoto | null;
  onCancel: () => void;
  onConfirm: (photo: PendingPhoto, crop?: ImageManipulator.Action) => Promise<void>;
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const positionRef = useRef<Position>({ x: 0, y: 0 });
  const dragStartRef = useRef<Position>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);

  const ratio = pending?.aspect ? pending.aspect[0] / pending.aspect[1] : null;
  const frameWidth = Math.max(160, Math.min(viewportWidth - 40, viewportHeight * 0.53, 440));
  const frameHeight = ratio ? frameWidth / ratio : Math.min(frameWidth, viewportHeight * 0.46);
  const sourceWidth = Math.max(1, pending?.width || 1);
  const sourceHeight = Math.max(1, pending?.height || 1);
  const displayScale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight) * zoom;
  const displayWidth = sourceWidth * displayScale;
  const displayHeight = sourceHeight * displayScale;
  const maxX = Math.max(0, (displayWidth - frameWidth) / 2);
  const maxY = Math.max(0, (displayHeight - frameHeight) / 2);

  useEffect(() => {
    positionRef.current = { x: 0, y: 0 };
    setPosition({ x: 0, y: 0 });
    setZoom(1);
    setSaving(false);
  }, [pending?.uri]);

  useEffect(() => {
    const next = {
      x: clamp(positionRef.current.x, -maxX, maxX),
      y: clamp(positionRef.current.y, -maxY, maxY),
    };
    positionRef.current = next;
    setPosition(next);
  }, [maxX, maxY]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(ratio) && !saving,
      onMoveShouldSetPanResponder: () => Boolean(ratio) && !saving,
      onPanResponderGrant: () => {
        dragStartRef.current = positionRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const next = {
          x: clamp(dragStartRef.current.x + gesture.dx, -maxX, maxX),
          y: clamp(dragStartRef.current.y + gesture.dy, -maxY, maxY),
        };
        positionRef.current = next;
        setPosition(next);
      },
    }),
    [maxX, maxY, ratio, saving]
  );

  const confirm = useCallback(async () => {
    if (!pending || saving) return;
    setSaving(true);
    try {
      if (!ratio) {
        await onConfirm(pending);
      } else {
        const cropWidth = Math.min(sourceWidth, Math.floor(frameWidth / displayScale));
        const cropHeight = Math.min(sourceHeight, Math.floor(frameHeight / displayScale));
        const originX = clamp(
          Math.round((displayWidth - frameWidth) / (2 * displayScale) - positionRef.current.x / displayScale),
          0,
          sourceWidth - cropWidth
        );
        const originY = clamp(
          Math.round((displayHeight - frameHeight) / (2 * displayScale) - positionRef.current.y / displayScale),
          0,
          sourceHeight - cropHeight
        );
        await onConfirm(pending, {
          crop: { originX, originY, width: cropWidth, height: cropHeight },
        });
      }
    } finally {
      setSaving(false);
    }
  }, [pending, saving, ratio, sourceWidth, sourceHeight, frameWidth, frameHeight, displayScale, displayWidth, displayHeight, onConfirm]);

  return (
    <Modal visible={Boolean(pending)} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Sistema la foto</Text>
          <Pressable
            onPress={onCancel}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Annulla scelta foto"
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Annulla</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {ratio
            ? 'Sposta la foto con il dito per scegliere cosa mostrare nel riquadro.'
            : 'Controlla la foto prima di confermarla.'}
        </Text>
        <View style={styles.stage}>
          <View
            style={[styles.frame, { width: frameWidth, height: frameHeight }]}
            {...panResponder.panHandlers}
            accessibilityLabel="Anteprima foto"
          >
            {pending ? (
              <Image
                source={{ uri: pending.uri }}
                resizeMode={ratio ? 'stretch' : 'contain'}
                style={ratio
                  ? {
                      position: 'absolute',
                      width: displayWidth,
                      height: displayHeight,
                      left: (frameWidth - displayWidth) / 2 + position.x,
                      top: (frameHeight - displayHeight) / 2 + position.y,
                    }
                  : { width: frameWidth, height: frameHeight }}
              />
            ) : null}
          </View>
          {ratio ? (
            <View style={styles.zoomRow}>
              <Pressable
                style={styles.zoomButton}
                disabled={zoom <= 1 || saving}
                onPress={() => setZoom(value => clamp(Math.round((value - 0.25) * 100) / 100, 1, 3))}
                accessibilityRole="button"
                accessibilityLabel="Riduci foto"
              >
                <Text style={styles.zoomText}>−</Text>
              </Pressable>
              <Text style={styles.zoomLabel}>Ingrandisci o riduci</Text>
              <Pressable
                style={styles.zoomButton}
                disabled={zoom >= 3 || saving}
                onPress={() => setZoom(value => clamp(Math.round((value + 0.25) * 100) / 100, 1, 3))}
                accessibilityRole="button"
                accessibilityLabel="Ingrandisci foto"
              >
                <Text style={styles.zoomText}>+</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={styles.footer}>
          <Pressable
            onPress={() => { void confirm(); }}
            disabled={!pending || saving}
            accessibilityRole="button"
            accessibilityLabel="Conferma foto"
            style={[styles.confirm, saving && styles.disabled]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>✓  CONFERMA FOTO</Text>}
          </Pressable>
          <Text style={styles.footerNote}>La foto verrà usata solo dopo la conferma.</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Selezione + ritaglio comune per profilo, gruppi ed esperienze.
 * La promessa risolve solo quando si preme CONFERMA FOTO (o Annulla).
 */
export function useBajujuPhotoPicker() {
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const resolver = useRef<((photo: PhotoResult | null) => void) | null>(null);

  const cancel = useCallback(() => {
    resolver.current?.(null);
    resolver.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback(async (photo: PendingPhoto, crop?: ImageManipulator.Action) => {
    try {
      const result = crop
        ? await ImageManipulator.manipulateAsync(photo.uri, [crop], {
            compress: 0.88,
            format: ImageManipulator.SaveFormat.JPEG,
          })
        : photo;
      resolver.current?.(result);
      resolver.current = null;
      setPending(null);
    } catch (error) {
      Alert.alert('Foto', 'Non riesco a ritagliare questa foto. Riprova o scegline un’altra.');
    }
  }, []);

  const pickPhoto = useCallback(async (options: PhotoOptions = {}): Promise<PhotoResult | null> => {
    if (resolver.current) return null;
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: options.quality ?? 0.9,
    });
    const asset = selection.assets?.[0];
    if (selection.canceled || !asset?.uri) return null;

    // Normalizza il formato e l'orientamento prima di calcolare il ritaglio.
    const prepared = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: options.quality ?? 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return await new Promise<PhotoResult | null>(resolve => {
      resolver.current = resolve;
      setPending({ ...prepared, aspect: options.aspect });
    });
  }, []);

  const photoPickerModal = <PhotoReview pending={pending} onCancel={cancel} onConfirm={confirm} />;
  return { pickPhoto, photoPickerModal };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff9fc', paddingHorizontal: 20 },
  header: { paddingTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#4b1430', fontSize: 23, fontWeight: '900', flexShrink: 1 },
  cancel: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#fce5f1' },
  cancelText: { color: '#852d59', fontSize: 15, fontWeight: '800' },
  hint: { marginTop: 18, color: '#54263e', fontSize: 15, textAlign: 'center', lineHeight: 21 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { overflow: 'hidden', backgroundColor: '#21151d', borderWidth: 3, borderColor: PINK, borderRadius: 12 },
  zoomRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  zoomButton: { height: 48, width: 54, borderRadius: 12, backgroundColor: '#fce5f1', alignItems: 'center', justifyContent: 'center' },
  zoomText: { color: '#742646', fontWeight: '900', fontSize: 28 },
  zoomLabel: { color: '#54263e', fontSize: 14, fontWeight: '700' },
  footer: { paddingTop: 8, paddingBottom: 22 },
  confirm: { backgroundColor: PINK, minHeight: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  disabled: { opacity: 0.65 },
  footerNote: { color: '#765b68', textAlign: 'center', marginTop: 10, fontSize: 12 },
});
