import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AddressAutocompleteField } from '../../src/components/AddressAutocompleteField';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { useBajujuPhotoPicker } from '../../src/components/useBajujuPhotoPicker';
import type { ResolvedAddress } from '../../src/lib/addressAutocomplete';
import {
  DISCOUNT_NAME_MAX_LENGTH,
  DISCOUNT_TEXT_MAX_LENGTH,
  createBajujuDiscount,
  deleteBajujuDiscount,
  loadBajujuDiscount,
  updateBajujuDiscount,
  uploadBajujuDiscountPhoto,
} from '../../src/lib/bajujuDiscounts';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../src/theme/bajujuTheme';

// Solo admin: aggiunge o modifica un negozio della sezione Sconti (id = modifica).
export default function EditDiscountScreen() {
  const { pickPhoto, photoPickerModal } = useBajujuPhotoPicker();
  const params = useLocalSearchParams<{ id?: string }>();
  const discountId = String(params.id || '').trim();
  const editing = Boolean(discountId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [discountText, setDiscountText] = useState('');
  // Foto già caricata (link) oppure scelta ora dal telefono (file locale).
  const [photo, setPhoto] = useState<{ uri: string; uploaded: boolean } | null>(null);
  const [addressText, setAddressText] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  // Indirizzo salvato prima: resta valido finché non se ne sceglie un altro dai suggerimenti.
  const [savedAddress, setSavedAddress] = useState<{ text: string; city: string; latitude: number | null; longitude: number | null } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const id = session.data.session?.user?.id || '';
        const admin = await supabase.rpc('is_current_user_admin' as any);
        if (!active) return;
        setUserId(id);
        setAllowed(!admin.error && admin.data === true);

        if (editing) {
          const item = await loadBajujuDiscount(discountId);
          if (!active || !item) return;
          setName(item.name);
          setDiscountText(item.discountText);
          setPhoto(item.photoUrl ? { uri: item.photoUrl, uploaded: true } : null);
          setAddressText(item.formattedAddress);
          setSavedAddress({ text: item.formattedAddress, city: item.city, latitude: item.latitude, longitude: item.longitude });
        }
      } catch {
        if (active) Alert.alert('Sconti', 'Non riesco a caricare il negozio. Riprova.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [discountId, editing]);

  const addressOk = Boolean(resolvedAddress) || Boolean(savedAddress && addressText.trim() === savedAddress.text);
  const missing: string[] = [];
  if (!name.trim()) missing.push('nome');
  if (!discountText.trim()) missing.push('sconto');
  if (!addressOk) missing.push('indirizzo (sceglilo dai suggerimenti)');
  const canSave = allowed && missing.length === 0 && !saving;

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Foto del negozio', 'Autorizza l’accesso alle immagini per scegliere la foto.');
        return;
      }
      const picked = await pickPhoto({ aspect: [16, 9], quality: 0.9 });
      if (!picked) return;
      const resized = await ImageManipulator.manipulateAsync(picked.uri, [{ resize: { width: 1280 } }], {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setPhoto({ uri: resized.uri, uploaded: false });
    } catch (error: unknown) {
      Alert.alert('Foto del negozio', error instanceof Error ? error.message : 'Non sono riuscito a preparare la foto.');
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const photoUrl = photo ? (photo.uploaded ? photo.uri : await uploadBajujuDiscountPhoto(userId, photo.uri)) : '';
      const input = {
        name,
        discountText,
        photoUrl,
        formattedAddress: resolvedAddress ? resolvedAddress.formattedAddress || addressText : savedAddress?.text || addressText,
        city: resolvedAddress ? resolvedAddress.city : savedAddress?.city || '',
        latitude: resolvedAddress ? resolvedAddress.latitude : savedAddress?.latitude ?? null,
        longitude: resolvedAddress ? resolvedAddress.longitude : savedAddress?.longitude ?? null,
      };
      if (editing) await updateBajujuDiscount(discountId, input);
      else await createBajujuDiscount(input);
      router.back();
    } catch (error: unknown) {
      Alert.alert('Sconti', error instanceof Error ? error.message : 'Non sono riuscito a salvare. Riprova.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Elimina negozio', `Vuoi togliere “${name}” dagli sconti?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBajujuDiscount(discountId);
            router.back();
          } catch (error: unknown) {
            Alert.alert('Sconti', error instanceof Error ? error.message : 'Non sono riuscito a eliminarlo. Riprova.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator color={BAJUJU_COLORS.pink} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {photoPickerModal}
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <BajujuBackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/discounts' as any))} />
          <Text style={styles.title}>{editing ? 'Modifica negozio' : 'Aggiungi negozio'}</Text>
          <BajujuProfileButton />
        </View>

        {!allowed ? (
          <Text style={styles.helper}>Solo gli admin possono aggiungere negozi.</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Foto del negozio</Text>
              <Pressable style={styles.photoBox} onPress={() => { void choosePhoto(); }} disabled={saving} accessibilityRole="button" accessibilityLabel="Scegli la foto">
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
                ) : (
                  <View style={styles.photoEmpty}>
                    <Ionicons name="camera-outline" size={28} color={BAJUJU_COLORS.pink} />
                    <Text style={styles.photoEmptyText}>Aggiungi foto</Text>
                  </View>
                )}
              </Pressable>
              {photo ? (
                <Pressable onPress={() => setPhoto(null)} style={styles.linkButton}>
                  <Text style={styles.linkButtonText}>Togli foto</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Nome del negozio</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Es. Bar Centrale"
                placeholderTextColor={BAJUJU_COLORS.muted}
                style={styles.input}
                maxLength={DISCOUNT_NAME_MAX_LENGTH}
              />
              <Text style={styles.label}>Sconto</Text>
              <TextInput
                value={discountText}
                onChangeText={setDiscountText}
                placeholder="Es. 10% su tutto"
                placeholderTextColor={BAJUJU_COLORS.muted}
                style={styles.input}
                maxLength={DISCOUNT_TEXT_MAX_LENGTH}
              />
            </View>

            <View style={styles.card}>
              <AddressAutocompleteField
                value={addressText}
                resolvedAddress={resolvedAddress}
                onValueChange={setAddressText}
                onResolvedAddressChange={setResolvedAddress}
                placeholder="Es. Via XX Settembre 12, Bergamo"
                disabled={saving}
              />
            </View>

            <Pressable style={[styles.mainButton, !canSave && styles.disabled]} onPress={() => { void handleSave(); }} disabled={!canSave}>
              <Text style={styles.mainButtonText}>{saving ? 'Salvataggio...' : editing ? 'Salva modifiche' : 'Aggiungi negozio'}</Text>
            </Pressable>
            {!saving && missing.length > 0 ? <Text style={styles.missingText}>Mancano: {missing.join(', ')}</Text> : null}

            {editing ? (
              <Pressable style={styles.deleteButton} onPress={confirmDelete} disabled={saving}>
                <Text style={styles.deleteButtonText}>Elimina negozio</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  title: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 24 },
  helper: { marginTop: 20, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  card: {
    marginTop: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
  },
  cardTitle: { marginBottom: 10, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  photoBox: { borderRadius: 16, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 16 / 9 },
  photoEmpty: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.softPink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoEmptyText: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 15 },
  linkButton: { marginTop: 8, alignSelf: 'flex-start' },
  linkButtonText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  label: { marginBottom: 6, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 15 },
  input: {
    marginBottom: 12,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    paddingHorizontal: 12,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 16,
    backgroundColor: BAJUJU_COLORS.white,
  },
  mainButton: {
    marginTop: 20,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: BAJUJU_COLORS.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButtonText: { color: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  disabled: { opacity: 0.45 },
  missingText: { marginTop: 8, textAlign: 'center', color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  deleteButton: { marginTop: 22, alignItems: 'center', paddingVertical: 10 },
  deleteButtonText: { color: '#C62828', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
});
