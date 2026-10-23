import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AddressAutocompleteField } from '../../src/components/AddressAutocompleteField';
import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { EXPERIENCE_CREATION_CATEGORIES } from '../../src/constants/experienceCategories';
import {
  BajujuGroupCard,
  loadOwnedBajujuGroups,
  notifyBajujuGroupsForExperience,
} from '../../src/lib/bajujuGroups';
import type { ResolvedAddress } from '../../src/lib/addressAutocomplete';
import {
  BajujuLocation,
  LOCATION_COLOR,
  LOCATION_COLOR_SOFT,
  loadBajujuLocation,
  loadPublicBajujuLocations,
  locationAddressLine,
} from '../../src/lib/bajujuLocations';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';
import { trackBajujuEvent } from '../../src/utils/bajujuAnalytics';
import { sendBajujuPushNotification } from '../../src/utils/bajujuNotifications';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';

function categoryToDatabaseValue(value: string) {
  switch (value) {
    case 'Cena': return 'cena';
    case 'Aperitivo': return 'aperitivo';
    case 'Camminata': return 'passeggiata';
    case 'Sport': return 'sport';
    case 'Cultura': return 'cultura';
    case 'Musica': return 'musica';
    case 'Cinema/Teatro': return 'cinema';
    case 'Gita': return 'gita';
    case 'Giochi': return 'giochi';
    case 'Altro': return 'altro';
    default: return 'altro';
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
  ) return null;

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

function resolvedAddressFromLocation(location: BajujuLocation): ResolvedAddress {
  return {
    placeId: '',
    formattedAddress: location.formattedAddress,
    shortFormattedAddress: location.formattedAddress,
    street: location.street,
    streetNumber: location.streetNumber,
    city: location.city,
    province: location.province || location.city,
    provinceCode: '',
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export default function CreateExperienceScreen() {
  const { pickPhoto, photoPickerModal } = useBajujuPhotoPicker();
  const params = useLocalSearchParams<{ locationId?: string }>();
  const initialLocationId = String(params.locationId || '').trim();
  const [selectedLocation, setSelectedLocation] = useState<BajujuLocation | null>(null);
  const [locationOptions, setLocationOptions] = useState<BajujuLocation[]>([]);
  const [locationSearch, setLocationSearch] = useState('');

  useEffect(() => {
    let active = true;
    void loadPublicBajujuLocations().then((rows) => {
      if (active) setLocationOptions(rows);
    });
    return () => { active = false; };
  }, []);

  // Da "Organizza un evento qui": il locale arriva già scelto.
  useEffect(() => {
    if (!initialLocationId) return;
    let active = true;
    void loadBajujuLocation(initialLocationId)
      .then((location) => {
        if (active && location) chooseLocation(location);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [initialLocationId]);

  function chooseLocation(location: BajujuLocation) {
    const address = resolvedAddressFromLocation(location);
    setSelectedLocation(location);
    setResolvedAddress(address);
    setMeetingPlace(`${location.name} · ${locationAddressLine(location)}`);
    setProvince(address.province);
    setCity(address.city);
    setLocationSearch('');
  }

  function clearLocation() {
    setSelectedLocation(null);
    setResolvedAddress(null);
    setMeetingPlace('');
    setProvince('');
    setCity('');
  }

  const locationMatches = locationSearch.trim().length >= 2
    ? locationOptions
        .filter((location) =>
          `${location.name} ${location.city} ${location.category}`
            .toLowerCase()
            .includes(locationSearch.trim().toLowerCase())
        )
        .slice(0, 5)
    : [];
  const [title, setTitle] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pendingDate, setPendingDate] = useState(() => new Date());
  const [pendingTime, setPendingTime] = useState(() => new Date());
  const [maxParticipants, setMaxParticipants] = useState('10');
  const [joinApprovalRequired, setJoinApprovalRequired] = useState(false);
  const [ageRestricted, setAgeRestricted] = useState(false);
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('80');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownedGroups, setOwnedGroups] = useState<BajujuGroupCard[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const authResult = await supabase.auth.getUser();
        if (authResult.error) throw authResult.error;
        const userId = authResult.data.user?.id;
        if (!userId) return;

        const groups = await loadOwnedBajujuGroups(userId);
        if (active) setOwnedGroups(groups);
      } catch (error) {
        console.log('Gruppi proprietario non caricati:', error);
        if (active) setOwnedGroups([]);
      }
    })();

    return () => { active = false; };
  }, []);

  const isoDate = buildIsoDate(day, month, year);
  const cleanTime = buildTime(hour, minute);
  const datePickerValue = isoDate
    ? new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0)
    : new Date();
  const timePickerValue = new Date();
  timePickerValue.setHours(cleanTime ? Number(hour) : 12, cleanTime ? Number(minute) : 0, 0, 0);

  const formattedSelectedDate = isoDate ? `${day}/${month}/${year}` : 'Scegli';
  const formattedSelectedTime = cleanTime ? `${hour}:${minute}` : 'Scegli';
  const needsBudget = category === 'Gita';
  const cleanMaxParticipants = Number(maxParticipants || '0');
  const cleanBudgetAmount = budgetAmount ? Number(budgetAmount) : null;
  const maxParticipantsIsValid = Number.isInteger(cleanMaxParticipants) && cleanMaxParticipants >= 1 && cleanMaxParticipants <= 99;
  const cleanMinAge = Number(minAge);
  const cleanMaxAge = Number(maxAge);
  const ageRangeIsValid =
    !ageRestricted ||
    (
      Number.isInteger(cleanMinAge) &&
      Number.isInteger(cleanMaxAge) &&
      cleanMinAge >= 18 &&
      cleanMaxAge <= 80 &&
      cleanMinAge <= cleanMaxAge
    );
  const budgetIsValid = !needsBudget || (
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
    ageRangeIsValid &&
    budgetIsValid &&
    photoUri !== null &&
    !saving;

  const missingFields = [
    !photoUri ? 'foto' : '',
    !title.trim() ? 'titolo' : '',
    !category.trim() ? 'categoria' : '',
    !description.trim() ? 'descrizione' : '',
    !resolvedAddress || !province.trim() || !city.trim() || !meetingPlace.trim() ? 'indirizzo' : '',
    !isoDate ? 'data' : '',
    !cleanTime ? 'ora' : '',
    !maxParticipantsIsValid ? 'posti' : '',
    !budgetIsValid ? 'budget' : '',
    !ageRangeIsValid ? 'età' : '',
  ].filter(Boolean);

  function applyDateSelection(selectedDate: Date) {
    setDay(String(selectedDate.getDate()).padStart(2, '0'));
    setMonth(String(selectedDate.getMonth() + 1).padStart(2, '0'));
    setYear(String(selectedDate.getFullYear()));
  }

  function applyTimeSelection(selectedTime: Date) {
    const selectedHour = selectedTime.getHours();
    const selectedMinute = selectedTime.getMinutes() >= 30 ? 30 : 0;
    setHour(String(selectedHour).padStart(2, '0'));
    setMinute(String(selectedMinute).padStart(2, '0'));
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'ios') {
      // iOS emits changes while the inline picker is open; don't unmount it mid-interaction.
      if (selectedDate) setPendingDate(selectedDate);
      return;
    }
    setShowDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    applyDateSelection(selectedDate);
  }

  function handleTimeChange(event: DateTimePickerEvent, selectedTime?: Date) {
    if (Platform.OS === 'ios') {
      if (selectedTime) setPendingTime(selectedTime);
      return;
    }
    setShowTimePicker(false);
    if (event.type === 'dismissed' || !selectedTime) return;
    applyTimeSelection(selectedTime);
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    );
  }

  function toggleAllGroups() {
    if (selectedGroupIds.length === ownedGroups.length) {
      setSelectedGroupIds([]);
      return;
    }
    setSelectedGroupIds(ownedGroups.map((group) => group.id));
  }

  async function handlePickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Foto esperienza', 'Autorizza l’accesso alle immagini per scegliere la foto dell’esperienza.');
        return;
      }

      const picked = await pickPhoto({ aspect: [16, 9], quality: 0.9 });
      if (!picked) return;

      const resized = await ImageManipulator.manipulateAsync(
        picked.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhotoUri(resized.uri);
    } catch (error: unknown) {
      Alert.alert(
        'Foto esperienza',
        error instanceof Error ? error.message : 'Non sono riuscito a preparare la foto selezionata.'
      );
    }
  }

  async function handleCreateExperience() {
    if (!canCreateExperience || saving) return;
    if (!photoUri) {
      Alert.alert('Foto esperienza', 'Aggiungi una foto per pubblicare l’esperienza.');
      return;
    }
    if (!resolvedAddress) {
      Alert.alert('Indirizzo', 'Seleziona un indirizzo completo dai suggerimenti.');
      return;
    }
    if (!isoDate || !cleanTime) {
      Alert.alert('Data e ora', 'Controlla data e ora prima di creare l’esperienza.');
      return;
    }

    const cleanTitle = title.trim();
    const cleanProvince = province.trim();
    const cleanCity = city.trim();
    const cleanDescription = description.trim();
    const databaseCategory = categoryToDatabaseValue(category.trim());

    setSaving(true);

    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;
      const creatorId = authResult.data.user?.id;
      if (!creatorId) {
        Alert.alert('Accesso richiesto', 'Devi essere collegato per creare un’esperienza.');
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
        join_approval_required: joinApprovalRequired,
        min_age: ageRestricted ? cleanMinAge : null,
        max_age: ageRestricted ? cleanMaxAge : null,
        budget_amount: needsBudget ? cleanBudgetAmount : null,
        is_flash: false,
        expires_at: null,
        latitude: resolvedAddress.latitude,
        longitude: resolvedAddress.longitude,
        ...(selectedLocation ? { location_owner_id: selectedLocation.ownerId } : {}),
      };

      const result = await supabase.from('activities').insert(payload).select('*').single();
      if (result.error) {
        Alert.alert('Errore creazione esperienza', result.error.message);
        return;
      }

      void trackBajujuEvent('experience_created', {
        activityId: result.data?.id,
        category: databaseCategory,
        province: cleanProvince,
        city: cleanCity,
        informedGroups: selectedGroupIds.length,
      });

      let photoUploadWarning = '';
      let groupNotificationWarning = '';

      if (photoUri && result.data?.id) {
        try {
          const photoResponse = await fetch(photoUri);
          const photoBuffer = await photoResponse.arrayBuffer();
          const filePath = `${result.data.id}/${creatorId}-cover-${Date.now()}.jpg`;

          const uploadResult = await supabase.storage
            .from('event-photos')
            .upload(filePath, photoBuffer, { contentType: 'image/jpeg', upsert: true });
          if (uploadResult.error) throw uploadResult.error;

          const publicUrl = supabase.storage.from('event-photos').getPublicUrl(filePath).data.publicUrl;
          if (!publicUrl) throw new Error('URL pubblico della foto non disponibile.');

          const updateResult = await supabase
            .from('activities')
            .update({ photo_url: publicUrl })
            .eq('id', result.data.id);
          if (updateResult.error) throw updateResult.error;
        } catch (error: unknown) {
          photoUploadWarning = error instanceof Error ? error.message : 'La foto non è stata caricata correttamente.';
        }
      }

      await sendBajujuPushNotification({
        type: 'new_experience',
        activityId: result.data?.id,
      }).catch(() => {
        console.log('Errore notifica geografica nuova esperienza.');
      });

      if (result.data?.id && selectedGroupIds.length > 0) {
        try {
          await notifyBajujuGroupsForExperience(String(result.data.id), selectedGroupIds);
        } catch (error: unknown) {
          groupNotificationWarning = error instanceof Error
            ? error.message
            : 'Non sono riuscito a informare i gruppi selezionati.';
        }
      }

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
      setJoinApprovalRequired(false);
      setAgeRestricted(false);
      setMinAge('18');
      setMaxAge('80');
      setBudgetAmount('');
      setPhotoUri(null);
      setSelectedGroupIds([]);
      setSelectedLocation(null);

      const warnings = [
        photoUploadWarning ? `Foto: ${photoUploadWarning}` : '',
        groupNotificationWarning ? `Gruppi: ${groupNotificationWarning}` : '',
      ].filter(Boolean);

      Alert.alert(
        'Esperienza creata',
        warnings.length > 0
          ? `L’esperienza è stata creata. ${warnings.join(' ')}`
          : selectedGroupIds.length > 0
            ? 'Esperienza creata e gruppi informati correttamente.'
            : 'Esperienza creata correttamente.'
      );

      router.replace('/experiences');
    } catch (error: unknown) {
      console.log('Errore creazione esperienza:', error);
      Alert.alert(
        'Errore',
        error instanceof Error ? error.message : 'Non sono riuscito a creare l’esperienza. Riprova tra poco.'
      );
    } finally {
      setSaving(false);
    }
  }

  function changeParticipants(delta: number) {
    const current = Number(maxParticipants || '0');
    const next = Math.min(99, Math.max(1, (Number.isInteger(current) ? current : 10) + delta));
    setMaxParticipants(String(next));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {photoPickerModal}
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            accessibilityRole="button"
            accessibilityLabel="Torna indietro"
          >
            <Ionicons name="arrow-back" size={22} color={BAJUJU_COLORS.plum} />
          </Pressable>
          <Text style={styles.title}>Nuova esperienza</Text>
          <BajujuProfileButton />
        </View>

        <Pressable
          style={[styles.coverBox, photoUri && styles.coverBoxFilled]}
          onPress={() => { void handlePickPhoto(); }}
          accessibilityRole="button"
          accessibilityLabel={photoUri ? 'Cambia foto' : 'Aggiungi una foto'}
        >
          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} style={styles.coverPreview} resizeMode="cover" />
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
              <Text style={styles.coverTitle}>Aggiungi una foto</Text>
              <Text style={styles.coverHint}>Obbligatoria · formato panoramico 16:9</Text>
            </>
          )}
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>L’esperienza</Text>

          <Text style={styles.label}>Titolo</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Es. Aperitivo sul lago"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.input}
          />

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.categoryGrid}>
            {EXPERIENCE_CREATION_CATEGORIES.map((item) => {
              const selected = category === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                  onPress={() => {
                    setCategory(item);
                    if (item !== 'Gita') setBudgetAmount('');
                  }}
                >
                  <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Descrizione</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Cosa farete, dove vi trovate, cosa portare..."
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={[styles.input, styles.textArea, styles.inputLast]}
            multiline
            maxLength={500}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dove e quando</Text>

          {selectedLocation ? (
            <>
              <Text style={styles.label}>Locale</Text>
              <View style={styles.locationChosen}>
                {selectedLocation.photos[0] ? (
                  <Image source={{ uri: selectedLocation.photos[0] }} style={styles.locationChosenPhoto} />
                ) : null}
                <View style={styles.locationChosenCopy}>
                  <Text style={styles.locationChosenName} numberOfLines={1}>{selectedLocation.name}</Text>
                  <Text style={styles.locationChosenMeta} numberOfLines={2}>{locationAddressLine(selectedLocation)}</Text>
                </View>
                <Pressable onPress={clearLocation} style={styles.locationChosenRemove} accessibilityLabel="Togli il locale">
                  <Ionicons name="close" size={18} color={LOCATION_COLOR} />
                </Pressable>
              </View>
              <Text style={styles.helper}>L’evento compare sulla pagina del locale e sulla mappa nel suo segnaposto.</Text>
            </>
          ) : (
            <>
              {locationOptions.length > 0 ? (
                <>
                  <Text style={styles.label}>Si svolge in un locale Bajuju? (facoltativo)</Text>
                  <TextInput
                    value={locationSearch}
                    onChangeText={setLocationSearch}
                    placeholder="Cerca il locale per nome"
                    placeholderTextColor={BAJUJU_COLORS.muted}
                    style={styles.input}
                  />
                  {locationMatches.map((location) => (
                    <Pressable key={location.ownerId} style={styles.locationOption} onPress={() => chooseLocation(location)}>
                      <Ionicons name="home-outline" size={18} color={LOCATION_COLOR} />
                      <View style={styles.locationChosenCopy}>
                        <Text style={styles.locationChosenName} numberOfLines={1}>{location.name}</Text>
                        <Text style={styles.locationChosenMeta} numberOfLines={1}>{location.category} · {location.city}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {locationSearch.trim().length >= 2 && locationMatches.length === 0 ? (
                    <Text style={styles.helper}>Nessun locale trovato: scrivi qui sotto l’indirizzo.</Text>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.label}>Indirizzo</Text>
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
              <Text style={styles.helper}>Scrivi l’indirizzo e scegli quello giusto dai suggerimenti.</Text>
            </>
          )}

          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeColumn}>
              <Text style={styles.label}>Data</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => {
                  setShowTimePicker(false);
                  setPendingDate(datePickerValue);
                  setShowDatePicker(true);
                }}
              >
                <Text style={[styles.pickerButtonText, !isoDate && styles.placeholder]}>{formattedSelectedDate}</Text>
                <Ionicons name="calendar-outline" size={18} color={BAJUJU_COLORS.pink} />
              </Pressable>
            </View>

            <View style={styles.dateTimeColumn}>
              <Text style={styles.label}>Ora</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => {
                  setShowDatePicker(false);
                  setPendingTime(timePickerValue);
                  setShowTimePicker(true);
                }}
              >
                <Text style={[styles.pickerButtonText, !cleanTime && styles.placeholder]}>{formattedSelectedTime}</Text>
                <Ionicons name="time-outline" size={18} color={BAJUJU_COLORS.pink} />
              </Pressable>
            </View>
          </View>

          {showDatePicker ? (
            Platform.OS === 'ios' ? (
              <View style={styles.iosPickerContainer}>
                <DateTimePicker
                  value={pendingDate}
                  mode="date"
                  display="inline"
                  onChange={handleDateChange}
                />
                <View style={styles.iosPickerActions}>
                  <Pressable onPress={() => setShowDatePicker(false)} style={styles.iosPickerAction}>
                    <Text style={styles.iosPickerCancelText}>Annulla</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      applyDateSelection(pendingDate);
                      setShowDatePicker(false);
                    }}
                    style={styles.iosPickerAction}
                  >
                    <Text style={styles.iosPickerConfirmText}>Conferma data</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <DateTimePicker value={datePickerValue} mode="date" display="calendar" onChange={handleDateChange} />
            )
          ) : null}
          {showTimePicker ? (
            Platform.OS === 'ios' ? (
              <View style={styles.iosPickerContainer}>
                <DateTimePicker
                  value={pendingTime}
                  mode="time"
                  display="spinner"
                  minuteInterval={30}
                  is24Hour
                  onChange={handleTimeChange}
                />
                <View style={styles.iosPickerActions}>
                  <Pressable onPress={() => setShowTimePicker(false)} style={styles.iosPickerAction}>
                    <Text style={styles.iosPickerCancelText}>Annulla</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      applyTimeSelection(pendingTime);
                      setShowTimePicker(false);
                    }}
                    style={styles.iosPickerAction}
                  >
                    <Text style={styles.iosPickerConfirmText}>Conferma ora</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <DateTimePicker
                value={timePickerValue}
                mode="time"
                display="spinner"
                minuteInterval={30}
                is24Hour
                positiveButton={{ label: 'OK', textColor: BAJUJU_COLORS.plum }}
                negativeButton={{ label: 'Annulla', textColor: BAJUJU_COLORS.plum }}
                onChange={handleTimeChange}
              />
            )
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Chi partecipa</Text>

          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeColumn}>
              <Text style={styles.label}>Posti</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepperButton}
                  onPress={() => changeParticipants(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Un posto in meno"
                >
                  <Ionicons name="remove" size={20} color={BAJUJU_COLORS.brightPink} />
                </Pressable>
                <TextInput
                  value={maxParticipants}
                  onChangeText={(value) => setMaxParticipants(onlyDigits(value, 2))}
                  style={styles.stepperValue}
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                />
                <Pressable
                  style={styles.stepperButton}
                  onPress={() => changeParticipants(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Un posto in più"
                >
                  <Ionicons name="add" size={20} color={BAJUJU_COLORS.brightPink} />
                </Pressable>
              </View>
            </View>

            {needsBudget ? (
              <View style={styles.dateTimeColumn}>
                <Text style={styles.label}>Budget €</Text>
                <TextInput
                  value={budgetAmount}
                  onChangeText={(value) => setBudgetAmount(onlyDigits(value, 4))}
                  placeholder="50"
                  placeholderTextColor={BAJUJU_COLORS.muted}
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            ) : null}
          </View>

          <Text style={styles.label}>Accesso</Text>
          <View style={styles.segment}>
            {[
              { value: false, label: 'Aperta a tutti' },
              { value: true, label: 'Su approvazione' },
            ].map((option) => {
              const selected = joinApprovalRequired === option.value;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                  onPress={() => setJoinApprovalRequired(option.value)}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Età</Text>
          <View style={[styles.segment, styles.segmentTight]}>
            {[
              { value: false, label: 'Tutte le età' },
              { value: true, label: 'Fascia d’età' },
            ].map((option) => {
              const selected = ageRestricted === option.value;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                  onPress={() => setAgeRestricted(option.value)}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {ageRestricted ? (
            <View style={styles.dateTimeRow}>
              <View style={styles.dateTimeColumn}>
                <Text style={styles.label}>Da</Text>
                <TextInput
                  value={minAge}
                  onChangeText={(value) => setMinAge(onlyDigits(value, 2))}
                  placeholder="18"
                  placeholderTextColor={BAJUJU_COLORS.muted}
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <View style={styles.dateTimeColumn}>
                <Text style={styles.label}>A</Text>
                <TextInput
                  value={maxAge}
                  onChangeText={(value) => setMaxAge(onlyDigits(value, 2))}
                  placeholder="80"
                  placeholderTextColor={BAJUJU_COLORS.muted}
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>
          ) : null}

          {ageRestricted && !ageRangeIsValid ? (
            <Text style={styles.ageError}>Inserisci una fascia valida da 18 a 80 anni.</Text>
          ) : null}

          <Text style={styles.helperLast}>
            {joinApprovalRequired
              ? 'Chi vuole partecipare invia una richiesta e decidi tu chi accettare.'
              : 'Chi tocca Partecipa entra subito, finché ci sono posti.'}
            {ageRestricted ? ' Solo chi è nella fascia d’età scelta può partecipare.' : ''}
          </Text>
        </View>

        {ownedGroups.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.groupsHeaderRow}>
              <View style={styles.groupsHeaderCopy}>
                <Text style={styles.cardTitle}>Informa i tuoi gruppi</Text>
                <Text style={styles.groupsHelper}>
                  Facoltativo. Gli iscritti dei gruppi scelti ricevono un solo avviso.
                </Text>
              </View>
              <Pressable onPress={toggleAllGroups} style={styles.selectAllButton}>
                <Text style={styles.selectAllText}>
                  {selectedGroupIds.length === ownedGroups.length ? 'Nessuno' : 'Tutti'}
                </Text>
              </Pressable>
            </View>

            {ownedGroups.map((group) => {
              const selected = selectedGroupIds.includes(group.id);
              return (
                <Pressable
                  key={group.id}
                  style={[styles.groupChoice, selected && styles.groupChoiceSelected]}
                  onPress={() => toggleGroup(group.id)}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    <Text style={styles.checkboxText}>{selected ? '✓' : ''}</Text>
                  </View>
                  <View style={styles.groupChoiceCopy}>
                    <Text style={styles.groupChoiceName}>{group.name}</Text>
                    <Text style={styles.groupChoiceMeta}>
                      {group.memberCount} {group.memberCount === 1 ? 'iscritto' : 'iscritti'}
                      {group.city ? ` · ${group.city}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          style={[styles.mainButton, !canCreateExperience && styles.disabled]}
          onPress={handleCreateExperience}
          disabled={!canCreateExperience}
        >
          <Text style={styles.mainButtonText}>{saving ? 'Pubblicazione...' : 'Pubblica esperienza'}</Text>
        </Pressable>

        {!saving && missingFields.length > 0 ? (
          <Text style={styles.missingText}>Mancano: {missingFields.join(', ')}</Text>
        ) : null}
      </KeyboardAwareScrollView>

      <BajujuBottomNav active="create" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 190, gap: 16 },
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
  inputLast: { marginBottom: 0 },
  textArea: { minHeight: 92, maxHeight: 220, paddingTop: 12, textAlignVertical: 'top' },
  helper: { marginTop: 2, marginBottom: 12, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  helperLast: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  categoryChip: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', justifyContent: 'center' },
  categoryChipSelected: { borderColor: BAJUJU_COLORS.pink, backgroundColor: BAJUJU_COLORS.pink },
  categoryChipText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  categoryChipTextSelected: { color: '#fff', fontFamily: BAJUJU_FONTS.semiBold },
  dateTimeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dateTimeColumn: { flex: 1, minWidth: 0 },
  pickerButton: {
    minHeight: 50,
    marginBottom: 2,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  pickerButtonText: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  placeholder: { color: BAJUJU_COLORS.muted },
  iosPickerContainer: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  iosPickerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iosPickerAction: { paddingVertical: 9, paddingHorizontal: 10 },
  iosPickerCancelText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  iosPickerConfirmText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  stepper: {
    minHeight: 50,
    marginBottom: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.softPink },
  stepperValue: { flex: 1, minHeight: 44, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, marginBottom: 14, borderRadius: 999, backgroundColor: BAJUJU_COLORS.softPink },
  segmentTight: { marginBottom: 12 },
  segmentButton: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentButtonSelected: { backgroundColor: '#fff', ...BAJUJU_SHADOW, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  segmentTextSelected: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold },
  ageError: { marginTop: -4, marginBottom: 10, color: '#b42318', fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  groupsHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  groupsHeaderCopy: { flex: 1 },
  groupsHelper: { marginTop: -4, marginBottom: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  selectAllButton: { minHeight: 37, paddingHorizontal: 13, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  selectAllText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 12 },
  groupChoice: {
    minHeight: 64,
    marginTop: 9,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupChoiceSelected: { borderColor: BAJUJU_COLORS.brightPink, backgroundColor: BAJUJU_COLORS.softPink },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: BAJUJU_COLORS.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxSelected: { borderColor: BAJUJU_COLORS.brightPink, backgroundColor: BAJUJU_COLORS.brightPink },
  checkboxText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  groupChoiceCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  groupChoiceName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  groupChoiceMeta: { marginTop: 3, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 11 },
  locationChosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D9C2F2',
    backgroundColor: LOCATION_COLOR_SOFT,
  },
  locationChosenPhoto: { width: 48, height: 48, borderRadius: 12 },
  locationChosenCopy: { flex: 1, minWidth: 0 },
  locationChosenName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  locationChosenMeta: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  locationChosenRemove: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    marginTop: -4,
    marginBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D9C2F2',
    backgroundColor: '#fff',
  },
  mainButton: { minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.pink },
  mainButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  disabled: { opacity: 0.45 },
  missingText: { marginTop: -6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
