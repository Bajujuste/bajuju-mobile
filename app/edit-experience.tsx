import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EXPERIENCE_CATEGORIES } from '@/src/constants/experienceCategories';
import { supabase } from '../src/lib/supabase';

type ActivityRow = {
  id: string;
  creator_id: string;
  title: string | null;
  description: string | null;
  activity_date: string | null;
  activity_time: string | null;
  city: string | null;
  province: string | null;
  meeting_place: string | null;
  category: string | null;
  max_participants: number | null;
  budget_amount: number | null;
  is_flash: boolean | null;
};

function cleanTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default function EditExperienceScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const experienceId = String(params.id || '').trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorizedUserId, setAuthorizedUserId] = useState('');
  const [minimumParticipants, setMinimumParticipants] = useState(1);
  const [errorText, setErrorText] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activityDate, setActivityDate] = useState('');
  const [activityTime, setActivityTime] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [category, setCategory] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  const loadExperience = useCallback(async () => {
    setLoading(true);
    setErrorText('');

    try {
      if (!experienceId) {
        setErrorText('Evento non trovato.');
        return;
      }

      const authResult = await supabase.auth.getUser();
      const userId = authResult.data.user?.id || '';

      if (!userId) {
        setErrorText('Devi accedere per modificare un evento.');
        return;
      }

      const result = await supabase
        .from('activities')
        .select('id,creator_id,title,description,activity_date,activity_time,city,province,meeting_place,category,max_participants,budget_amount,is_flash')
        .eq('id', experienceId)
        .eq('creator_id', userId)
        .eq('is_flash', false)
        .maybeSingle();

      if (result.error) {
        setErrorText(result.error.message || 'Non sono riuscito a caricare l’evento.');
        return;
      }

      const row = result.data as ActivityRow | null;
      if (!row) {
        setErrorText('Puoi modificare solamente gli eventi creati da te.');
        return;
      }

      const participantResult = await supabase
        .from('activity_participants')
        .select('user_id,status')
        .eq('activity_id', experienceId);

      const activeParticipantIds = new Set<string>();
      (participantResult.data || []).forEach((participant: any) => {
        const status = String(participant.status || '').toLowerCase().trim();
        if (['cancelled', 'canceled', 'rejected', 'left', 'deleted', 'annullato', 'rifiutato'].includes(status)) return;
        const participantId = String(participant.user_id || '').trim();
        if (participantId) activeParticipantIds.add(participantId);
      });

      setAuthorizedUserId(userId);
      setMinimumParticipants(Math.max(1, activeParticipantIds.size + 1));
      setTitle(String(row.title || ''));
      setDescription(String(row.description || ''));
      setActivityDate(String(row.activity_date || ''));
      setActivityTime(String(row.activity_time || '').slice(0, 5));
      setCity(String(row.city || ''));
      setProvince(String(row.province || ''));
      setMeetingPlace(String(row.meeting_place || ''));
      setCategory(String(row.category || ''));
      setMaxParticipants(row.max_participants ? String(row.max_participants) : '');
      setBudgetAmount(row.budget_amount !== null && row.budget_amount !== undefined ? String(row.budget_amount) : '');
    } catch (error: any) {
      setErrorText(error?.message || 'Errore durante il caricamento dell’evento.');
    } finally {
      setLoading(false);
    }
  }, [experienceId]);

  useEffect(() => {
    loadExperience();
  }, [loadExperience]);

  async function saveExperience() {
    if (!authorizedUserId || !experienceId || saving) return;

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const cleanCity = city.trim();
    const cleanProvince = province.trim();
    const cleanMeetingPlace = meetingPlace.trim();
    const normalizedTime = cleanTime(activityTime);
    const parsedMax = Number(maxParticipants);
    const parsedBudget = budgetAmount.trim() ? Number(String(budgetAmount).replace(',', '.')) : null;

    if (!cleanTitle || !cleanDescription || !cleanCity || !cleanProvince || !cleanMeetingPlace || !category) {
      Alert.alert('Campi mancanti', 'Completa titolo, descrizione, luogo, comune, provincia e categoria.');
      return;
    }

    if (!validDate(activityDate)) {
      Alert.alert('Data non valida', 'Inserisci la data nel formato AAAA-MM-GG.');
      return;
    }

    if (!normalizedTime) {
      Alert.alert('Ora non valida', 'Inserisci l’ora nel formato HH:MM.');
      return;
    }

    if (!Number.isInteger(parsedMax) || parsedMax < minimumParticipants || parsedMax > 500) {
      Alert.alert(
        'Partecipanti non validi',
        `Il massimo deve essere un numero intero tra ${minimumParticipants} e 500. Non può essere inferiore alle persone già presenti.`
      );
      return;
    }

    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0 || parsedBudget > 100000)) {
      Alert.alert('Budget non valido', 'Inserisci un budget valido oppure lascia il campo vuoto.');
      return;
    }

    setSaving(true);

    try {
      const result = await supabase
        .from('activities')
        .update({
          title: cleanTitle,
          description: cleanDescription,
          activity_date: activityDate,
          activity_time: normalizedTime,
          city: cleanCity,
          province: cleanProvince,
          meeting_place: cleanMeetingPlace,
          category,
          max_participants: parsedMax,
          budget_amount: parsedBudget,
        })
        .eq('id', experienceId)
        .eq('creator_id', authorizedUserId)
        .eq('is_flash', false)
        .select('id')
        .maybeSingle();

      if (result.error) {
        Alert.alert('Modifica non riuscita', result.error.message);
        return;
      }

      if (!result.data) {
        Alert.alert('Modifica non autorizzata', 'L’evento non è stato modificato perché non risulta creato da questo account.');
        return;
      }

      Alert.alert('Evento aggiornato', 'Le modifiche sono state salvate.', [
        {
          text: 'Apri evento',
          onPress: () =>
            router.replace({
              pathname: '/experience-detail' as any,
              params: { id: experienceId },
            }),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Non sono riuscito a salvare le modifiche.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>← Indietro</Text>
          </Pressable>

          <Text style={styles.pageTitle}>Modifica evento</Text>
          <Text style={styles.subtitle}>Puoi modificare soltanto un evento creato dal tuo account.</Text>

          {loading ? (
            <View style={styles.statusBox}>
              <ActivityIndicator />
              <Text style={styles.statusText}>Caricamento evento...</Text>
            </View>
          ) : errorText ? (
            <View style={styles.statusBox}>
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>Titolo</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={100} />

              <Text style={styles.label}>Descrizione</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={1500}
                textAlignVertical="top"
              />

              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>Data</Text>
                  <TextInput
                    style={styles.input}
                    value={activityDate}
                    onChangeText={setActivityDate}
                    placeholder="2026-08-02"
                    autoCapitalize="none"
                    maxLength={10}
                  />
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>Ora</Text>
                  <TextInput
                    style={styles.input}
                    value={activityTime}
                    onChangeText={setActivityTime}
                    placeholder="08:30"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              </View>

              <Text style={styles.label}>Luogo di ritrovo</Text>
              <TextInput style={styles.input} value={meetingPlace} onChangeText={setMeetingPlace} maxLength={250} />

              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>Comune</Text>
                  <TextInput style={styles.input} value={city} onChangeText={setCity} maxLength={100} />
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>Provincia</Text>
                  <TextInput style={styles.input} value={province} onChangeText={setProvince} maxLength={100} />
                </View>
              </View>

              <Text style={styles.label}>Categoria</Text>
              <View style={styles.categories}>
                {EXPERIENCE_CATEGORIES.filter((item) => item !== 'Tutti').map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.categoryButton, category === item && styles.categoryButtonActive]}
                    onPress={() => setCategory(item)}
                  >
                    <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>Massimo partecipanti</Text>
                  <TextInput
                    style={styles.input}
                    value={maxParticipants}
                    onChangeText={setMaxParticipants}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.hint}>Minimo attuale: {minimumParticipants}</Text>
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>Budget massimo €</Text>
                  <TextInput
                    style={styles.input}
                    value={budgetAmount}
                    onChangeText={setBudgetAmount}
                    keyboardType="decimal-pad"
                    maxLength={10}
                    placeholder="Facoltativo"
                  />
                </View>
              </View>

              <Text style={styles.notice}>La foto, il creatore, i partecipanti, la chat e la galleria non vengono modificati.</Text>

              <Pressable style={[styles.saveButton, saving && styles.disabledButton]} onPress={saveExperience} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? 'Salvataggio...' : 'Salva modifiche'}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#fff8fb' },
  container: { flexGrow: 1, padding: 20, paddingTop: 58, paddingBottom: 40 },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: '#fff2f8',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    marginBottom: 18,
  },
  backText: { color: '#9b1f61', fontWeight: '900' },
  pageTitle: { fontSize: 32, fontWeight: '900', color: '#e43f98' },
  subtitle: { marginTop: 7, marginBottom: 18, color: '#6b3652', fontSize: 15, lineHeight: 21, fontWeight: '700' },
  card: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f6d7e4',
  },
  statusBox: {
    minHeight: 130,
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f6d7e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { marginTop: 12, color: '#6b3652', fontWeight: '800' },
  errorText: { color: '#a32057', fontWeight: '900', textAlign: 'center', lineHeight: 21 },
  label: { color: '#6b3652', fontSize: 13, fontWeight: '900', marginBottom: 6, marginTop: 12 },
  input: {
    minHeight: 48,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    color: '#331426',
    fontSize: 15,
    fontWeight: '700',
  },
  textArea: { minHeight: 130 },
  row: { flexDirection: 'row', gap: 10 },
  rowItem: { flex: 1, minWidth: 0 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#fff8fb',
  },
  categoryButtonActive: { backgroundColor: '#e43f98', borderColor: '#e43f98' },
  categoryText: { color: '#7b4960', fontSize: 12, fontWeight: '900' },
  categoryTextActive: { color: '#ffffff' },
  hint: { marginTop: 5, color: '#9b6b82', fontSize: 11, fontWeight: '700' },
  notice: {
    marginTop: 18,
    borderRadius: 15,
    padding: 12,
    backgroundColor: '#fff0f7',
    color: '#7b4960',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  saveButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: { opacity: 0.55 },
  saveButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
});
