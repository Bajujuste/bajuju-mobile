import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EXPERIENCE_CREATION_CATEGORIES } from '../src/constants/experienceCategories';
import { supabase } from '../src/lib/supabase';

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

function buildIsoDate(day: string, month: string, year: string) {
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return null;

  const dayNumber = Number(day);
  const monthNumber = Number(month);
  const yearNumber = Number(year);

  const date = new Date(yearNumber, monthNumber - 1, dayNumber);

  if (
    date.getFullYear() !== yearNumber ||
    date.getMonth() !== monthNumber - 1 ||
    date.getDate() !== dayNumber
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function buildTime(hour: string, minute: string) {
  if (hour.length !== 2 || minute.length !== 2) return null;

  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);

  if (hourNumber < 0 || hourNumber > 23) return null;
  if (minuteNumber < 0 || minuteNumber > 59) return null;

  return `${hour}:${minute}`;
}

export default function CreateExperienceScreen() {
  const [title, setTitle] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');

  const [maxParticipants, setMaxParticipants] = useState('10');
  const [budgetAmount, setBudgetAmount] = useState('');

  const [saving, setSaving] = useState(false);

  const isoDate = buildIsoDate(day, month, year);
  const cleanTime = buildTime(hour, minute);
  const needsBudget = category === 'Gita' || category === 'Vacanza';
  const cleanMaxParticipants = Number(maxParticipants || '0');
  const cleanBudgetAmount = budgetAmount ? Number(budgetAmount) : null;
  const maxParticipantsIsValid =
    Number.isInteger(cleanMaxParticipants) &&
    cleanMaxParticipants >= 1 &&
    cleanMaxParticipants <= 99;
  const budgetIsValid =
    !needsBudget ||
    (
      cleanBudgetAmount !== null &&
      Number.isInteger(cleanBudgetAmount) &&
      cleanBudgetAmount >= 0 &&
      cleanBudgetAmount <= 9999
    );

  const canCreateExperience =
    title.trim().length > 0 &&
    province.trim().length > 0 &&
    city.trim().length > 0 &&
    meetingPlace.trim().length > 0 &&
    description.trim().length > 0 &&
    category.trim().length > 0 &&
    Boolean(isoDate) &&
    Boolean(cleanTime) &&
    maxParticipantsIsValid &&
    budgetIsValid &&
    !saving;

  async function handleCreateExperience() {
    if (!canCreateExperience || saving) return;

    const cleanTitle = title.trim();
    const cleanProvince = province.trim();
    const cleanCity = city.trim();
    const cleanMeetingPlace = meetingPlace.trim();
    const cleanDescription = description.trim();
    const cleanCategory = category.trim();

    if (!isoDate || !cleanTime) {
      if (typeof window !== 'undefined') {
        window.alert('Controlla data e ora prima di creare l’esperienza.');
      }
      return;
    }

    setSaving(true);

    try {
      const authResult = await supabase.auth.getUser();
      const creatorId = authResult.data.user?.id;

      if (!creatorId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per creare un’esperienza.');
        }
        return;
      }

      const payload = {
        creator_id: creatorId,
        title: cleanTitle,
        category: cleanCategory.toLowerCase(),
        description: cleanDescription,
        city: cleanCity,
        province: cleanProvince,
        meeting_place: cleanMeetingPlace,
        activity_date: isoDate,
        activity_time: cleanTime,
        min_participants: 1,
        max_participants: cleanMaxParticipants,
        budget_amount: needsBudget ? cleanBudgetAmount : null,
        is_flash: false,
        expires_at: null,
        latitude: null,
        longitude: null,
      };

      const result = await supabase.from('activities').insert(payload).select('*').single();

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore creazione esperienza: ${result.error.message}`);
        }
        return;
      }

      setTitle('');
      setProvince('');
      setCity('');
      setMeetingPlace('');
      setDescription('');
      setCategory('');
      setDay('');
      setMonth('');
      setYear('');
      setHour('');
      setMinute('');
      setMaxParticipants('10');
      setBudgetAmount('');

      if (typeof window !== 'undefined') {
        window.alert('Esperienza creata correttamente.');
      }

      router.replace('/experiences');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Home</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.logoText}>Crea esperienza</Text>
          <Text style={styles.subtitle}>
            Proponi qualcosa da fare dal vivo e lascia che altre persone si uniscano.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>Nuova esperienza</Text>
          <Text style={styles.title}>Cosa vuoi organizzare?</Text>

          <Text style={styles.label}>Titolo esperienza</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Es. Aperitivo, museo, trekking..."
            placeholderTextColor="#b36a91"
            style={styles.input}
          />

          <Text style={styles.label}>Provincia</Text>
          <TextInput
            value={province}
            onChangeText={setProvince}
            placeholder="Es. Bergamo"
            placeholderTextColor="#b36a91"
            style={styles.input}
          />

          <Text style={styles.label}>Comune</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Es. Caprino Bergamasco"
            placeholderTextColor="#b36a91"
            style={styles.input}
          />

          <Text style={styles.label}>Punto di ritrovo</Text>
          <TextInput
            value={meetingPlace}
            onChangeText={setMeetingPlace}
            placeholder="Es. Piazza principale, ingresso bar, parcheggio..."
            placeholderTextColor="#b36a91"
            style={styles.input}
            maxLength={120}
          />

          <Text style={styles.label}>Descrizione esperienza</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Spiega cosa si farà, per chi è adatta e cosa portare."
            placeholderTextColor="#b36a91"
            style={[styles.input, styles.textArea]}
            multiline
            maxLength={500}
          />
          <Text style={styles.helperText}>
            Massimo 500 caratteri.
          </Text>

          <Text style={styles.label}>Data</Text>
          <Text style={styles.helperText}>Formato europeo: GG/MM/AAAA — esempio 26/06/2026</Text>

          <View style={styles.datePartsRow}>
            <TextInput
              value={day}
              onChangeText={(value) => setDay(onlyDigits(value, 2))}
              placeholder="GG"
              placeholderTextColor="#b36a91"
              style={styles.smallInput}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.separator}>/</Text>
            <TextInput
              value={month}
              onChangeText={(value) => setMonth(onlyDigits(value, 2))}
              placeholder="MM"
              placeholderTextColor="#b36a91"
              style={styles.smallInput}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.separator}>/</Text>
            <TextInput
              value={year}
              onChangeText={(value) => setYear(onlyDigits(value, 4))}
              placeholder="AAAA"
              placeholderTextColor="#b36a91"
              style={styles.yearInput}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>

          <Text style={styles.label}>Ora</Text>
          <Text style={styles.helperText}>Formato 24 ore: HH:MM — esempio 18:30</Text>

          <View style={styles.datePartsRow}>
            <TextInput
              value={hour}
              onChangeText={(value) => setHour(onlyDigits(value, 2))}
              placeholder="HH"
              placeholderTextColor="#b36a91"
              style={styles.smallInput}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.separator}>:</Text>
            <TextInput
              value={minute}
              onChangeText={(value) => setMinute(onlyDigits(value, 2))}
              placeholder="MM"
              placeholderTextColor="#b36a91"
              style={styles.smallInput}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>

          <Text style={styles.sectionTitle}>Categoria</Text>

          <View style={styles.categoryGrid}>
            {EXPERIENCE_CREATION_CATEGORIES.map((item) => (
              <Pressable
                key={item}
                style={[
                  styles.categoryButton,
                  category === item && styles.categoryButtonActive,
                ]}
                onPress={() => {
                  setCategory(item);
                  if (item !== 'Gita' && item !== 'Vacanza') {
                    setBudgetAmount('');
                  }
                }}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === item && styles.categoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Numero massimo partecipanti</Text>
          <TextInput
            value={maxParticipants}
            onChangeText={(value) => setMaxParticipants(onlyDigits(value, 2))}
            placeholder="Es. 10"
            placeholderTextColor="#b36a91"
            style={styles.input}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text style={styles.helperText}>
            Puoi inserire da 1 a 99 partecipanti.
          </Text>

          {needsBudget ? (
            <>
              <Text style={styles.label}>Budget indicativo €</Text>
              <TextInput
                value={budgetAmount}
                onChangeText={(value) => setBudgetAmount(onlyDigits(value, 4))}
                placeholder="Es. 50"
                placeholderTextColor="#b36a91"
                style={styles.input}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={styles.helperText}>
                Indica una spesa massima indicativa da 0 a 9999 €.
              </Text>
            </>
          ) : null}

          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Anteprima esperienza</Text>
            <Text style={styles.previewText}>
              {title.trim() || 'Titolo esperienza'}
            </Text>
            <Text style={styles.previewSmall}>
              {category || 'Categoria'} · {city.trim() || 'Comune'} · {province.trim() || 'Provincia'}
            </Text>
            <Text style={styles.previewSmall}>
              Ritrovo: {meetingPlace.trim() || 'Punto di ritrovo'}
            </Text>
            <Text style={styles.previewSmall}>
              {day || 'GG'}/{month || 'MM'}/{year || 'AAAA'} · {hour || 'HH'}:{minute || 'MM'}
            </Text>
            <Text style={styles.previewSmall}>
              Max {maxParticipants || '0'} partecipanti
              {needsBudget ? ` · Budget ${budgetAmount || '0'} €` : ''}
            </Text>
          </View>

          <Pressable
            style={[
              styles.mainButton,
              !canCreateExperience && styles.mainButtonDisabled,
            ]}
            onPress={handleCreateExperience}
            disabled={!canCreateExperience}
          >
            <Text style={styles.mainButtonText}>
              {saving
                ? 'Creazione in corso...'
                : canCreateExperience
                  ? 'Crea esperienza'
                  : 'Completa tutti i dati'}
            </Text>
          </Pressable>

          <Text style={styles.note}>
            Il pulsante si attiva solo quando data, ora e dati principali sono corretti.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 64,
    paddingBottom: 32,
    backgroundColor: '#fff8fb',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  backText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9b1f61',
  },
  header: {
    marginBottom: 18,
  },
  logoText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#e43f98',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#6b3652',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionEyebrow: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 18,
    letterSpacing: -0.4,
  },
  label: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9b1f61',
    marginBottom: 6,
  },
  helperText: {
    marginBottom: 8,
    color: '#b36a91',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#fff8fb',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#6b3652',
    marginBottom: 16,
    fontWeight: '600',
  },
  datePartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  smallInput: {
    width: 64,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#fff8fb',
    textAlign: 'center',
    fontSize: 16,
    color: '#6b3652',
    fontWeight: '900',
  },
  yearInput: {
    width: 92,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#fff8fb',
    textAlign: 'center',
    fontSize: 16,
    color: '#6b3652',
    fontWeight: '900',
  },
  separator: {
    fontSize: 22,
    fontWeight: '900',
    color: '#e43f98',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 18,
  },
  categoryButton: {
    borderRadius: 999,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  categoryButtonActive: {
    backgroundColor: '#e43f98',
    borderColor: '#e43f98',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9b1f61',
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
    paddingTop: 13,
  },
  previewBox: {
    borderRadius: 22,
    padding: 15,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 6,
  },
  previewText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#9b1f61',
    marginBottom: 4,
  },
  previewSmall: {
    fontSize: 13,
    color: '#6b3652',
    fontWeight: '700',
    marginTop: 2,
  },
  mainButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButtonDisabled: {
    opacity: 0.45,
  },
  mainButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  note: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: '#9b1f61',
    textAlign: 'center',
    fontWeight: '700',
  },
});
