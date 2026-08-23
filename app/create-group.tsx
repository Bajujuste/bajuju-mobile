import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createBajujuGroup } from '../src/lib/bajujuGroups';
import { resolveAddressText } from '../src/lib/addressAutocomplete';
import { supabase } from '../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../src/theme/bajujuTheme';

export default function CreateGroupScreen() {
  const [userId, setUserId] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const authResult = await supabase.auth.getUser();
        if (authResult.error) throw authResult.error;
        const id = authResult.data.user?.id || '';
        if (!id) return;

        const profileResult = await supabase
          .from('profiles')
          .select('is_admin,is_premium_organizer')
          .eq('id', id)
          .maybeSingle();

        if (profileResult.error) throw profileResult.error;
        if (!active) return;

        setUserId(id);
        setAllowed(
          profileResult.data?.is_admin === true ||
          profileResult.data?.is_premium_organizer === true
        );
      } catch (error) {
        console.log('Errore verifica permessi gruppo:', error);
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => { active = false; };
  }, []);

  const canSave =
    allowed &&
    !saving &&
    name.trim().length >= 3 &&
    description.trim().length >= 10 &&
    city.trim().length >= 2;

  async function handleCreate() {
    if (!canSave || !userId) return;
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
      });

      Alert.alert('Gruppo creato', 'Il gruppo è online e gli utenti possono iscriversi.');
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
          <Text style={styles.deniedTitle}>Creazione riservata</Text>
          <Text style={styles.deniedText}>
            I gruppi possono essere creati solo da Admin e Organizzatori Premium.
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
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Gruppi</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>ORGANIZZATORI</Text>
          <Text style={styles.title}>Crea gruppo</Text>
          <Text style={styles.subtitle}>
            Costruisci una community e avvisa gli iscritti quando pubblichi un'esperienza dedicata.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Nome gruppo</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Es. Single Bergamo"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.input}
            maxLength={60}
          />
          <Text style={styles.helper}>
            Il nome deve essere unico su Bajuju. Nomi uguali o troppo simili vengono bloccati.
          </Text>

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

          <Text style={styles.label}>Comune</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Es. Bergamo"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.input}
            maxLength={80}
            autoCapitalize="words"
          />
          <Text style={styles.helper}>
            Inserisci solo il Comune. Bajuju ricava automaticamente la posizione per mostrare il gruppo alle persone più vicine.
          </Text>

          <Text style={styles.label}>Categoria</Text>
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="Es. Single, Trekking, Sport..."
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.input}
            maxLength={60}
          />

          <Pressable
            style={[styles.mainButton, !canSave && styles.disabled]}
            disabled={!canSave}
            onPress={() => { void handleCreate(); }}
          >
            <Text style={styles.mainButtonText}>{saving ? 'Creazione...' : 'Crea gruppo'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 80 },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
  },
  backText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  header: {
    marginTop: 15,
    marginBottom: 18,
    padding: 22,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#FFFFFFE8',
    ...BAJUJU_SHADOW,
  },
  eyebrow: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 12, letterSpacing: 1.1 },
  title: { marginTop: 2, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 34 },
  subtitle: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  card: { padding: 19, borderRadius: 27, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  label: { marginTop: 4, marginBottom: 7, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  input: {
    minHeight: 54,
    marginBottom: 12,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    color: BAJUJU_COLORS.plum,
    backgroundColor: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
  },
  textArea: { minHeight: 118, paddingTop: 14, textAlignVertical: 'top' },
  helper: { marginTop: -4, marginBottom: 13, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  mainButton: { minHeight: 54, marginTop: 8, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  mainButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  disabled: { opacity: 0.45 },
  denied: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  deniedTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 25, textAlign: 'center' },
  deniedText: { marginTop: 8, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  secondaryButton: { minHeight: 48, marginTop: 20, paddingHorizontal: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  secondaryButtonText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
});