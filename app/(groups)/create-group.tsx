import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useBajujuPhotoPicker } from '../../src/components/useBajujuPhotoPicker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createBajujuGroup, uploadBajujuGroupCover } from '../../src/lib/bajujuGroups';
import { BAJUJU_GROUP_CATEGORIES } from '../../src/constants/groupCategories';
import { resolveAddressText } from '../../src/lib/addressAutocomplete';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';

export default function CreateGroupScreen() {
  const { pickPhoto, photoPickerModal } = useBajujuPhotoPicker();
  const safeAreaInsets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === 'android' ? safeAreaInsets.bottom : 0;
  const [userId, setUserId] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMissingFields, setShowMissingFields] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [ageRestricted, setAgeRestricted] = useState(false);
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('80');
  const [coverUri, setCoverUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const authResult = await supabase.auth.getUser();
        if (authResult.error) throw authResult.error;
        const id = authResult.data.user?.id || '';
        if (!id) return;

        if (!active) return;

        setUserId(id);
        setAllowed(true);
      } catch (error) {
        console.log('Errore verifica permessi gruppo:', error);
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => { active = false; };
  }, []);

  const parsedMinAge = Number(minAge);
  const parsedMaxAge = Number(maxAge);
  const ageRangeValid =
    !ageRestricted ||
    (
      Number.isInteger(parsedMinAge) &&
      Number.isInteger(parsedMaxAge) &&
      parsedMinAge >= 18 &&
      parsedMaxAge <= 80 &&
      parsedMinAge <= parsedMaxAge
    );

  const missingFields = [
    ...(!coverUri ? ['Immagine di copertina'] : []),
    ...(name.trim().length < 3 ? ['Nome gruppo (almeno 3 caratteri)'] : []),
    ...(description.trim().length < 10 ? ['Descrizione (almeno 10 caratteri)'] : []),
    ...(city.trim().length < 2 ? ['Comune'] : []),
    ...(!category ? ['Categoria'] : []),
    ...(!ageRangeValid ? ['Fascia d’età valida (18–80 anni)'] : []),
  ];
  const canSave = allowed && !saving;

  async function handlePickCover() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Copertina gruppo', 'Autorizza l’accesso alle immagini per scegliere la copertina del gruppo.');
        return;
      }

      const picked = await pickPhoto({ aspect: [16, 9], quality: 0.9 });
      if (!picked) return;

      const resized = await ImageManipulator.manipulateAsync(
        picked.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCoverUri(resized.uri);
    } catch (error: unknown) {
      Alert.alert(
        'Copertina gruppo',
        error instanceof Error ? error.message : 'Non sono riuscito a preparare l’immagine selezionata.'
      );
    }
  }

  async function handleCreate() {
    if (!canSave || !userId) return;
    if (missingFields.length > 0) {
      setShowMissingFields(true);
      Alert.alert('Completa il gruppo', `Mancano questi campi obbligatori:\n\n• ${missingFields.join('\n• ')}`);
      return;
    }
    setShowMissingFields(false);
    setSaving(true);

    try {
      const cleanCity = city.trim();
      const coordinates = await resolveAddressText(`${cleanCity}, Italia`);

      const groupId = await createBajujuGroup({
        ownerId: userId,
        name,
        description,
        city: cleanCity,
        category,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        requiresApproval,
        minAge: ageRestricted ? parsedMinAge : null,
        maxAge: ageRestricted ? parsedMaxAge : null,
      });

      if (!groupId || !coverUri) throw new Error('Immagine di copertina obbligatoria.');
      try {
        await uploadBajujuGroupCover({ groupId, userId, localUri: coverUri });
      } catch (uploadError: unknown) {
        // Mantieni il gruppo non pubblicato: l'approvazione è vietata senza copertina.
        // Il proprietario può riprovare a caricarla direttamente nei dettagli.
        const details = uploadError instanceof Error ? uploadError.message : 'Caricamento non riuscito.';
        Alert.alert(
          'Copertina non caricata',
          `Il gruppo non sarà pubblicato finché non aggiungi la copertina. ${details}`,
          [{
            text: 'Apri gruppo e riprova',
            onPress: () => router.replace({
              pathname: '/group-detail' as any,
              params: { id: groupId },
            }),
          }]
        );
        return;
      }

      Alert.alert(
        'Richiesta inviata',
        'Il gruppo con copertina è stato inviato a Bajuju per l’approvazione. Finché non viene approvato lo vedi solo tu e gli Admin.'
      );
      router.replace({ pathname: '/group-detail' as any, params: { id: groupId } });
    } catch (error: any) {
      const rawMessage = String(error?.message || 'Non sono riuscito a creare il gruppo.');
      const message = rawMessage.includes('ADDRESS_NOT_FOUND') || rawMessage.includes('TEXT_SEARCH_FAILED')
        ? 'Non riesco a riconoscere il Comune. Controlla il nome e riprova.'
        : rawMessage;
      Alert.alert('Impossibile creare il gruppo', message);
    } finally {
      setSaving(false);
    }
  }

  if (!checking && !allowed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.denied}>
          <Text style={styles.deniedTitle}>Accedi per creare un gruppo</Text>
          <Text style={styles.deniedText}>
            Tutti gli utenti Bajuju possono proporre un gruppo. Dopo l’invio verrà controllato prima della pubblicazione.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/groups' as any)}>
            <Text style={styles.secondaryButtonText}>Torna ai gruppi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {photoPickerModal}
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/groups' as any))}
            accessibilityRole="button"
            accessibilityLabel="Torna ai gruppi"
          >
            <Ionicons name="arrow-back" size={22} color={BAJUJU_COLORS.plum} />
          </Pressable>
          <Text style={styles.title}>Nuovo gruppo</Text>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={20} color={BAJUJU_COLORS.pink} />
          <Text style={styles.infoText}>Bajuju lo controlla prima di renderlo pubblico.</Text>
        </View>

        <Pressable
          style={[styles.coverBox, coverUri && styles.coverBoxFilled]}
          onPress={() => { void handlePickCover(); }}
          accessibilityRole="button"
          accessibilityLabel={coverUri ? 'Cambia copertina' : 'Aggiungi la copertina'}
        >
          {coverUri ? (
            <>
              <Image source={{ uri: coverUri }} style={styles.coverPreview} resizeMode="cover" />
              <View style={styles.coverChangePill}>
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={styles.coverChangeText}>Cambia</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.coverIconCircle}>
                <Ionicons name="image-outline" size={28} color={BAJUJU_COLORS.pink} />
              </View>
              <Text style={styles.coverTitle}>Aggiungi la copertina</Text>
              <Text style={styles.coverHint}>Obbligatoria · potrai cambiarla dopo</Text>
            </>
          )}
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Il gruppo</Text>

          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Es. Single Bergamo"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.input}
            maxLength={60}
          />
          <Text style={styles.helper}>Unico su Bajuju: nomi uguali o simili vengono bloccati.</Text>

          <Text style={styles.label}>Descrizione</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Per chi è il gruppo e che esperienze propone?"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={[styles.input, styles.textArea]}
            multiline
            maxLength={500}
          />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.categoryGrid}>
            {BAJUJU_GROUP_CATEGORIES.map((item) => {
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
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dove e chi</Text>

          <Text style={styles.label}>Comune</Text>
          <View style={styles.inputWithIcon}>
            <Ionicons name="location-outline" size={18} color={BAJUJU_COLORS.pink} />
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="Es. Bergamo"
              placeholderTextColor={BAJUJU_COLORS.muted}
              style={styles.inputInner}
              maxLength={80}
              autoCapitalize="words"
            />
          </View>

          <Text style={styles.label}>Età degli iscritti</Text>
          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentButton, !ageRestricted && styles.segmentButtonSelected]}
              onPress={() => setAgeRestricted(false)}
              accessibilityRole="button"
              accessibilityState={{ selected: !ageRestricted }}
            >
              <Text style={[styles.segmentText, !ageRestricted && styles.segmentTextSelected]}>Tutte le età</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, ageRestricted && styles.segmentButtonSelected]}
              onPress={() => setAgeRestricted(true)}
              accessibilityRole="button"
              accessibilityState={{ selected: ageRestricted }}
            >
              <Text style={[styles.segmentText, ageRestricted && styles.segmentTextSelected]}>Solo una fascia</Text>
            </Pressable>
          </View>

          {ageRestricted ? (
            <View style={styles.ageInputsRow}>
              <View style={styles.ageInputBox}>
                <Text style={styles.ageInputLabel}>Da</Text>
                <TextInput
                  value={minAge}
                  onChangeText={(value) => setMinAge(value.replace(/[^0-9]/g, '').slice(0, 2))}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholder="18"
                  maxLength={2}
                />
              </View>
              <View style={styles.ageInputBox}>
                <Text style={styles.ageInputLabel}>A</Text>
                <TextInput
                  value={maxAge}
                  onChangeText={(value) => setMaxAge(value.replace(/[^0-9]/g, '').slice(0, 2))}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholder="80"
                  maxLength={2}
                />
              </View>
            </View>
          ) : null}

          {ageRestricted && !ageRangeValid ? (
            <Text style={styles.ageError}>Inserisci una fascia valida da 18 a 80 anni.</Text>
          ) : null}

          <Text style={styles.label}>Iscrizione</Text>
          <View style={[styles.segment, styles.segmentLast]}>
            <Pressable
              style={[styles.segmentButton, !requiresApproval && styles.segmentButtonSelected]}
              onPress={() => setRequiresApproval(false)}
              accessibilityRole="button"
              accessibilityState={{ selected: !requiresApproval }}
            >
              <Text style={[styles.segmentText, !requiresApproval && styles.segmentTextSelected]}>Libera</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, requiresApproval && styles.segmentButtonSelected]}
              onPress={() => setRequiresApproval(true)}
              accessibilityRole="button"
              accessibilityState={{ selected: requiresApproval }}
            >
              <Text style={[styles.segmentText, requiresApproval && styles.segmentTextSelected]}>Con approvazione</Text>
            </Pressable>
          </View>
          <Text style={styles.helperLast}>
            {requiresApproval
              ? 'Decidi tu se accettare o rifiutare ogni richiesta.'
              : 'Chi si iscrive entra subito nel gruppo.'}
          </Text>
        </View>

        {showMissingFields && missingFields.length > 0 ? (
          <Text style={styles.missingText}>Da completare: {missingFields.join(' · ')}</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: 12 + androidBottomInset }]}>
        <Pressable
          style={[styles.mainButton, !canSave && styles.disabled]}
          disabled={!canSave}
          onPress={() => { void handleCreate(); }}
        >
          <Text style={styles.mainButtonText}>{saving ? 'Invio...' : 'Invia per approvazione'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32, gap: 16 },
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
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: BAJUJU_COLORS.softPink },
  infoText: { flex: 1, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 19 },
  coverBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#EFA3C8',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverBoxFilled: { borderWidth: 0 },
  coverPreview: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverIconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.softPink },
  coverTitle: { marginTop: 8, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  coverHint: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  coverChangePill: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(75, 12, 45, 0.82)',
  },
  coverChangeText: { color: '#fff', fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
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
  inputWithIcon: {
    minHeight: 50,
    marginBottom: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.background,
  },
  inputInner: { flex: 1, minHeight: 48, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 16 },
  textArea: { minHeight: 92, paddingTop: 12, textAlignVertical: 'top' },
  helper: { marginTop: -6, marginBottom: 12, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  helperLast: { marginTop: 8, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', justifyContent: 'center' },
  categoryChipSelected: { borderColor: BAJUJU_COLORS.pink, backgroundColor: BAJUJU_COLORS.pink },
  categoryChipText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  categoryChipTextSelected: { color: '#fff', fontFamily: BAJUJU_FONTS.semiBold },
  segment: { flexDirection: 'row', gap: 4, padding: 4, marginBottom: 14, borderRadius: 999, backgroundColor: BAJUJU_COLORS.softPink },
  segmentLast: { marginBottom: 0 },
  segmentButton: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentButtonSelected: { backgroundColor: '#fff', ...BAJUJU_SHADOW, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  segmentTextSelected: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold },
  ageInputsRow: { flexDirection: 'row', gap: 12 },
  ageInputBox: { flex: 1 },
  ageInputLabel: { marginBottom: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  ageError: { marginTop: -4, marginBottom: 14, color: '#b42318', fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  missingText: { color: '#b42318', fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13, lineHeight: 18 },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: BAJUJU_COLORS.line,
  },
  mainButton: { minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.pink },
  mainButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  disabled: { opacity: 0.45 },
  denied: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  deniedTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 25, textAlign: 'center' },
  deniedText: { marginTop: 8, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  secondaryButton: { minHeight: 48, marginTop: 20, paddingHorizontal: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  secondaryButtonText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
});
