import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import { useBajujuPhotoPicker } from '../../src/components/useBajujuPhotoPicker';
import type { ResolvedAddress } from '../../src/lib/addressAutocomplete';
import {
  LOCATION_CATEGORIES,
  LOCATION_COLOR,
  LOCATION_COLOR_SOFT,
  LOCATION_DESCRIPTION_MAX_LENGTH,
  LOCATION_MAX_PHOTOS,
  LOCATION_NAME_MAX_LENGTH,
  loadBajujuLocation,
  normalizeFacebookUrl,
  normalizeInstagramUrl,
  normalizePhone,
  normalizeWebsiteUrl,
  saveBajujuLocation,
} from '../../src/lib/bajujuLocations';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../src/theme/bajujuTheme';

// Una foto è un link già caricato oppure un file scelto ora dal telefono.
type LocationPhoto = { uri: string; uploaded: boolean };

export default function MyLocationScreen() {
  const { pickPhoto, photoPickerModal } = useBajujuPhotoPicker();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState('');
  const [isLocationActive, setIsLocationActive] = useState(false);
  const [alreadyPublished, setAlreadyPublished] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [addressText, setAddressText] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [photos, setPhotos] = useState<LocationPhoto[]>([]);
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const auth = await supabase.auth.getUser();
      const id = auth.data.user?.id || '';
      setUserId(id);
      if (!id) return;

      const profileResult = await supabase
        .from('profiles')
        .select('is_location_organizer,location_profile_text')
        .eq('id', id)
        .maybeSingle();
      const profile = (profileResult.data || {}) as Record<string, any>;
      setIsLocationActive(profile.is_location_organizer === true);

      const location = await loadBajujuLocation(id);
      setAlreadyPublished(Boolean(location));

      if (!location) {
        // Il testo scritto dall'Admin diventa la prima bozza della descrizione.
        const adminText = typeof profile.location_profile_text === 'string' ? profile.location_profile_text.trim() : '';
        setDescription(adminText.slice(0, LOCATION_DESCRIPTION_MAX_LENGTH));
        return;
      }

      setName(location.name);
      setCategory(location.category);
      setDescription(location.description);
      setAddressText(location.formattedAddress);
      setResolvedAddress({
        placeId: '',
        formattedAddress: location.formattedAddress,
        shortFormattedAddress: location.formattedAddress,
        street: location.street,
        streetNumber: location.streetNumber,
        city: location.city,
        province: location.province,
        provinceCode: '',
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setPhotos(location.photos.map((uri) => ({ uri, uploaded: true })));
      setInstagram(location.instagramUrl);
      setFacebook(location.facebookUrl);
      setWebsite(location.websiteUrl);
      setPhone(location.phone);
      setWhatsapp(location.whatsapp);
    } catch (error: unknown) {
      Alert.alert(
        'Il mio locale',
        error instanceof Error ? error.message : 'Non riesco a caricare la pagina del locale.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addressHasNumber = Boolean(resolvedAddress?.streetNumber.trim());
  const addressIsComplete = Boolean(
    resolvedAddress &&
      resolvedAddress.street.trim() &&
      resolvedAddress.city.trim() &&
      addressHasNumber
  );

  const instagramUrl = normalizeInstagramUrl(instagram);
  const facebookUrl = normalizeFacebookUrl(facebook);
  const websiteUrl = normalizeWebsiteUrl(website);
  const phoneValue = normalizePhone(phone);
  const whatsappValue = normalizePhone(whatsapp);
  const linksAreValid = [instagramUrl, facebookUrl, websiteUrl, phoneValue, whatsappValue].every(
    (value) => value !== null
  );

  const missingFields = [
    name.trim().length < 2 ? 'nome del locale' : '',
    !category ? 'tipo di posto' : '',
    !addressIsComplete ? 'indirizzo completo' : '',
    photos.length === 0 ? 'almeno una foto' : '',
  ].filter(Boolean);

  const canSave = isLocationActive && missingFields.length === 0 && linksAreValid && !saving;

  async function addPhoto() {
    if (photos.length >= LOCATION_MAX_PHOTOS) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Foto del locale', 'Autorizza l’accesso alle immagini per scegliere le foto del locale.');
        return;
      }

      const picked = await pickPhoto({ aspect: [4, 3], quality: 0.9 });
      if (!picked) return;

      const resized = await ImageManipulator.manipulateAsync(
        picked.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhotos((current) => [...current, { uri: resized.uri, uploaded: false }].slice(0, LOCATION_MAX_PHOTOS));
    } catch (error: unknown) {
      Alert.alert(
        'Foto del locale',
        error instanceof Error ? error.message : 'Non sono riuscito a preparare la foto selezionata.'
      );
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function makeCover(index: number) {
    setPhotos((current) => {
      const next = [...current];
      const [photo] = next.splice(index, 1);
      return photo ? [photo, ...next] : current;
    });
  }

  async function uploadPhoto(photo: LocationPhoto, index: number) {
    if (photo.uploaded) return photo.uri;

    const response = await fetch(photo.uri);
    const buffer = await response.arrayBuffer();
    // La cartella con l'id utente è quella che le regole dello Storage avatars permettono.
    const filePath = `${userId}/location-${Date.now()}-${index}.jpg`;

    const upload = await supabase.storage
      .from('avatars')
      .upload(filePath, buffer, { contentType: 'image/jpeg', upsert: true });
    if (upload.error) throw upload.error;

    const publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
    if (!publicUrl) throw new Error('URL della foto non disponibile.');
    return publicUrl;
  }

  async function handleSave() {
    if (!canSave || !resolvedAddress) return;

    setSaving(true);

    try {
      const uploadedPhotos: string[] = [];
      for (let index = 0; index < photos.length; index += 1) {
        uploadedPhotos.push(await uploadPhoto(photos[index], index));
      }

      await saveBajujuLocation(userId, {
        name,
        category,
        description,
        street: resolvedAddress.street,
        streetNumber: resolvedAddress.streetNumber,
        city: resolvedAddress.city,
        province: resolvedAddress.province,
        formattedAddress: resolvedAddress.formattedAddress || addressText,
        latitude: resolvedAddress.latitude,
        longitude: resolvedAddress.longitude,
        photos: uploadedPhotos,
        instagramUrl: instagramUrl || '',
        facebookUrl: facebookUrl || '',
        websiteUrl: websiteUrl || '',
        phone: phoneValue || '',
        whatsapp: whatsappValue || '',
      });

      setPhotos(uploadedPhotos.map((uri) => ({ uri, uploaded: true })));
      const firstTime = !alreadyPublished;
      setAlreadyPublished(true);

      Alert.alert(
        firstTime ? 'Il tuo locale è online' : 'Locale aggiornato',
        firstTime
          ? 'Da ora gli utenti vedono il tuo locale sulla mappa e possono organizzare eventi da te.'
          : 'Le modifiche sono visibili a tutti.',
        [{ text: 'Vedi la pagina', onPress: () => router.replace({ pathname: '/user-profile' as any, params: { userId } }) }]
      );
    } catch (error: unknown) {
      Alert.alert(
        'Il mio locale',
        error instanceof Error ? error.message : 'Non sono riuscito a salvare il locale. Riprova.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator color={LOCATION_COLOR} />
          <Text style={styles.helperLast}>Carico il tuo locale...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {photoPickerModal}
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
            accessibilityRole="button"
            accessibilityLabel="Torna indietro"
          >
            <Ionicons name="chevron-back" size={20} color={BAJUJU_COLORS.plum} />
          </Pressable>
          <Text style={styles.title}>Il mio locale</Text>
        </View>

        {!isLocationActive ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Location non attiva</Text>
            <Text style={styles.noticeText}>
              La pagina del locale è disponibile solo per i profili attivati come Location da Bajuju.
            </Text>
          </View>
        ) : !alreadyPublished ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Completa la pagina del tuo locale</Text>
            <Text style={styles.noticeText}>
              Servono nome, tipo di posto, indirizzo completo con numero civico e almeno una foto. Appena salvi, il locale compare sulla mappa e al posto del tuo nome si vede il nome del locale.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Foto del locale</Text>
          <Text style={styles.helper}>Almeno una, massimo {LOCATION_MAX_PHOTOS}. La prima è la copertina.</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoTile}>
                <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
                {index === 0 ? (
                  <View style={styles.coverPill}><Text style={styles.coverPillText}>Copertina</Text></View>
                ) : (
                  <Pressable style={styles.makeCoverButton} onPress={() => makeCover(index)} accessibilityLabel="Usa come copertina">
                    <Ionicons name="star-outline" size={15} color="#fff" />
                  </Pressable>
                )}
                <Pressable style={styles.removePhotoButton} onPress={() => removePhoto(index)} accessibilityLabel="Togli foto">
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < LOCATION_MAX_PHOTOS ? (
              <Pressable
                style={[styles.photoTile, styles.addPhotoTile]}
                onPress={() => { void addPhoto(); }}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi una foto"
              >
                <Ionicons name="camera-outline" size={26} color={LOCATION_COLOR} />
                <Text style={styles.addPhotoText}>Aggiungi</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Il locale</Text>

          <Text style={styles.label}>Nome del locale</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Es. Bar Centrale"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.input}
            maxLength={LOCATION_NAME_MAX_LENGTH}
          />

          <Text style={styles.label}>Tipo di posto</Text>
          <View style={styles.categoryGrid}>
            {LOCATION_CATEGORIES.map((item) => {
              const selected = category === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                  onPress={() => setCategory(item)}
                >
                  <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Descrizione breve (facoltativa)</Text>
          <TextInput
            value={description}
            onChangeText={(value) => setDescription(value.slice(0, LOCATION_DESCRIPTION_MAX_LENGTH))}
            placeholder="Es. Cocktail bar in Città Alta con musica dal vivo il venerdì"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={[styles.input, styles.textArea, styles.inputLast]}
            multiline
            maxLength={LOCATION_DESCRIPTION_MAX_LENGTH}
          />
          <Text style={styles.counter}>{description.length}/{LOCATION_DESCRIPTION_MAX_LENGTH}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Indirizzo</Text>
          <AddressAutocompleteField
            value={addressText}
            resolvedAddress={resolvedAddress}
            onValueChange={setAddressText}
            onResolvedAddressChange={setResolvedAddress}
            placeholder="Es. Via XX Settembre 12, Bergamo"
            disabled={saving}
          />
          {resolvedAddress && !addressHasNumber ? (
            <Text style={styles.errorText}>Inserisci l’indirizzo completo con il numero civico.</Text>
          ) : (
            <Text style={styles.helper}>
              Scrivi via, numero civico e comune, poi scegli l’indirizzo giusto dai suggerimenti: il segnaposto sulla mappa va esattamente lì.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Link e contatti (facoltativi)</Text>
          <Text style={styles.helper}>Sulla pagina del locale compaiono come icone: chi le tocca arriva direttamente da te.</Text>

          <LinkField
            icon="logo-instagram"
            iconColor="#C13584"
            value={instagram}
            onChangeText={setInstagram}
            placeholder="Instagram: @nomelocale o link"
            invalid={instagramUrl === null}
            errorText="Scrivi il nome Instagram (es. @barcentrale) o il link del profilo."
          />
          <LinkField
            icon="logo-facebook"
            iconColor="#1877F2"
            value={facebook}
            onChangeText={setFacebook}
            placeholder="Facebook: link della pagina"
            invalid={facebookUrl === null}
            errorText="Incolla il link della pagina Facebook."
          />
          <LinkField
            icon="globe-outline"
            iconColor={LOCATION_COLOR}
            value={website}
            onChangeText={setWebsite}
            placeholder="Sito web: es. www.barcentrale.it"
            invalid={websiteUrl === null}
            errorText="Controlla l’indirizzo del sito."
            keyboardType="url"
          />
          <LinkField
            icon="call-outline"
            iconColor={BAJUJU_COLORS.plum}
            value={phone}
            onChangeText={setPhone}
            placeholder="Telefono"
            invalid={phoneValue === null}
            errorText="Controlla il numero di telefono."
            keyboardType="phone-pad"
          />
          <LinkField
            icon="logo-whatsapp"
            iconColor="#25D366"
            value={whatsapp}
            onChangeText={setWhatsapp}
            placeholder="WhatsApp"
            invalid={whatsappValue === null}
            errorText="Controlla il numero WhatsApp."
            keyboardType="phone-pad"
            last
          />
        </View>

        <Pressable
          style={[styles.mainButton, !canSave && styles.disabled]}
          onPress={() => { void handleSave(); }}
          disabled={!canSave}
        >
          <Text style={styles.mainButtonText}>
            {saving ? 'Salvataggio...' : alreadyPublished ? 'Salva modifiche' : 'Pubblica il locale'}
          </Text>
        </Pressable>

        {isLocationActive && !saving && missingFields.length > 0 ? (
          <Text style={styles.missingText}>Mancano: {missingFields.join(', ')}</Text>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

type LinkFieldProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  invalid: boolean;
  errorText: string;
  keyboardType?: 'default' | 'url' | 'phone-pad';
  last?: boolean;
};

function LinkField({ icon, iconColor, value, onChangeText, placeholder, invalid, errorText, keyboardType = 'default', last = false }: LinkFieldProps) {
  return (
    <View style={!last && styles.linkFieldSpacing}>
      <View style={[styles.linkRow, invalid && styles.linkRowInvalid]}>
        <Ionicons name={icon} size={22} color={iconColor} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={BAJUJU_COLORS.muted}
          style={styles.linkInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
        />
      </View>
      {invalid ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  container: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 80, gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
  },
  title: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 28 },
  notice: { padding: 16, borderRadius: 22, backgroundColor: LOCATION_COLOR_SOFT, borderWidth: 1, borderColor: '#D9C2F2' },
  noticeTitle: { color: LOCATION_COLOR, fontFamily: BAJUJU_FONTS.bold, fontSize: 17, marginBottom: 4 },
  noticeText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  card: { padding: 16, borderRadius: 22, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff' },
  cardTitle: { marginBottom: 10, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 19 },
  label: { marginBottom: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  input: {
    minHeight: 50,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    color: BAJUJU_COLORS.plum,
    backgroundColor: BAJUJU_COLORS.background,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 16,
  },
  inputLast: { marginBottom: 0 },
  textArea: { minHeight: 92, maxHeight: 180, paddingTop: 12, textAlignVertical: 'top' },
  counter: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12, textAlign: 'right' },
  helper: { marginTop: 2, marginBottom: 12, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  helperLast: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  errorText: { marginTop: 4, color: '#b42318', fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12, lineHeight: 17 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  categoryChip: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', justifyContent: 'center' },
  categoryChipSelected: { borderColor: LOCATION_COLOR, backgroundColor: LOCATION_COLOR },
  categoryChipText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  categoryChipTextSelected: { color: '#fff', fontFamily: BAJUJU_FONTS.semiBold },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { width: '31%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: BAJUJU_COLORS.softPink },
  photoImage: { width: '100%', height: '100%' },
  addPhotoTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: '#C9A6EC', backgroundColor: '#fff' },
  addPhotoText: { marginTop: 4, color: LOCATION_COLOR, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  coverPill: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: LOCATION_COLOR },
  coverPillText: { color: '#fff', fontFamily: BAJUJU_FONTS.semiBold, fontSize: 11 },
  makeCoverButton: { position: 'absolute', left: 6, bottom: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(75, 12, 45, 0.72)' },
  removePhotoButton: { position: 'absolute', right: 6, top: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(75, 12, 45, 0.72)' },
  linkFieldSpacing: { marginBottom: 10 },
  linkRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkRowInvalid: { borderColor: '#e58b8b' },
  linkInput: { flex: 1, minHeight: 48, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  mainButton: { minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: LOCATION_COLOR },
  mainButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  disabled: { opacity: 0.45 },
  missingText: { marginTop: -6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
