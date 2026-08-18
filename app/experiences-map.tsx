import { router } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import BajujuMap, { BajujuMapItem } from '../components/BajujuMap';
import { BajujuBottomNav } from '@/src/components/navigation/BajujuBottomNav';
import { EXPERIENCE_CATEGORIES, getExperienceCategoryIcon, normalizeExperienceCategory } from '@/src/constants/experienceCategories';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '@/src/theme/bajujuTheme';
import { supabase } from '../src/lib/supabase';

const PROVINCE_REGIONS = {
  Bergamo: {
    latitude: 45.6983,
    longitude: 9.6773,
    latitudeDelta: 0.42,
    longitudeDelta: 0.52,
  },
  Milano: {
    latitude: 45.4642,
    longitude: 9.19,
    latitudeDelta: 0.46,
    longitudeDelta: 0.58,
  },
  Lecco: {
    latitude: 45.8566,
    longitude: 9.3977,
    latitudeDelta: 0.38,
    longitudeDelta: 0.48,
  },
  'Monza e Brianza': {
    latitude: 45.5845,
    longitude: 9.2744,
    latitudeDelta: 0.34,
    longitudeDelta: 0.44,
  },
  Verona: {
    latitude: 45.4384,
    longitude: 10.9916,
    latitudeDelta: 0.48,
    longitudeDelta: 0.58,
  },
} as const;

const PROVINCE_OPTIONS = ['Tutte', 'Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Verona'] as const;
const WHEN_OPTIONS = ['Tutte', 'Oggi', 'Domani', 'Questo weekend', 'Prossimi 7 giorni'] as const;

type ActivityRow = Record<string, any>;

type Coordinates = {
  latitude: number;
  longitude: number;
};

function firstValue(row: ActivityRow, keys: string[], fallback: any = '') {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return fallback;
}

function cleanText(value: any, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).trim() || fallback;
}

function activityId(row: ActivityRow) {
  return String(firstValue(row, ['id', 'activity_id'], ''));
}

function activityTitle(row: ActivityRow) {
  return cleanText(firstValue(row, ['title', 'titolo', 'name', 'nome', 'activity_title'], ''), 'Esperienza Bajuju');
}

function getCategory(row: ActivityRow) {
  return cleanText(firstValue(row, ['category', 'categoria'], ''), 'altro');
}

function getMapCategoryIcon(category: string) {
  const value = normalizeExperienceCategory(category).toLowerCase();

  if (
    value.includes('sport') ||
    value.includes('calcetto') ||
    value.includes('calcio') ||
    value.includes('palestra') ||
    value.includes('tennis') ||
    value.includes('padel')
  ) {
    return '⚽';
  }

  if (
    value.includes('cena') ||
    value.includes('aperitivo') ||
    value.includes('pizza') ||
    value.includes('ristorante') ||
    value.includes('food')
  ) {
    return '🍽';
  }

  if (
    value.includes('camminata') ||
    value.includes('trekking') ||
    value.includes('gita') ||
    value.includes('passeggiata')
  ) {
    return '🥾';
  }

  if (
    value.includes('musica') ||
    value.includes('concerto') ||
    value.includes('live')
  ) {
    return '♪';
  }

  if (
    value.includes('cinema') ||
    value.includes('film')
  ) {
    return '▶';
  }

  if (
    value.includes('cultura') ||
    value.includes('museo') ||
    value.includes('mostra')
  ) {
    return '★';
  }

  if (
    value.includes('viaggio') ||
    value.includes('vacanza')
  ) {
    return '✈';
  }

  return '✨';
}

function getCity(row: ActivityRow) {
  return cleanText(firstValue(row, ['city', 'citta', 'comune', 'location_city'], ''), 'Comune non indicato');
}

function getProvince(row: ActivityRow) {
  return cleanText(firstValue(row, ['province', 'provincia', 'location_province'], ''), '');
}

function getAddress(row: ActivityRow) {
  return cleanText(
    firstValue(row, ['meeting_place', 'place', 'luogo', 'address', 'indirizzo', 'meeting_point', 'punto_ritrovo'], ''),
    ''
  );
}

