import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { supabase } from './supabase';

/** Testo salvato quando si manda una foto senza scrivere nulla (serve anche alle notifiche). */
export const CHAT_PHOTO_PLACEHOLDER = '📷 Foto';
export const CHAT_PHOTO_BUCKET = 'chat-photos';

const MAX_SIDE = 1600;
const COMPRESS = 0.7;

/** Testo da mostrare sotto la foto: il segnaposto non si mostra. */
export function chatPhotoCaption(message: string | null | undefined, imageUrl: string | null | undefined) {
  const text = String(message || '');
  if (imageUrl && text.trim() === CHAT_PHOTO_PLACEHOLDER) return '';
  return text;
}

/**
 * Fa scegliere una foto dalla galleria, la rimpicciolisce (lato lungo max 1600 px, JPEG 70%)
 * e la carica su Supabase Storage. Restituisce l'indirizzo pubblico, oppure null se annullato.
 */
export async function pickAndUploadChatPhoto(userId: string): Promise<string | null> {
  if (!userId) return null;

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permesso richiesto', 'Autorizza l’accesso alle immagini per mandare una foto in chat.');
    return null;
  }

  const selection = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  const asset = selection.assets?.[0];
  if (selection.canceled || !asset?.uri) return null;

  const width = Number(asset.width || 0);
  const height = Number(asset.height || 0);
  const actions: ImageManipulator.Action[] = [];
  if (width > MAX_SIDE || height > MAX_SIDE) {
    actions.push(width >= height ? { resize: { width: MAX_SIDE } } : { resize: { height: MAX_SIDE } });
  }

  const prepared = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: COMPRESS,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const response = await fetch(prepared.uri);
  const buffer = await response.arrayBuffer();
  const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const upload = await supabase.storage
    .from(CHAT_PHOTO_BUCKET)
    .upload(filePath, buffer, { contentType: 'image/jpeg', upsert: false });
  if (upload.error) throw upload.error;

  const publicUrl = supabase.storage.from(CHAT_PHOTO_BUCKET).getPublicUrl(filePath).data.publicUrl;
  if (!publicUrl) throw new Error('Foto caricata ma indirizzo non disponibile.');
  return publicUrl;
}
