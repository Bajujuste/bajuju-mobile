import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AddressAutocompleteField } from '../src/components/AddressAutocompleteField';
import { BajujuBottomNav } from '../src/components/navigation/BajujuBottomNav';
import { EXPERIENCE_CREATION_CATEGORIES } from '../src/constants/experienceCategories';
import type { ResolvedAddress } from '../src/lib/addressAutocomplete';
import { supabase } from '../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../src/theme/bajujuTheme';
import { trackBajujuEvent } from '../src/utils/bajujuAnalytics';
import { sendBajujuPushNotification, buildExperienceNotificationTitle } from '../src/utils/bajujuNotifications';

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
      return 'cultura';
    case 'Musica':
      return 'musica';
    case 'Cinema/Teatro':
      return 'cinema';
    case 'Gita':
      return 'gita';
    case 'Giochi':
      return 'giochi';
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

export default function CreateExperienceScreen() {
  const [title, setTitle] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [categorySelectOpen, setCategorySelectOpen] = useState(false);

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState('10');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isoDate = buildIsoDate(day, month, year);
  const cleanTime = buildTime(hour, minute);

  const datePickerValue = isoDate
    ? new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0)
    : new Date();

  const timePickerValue = new Date();
  timePickerValue.setHours(
    cleanTime ? Number(hour) : 12,
    cleanTime ? Number(minute) : 0,
    0,
    0
  );

  const formattedSelectedDate = isoDate
    ? `${day}/${month}/${year}`
    : 'Seleziona la data';

  const formattedSelectedTime = cleanTime
    ? `${hour}:${minute}`
    : 'Seleziona l’orario';

  const needsBudget = category === 'Gita';
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
    resolvedAddress !== null &&
    description.trim().length > 0 &&
    category.trim().length > 0 &&
    Boolean(isoDate) &&
    Boolean(cleanTime) &&
    maxParticipantsIsValid &&
    budgetIsValid &&
    !saving;

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (event.type === 'dismissed' || selectedDate === undefined) return;

    setDay(String(selectedDate.getDate()).padStart(2, '0'));
    setMonth(String(selectedDate.getMonth() + 1).padStart(2, '0'));
    setYear(String(selectedDate.getFullYear()));
  }

  function handleTimeChange(event: DateTimePickerEvent, selectedTime?: Date) {
    setShowTimePicker(false);
    if (event.type === 'dismissed' || selectedTime === undefined) return;

    const selectedHour = selectedTime.getHours();
    const selectedMinute = selectedTime.getMinutes() >= 30 ? 30 : 0;

    setHour(String(selectedHour).padStart(2, '0'));
    setMinute(String(selectedMinute).padStart(2, '0'));
  }

  async function handlePickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        if (typeof window !== 'undefined') {
          window.alert('Autorizza l’accesso alle immagini per scegliere la foto dell’esperienza.');
        }
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
      const message =
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a preparare la foto selezionata.';

      if (typeof window !== 'undefined') window.alert(message);
    }
  }

  async function handleCreateExperience() {
    if (!canCreateExperience || saving) return;

    if (!resolvedAddress) {
      if (typeof window !== 'undefined') {
        window.alert('Seleziona un indirizzo completo dai suggerimenti.');
      }
      return;
    }

    if (!isoDate || !cleanTime) {
      if (typeof window !== 'undefined') {
        window.alert('Controlla data e ora prima di creare l’esperienza.');
      }
      return;
    }

    const cleanTitle = title.trim();
    const cleanProvince = province.trim();
    const cleanCity = city.trim();
    const cleanDescription = description.trim();
    const cleanCategory = category.trim();
    const databaseCategory = categoryToDatabaseValue(cleanCategory);

    setSaving(true);

    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;

      const creatorId = authResult.data.user?.id;
      if (!creatorId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per creare un’esperienza.');
        }
        return;
      }

      const finalMeetingPlace = `${resolvedAddress.street} ${resolvedAddress.streetNumber || ''}`.trim();

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
        latitude: resolvedAddress.latitude,
        longitude: resolvedAddress.longitude,
      };

      const result = await supabase.from('activities').insert(payload).select('*').single();

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore creazione esperienza: ${result.error.message}`);
        }
        return;
      }

      void trackBajujuEvent('experience_created', {
        activityId: result.data?.id,
        category: databaseCategory,
        province: cleanProvince,
        city: cleanCity,
      });

      let photoUploadWarning = '';

      if (photoUri && result.data?.id) {
        try {
          const photoResponse = await fetch(photoUri);
          const photoBuffer = await photoResponse.arrayBuffer();
          const filePath = `${result.data.id}/${creatorId}-cover-${Date.now()}.jpg`;

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

          if (!publicUrl) throw new Error('URL pubblico della foto non disponibile.');

          const updateResult = await supabase
            .from('activities')
            .update({ photo_url: publicUrl })
            .eq('id', result.data.id);

          if (updateResult.error) throw updateResult.error;
        } catch (error: unknown) {
          photoUploadWarning =
            error instanceof Error
              ? error.message
              : 'La foto non è stata caricata correttamente.';
        }
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
      }).catch(() => {
        console.log('Errore notifica nuova esperienza.');
      });

      setTitle('');
      setProvince('');
      setCity('');
      setMeetingPlace('');
      setResolvedAddress(null);
      setDescription('');
      setCategory('');
      setDay('');
      setMonth('');
      setYear('');
      setHour('');
      setMinute('');
      setMaxParticipants('10');
      setBudgetAmount('');
      setPhotoUri(null);

      if (typeof window !== 'undefined') {
        window.alert(
          photoUploadWarning
            ? `Esperienza creata correttamente, ma la foto non è stata caricata: ${photoUploadWarning}`
            : 'Esperienza creata correttamente.'
        );
      }

      router.replace('/experiences');
    } catch (error: unknown) {
      console.log('Errore creazione esperienza.');
      const message =
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a creare l’esperienza. Riprova tra poco.';
      if (typeof window !== 'undefined') window.alert(message);
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
          <View style={[styles.headerBlob, styles.headerBlobTop]} />
          <View style={[styles.headerBlob, styles.headerBlobBottom]} />
          <Text style={[styles.headerDoodle, styles.headerDoodleLeft]}>‹‹</Text>
          <Text style={[styles.headerDoodle, styles.headerDoodleRight]}>✦</Text>
          <Text style={styles.pageTitle}>
            <Text style={styles.headerTitlePlum}>Crea </Text>
            <Text style={styles.headerTitlePink}>esperienza</Text>
          </Text>
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

            <AddressAutocompleteField
              value={meetingPlace}
              resolvedAddress={resolvedAddress}
              onValueChange={setMeetingPlace}
              onResolvedAddressChange={(address) => {
                setResolvedAddress(address);
                setProvince(address?.province ?? '');
                setCity(address?.city ?? '');
              }}
              disabled={saving}
            />

            <Text style={styles.helperText}>
              Inizia a scrivere l’indirizzo e seleziona quello corretto dai suggerimenti. Vale per tutta Italia.
            </Text>
          </View>

          <View style={[styles.formSection, styles.whenSection]}>
            <View style={styles.compactSectionHeaderRow}>
              <Text style={styles.sectionTitle}>Quando e dettagli</Text>
            </View>

            <View style={styles.dateTimeRow}>
              <View style={styles.dateColumn}>
                <Text style={styles.compactLabel}>Data</Text>
                <Pressable
                  style={styles.dateTimePickerButton}
                  onPress={() => {
                    setShowTimePicker(false);
                    setShowDatePicker(true);
                  }}
                >
                  <Text style={[styles.dateTimePickerButtonText, isoDate ? null : styles.dateTimePickerPlaceholder]}>
                    {formattedSelectedDate}
                  </Text>
                  <Text style={styles.dateTimePickerIcon}>▣</Text>
                </Pressable>
              </View>

              <View style={styles.timeColumn}>
                <Text style={styles.compactLabel}>Ora</Text>
                <Pressable
                  style={styles.dateTimePickerButton}
                  onPress={() => {
                    setShowDatePicker(false);
                    setShowTimePicker(true);
                  }}
                >
                  <Text style={[styles.dateTimePickerButtonText, cleanTime ? null : styles.dateTimePickerPlaceholder]}>
                    {formattedSelectedTime}
                  </Text>
                  <Text style={styles.dateTimePickerIcon}>◷</Text>
                </Pressable>
              </View>
            </View>

            {showDatePicker ? (
              <DateTimePicker
                value={datePickerValue}
                mode="date"
                display="calendar"
                onChange={handleDateChange}
              />
            ) : null}

            {showTimePicker ? (
              <DateTimePicker
                value={timePickerValue}
                mode="time"
                display="spinner"
                minuteInterval={30}
                is24Hour
                onChange={handleTimeChange}
              />
            ) : null}
          </View>

          <View style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Categoria e partecipanti</Text>
            </View>

            <Text style={styles.label}>Categoria</Text>
            <Pressable style={styles.selectButton} onPress={() => setCategorySelectOpen(true)}>
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

            <Text style={styles.label}>Foto esperienza</Text>
            <Pressable style={styles.photoPicker} onPress={handlePickPhoto}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderTitle}>Aggiungi una foto</Text>
                  <Text style={styles.photoPlaceholderText}>Formato panoramico 16:9</Text>
                </View>
              )}
            </Pressable>

            {photoUri ? (
              <View style={styles.photoActions}>
                <Pressable style={styles.photoActionButton} onPress={handlePickPhoto}>
                  <Text style={styles.photoActionText}>Sostituisci</Text>
                </Pressable>
                <Pressable style={styles.photoActionButton} onPress={() => setPhotoUri(null)}>
                  <Text style={styles.photoRemoveText}>Rimuovi</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.photoHelper}>Facoltativa. La foto viene adattata automaticamente.</Text>
            )}
          </View>

          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Come apparirà la tua esperienza</Text>
            <Text style={styles.previewText}>{title.trim() || 'Titolo esperienza'}</Text>
            <Text style={styles.previewSmall}>
              {category || 'Categoria'} · {city.trim() || 'Comune'} ({province.trim() || 'Provincia'})
            </Text>
            <Text style={styles.previewSmall}>Ritrovo: {meetingPlace.trim() || 'Indirizzo'}</Text>
            <Text style={styles.previewSmall}>
              {day || 'GG'}/{month || 'MM'}/{year || 'AAAA'} · {hour || 'HH'}:{minute || 'MM'}
            </Text>
            <Text style={styles.previewSmall}>
              Max {maxParticipants || '0'} partecipanti
              {needsBudget ? ` · Budget ${budgetAmount || '0'} €` : ''}
            </Text>
          </View>

          <Pressable
            style={[styles.mainButton, !canCreateExperience && styles.mainButtonDisabled]}
            onPress={handleCreateExperience}
            disabled={!canCreateExperience}
          >
            <Text style={styles.mainButtonText}>
              {saving ? 'Creazione in corso...' : canCreateExperience ? 'Crea esperienza' : 'Completa tutti i dati'}
            </Text>
          </Pressable>

          <Text style={styles.note}>
            Completa tutti i dati richiesti: poi potrai pubblicare la tua esperienza.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={categorySelectOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategorySelectOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCategorySelectOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Seleziona categoria</Text>

            <ScrollView style={styles.modalOptions} contentContainerStyle={styles.modalOptionsContent}>
              {EXPERIENCE_CREATION_CATEGORIES.map((item) => {
                const isSelected = category === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.modalOption, isSelected && styles.modalOptionActive]}
                    onPress={() => {
                      setCategory(item);
                      if (item !== 'Gita') setBudgetAmount('');
                      setCategorySelectOpen(false);
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

            <Pressable style={styles.modalCloseButton} onPress={() => setCategorySelectOpen(false)}>
              <Text style={styles.modalCloseText}>Chiudi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <BajujuBottomNav active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BAJUJU_COLORS.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 190,
    backgroundColor: BAJUJU_COLORS.background,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 17,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#FFFFFFE8',
    ...BAJUJU_SHADOW,
  },
  backText: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 15,
  },
  header: {
    marginBottom: 18,
    minHeight: 186,
    paddingVertical: 28,
    paddingHorizontal: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#FFFFFFDC',
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    ...BAJUJU_SHADOW,
  },
  headerBlob: {
    position: 'absolute',
    width: 104,
    height: 76,
    borderRadius: 52,
    backgroundColor: BAJUJU_COLORS.palePink,
    opacity: 0.76,
  },
  headerBlobTop: {
    left: -27,
    top: -25,
    transform: [{ rotate: '-18deg' }],
  },
  headerBlobBottom: {
    right: -34,
    bottom: -28,
    transform: [{ rotate: '18deg' }],
  },
  headerDoodle: {
    position: 'absolute',
    zIndex: 2,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
  },
  headerDoodleLeft: {
    left: 28,
    top: 84,
    fontSize: 24,
    transform: [{ rotate: '-8deg' }],
  },
  headerDoodleRight: {
    right: 27,
    top: 24,
    fontSize: 23,
    transform: [{ rotate: '8deg' }],
  },
  pageTitle: {
    zIndex: 1,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  headerTitlePlum: { color: BAJUJU_COLORS.plum },
  headerTitlePink: { color: BAJUJU_COLORS.brightPink },
  subtitle: {
    zIndex: 1,
    marginTop: 7,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: { width: '100%', padding: 0, backgroundColor: 'transparent' },
  formSection: {
    padding: 19,
    marginBottom: 18,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#FFFCFE',
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  sectionHeaderRow: { marginBottom: 13 },
  compactSectionHeaderRow: { marginBottom: 13 },
  sectionTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  label: {
    marginBottom: 7,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  compactLabel: {
    marginBottom: 7,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  input: {
    minHeight: 56,
    marginBottom: 13,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.white,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
  },
  selectButton: {
    minHeight: 56,
    marginBottom: 13,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectButtonText: {
    flex: 1,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
  },
  selectPlaceholder: { color: BAJUJU_COLORS.muted },
  selectChevron: {
    marginLeft: 8,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
  },
  helperText: {
    marginBottom: 3,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  whenSection: { paddingVertical: 19 },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  dateColumn: { flex: 1, minWidth: 0 },
  timeColumn: { flex: 1, minWidth: 0 },
  dateTimePickerButton: {
    minHeight: 56,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 7,
  },
  dateTimePickerButtonText: {
    flex: 1,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
  },
  dateTimePickerPlaceholder: { color: BAJUJU_COLORS.muted },
  dateTimePickerIcon: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 17,
  },
  compactDetailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  participantsColumn: { width: 132 },
  budgetColumn: { width: 132 },
  textArea: {
    minHeight: 112,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  compactTextArea: { minHeight: 92 },
  photoPicker: {
    width: '100%',
    height: 176,
    marginTop: 2,
    marginBottom: 10,
    overflow: 'hidden',
    borderRadius: 23,
    borderWidth: 2,
    borderColor: '#F7A7CD',
    backgroundColor: BAJUJU_COLORS.palePink,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  photoPlaceholderTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 16,
  },
  photoPlaceholderText: {
    marginTop: 4,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 12,
  },
  photoActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  photoActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionText: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  photoRemoveText: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  photoHelper: {
    marginBottom: 12,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  previewBox: {
    marginTop: 2,
    padding: 16,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#F7A7CD',
    backgroundColor: BAJUJU_COLORS.palePink,
  },
  previewTitle: {
    marginBottom: 7,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 15,
  },
  previewText: {
    marginBottom: 4,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
  },
  previewSmall: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
  },
  mainButton: {
    minHeight: 54,
    marginTop: 16,
    borderRadius: 27,
    backgroundColor: BAJUJU_COLORS.brightPink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BAJUJU_COLORS.brightPink,
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 9 },
    elevation: 7,
  },
  mainButtonDisabled: { opacity: 0.45 },
  mainButtonText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 17,
  },
  note: {
    marginTop: 13,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(75, 12, 45, 0.34)',
  },
  modalSheet: {
    maxHeight: '72%',
    padding: 16,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.background,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    marginBottom: 14,
    borderRadius: 999,
    backgroundColor: BAJUJU_COLORS.line,
  },
  modalTitle: {
    marginBottom: 11,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 22,
  },
  modalOptions: { maxHeight: 360 },
  modalOptionsContent: { paddingBottom: 8, gap: 8 },
  modalOption: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOptionActive: {
    borderColor: BAJUJU_COLORS.brightPink,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  modalOptionText: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
  },
  modalOptionTextActive: { color: BAJUJU_COLORS.white },
  modalCheck: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
  },
  modalCloseButton: {
    minHeight: 46,
    marginTop: 12,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 15,
  },
});
