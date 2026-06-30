import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getExperienceCategoryIcon, normalizeExperienceCategory } from '@/src/constants/experienceCategories';
import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

const INITIAL_MAP_REGION = {
  latitude: 45.82,
  longitude: 9.50,
  latitudeDelta: 0.32,
  longitudeDelta: 0.44,
};


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

function getMapCategoryIconName(category: string) {
  const value = normalizeExperienceCategory(category).toLowerCase();

  if (value.includes('sport') || value.includes('calcetto') || value.includes('calcio') || value.includes('palestra') || value.includes('tennis') || value.includes('padel')) {
    return 'soccer';
  }

  if (value.includes('cena') || value.includes('aperitivo') || value.includes('pizza') || value.includes('ristorante') || value.includes('food')) {
    return 'silverware-fork-knife';
  }

  if (value.includes('camminata') || value.includes('trekking') || value.includes('gita') || value.includes('passeggiata')) {
    return 'hiking';
  }

  if (value.includes('musica') || value.includes('concerto') || value.includes('live')) {
    return 'music-note';
  }

  if (value.includes('cinema') || value.includes('film')) {
    return 'movie-open';
  }

  if (value.includes('cultura') || value.includes('museo') || value.includes('mostra')) {
    return 'star-four-points';
  }

  if (value.includes('viaggio') || value.includes('vacanza')) {
    return 'bag-suitcase';
  }

  return 'star-four-points';
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
  const latitude = Number(firstValue(row, ['latitude', 'lat', 'location_latitude', 'meeting_latitude'], null));
  const longitude = Number(firstValue(row, ['longitude', 'lng', 'lon', 'location_longitude', 'meeting_longitude'], null));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
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

function fallbackCoordinate(index: number) {
  const points = [
    { latitude: 45.8566, longitude: 9.3977 }, // Lecco
    { latitude: 45.6983, longitude: 9.6773 }, // Bergamo
    { latitude: 45.7430, longitude: 9.5480 }, // Ponte San Pietro / area centrale
    { latitude: 45.7680, longitude: 9.4220 }, // Calolziocorte / Vercurago
    { latitude: 45.7650, longitude: 9.6400 }, // Val Brembana bassa
    { latitude: 45.7100, longitude: 9.5000 }, // area intermedia
  ];

  return points[index % points.length];
}


function pinPosition(row: ActivityRow, index: number) {
  const coordinates = getCoordinates(row);

  if (coordinates) {
    const latitude = Math.max(35.4, Math.min(47.2, coordinates.latitude));
    const longitude = Math.max(6.3, Math.min(18.9, coordinates.longitude));

    const top = 82 - ((latitude - 35.4) / (47.2 - 35.4)) * 68;
    const left = 8 + ((longitude - 6.3) / (18.9 - 6.3)) * 84;

    return {
      top: `${Math.max(10, Math.min(78, top))}%`,
      left: `${Math.max(10, Math.min(86, left))}%`,
    };
  }

  const fallbackPositions = [
    { top: '24%', left: '28%' },
    { top: '34%', left: '56%' },
    { top: '52%', left: '38%' },
    { top: '62%', left: '70%' },
    { top: '72%', left: '48%' },
    { top: '42%', left: '78%' },
  ];

  return fallbackPositions[index % fallbackPositions.length];
}

function openExternalMap(row: ActivityRow) {
  const coordinates = getCoordinates(row);

  if (coordinates) {
    const { latitude, longitude } = coordinates;
    const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}&layers=N&marker=${latitude},${longitude}`;
    Linking.openURL(url);
    return;
  }

  const query = [getAddress(row), getCity(row), getProvince(row), 'Italia'].filter(Boolean).join(', ');
  if (query.trim()) {
    Linking.openURL(`https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`);
  }
}

function openDetail(row: ActivityRow) {
  const id = activityId(row);
  if (id) {
    router.push(`/experience-detail?id=${encodeURIComponent(id)}`);
  }
}

export default function ExperiencesMapScreen() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [selectedPreviewRow, setSelectedPreviewRow] = useState<ActivityRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setErrorMessage(null);

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
    setSelectedPreviewRow(null);
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

  const selectedPreviewId = selectedPreviewRow ? activityId(selectedPreviewRow) : '';

  function handleMarkerPress(row: ActivityRow) {
    const id = activityId(row);

    if (id && selectedPreviewId === id) {
      openDetail(row);
      return;
    }

    setSelectedPreviewRow(row);
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

      {!loading && !errorMessage && rows.length > 0 ? (
        <View style={styles.visualMapCard}>
          <View style={styles.visualMapHeader}>
            <View style={styles.visualMapHeaderText}>
              <Text style={styles.visualMapTitle}>Eventi sulla mappa</Text>
              <Text style={styles.visualMapSubtitle}>Ogni pin mostra il tipo di esperienza.</Text>
            </View>
            <Text style={styles.visualMapCount}>{rows.length}</Text>
          </View>

          <View style={styles.realMapShell}>
            <View style={styles.staticMapSurface}>
              <View style={styles.staticMapGlowOne} />
              <View style={styles.staticMapGlowTwo} />
              <View style={styles.staticMapRoadOne} />
              <View style={styles.staticMapRoadTwo} />

              <View pointerEvents="box-none" style={styles.markerOverlayLayer}>
                {rows.slice(0, 80).map((row, index) => {
                  const category = getCategory(row);
                  const id = activityId(row);
                  const position = pinPosition(row, index);

                  return (
                    <Pressable
                      key={`bajuju-overlay-circle-${id || index}-${selectedPreviewId === id ? 'selected' : 'idle'}`}
                      style={[
                        styles.bajujuOverlayMarkerCircle,
                        position as any,
                        selectedPreviewId === id && styles.bajujuOverlayMarkerCircleSelected,
                      ]}
                      onPress={() => handleMarkerPress(row)}
                    >
                      <MaterialCommunityIcons
                        name={getMapCategoryIconName(category) as any}
                        size={26}
                        color="#ffffff"
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {selectedPreviewRow ? (
              <Pressable style={styles.mapPreviewOverlay} onPress={() => openDetail(selectedPreviewRow)}>
                <View style={styles.mapPreviewHeader}>
                  <View style={styles.mapPreviewIconCircle}>
                    <Text style={styles.mapPreviewIcon}>{getMapCategoryIcon(getCategory(selectedPreviewRow))}</Text>
                  </View>

                  <View style={styles.mapPreviewTextBox}>
                    <Text style={styles.mapPreviewKicker}>
                      {normalizeExperienceCategory(getCategory(selectedPreviewRow))}
                    </Text>
                    <Text style={styles.mapPreviewTitle} numberOfLines={2}>
                      {activityTitle(selectedPreviewRow)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.mapPreviewMeta} numberOfLines={1}>
                  {[getCity(selectedPreviewRow), getProvince(selectedPreviewRow)].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.mapPreviewMeta} numberOfLines={1}>
                  {formatDate(selectedPreviewRow)}
                </Text>
                <Text style={styles.mapPreviewAction}>Tocca questa anteprima per aprire l’evento</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.visualMapHint}>
            Tocca un cerchio Bajuju per vedere l’anteprima, poi tocca di nuovo per aprire il dettaglio evento.
          </Text>
        </View>
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
          <Pressable style={styles.mainButton} onPress={loadRows}>
            <Text style={styles.mainButtonText}>Riprova</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Nessuna esperienza disponibile</Text>
          <Text style={styles.mutedText}>Quando saranno presenti eventi attivi, li troverai qui.</Text>
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
              <View key={activityId(row) || `${activityTitle(row)}-${Math.random()}`} style={styles.eventBox}>
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

                <Pressable style={styles.mapButton} onPress={() => openExternalMap(row)}>
                  <Text style={styles.mapButtonText}>Apri posizione su mappa</Text>
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
  bajujuOverlayMarkerCircleSelected: {
    width: 60,
    height: 60,
    marginLeft: -30,
    marginTop: -30,
    borderRadius: 30,
    borderWidth: 5,
    backgroundColor: '#c81f77',
  },
  bajujuOverlayMarkerCircle: {
    position: 'absolute',
    width: 52,
    height: 52,
    marginLeft: -26,
    marginTop: -26,
    borderRadius: 26,
    backgroundColor: '#e43f98',
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4b1430',
    shadowOpacity: 0.35,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  markerOverlayLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  mapPreviewAction: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  mapPreviewMeta: {
    color: '#7b4960',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 5,
  },
  mapPreviewTitle: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  mapPreviewKicker: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 2,
  },
  mapPreviewTextBox: {
    flex: 1,
    minWidth: 0,
  },
  mapPreviewIcon: {
    fontSize: 19,
  },
  mapPreviewIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapPreviewOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    shadowColor: '#4b1430',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 12,
  },


















  realMap: {
    width: '100%',
    height: '100%',
  },
  realMapShell: {
    height: 330,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    backgroundColor: '#fff8fb',
  },
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
  visualMapCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 12,
    overflow: 'hidden',
  },
  visualMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  visualMapHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  visualMapTitle: {
    color: '#4b1430',
    fontSize: 20,
    fontWeight: '900',
  },
  visualMapSubtitle: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  visualMapCount: {
    color: '#e43f98',
    fontSize: 26,
    fontWeight: '900',
  },
  visualMapCanvas: {
    position: 'relative',
    height: 260,
    borderRadius: 22,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    overflow: 'hidden',
  },
  mapBlobOne: {
    position: 'absolute',
    width: 190,
    height: 170,
    borderRadius: 90,
    backgroundColor: '#fff0f7',
    top: 18,
    left: 20,
    transform: [{ rotate: '-18deg' }],
  },
  mapBlobTwo: {
    position: 'absolute',
    width: 150,
    height: 130,
    borderRadius: 80,
    backgroundColor: '#ffe3f0',
    bottom: 18,
    right: 18,
    transform: [{ rotate: '24deg' }],
  },
  mapBlobThree: {
    position: 'absolute',
    width: 110,
    height: 90,
    borderRadius: 55,
    backgroundColor: '#ffffff',
    bottom: 48,
    left: 76,
    opacity: 0.75,
  },
  mapWatermark: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    color: '#f0a4ca',
    fontSize: 12,
    fontWeight: '900',
  },


  mapPinIcon: {
    fontSize: 18,
  },

  visualMapHint: {
    color: '#a95d86',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
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
