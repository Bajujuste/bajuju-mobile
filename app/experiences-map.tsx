import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import BajujuMap, { BajujuMapItem } from '../components/BajujuMap';
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '@/src/constants/experienceCategories';
import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

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
  Brescia: {
    latitude: 45.5416,
    longitude: 10.2118,
    latitudeDelta: 0.52,
    longitudeDelta: 0.64,
  },
  Torino: {
    latitude: 45.0703,
    longitude: 7.6869,
    latitudeDelta: 0.58,
    longitudeDelta: 0.7,
  },
} as const;

type ActivityRow = Record<string, any>;

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

function openDetail(row: ActivityRow) {
  const id = activityId(row);
  if (id) {
    router.push(`/experience-detail?id=${encodeURIComponent(id)}`);
  }
}

export default function ExperiencesMapScreen() { 
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [profileProvince, setProfileProvince] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setErrorMessage(null);

    try {
      const authResult = await supabase.auth.getUser();
      const userId = authResult.data.user?.id || null;

      let selectedProvince = '';

      if (userId) {
        const profileResult = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (!profileResult.error && profileResult.data) {
          selectedProvince = cleanText(
            firstValue(
              profileResult.data as ActivityRow,
              ['province', 'provincia', 'location_province', 'preferred_province'],
              ''
            ),
            ''
          );
        }
      }

      setProfileProvince(selectedProvince);

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
        .filter((row) => {
          if (!selectedProvince) return true;

          return getProvince(row).toLowerCase() === selectedProvince.toLowerCase();
        })
        .sort((a, b) => {
          const dateA = `${firstValue(a, ['activity_date', 'event_date', 'date', 'data'], '9999-12-31')}T${firstValue(a, ['activity_time', 'event_time', 'time', 'ora'], '23:59')}`;
          const dateB = `${firstValue(b, ['activity_date', 'event_date', 'date', 'data'], '9999-12-31')}T${firstValue(b, ['activity_time', 'event_time', 'time', 'ora'], '23:59')}`;
          return dateA.localeCompare(dateB);
        });

      setRows(cleanRows);
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

  const provinceRegion =
    PROVINCE_REGIONS[profileProvince as keyof typeof PROVINCE_REGIONS] || undefined;

  const mapItems: BajujuMapItem[] = rows.flatMap((row) => {
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
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.heroCard}>
        <Pressable style={styles.backButton} onPress={() => router.push('/experiences')}>
          <Text style={styles.backButtonText}>← Trova esperienza</Text>
        </Pressable>

        <View style={styles.logoCircle}>
          <Image source={bajujuLogo} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title}>Mappa esperienze</Text>
        <Text style={styles.subtitle}>
          Ecco gli eventi disponibili: tocca un pin per aprire subito l’esperienza.
        </Text>
      </View>

        {!loading && !errorMessage ? (
          <BajujuMap
            items={mapItems}
            mapTitle={
              profileProvince
                ? `Eventi in provincia di ${profileProvince}`
                : 'Eventi sulla mappa'
            }
            mapSubtitle="Tocca un marker per vedere l’anteprima."
            emptyText={
              profileProvince
                ? `Nessuna esperienza con coordinate disponibile in provincia di ${profileProvince}.`
                : 'Nessuna esperienza con coordinate disponibile.'
            }
            previewActionText="Tocca questa anteprima per aprire l’esperienza"
            onOpenItem={openMapItem}
            fallbackRegion={provinceRegion}
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
              {profileProvince
                ? `Al momento non ci sono esperienze attive in provincia di ${profileProvince}.`
                : 'Quando saranno presenti eventi attivi, li troverai qui.'}
            </Text>
          </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Eventi disponibili</Text>

          {rows.map((row) => {
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
  );
}

const styles = StyleSheet.create({


















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