function getCoordinates(row: ActivityRow) {
  const latitudeValue = firstValue(
    row,
    ['latitude', 'lat', 'location_latitude', 'meeting_latitude'],
    null
  );
  const longitudeValue = firstValue(
    row,
    ['longitude', 'lng', 'lon', 'location_longitude', 'meeting_longitude'],
    null
  );

  if (
    latitudeValue === null ||
    latitudeValue === undefined ||
    String(latitudeValue).trim() === '' ||
    longitudeValue === null ||
    longitudeValue === undefined ||
    String(longitudeValue).trim() === ''
  ) {
    return null;
  }

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (
    Number.isFinite(latitude) === false ||
    Number.isFinite(longitude) === false ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { latitude, longitude };
}

async function geocodeEvent(row: ActivityRow) {
  const address = getAddress(row);
  const city = getCity(row);
  const province = getProvince(row);

  if (!address.trim()) return null;
  const queries = [
    [address, city, province, 'Italia'].filter(Boolean).join(', '),
  ].filter(Boolean);

  for (const query of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BajujuMobileApp/1.0',
        },
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) continue;

      const latitude = Number(data[0].lat);
      const longitude = Number(data[0].lon);

      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        !(latitude === 0 && longitude === 0)
      ) {
        return { latitude, longitude };
      }
    } catch {
      console.log('Errore geocoding evento.');
    }
  }

  return null;
}

function isDeleted(row: ActivityRow) {
  if (firstValue(row, ['deleted_at', 'removed_at', 'cancelled_at', 'canceled_at', 'archived_at'], '')) return true;

  const status = cleanText(firstValue(row, ['status', 'stato', 'state', 'activity_status', 'event_status'], ''), '')
    .toLowerCase()
    .trim();

  return [
    'deleted',
    'eliminato',
    'eliminata',
    'removed',
    'cancellato',
    'cancellata',
    'cancelled',
    'canceled',
    'annullato',
    'annullata',
    'archived',
    'archiviato',
    'archiviata',
    'closed',
    'chiuso',
    'chiusa',
  ].includes(status);
}

function isFutureOrToday(row: ActivityRow) {
  const dateValue = firstValue(row, ['activity_date', 'event_date', 'date', 'data', 'day', 'giorno'], '');
  if (!dateValue) return true;

  const timeValue = firstValue(row, ['activity_time', 'event_time', 'time', 'ora'], '23:59');
  const date = new Date(`${dateValue}T${timeValue}`);

  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() >= new Date().getTime();
}

function formatDate(row: ActivityRow) {
  const dateValue = firstValue(row, ['activity_date', 'event_date', 'date', 'data', 'day', 'giorno'], '');
  const timeValue = cleanText(firstValue(row, ['activity_time', 'event_time', 'time', 'ora'], ''), '');

  if (!dateValue) return timeValue || 'Data da definire';

  const direct = new Date(`${dateValue}T${timeValue || '00:00'}`);
  let dateText = String(dateValue);

  if (!Number.isNaN(direct.getTime())) {
    dateText = direct.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } else {
    const parts = String(dateValue).split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      dateText = `${day}/${month}/${year}`;
    }
  }

  return [dateText, timeValue].filter(Boolean).join(' · ');
}

function matchesWhenFilter(row: ActivityRow, selectedWhen: string) {
  if (selectedWhen === "Tutte") return true;
  const value = String(firstValue(row, ["activity_date", "event_date", "date", "data"], "")).trim();
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isFinite(part) === false)) return false;
  const eventDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / dayMs);
  if (selectedWhen === "Oggi") return diffDays === 0;
  if (selectedWhen === "Domani") return diffDays === 1;
  if (selectedWhen === "Prossimi 7 giorni") return diffDays >= 0 && diffDays < 7;
  if (selectedWhen === "Questo weekend") {
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + (today.getDay() === 0 ? -1 : 6 - today.getDay()));
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    return eventDate >= saturday && eventDate <= sunday;
  }
  return true;
}

function openDetail(row: ActivityRow) {
  const id = activityId(row);
  if (id) {
    router.push(`/experience-detail?id=${encodeURIComponent(id)}`);
  }
}

