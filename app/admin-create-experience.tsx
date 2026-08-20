import { router } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { resolveAddressText } from '../src/lib/addressAutocomplete';
import { supabase } from '../src/lib/supabase';

type ExperienceDraft = {
  title: string;
  description: string;
  activity_date: string;
  activity_time: string;
  city: string;
  province: string;
  meeting_place: string;
  category: string;
  max_participants: string;
};

export default function AdminCreateExperienceScreen() {
  const [dictationText, setDictationText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [experienceDraft, setExperienceDraft] = useState<ExperienceDraft | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  async function handleAnalyzeEvent() {
    if (dictationText.trim().length === 0 || analyzing) return;

    setAnalyzing(true);
    setExperienceDraft(null);
    setIdempotencyKey('');

    try {
      const result = await supabase.functions.invoke('analyze-admin-experience', {
        body: {
          text: dictationText.trim(),
        },
      });

      if (result.error) {
        console.log('Errore analisi evento Admin.');

        let diagnostic = result.error.message || 'Errore sconosciuto';

        try {
          const context = (result.error as { context?: Response }).context;

          if (context) {
            const rawBody = await context.clone().text();

            console.log('Stato risposta analisi:', context.status);
            console.log('Corpo risposta analisi:', rawBody);

            if (rawBody.trim()) {
              try {
                const errorBody = JSON.parse(rawBody);

                diagnostic = [
                  errorBody?.error,
                  errorBody?.provider_status,
                  errorBody?.provider_code,
                ]
                  .filter(Boolean)
                  .join(' - ');
              } catch {
                diagnostic = rawBody;
              }
            } else {
              diagnostic = 'HTTP ' + context.status;
            }
          }
        } catch {
          // Mantiene il messaggio originale.
        }

        console.log('Dettaglio errore analisi:', diagnostic);

        Alert.alert('Errore analisi', diagnostic);

        return;
      }

      const response = result.data as {
        ok?: boolean;
        experience?: Record<string, unknown>;
        error?: string;
      } | null;

      if (response?.ok !== true || !response.experience) {
        Alert.alert('Analisi non valida', 'L’analisi non ha restituito dati validi.');

        return;
      }

      setExperienceDraft({
        title: String(response.experience.title ?? ''),
        description: String(response.experience.description ?? ''),
        activity_date: String(response.experience.activity_date ?? ''),
        activity_time: String(response.experience.activity_time ?? ''),
        city: String(response.experience.city ?? ''),
        province: String(response.experience.province ?? ''),
        meeting_place: String(response.experience.meeting_place ?? ''),
        category: String(response.experience.category ?? ''),
        max_participants: String(response.experience.max_participants ?? ''),
      });
      setIdempotencyKey(`admin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    } catch {
      console.log('Errore analisi evento Admin.');

      Alert.alert('Errore analisi', 'Non sono riuscito ad analizzare l’evento. Riprova.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handlePickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permesso necessario',
          'Autorizza l’accesso alle immagini per scegliere la foto di presentazione.'
        );
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      const resized = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 1280 } }],
        {
          compress: 0.72,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      setPhotoUri(resized.uri);
    } catch (error: unknown) {
      Alert.alert(
        'Errore foto',
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a preparare la foto selezionata.'
      );
    }
  }

  async function handleCreateEvent() {
    if (!experienceDraft || creating) return;

    const maxParticipants = Number(experienceDraft.max_participants);
    const payload = {
      title: experienceDraft.title.trim(),
      description: experienceDraft.description.trim(),
      activity_date: experienceDraft.activity_date.trim(),
      activity_time: experienceDraft.activity_time.trim(),
      city: experienceDraft.city.trim(),
      province: experienceDraft.province.trim(),
      meeting_place: experienceDraft.meeting_place.trim(),
      category: experienceDraft.category.trim(),
      max_participants: maxParticipants,
    };

    if (
      !payload.title ||
      !payload.description ||
      !payload.activity_date ||
      !payload.activity_time ||
      !payload.city ||
      !payload.province ||
      !payload.meeting_place ||
      !payload.category ||
      !Number.isInteger(maxParticipants) ||
      maxParticipants < 1 ||
      maxParticipants > 99
    ) {
      Alert.alert(
        'Dati mancanti',
        'Controlla tutti i campi e inserisci un numero di partecipanti tra 1 e 99.'
      );
      return;
    }

    setCreating(true);

    try {
      const authResult = await supabase.auth.getUser();
      const creatorId = authResult.data.user?.id;

      if (authResult.error || !creatorId) {
        throw authResult.error || new Error('Devi accedere come amministratore.');
      }

      const resolvedLocation = await resolveAddressText(
        [payload.meeting_place, payload.city, payload.province, 'Italia'].join(', ')
      );
      const geolocatedPayload = {
        ...payload,
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
      };

      const stableKey =
        idempotencyKey ||
        `admin-${creatorId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      setIdempotencyKey(stableKey);

      const result = await supabase.functions.invoke('admin-create-experience', {
        body: {
          idempotencyKey: stableKey,
          payload: geolocatedPayload,
        },
      });

      if (result.error) {
        throw result.error;
      }

      const response = (result.data || {}) as Record<string, any>;

      if (response.ok === false) {
        throw new Error(String(response.error || 'Creazione evento non riuscita.'));
      }

      const activityId = String(
        response.activity_id ||
          response.id ||
          response.experience?.id ||
          response.data?.id ||
          ''
      ).trim();

      let photoWarning = '';

      if (photoUri) {
        if (!activityId) {
          photoWarning =
            'L’evento è stato creato, ma non ho ricevuto il suo identificativo per collegare la foto.';
        } else {
          try {
            const photoResponse = await fetch(photoUri);
            const photoBuffer = await photoResponse.arrayBuffer();
            const filePath = `${activityId}/${creatorId}-admin-cover-${Date.now()}.jpg`;

            const uploadResult = await supabase.storage
              .from('event-photos')
              .upload(filePath, photoBuffer, {
                contentType: 'image/jpeg',
                upsert: true,
              });

            if (uploadResult.error) throw uploadResult.error;

            const publicUrl = supabase.storage
              .from('event-photos')
              .getPublicUrl(filePath).data.publicUrl;

            if (!publicUrl) {
              throw new Error('URL pubblico della foto non disponibile.');
            }

            const updateResult = await supabase
              .from('activities')
              .update({ photo_url: publicUrl })
              .eq('id', activityId);

            if (updateResult.error) throw updateResult.error;
          } catch (error: unknown) {
            photoWarning =
              error instanceof Error
                ? error.message
                : 'La foto non è stata collegata correttamente.';
          }
        }
      }

      if (photoWarning) {
        Alert.alert('Evento creato, foto non caricata', photoWarning);
        return;
      }

      Alert.alert(
        'Evento pubblicato',
        photoUri
          ? 'L’evento e la foto di presentazione sono stati pubblicati correttamente.'
          : 'L’evento è stato pubblicato correttamente.'
      );

      setDictationText('');
      setExperienceDraft(null);
      setPhotoUri(null);
      setIdempotencyKey('');
    } catch (error: unknown) {
      Alert.alert(
        'Errore creazione',
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a pubblicare l’evento.'
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.card} keyboardShouldPersistTaps='handled'>
        <Text style={styles.title}>Crea evento con dettatura</Text>
        <Text style={styles.text}>
          Descrivi l’evento a voce usando il microfono della tastiera, oppure scrivilo.
        </Text>

        <Text style={styles.label}>Descrizione dell’evento</Text>
        <TextInput
          value={dictationText}
          onChangeText={setDictationText}
          placeholder="Esempio: crea una cena a Bergamo il 25 luglio alle 20:30..."
          placeholderTextColor="#9c7b8b"
          multiline
          textAlignVertical="top"
          style={styles.dictationInput}
        />

        <Text style={styles.helper}>
          Inserisci titolo, data, ora, comune, provincia, indirizzo e numero massimo di partecipanti.
        </Text>

        <Pressable
          style={[
            styles.analyzeButton,
            (dictationText.trim().length === 0 || analyzing) && styles.disabledButton,
          ]}
          disabled={dictationText.trim().length === 0 || analyzing}
          onPress={handleAnalyzeEvent}
        >
          <Text style={styles.analyzeButtonText}>
            {analyzing ? 'Analisi in corso...' : 'Analizza evento'}
          </Text>
        </Pressable>

        {experienceDraft ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Controlla e modifica l’evento</Text>

            <Text style={styles.label}>Titolo</Text>
            <TextInput
              value={experienceDraft.title}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, title: value })}
              style={styles.editableInput}
            />

            <Text style={styles.label}>Descrizione</Text>
            <TextInput
              value={experienceDraft.description}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, description: value })}
              multiline
              textAlignVertical="top"
              style={[styles.editableInput, styles.descriptionInput]}
            />

            <Text style={styles.label}>Data</Text>
            <TextInput
              value={experienceDraft.activity_date}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, activity_date: value })}
              placeholder="AAAA-MM-GG"
              style={styles.editableInput}
            />

            <Text style={styles.label}>Ora</Text>
            <TextInput
              value={experienceDraft.activity_time}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, activity_time: value })}
              placeholder="HH:MM"
              style={styles.editableInput}
            />

            <Text style={styles.label}>Comune</Text>
            <TextInput
              value={experienceDraft.city}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, city: value })}
              style={styles.editableInput}
            />

            <Text style={styles.label}>Provincia</Text>
            <TextInput
              value={experienceDraft.province}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, province: value })}
              style={styles.editableInput}
            />

            <Text style={styles.label}>Luogo di ritrovo</Text>
            <TextInput
              value={experienceDraft.meeting_place}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, meeting_place: value })}
              style={styles.editableInput}
            />

            <Text style={styles.label}>Categoria</Text>
            <TextInput
              value={experienceDraft.category}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, category: value })}
              style={styles.editableInput}
            />

            <Text style={styles.label}>Numero massimo partecipanti</Text>
            <TextInput
              value={experienceDraft.max_participants}
              onChangeText={(value) => setExperienceDraft({ ...experienceDraft, max_participants: value })}
              keyboardType="number-pad"
              style={styles.editableInput}
            />

            <Text style={styles.label}>Foto di presentazione</Text>
            <Pressable
              style={styles.photoPicker}
              onPress={handlePickPhoto}
              disabled={creating}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderTitle}>Scegli la foto</Text>
                  <Text style={styles.photoPlaceholderText}>
                    Verrà usata come copertina dell’evento
                  </Text>
                </View>
              )}
            </Pressable>

            {photoUri ? (
              <View style={styles.photoActions}>
                <Pressable
                  style={styles.photoActionButton}
                  onPress={handlePickPhoto}
                  disabled={creating}
                >
                  <Text style={styles.photoActionText}>Sostituisci</Text>
                </Pressable>
                <Pressable
                  style={styles.photoActionButton}
                  onPress={() => setPhotoUri(null)}
                  disabled={creating}
                >
                  <Text style={styles.photoRemoveText}>Rimuovi</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              style={[styles.publishButton, creating && styles.disabledButton]}
              onPress={handleCreateEvent}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.publishButtonText}>
                  Pubblica evento{photoUri ? ' con foto' : ''}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>← Torna all’area Admin</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff8fb', padding: 18 },
  card: { backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#ffd3e6' },
  title: { color: '#e43f98', fontSize: 28, fontWeight: '900', marginBottom: 12 },
  text: { color: '#4b1430', fontSize: 15, lineHeight: 22, fontWeight: '700', marginBottom: 20 },
  label: { color: '#4b1430', fontSize: 15, fontWeight: '900', marginBottom: 8 },
  dictationInput: { minHeight: 180, backgroundColor: '#fff8fb', borderRadius: 18, borderWidth: 1, borderColor: '#ffd3e6', padding: 14, color: '#4b1430', fontSize: 16, lineHeight: 23, marginBottom: 10 },
  helper: { color: '#7b4960', fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: 20 },
  analyzeButton: { backgroundColor: '#ef2d82', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', marginBottom: 14 },
  analyzeButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  disabledButton: { opacity: 0.45 },
  resultCard: { backgroundColor: '#fff8fb', borderRadius: 18, borderWidth: 1, borderColor: '#ffd3e6', padding: 14, marginBottom: 16 },
  resultTitle: { color: '#4b1430', fontSize: 18, fontWeight: '900', marginBottom: 10 },
  resultText: { color: '#4b1430', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  editableInput: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#ffd3e6', paddingVertical: 11, paddingHorizontal: 12, color: '#4b1430', fontSize: 15, marginBottom: 14 },
  descriptionInput: { minHeight: 110 },
  photoPicker: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#ffd3e6', marginBottom: 10 },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  photoPlaceholderTitle: { color: '#e43f98', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  photoPlaceholderText: { color: '#7b4960', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  photoActions: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  photoActionButton: { flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 999, borderWidth: 1, borderColor: '#ffd3e6', paddingVertical: 10, paddingHorizontal: 12 },
  photoActionText: { color: '#9b1f61', fontSize: 14, fontWeight: '900' },
  photoRemoveText: { color: '#a03455', fontSize: 14, fontWeight: '900' },
  publishButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ef2d82', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18 },
  publishButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  button: { alignSelf: 'flex-start', backgroundColor: '#fff0f7', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffd3e6' },
  buttonText: { color: '#9b1f61', fontSize: 14, fontWeight: '900' },
});
