import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EXPERIENCE_CREATION_CATEGORIES } from '../src/constants/experienceCategories';
import { ITALIAN_MUNICIPALITIES_BY_PROVINCE } from '../src/data/italianMunicipalities';
import { supabase } from '../src/lib/supabase';
import { sendBajujuPushNotification, buildExperienceNotificationTitle } from '../src/utils/bajujuNotifications';

const LOCATION_OPTIONS = [
  'Bergamo',
  'Milano',
  'Lecco',
  'Monza e Brianza',
  'Brescia',
  'Torino',
];

function categoryToDatabaseValue(value: string) {
  switch (value) {
    case 'Cena':
      return 'cena';
    case 'Aperitivo':
      return 'aperitivo';
    case 'Camminata':
      return 'passeggiata';
    case 'Sport':
      return 'sport';
    case 'Cultura':
      return 'evento';
    case 'Musica':
      return 'evento';
    case 'Cinema/Teatro':
      return 'cinema';
    case 'Gita':
      return 'gita';
    case 'Giochi':
      return 'evento';
    case 'Altro':
      return 'altro';
    default:
      return 'altro';
  }
}

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

async function geocodeAddress(address: string, streetNumber: string, city: string, province: string) {
  const cleanAddress = address.trim();
  const cleanStreetNumber = streetNumber.trim();
  const cleanCity = city.trim();
  const cleanProvince = province.trim();

  const addressAlreadyHasStreetNumber =
    cleanStreetNumber.length > 0 &&
    new RegExp(`\\b${cleanStreetNumber.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(cleanAddress);

  const fullAddress =
    cleanStreetNumber && !addressAlreadyHasStreetNumber ? `${cleanAddress} ${cleanStreetNumber}` : cleanAddress;

  const queries = [
    `${fullAddress}, ${cleanCity}, ${cleanProvince}`,
    `${fullAddress}, ${cleanCity}`,
    `${cleanAddress}, ${cleanCity}, ${cleanProvince}`,
    `${cleanAddress}, ${cleanCity}`,
    `${cleanCity}, ${cleanProvince}, Italia`,
    `${cleanCity}, Italia`,
  ];

  for (const query of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BajujuMobileApp/1.0',
        },
      });

      if (!response.ok) {
        console.log('Geocoding esperienza non riuscito:', response.status, query);
        continue;
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        console.log('Nessun risultato geocoding esperienza per:', query);
        continue;
      }

      const first = data[0];
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        console.log('Coordinate esperienza non valide per:', query);
        continue;
      }

      return { latitude, longitude };
    } catch (error) {
      console.log('Errore geocoding esperienza per:', query, error);
    }
  }

  return null;
}

export default function CreateExperienceScreen() {
  const [title, setTitle] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [openSelect, setOpenSelect] = useState<null | 'province' | 'city' | 'category'>(null);

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

  const provinceMunicipalities = useMemo(() => {
    return ITALIAN_MUNICIPALITIES_BY_PROVINCE[
      province.trim() as keyof typeof ITALIAN_MUNICIPALITIES_BY_PROVINCE
    ] ?? [];
  }, [province]);

  const provinceIsValid = LOCATION_OPTIONS.includes(province.trim());
  const cityIsValid = provinceMunicipalities.includes(city.trim() as never);

  const canCreateExperience =
    title.trim().length > 0 &&
    provinceIsValid &&
    cityIsValid &&
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
    const cleanStreetNumber = streetNumber.trim();
    const cleanDescription = description.trim();
    const cleanCategory = category.trim();
    const databaseCategory = categoryToDatabaseValue(cleanCategory);

    if (!cleanCity || !cleanMeetingPlace) {
      if (typeof window !== 'undefined') {
        window.alert('Compila provincia, comune e indirizzo.');
      }
      return;
    }

    if (!provinceMunicipalities.includes(cleanCity as never)) {
      if (typeof window !== 'undefined') {
        window.alert('Seleziona un comune valido dalla lista ufficiale.');
      }
      return;
    }

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

      const coordinates = await geocodeAddress(cleanMeetingPlace, cleanStreetNumber, cleanCity, cleanProvince);

      if (!coordinates) {
        if (typeof window !== 'undefined') {
          window.alert('Non sono riuscito a trovare nemmeno il centro del comune selezionato. Controlla il comune e riprova.');
        }
        return;
      }

      const addressAlreadyHasStreetNumber =
        cleanStreetNumber.length > 0 &&
        new RegExp(`\\b${cleanStreetNumber.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(cleanMeetingPlace);

      const finalMeetingPlace =
        cleanStreetNumber && !addressAlreadyHasStreetNumber
          ? `${cleanMeetingPlace} ${cleanStreetNumber}`
          : cleanMeetingPlace;

      const payload = {
        creator_id: creatorId,
        title: cleanTitle,
        category: databaseCategory,
        description: cleanDescription,
        province: cleanProvince,
        city: cleanCity,
        meeting_place: finalMeetingPlace,
        activity_date: isoDate,
        activity_time: cleanTime,
        min_participants: 1,
        max_participants: cleanMaxParticipants,
        budget_amount: needsBudget ? cleanBudgetAmount : null,
        is_flash: false,
        expires_at: null,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };

      const result = await supabase.from('activities').insert(payload).select('*').single();

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore creazione esperienza: ${result.error.message}`);
        }
        return;
      }

      await sendBajujuPushNotification({
        type: 'new_experience',
        actorUserId: creatorId,
        title: buildExperienceNotificationTitle(payload.title),
        body: `${payload.province}: qualcuno ha creato una nuova esperienza su Bajuju.`,
        province: payload.province,
        data: {
          screen: 'experience',
          activityId: result.data?.id,
          title: payload.title,
        },
      }).catch((error) => {
        console.log('Errore notifica nuova esperienza:', error);
      });

      setTitle('');
      setProvince('');
      setCity('');
      setMeetingPlace('');
      setStreetNumber('');
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
          <Text style={styles.logoText}>Bajuju</Text>
          <Text style={styles.brandClaim}>Dal Vivo è Meglio</Text>
          <View style={styles.headerLine} />

          <Text style={styles.pageTitle}>Crea esperienza</Text>
          <Text style={styles.subtitle}>
            Compila i dettagli essenziali e pubblica la tua esperienza.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Informazioni principali</Text>
            </View>

            <Text style={styles.label}>Titolo esperienza</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Titolo"
              placeholderTextColor="#9c7b8b"
              style={styles.input}
            />
          </View>

          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Dove si svolge</Text>
            </View>

            <Text style={styles.label}>Provincia</Text>
            <Pressable style={styles.selectButton} onPress={() => setOpenSelect('province')}>
              <Text style={[styles.selectButtonText, !province.trim() && styles.selectPlaceholder]}>
                {province.trim() || 'Seleziona provincia'}
              </Text>
              <Text style={styles.selectChevron}>⌄</Text>
            </Pressable>

            <Text style={styles.label}>Comune</Text>
            <Pressable
              style={[styles.selectButton, !provinceIsValid && styles.selectButtonDisabled]}
              onPress={() => {
                if (!provinceIsValid) {
                  if (typeof window !== 'undefined') {
                    window.alert('Scegli prima la provincia.');
                  }
                  return;
                }
                setOpenSelect('city');
              }}
            >
              <Text style={[styles.selectButtonText, !cityIsValid && styles.selectPlaceholder]}>
                {cityIsValid ? city : 'Seleziona comune'}
              </Text>
              <Text style={styles.selectChevron}>⌄</Text>
            </Pressable>

            <View style={styles.twoColumnsRow}>
              <View style={styles.addressColumn}>
                <Text style={styles.label}>Indirizzo</Text>
                <TextInput
                  value={meetingPlace}
                  onChangeText={setMeetingPlace}
                  placeholder="Indirizzo"
                  placeholderTextColor="#9c7b8b"
                  style={styles.input}
                  maxLength={100}
                />
              </View>

              <View style={styles.streetNumberColumn}>
                <Text style={styles.label}>N. civico</Text>
                <TextInput
                  value={streetNumber}
                  onChangeText={(value) => setStreetNumber(value.replace(/[^0-9a-zA-Z\/\-]/g, '').slice(0, 8))}
                  placeholder="12"
                  placeholderTextColor="#9c7b8b"
                  style={styles.input}
                  maxLength={8}
                />
              </View>
            </View>

            <Text style={styles.helperText}>
              L’indirizzo serve solo per posizionare correttamente l’esperienza sulla mappa.
              Se l’indirizzo inserito non viene trovato correttamente, verrà utilizzato il centro del comune selezionato.
            </Text>
          </View>

          <View style={[styles.formSection, styles.whenSection]}>
            <View style={styles.compactSectionHeaderRow}>
              <Text style={styles.sectionTitle}>Quando</Text>
            </View>

            <View style={styles.dateTimeRow}>
              <View style={styles.dateColumn}>
                <Text style={styles.compactLabel}>Data</Text>
                <View style={styles.compactDatePartsRow}>
                  <TextInput
                    value={day}
                    onChangeText={(value) => setDay(onlyDigits(value, 2))}
                    placeholder="GG"
                    placeholderTextColor="#9c7b8b"
                    style={[styles.smallInput, styles.compactSmallInput]}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.separator}>/</Text>
                  <TextInput
                    value={month}
                    onChangeText={(value) => setMonth(onlyDigits(value, 2))}
                    placeholder="MM"
                    placeholderTextColor="#9c7b8b"
                    style={[styles.smallInput, styles.compactSmallInput]}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.separator}>/</Text>
                  <TextInput
                    value={year}
                    onChangeText={(value) => setYear(onlyDigits(value, 4))}
                    placeholder="AAAA"
                    placeholderTextColor="#9c7b8b"
                    style={[styles.yearInput, styles.compactYearInput]}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              </View>

              <View style={styles.timeColumn}>
                <Text style={styles.compactLabel}>Ora</Text>
                <View style={styles.compactDatePartsRow}>
                  <TextInput
                    value={hour}
                    onChangeText={(value) => setHour(onlyDigits(value, 2))}
                    placeholder="HH"
                    placeholderTextColor="#9c7b8b"
                    style={[styles.smallInput, styles.compactSmallInput]}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.separator}>:</Text>
                  <TextInput
                    value={minute}
                    onChangeText={(value) => setMinute(onlyDigits(value, 2))}
                    placeholder="MM"
                    placeholderTextColor="#9c7b8b"
                    style={[styles.smallInput, styles.compactSmallInput]}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Dettagli</Text>
            </View>

            <Text style={styles.label}>Categoria</Text>
            <Pressable style={styles.selectButton} onPress={() => setOpenSelect('category')}>
              <Text style={[styles.selectButtonText, !category.trim() && styles.selectPlaceholder]}>
                {category.trim() || 'Seleziona categoria'}
              </Text>
              <Text style={styles.selectChevron}>⌄</Text>
            </Pressable>

            <View style={styles.compactDetailsRow}>
              <View style={styles.participantsColumn}>
                <Text style={styles.label}>Partecipanti</Text>
                <TextInput
                  value={maxParticipants}
                  onChangeText={(value) => setMaxParticipants(onlyDigits(value, 2))}
                  placeholder="10"
                  placeholderTextColor="#9c7b8b"
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              {needsBudget ? (
                <View style={styles.budgetColumn}>
                  <Text style={styles.label}>Budget €</Text>
                  <TextInput
                    value={budgetAmount}
                    onChangeText={(value) => setBudgetAmount(onlyDigits(value, 4))}
                    placeholder="50"
                    placeholderTextColor="#9c7b8b"
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              ) : null}
            </View>

            <Text style={styles.label}>Descrizione</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Descrivi la tua esperienza..."
              placeholderTextColor="#9c7b8b"
              style={[styles.input, styles.textArea, styles.compactTextArea]}
              multiline
              maxLength={500}
            />
          </View>

          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Come apparirà la tua esperienza</Text>
            <Text style={styles.previewText}>
              {title.trim() || 'Titolo esperienza'}
            </Text>
            <Text style={styles.previewSmall}>
              {category || 'Categoria'} · {province.trim() || 'Provincia'}
            </Text>
            <Text style={styles.previewSmall}>
              Ritrovo: {meetingPlace.trim() || 'Nome punto di ritrovo'}
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
            Completa tutti i dati richiesti: poi potrai pubblicare la tua esperienza.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={openSelect !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenSelect(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpenSelect(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {openSelect === 'province'
                ? 'Seleziona provincia'
                : openSelect === 'city'
                  ? 'Seleziona comune'
                  : 'Seleziona categoria'}
            </Text>

            <ScrollView style={styles.modalOptions} contentContainerStyle={styles.modalOptionsContent}>
              {(openSelect === 'province'
                ? LOCATION_OPTIONS
                : openSelect === 'city'
                  ? provinceMunicipalities
                  : EXPERIENCE_CREATION_CATEGORIES
              ).map((item) => {
                const isSelected =
                  openSelect === 'province' ? province === item : openSelect === 'city' ? city === item : category === item;

                return (
                  <Pressable
                    key={item}
                    style={[styles.modalOption, isSelected && styles.modalOptionActive]}
                    onPress={() => {
                      if (openSelect === 'province') {
                        setProvince(item);
                        setCity('');
                      } else if (openSelect === 'city') {
                        setCity(item);
                      } else {
                        setCategory(item);
                        if (item !== 'Gita' && item !== 'Vacanza') {
                          setBudgetAmount('');
                        }
                      }
                      setOpenSelect(null);
                    }}
                  >
                    <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]}>
                      {item}
                    </Text>
                    {isSelected ? <Text style={styles.modalCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable style={styles.modalCloseButton} onPress={() => setOpenSelect(null)}>
              <Text style={styles.modalCloseText}>Chiudi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  compactDetailsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  participantsColumn: {
    width: 132,
  },
  budgetColumn: {
    width: 132,
  },
  compactTextArea: {
    minHeight: 72,
    paddingTop: 10,
  },
  selectButton: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f2c8db',
    backgroundColor: '#fff8fb',
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    color: '#331426',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  selectPlaceholder: {
    color: '#9c7b8b',
    fontWeight: '700',
  },
  selectChevron: {
    color: '#ef2d82',
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(51, 20, 38, 0.34)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalSheet: {
    maxHeight: '72%',
    backgroundColor: '#fff8fb',
    borderRadius: 28,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f6d7e4',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#f1bfd4',
    marginBottom: 14,
  },
  modalTitle: {
    color: '#331426',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 10,
  },
  modalOptions: {
    maxHeight: 360,
  },
  modalOptionsContent: {
    paddingBottom: 8,
    gap: 8,
  },
  modalOption: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f5d4e2',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOptionActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#ef2d82',
  },
  modalOptionText: {
    color: '#331426',
    fontSize: 15,
    fontWeight: '800',
  },
  modalOptionTextActive: {
    color: '#ffffff',
  },
  modalCheck: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  modalCloseButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f2c8db',
  },
  modalCloseText: {
    color: '#ef2d82',
    fontSize: 15,
    fontWeight: '900',
  },
  brandClaim: {
    color: '#ef2d82',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -2,
  },
  headerLine: {
    height: 1,
    backgroundColor: '#f8cadd',
    marginTop: 18,
    marginBottom: 22,
    opacity: 0.9,
  },
  pageTitle: {
    color: '#331426',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  formSection: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#f6d7e4',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#8b2d5a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  sectionHeaderRow: {
    marginBottom: 10,
  },
  twoColumnsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  addressColumn: {
    flex: 1,
  },
  selectButtonDisabled: {
    opacity: 0.6,
  },
  streetNumberColumn: {
    width: 104,
  },
  whenSection: {
    paddingVertical: 12,
    marginBottom: 10,
  },
  compactSectionHeaderRow: {
    marginBottom: 10,
  },
  compactLabel: {
    color: '#6f3855',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  dateColumn: {
    flex: 1,
    minWidth: 0,
  },
  timeColumn: {
    width: 112,
  },
  compactDatePartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactSmallInput: {
    width: 38,
    minHeight: 46,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  compactYearInput: {
    width: 64,
    minHeight: 46,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#fffafd',
  },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 44,
    paddingBottom: 32,
    backgroundColor: '#fffafd',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#fffafd',
    borderWidth: 1,
    borderColor: '#f2a8cc',
  },
  backText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8f1658',
  },
  header: {
    marginBottom: 14,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#e43f98',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#4c1835',
  },
  card: {
    width: '100%',
    borderRadius: 34,
    padding: 16,
    backgroundColor: '#fffafd',
    borderWidth: 1,
    borderColor: '#f2a8cc',
    shadowColor: '#e43f98',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: '900',
    color: '#8f1658',
    marginBottom: 6,
  },
  helperText: {
    marginBottom: 8,
    color: '#a95d86',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f2a8cc',
    backgroundColor: '#fffafd',
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#4c1835',
    marginBottom: 10,
    fontWeight: '800',
  },
  datePartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  smallInput: {
    width: 64,
    height: 58,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f2a8cc',
    backgroundColor: '#fffafd',
    textAlign: 'center',
    fontSize: 18,
    color: '#4c1835',
    fontWeight: '900',
  },
  yearInput: {
    width: 92,
    height: 58,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f2a8cc',
    backgroundColor: '#fffafd',
    textAlign: 'center',
    fontSize: 18,
    color: '#4c1835',
    fontWeight: '900',
  },
  separator: {
    fontSize: 22,
    fontWeight: '900',
    color: '#e43f98',
  },
  sectionTitle: {
    color: '#331426',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
    paddingTop: 13,
  },
  previewBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f6d7e4',
    marginTop: 4,
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
    color: '#8f1658',
    marginBottom: 4,
  },
  previewSmall: {
    fontSize: 13,
    color: '#4c1835',
    fontWeight: '700',
    marginTop: 2,
  },
  mainButton: {
    backgroundColor: '#ef2d82',
    borderRadius: 999,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  mainButtonDisabled: {
    opacity: 0.45,
  },
  mainButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  note: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: '#8f1658',
    textAlign: 'center',
    fontWeight: '700',
  },

});
