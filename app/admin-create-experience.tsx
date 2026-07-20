import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [experienceDraft, setExperienceDraft] = useState<ExperienceDraft | null>(null);

  async function handleAnalyzeEvent() {
    if (dictationText.trim().length === 0 || analyzing) return;

    setAnalyzing(true);
    setAnalysisResult(null);
    setExperienceDraft(null);

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

      setAnalysisResult(response.experience);
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
    } catch {
      console.log('Errore analisi evento Admin.');

      Alert.alert('Errore analisi', 'Non sono riuscito ad analizzare l’evento. Riprova.');
    } finally {
      setAnalyzing(false);
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
  button: { alignSelf: 'flex-start', backgroundColor: '#fff0f7', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffd3e6' },
  buttonText: { color: '#9b1f61', fontSize: 14, fontWeight: '900' },
});