export default function ExperiencesMapScreen() { 
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [viewerCoordinates, setViewerCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mapGestureActive, setMapGestureActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Tutti');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState('Tutte');
  const [provinceMenuOpen, setProvinceMenuOpen] = useState(false);
  const [selectedWhen, setSelectedWhen] = useState('Tutte');
  const [whenMenuOpen, setWhenMenuOpen] = useState(false);

  const loadRows = useCallback(async () => {
    setErrorMessage(null);

    try {
      void (async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setViewerCoordinates(null);
          return;
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        setViewerCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        })().catch(() => setViewerCoordinates(null));

      const result = await supabase.from('activities').select('*').limit(200);

      if (result.error) {
        setRows([]);
        setErrorMessage(result.error.message || 'Non sono riuscito a caricare le esperienze.');
        return;
      }

      const cleanRows = ((result.data || []) as ActivityRow[])
        .filter((row) => row.is_flash !== true)
        .filter((row) => !isDeleted(row))
        .filter(isFutureOrToday)
        .sort((a, b) => {
          const dateA = `${firstValue(a, ['activity_date', 'event_date', 'date', 'data'], '9999-12-31')}T${firstValue(a, ['activity_time', 'event_time', 'time', 'ora'], '23:59')}`;
          const dateB = `${firstValue(b, ['activity_date', 'event_date', 'date', 'data'], '9999-12-31')}T${firstValue(b, ['activity_time', 'event_time', 'time', 'ora'], '23:59')}`;
          return dateA.localeCompare(dateB);
        });

      setRows(cleanRows);
      void (async () => {
        for (const row of cleanRows.filter((item) => getCoordinates(item) === null)) {
          const coordinates = await geocodeEvent(row);
          if (coordinates === null) continue;
          const id = activityId(row);
          setRows((current) => current.map((item) => activityId(item) === id ? { ...item, latitude: coordinates.latitude, longitude: coordinates.longitude } : item));
          if (id) await supabase.from('activities').update({ latitude: coordinates.latitude, longitude: coordinates.longitude }).eq('id', id);
        }
      })();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore imprevisto durante il caricamento della mappa.";
      setRows([]);
      setErrorMessage(message);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadRows();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadRows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRows();
    setRefreshing(false);
  }, [loadRows]);

  const retryLoadRows = useCallback(async () => {
    setLoading(true);
    await loadRows();
    setLoading(false);
  }, [loadRows]);

  const viewerRegion = viewerCoordinates ? {
    latitude: viewerCoordinates.latitude,
    longitude: viewerCoordinates.longitude,
    latitudeDelta: 0.25,
    longitudeDelta: 0.25,
  } : undefined;

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesCategory =
        selectedCategory === "Tutti" ||
        normalizeExperienceCategory(getCategory(row)).toLowerCase() === selectedCategory.toLowerCase();

      const matchesProvince =
        selectedProvince === "Tutte" || getProvince(row) === selectedProvince;

      return matchesCategory && matchesProvince && matchesWhenFilter(row, selectedWhen);
    });
  }, [rows, selectedCategory, selectedProvince, selectedWhen]);

  const mapItems: BajujuMapItem[] = filteredRows.flatMap((row) => {
    const id = activityId(row);
    const coordinates = getCoordinates(row);

    if (!id || !coordinates) return [];

    return [{
      id,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      icon: getMapCategoryIcon(getCategory(row)),
      kicker: normalizeExperienceCategory(getCategory(row)),
      title: activityTitle(row),
      locationText: [getCity(row), getProvince(row)].filter(Boolean).join(' · '),
      dateText: formatDate(row),
    }];
  });

  function openMapItem(item: BajujuMapItem) {
    const row = rows.find((candidate) => activityId(candidate) === item.id);

    if (row) {
      openDetail(row);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollEnabled={!mapGestureActive}
        nestedScrollEnabled
      >

          <View style={[styles.card, styles.filtersCard]}>
          <View style={styles.filtersRow}>
            <View style={styles.filterColumn}>
              <Text style={styles.filterLabel}>Categoria</Text>
              <Pressable style={styles.categorySelectButton} onPress={() => { setProvinceMenuOpen(false); setWhenMenuOpen(false); setCategoryMenuOpen((value) => !value); }}>
                <View style={styles.categorySelectTextBox}><Text style={styles.categorySelectValue}>{selectedCategory}</Text></View>
                <Text style={styles.categorySelectArrow}>{categoryMenuOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
            </View>
            <View style={styles.filterColumn}>
              <Text style={styles.filterLabel}>Provincia</Text>
              <Pressable style={styles.categorySelectButton} onPress={() => { setCategoryMenuOpen(false); setWhenMenuOpen(false); setProvinceMenuOpen((value) => !value); }}>
                <View style={styles.categorySelectTextBox}><Text style={styles.categorySelectValue}>{selectedProvince}</Text></View>
                <Text style={styles.categorySelectArrow}>{provinceMenuOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
            </View>
              <View style={styles.filterColumn}>
                <Text style={styles.filterLabel}>Quando</Text>
                <Pressable style={styles.categorySelectButton} onPress={() => { setCategoryMenuOpen(false); setProvinceMenuOpen(false); setWhenMenuOpen((value) => !value); }}>
                  <View style={styles.categorySelectTextBox}><Text style={styles.categorySelectValue}>{selectedWhen}</Text></View>
                  <Text style={styles.categorySelectArrow}>{whenMenuOpen ? "⌃" : "⌄"}</Text>
                </Pressable>
              </View>
            </View>
          {categoryMenuOpen ? (
            <View style={styles.categoryDropdown}>
              {EXPERIENCE_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  style={[styles.categoryDropdownItem, selectedCategory === category && styles.categoryDropdownItemActive]}
                  onPress={() => { setSelectedCategory(category); setCategoryMenuOpen(false); }}
                >
                  <Text style={[styles.categoryDropdownText, selectedCategory === category && styles.categoryDropdownTextActive]}>{category}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {provinceMenuOpen ? (
            <View style={styles.categoryDropdown}>
              {PROVINCE_OPTIONS.map((province) => (
                <Pressable
                  key={province}
                  style={[styles.categoryDropdownItem, selectedProvince === province && styles.categoryDropdownItemActive]}
                  onPress={() => { setSelectedProvince(province); setProvinceMenuOpen(false); }}
                >
                  <Text style={[styles.categoryDropdownText, selectedProvince === province && styles.categoryDropdownTextActive]}>{province}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}


          {whenMenuOpen ? (
            <View style={styles.categoryDropdown}>
              {WHEN_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.categoryDropdownItem, selectedWhen === option && styles.categoryDropdownItemActive]}
                  onPress={() => { setSelectedWhen(option); setWhenMenuOpen(false); }}
                >
                  <Text style={[styles.categoryDropdownText, selectedWhen === option && styles.categoryDropdownTextActive]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

        </View>

        {!loading && !errorMessage ? (
          <BajujuMap
            items={mapItems}
              mapTitle=""
              showUserLocation={viewerCoordinates !== null}
              hideHeader
            mapSubtitle="Tocca un marker per vedere l’anteprima."
            emptyText="Nessuna esperienza disponibile sulla mappa."
            previewActionText="Tocca questa anteprima per aprire l’esperienza"
            onOpenItem={openMapItem}
            fallbackRegion={viewerRegion}
              preferFallbackRegion={viewerRegion !== undefined}
              viewportKey={`${selectedCategory}|${selectedProvince}|${selectedWhen}`}
              onInteractionChange={setMapGestureActive}
          />
        ) : null}

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Caricamento esperienze...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Errore caricamento</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.mainButton} onPress={retryLoadRows}>
            <Text style={styles.mainButtonText}>Riprova</Text>
          </Pressable>
        </View>
        ) : rows.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>Nessuna esperienza disponibile</Text>
            <Text style={styles.mutedText}>
              {'Quando saranno presenti eventi attivi, li troverai qui.'}
            </Text>
          </View>
      ) : (
        <View style={styles.card}>

          {filteredRows.map((row) => {
            const category = getCategory(row);
            const city = getCity(row);
            const province = getProvince(row);
            const address = getAddress(row);

            return (
              <View key={activityId(row) || `${activityTitle(row)}-${getCity(row)}-${formatDate(row)}`} style={styles.eventBox}>
                <Pressable style={styles.eventHeader} onPress={() => openDetail(row)}>
                  <View style={styles.pinCircle}>
                    <Text style={styles.pinIcon}>{getExperienceCategoryIcon(category)}</Text>
                  </View>

                  <View style={styles.eventTextBox}>
                    <Text style={styles.eventTitle}>{activityTitle(row)}</Text>
                    <Text style={styles.eventMeta}>
                      {normalizeExperienceCategory(category)} · Tocca per aprire
                    </Text>
                  </View>
                </Pressable>

                <Text style={styles.eventInfo}>{[city, province].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.eventInfo}>{formatDate(row)}</Text>
                <Text style={styles.addressText}>
                  {address || 'Indirizzo non indicato: provo ad aprire la mappa dal comune.'}
                </Text>

                <Pressable style={styles.mapButton} onPress={() => openDetail(row)}>
                  <Text style={styles.mapButtonText}>Apri esperienza</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      </ScrollView>
      <BajujuBottomNav active="find" />
    </SafeAreaView>
  );
}

const legacyStyles = StyleSheet.create({


















  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  backButtonText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
  },
  logoCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  kicker: {
    color: '#e43f98',
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    color: '#4b1430',
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    textAlign: 'center',
  },


  mapPinIcon: {
    fontSize: 18,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 12,
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 21,
    fontWeight: '900',
  },
  eventBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff0f7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  pinIcon: {
    fontSize: 18,
  },
  eventTextBox: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  eventMeta: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  eventInfo: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  addressText: {
    color: '#4b1430',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
  },
  mapButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e43f98',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  mapButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  mainButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e43f98',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  mainButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  mutedText: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  emptyTitle: {
    color: '#4b1430',
    fontSize: 18,
    fontWeight: '900',
  },
  errorTitle: {
    color: '#b00020',
    fontSize: 18,
    fontWeight: '900',
  },
  errorText: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  staticMapSurface: {
    height: 360,
    borderRadius: 24,
    backgroundColor: '#fff0f7',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  staticMapGlowOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#ffd3e7',
    top: -70,
    left: -50,
    opacity: 0.7,
  },
  staticMapGlowTwo: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#ffe6f1',
    right: -60,
    bottom: -40,
    opacity: 0.9,
  },
  staticMapRoadOne: {
    position: 'absolute',
    width: '125%',
    height: 26,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    opacity: 0.78,
    top: 116,
    left: -32,
    transform: [{ rotate: '-18deg' }],
  },
  staticMapRoadTwo: {
    position: 'absolute',
    width: '120%',
    height: 22,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    opacity: 0.62,
    bottom: 112,
    left: -28,
    transform: [{ rotate: '17deg' }],
  },

});

void legacyStyles;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BAJUJU_COLORS.background,
  },
  page: {
    flexGrow: 1,
    paddingTop: 20,
    paddingHorizontal: 22,
    paddingBottom: 132,
    backgroundColor: BAJUJU_COLORS.background,
    gap: 14,
  },
  heroCard: {
    marginBottom: 10,
    minHeight: 206,
    padding: 20,
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#FFFFFFDC',
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    ...BAJUJU_SHADOW,
  },
  heroBlob: {
    position: 'absolute',
    width: 104,
    height: 76,
    borderRadius: 52,
    backgroundColor: BAJUJU_COLORS.palePink,
    opacity: 0.76,
  },
  heroBlobTop: {
    left: -27,
    top: -25,
    transform: [{ rotate: '-18deg' }],
  },
  heroBlobBottom: {
    right: -34,
    bottom: -28,
    transform: [{ rotate: '18deg' }],
  },
  heroDoodle: {
    position: 'absolute',
    zIndex: 2,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
  },
  heroDoodleLeft: {
    left: 30,
    top: 121,
    fontSize: 23,
    transform: [{ rotate: '-8deg' }],
  },
  heroDoodleRight: {
    right: 27,
    top: 25,
    fontSize: 23,
    transform: [{ rotate: '8deg' }],
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 17,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: '#FFFFFFE8',
  },
  backButtonText: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 15,
  },
  title: {
    zIndex: 1,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  heroTitlePlum: {
    color: BAJUJU_COLORS.plum,
  },
  heroTitlePink: {
    color: BAJUJU_COLORS.brightPink,
  },
  subtitle: {
    zIndex: 1,
    marginTop: 7,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    padding: 18,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#FFFCFE',
    gap: 12,
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  filtersCard: { padding: 8, borderRadius: 18, gap: 6, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
filtersRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },  filterColumn: { flex: 1, minWidth: 0 },  filterColumnFull: { width: '100%', marginBottom: 4 },  filterLabel: { marginBottom: 4, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 11 },  categorySelectButton: { minHeight: 40, paddingHorizontal: 8, borderRadius: 18, borderWidth: 2, borderColor: BAJUJU_COLORS.palePink, backgroundColor: BAJUJU_COLORS.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },  categorySelectTextBox: { flex: 1, minWidth: 0 },  categorySelectValue: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 11 },  categorySelectArrow: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },  categoryDropdown: { marginTop: 8, marginBottom: 14, padding: 8, borderRadius: 18, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white, gap: 6 },  categoryDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: BAJUJU_COLORS.softPink, backgroundColor: BAJUJU_COLORS.background },  categoryDropdownItemActive: { borderColor: BAJUJU_COLORS.brightPink, backgroundColor: BAJUJU_COLORS.brightPink },  categoryDropdownText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },  categoryDropdownTextActive: { color: BAJUJU_COLORS.white },
  sectionTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 21,
  },
  eventBox: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.softPink,
    gap: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
  },
  pinIcon: {
    fontSize: 18,
  },
  eventTextBox: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 16,
    lineHeight: 21,
  },
  eventMeta: {
    marginTop: 2,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  eventInfo: {
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  addressText: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: BAJUJU_COLORS.white,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  mapButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  mapButtonText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  mainButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  mainButtonText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  mutedText: {
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
  },
  errorTitle: {
    color: '#B00020',
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
  },
  errorText: {
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
  },
});
