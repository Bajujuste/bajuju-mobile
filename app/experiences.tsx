import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BajujuBottomNav } from '@/src/components/navigation/BajujuBottomNav';
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '@/src/constants/experienceCategories';
import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');
const PAGE_SIZE = 20;
const NEARBY_RADIUS_KM = 25;
const PAST_RETENTION_DAYS = 30;

type Mode = 'nearby' | 'joined' | 'organized' | 'past';

type ActivityRow = {
  id?: string;
  creator_id?: string | null;
  title?: string | null;
  category?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  max_participants?: number | null;
  is_flash?: boolean | null;
  photo_url?: string | null;
  image_url?: string | null;
  cover_url?: string | null;
  deleted_at?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type ParticipantRow = {
  activity_id?: string | null;
  user_id?: string | null;
  status?: string | null;
};

type Coordinates = { latitude: number; longitude: number };

type ExperienceWithDistance = ActivityRow & { distanceKm?: number | null };

function participantIsActive(row: ParticipantRow) {
  return !['annullato', 'annullata', 'rejected', 'rifiutato', 'declined', 'deleted', 'removed']
    .includes(String(row.status || '').trim().toLowerCase());
}

function isDeleted(row: ActivityRow) {
  if (row.deleted_at) return true;
  return ['deleted', 'eliminato', 'eliminata', 'removed', 'cancelled', 'canceled', 'annullato', 'annullata', 'archived', 'closed']
    .includes(String(row.status || '').trim().toLowerCase());
}

function activityMoment(row: ActivityRow) {
  if (!row.activity_date) return null;
  const value = new Date(`${row.activity_date}T${row.activity_time || '23:59'}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function formatDate(row: ActivityRow) {
  const moment = activityMoment(row);
  if (!moment) return 'Data da definire';
  return moment.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function imageUrl(row: ActivityRow) {
  return String(row.photo_url || row.image_url || row.cover_url || '').trim();
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function distanceKm(from: Coordinates, to: Coordinates) {
  const earthRadius = 6371.0088;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function rowCoordinates(row: ActivityRow): Coordinates | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export default function ExperiencesScreen() {
  const [mode, setMode] = useState<Mode>('nearby');
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [myActivityIds, setMyActivityIds] = useState<Set<string>>(new Set());
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [currentUserId, setCurrentUserId] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [allEventsVisibleCount, setAllEventsVisibleCount] = useState(PAGE_SIZE);
  const [selectedPosterUrl, setSelectedPosterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const authResult = await supabase.auth.getUser();
      const userId = authResult.data.user?.id || '';
      setCurrentUserId(userId);

      let resolvedCoordinates: Coordinates | null = null;

      if (userId) {
        const preferenceResult = await supabase
          .from('notification_preferences')
          .select('latitude,longitude')
          .eq('user_id', userId)
          .maybeSingle();

        const savedLatitude = Number(preferenceResult.data?.latitude);
        const savedLongitude = Number(preferenceResult.data?.longitude);
        if (Number.isFinite(savedLatitude) && Number.isFinite(savedLongitude)) {
          resolvedCoordinates = { latitude: savedLatitude, longitude: savedLongitude };
        }
      }

      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 6 * 60 * 60 * 1000 });
          const location = lastKnown || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          resolvedCoordinates = {
            latitude: Number(location.coords.latitude),
            longitude: Number(location.coords.longitude),
          };
        }
      } catch {
        // Se il GPS non risponde usiamo le ultime coordinate notifiche salvate.
      }

      setCoordinates(resolvedCoordinates);

      const activitiesResult = await supabase
        .from('activities')
        .select('*')
        .neq('is_flash', true)
        .limit(500);

      if (activitiesResult.error) throw activitiesResult.error;

      const cleanActivities = ((activitiesResult.data || []) as ActivityRow[])
        .filter((row) => !isDeleted(row));
      setActivities(cleanActivities);

      const activityIds = cleanActivities.map((row) => String(row.id || '')).filter(Boolean);
      const participationSet = new Set<string>();
      const countSets: Record<string, Set<string>> = {};

      cleanActivities.forEach((row) => {
        const activityId = String(row.id || '');
        if (!activityId) return;
        countSets[activityId] = new Set<string>();
        const creatorId = String(row.creator_id || '');
        if (creatorId) countSets[activityId].add(creatorId);
        if (userId && creatorId === userId) participationSet.add(activityId);
      });

      if (activityIds.length > 0) {
        const participantResult = await supabase
          .from('activity_participants')
          .select('activity_id,user_id,status')
          .in('activity_id', activityIds)
          .limit(10000);

        if (!participantResult.error) {
          ((participantResult.data || []) as ParticipantRow[])
            .filter(participantIsActive)
            .forEach((row) => {
              const activityId = String(row.activity_id || '');
              const participantUserId = String(row.user_id || '');
              if (!activityId || !participantUserId) return;
              countSets[activityId]?.add(participantUserId);
              if (userId && participantUserId === userId) participationSet.add(activityId);
            });
        }
      }

      const nextCounts: Record<string, number> = {};
      Object.entries(countSets).forEach(([activityId, users]) => {
        nextCounts[activityId] = users.size;
      });

      setParticipantCounts(nextCounts);
      setMyActivityIds(participationSet);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Non sono riuscito a caricare le esperienze.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  const nearbyActivities = useMemo<ExperienceWithDistance[]>(() => {
    const now = Date.now();
    if (!coordinates) return [];

    return activities
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .map((row) => {
        const target = rowCoordinates(row);
        return { ...row, distanceKm: target ? distanceKm(coordinates, target) : null };
      })
      .filter((row) => row.distanceKm !== null && Number(row.distanceKm) <= NEARBY_RADIUS_KM)
      .sort((a, b) => Number(a.distanceKm || 9999) - Number(b.distanceKm || 9999));
  }, [activities, coordinates]);

  const allEventsActivities = useMemo<ExperienceWithDistance[]>(() => {
    const now = Date.now();

    return activities
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .map((row) => {
        const target = rowCoordinates(row);
        return {
          ...row,
          distanceKm: coordinates && target ? distanceKm(coordinates, target) : null,
        };
      })
      .filter((row) => row.distanceKm === null || Number(row.distanceKm) > NEARBY_RADIUS_KM)
      .sort((a, b) => {
        const distanceA = typeof a.distanceKm === 'number' ? a.distanceKm : Number.MAX_SAFE_INTEGER;
        const distanceB = typeof b.distanceKm === 'number' ? b.distanceKm : Number.MAX_SAFE_INTEGER;
        if (distanceA !== distanceB) return distanceA - distanceB;
        return (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) -
          (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER);
      });
  }, [activities, coordinates]);

  const joinedActivities = useMemo(() => {
    const now = Date.now();
    return activities
      .filter((row) => myActivityIds.has(String(row.id || '')))
      .filter((row) => String(row.creator_id || '') !== currentUserId)
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .sort((a, b) => (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER));
  }, [activities, myActivityIds, currentUserId]);

  const organizedActivities = useMemo(() => {
    const now = Date.now();
    return activities
      .filter((row) => currentUserId && String(row.creator_id || '') === currentUserId)
      .filter((row) => {
        const moment = activityMoment(row);
        return !moment || moment.getTime() >= now;
      })
      .sort((a, b) => (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER));
  }, [activities, currentUserId]);

  const pastActivities = useMemo(() => {
    const now = Date.now();
    const oldestAllowed = now - PAST_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    return activities
      .filter((row) => myActivityIds.has(String(row.id || '')))
      .filter((row) => {
        const moment = activityMoment(row);
        if (!moment) return false;
        const time = moment.getTime();
        return time < now && time >= oldestAllowed;
      })
      .sort((a, b) => (activityMoment(b)?.getTime() || 0) - (activityMoment(a)?.getTime() || 0));
  }, [activities, myActivityIds]);

  const selectedActivities = mode === 'nearby'
    ? nearbyActivities
    : mode === 'joined'
      ? joinedActivities
      : mode === 'organized'
        ? organizedActivities
        : pastActivities;

  const visibleActivities = selectedActivities.slice(0, visibleCount);
  const visibleAllEvents = allEventsActivities.slice(0, allEventsVisibleCount);

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setVisibleCount(PAGE_SIZE);
    setAllEventsVisibleCount(PAGE_SIZE);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Home</Text>
        </Pressable>

        <View style={styles.headerCard}>
          <Text style={styles.title}>Trova esperienze</Text>
          <Text style={styles.subtitle}>Vicino a te, quelle che vivi e i ricordi degli ultimi 30 giorni.</Text>
        </View>

        <Pressable style={styles.mapButton} onPress={() => router.push('/experiences-map')}>
          <Text style={styles.mapIcon}>🗺️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.mapTitle}>Apri la mappa</Text>
            <Text style={styles.mapSubtitle}>Guarda gli eventi intorno a te</Text>
          </View>
          <Text style={styles.mapArrow}>→</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          <TabButton active={mode === 'nearby'} label="Vicino a te" onPress={() => selectMode('nearby')} />
          <TabButton active={mode === 'joined'} label="A cui partecipi" onPress={() => selectMode('joined')} />
          <TabButton active={mode === 'organized'} label="I tuoi eventi" onPress={() => selectMode('organized')} />
          <TabButton active={mode === 'past'} label="Eventi passati" onPress={() => selectMode('past')} />
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>
              {mode === 'nearby'
                ? 'Entro 25 km da te'
                : mode === 'joined'
                  ? 'A cui partecipi'
                  : mode === 'organized'
                    ? 'I tuoi eventi'
                    : 'I tuoi eventi passati'}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {mode === 'nearby'
                ? coordinates ? 'Dal più vicino al più lontano.' : 'Attiva la posizione per vedere gli eventi entro 25 km.'
                : mode === 'joined'
                  ? 'Qui trovi le esperienze a cui partecipi.'
                  : mode === 'organized'
                    ? 'Qui trovi le esperienze che organizzi tu.'
                    : 'Foto, chat e dettagli restano disponibili per 30 giorni.'}
            </Text>
          </View>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>{selectedActivities.length}</Text>
          </View>
        </View>

        {mode === 'past' ? (
          <View style={styles.retentionNote}>
            <Text style={styles.retentionText}>
              Gli eventi passati restano disponibili per 30 giorni. Dopo 30 giorni evento, chat e fotografie possono essere eliminati definitivamente.
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color="#e43f98" />
            <Text style={styles.emptyText}>Caricamento esperienze…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadAll()}>
              <Text style={styles.retryText}>Riprova</Text>
            </Pressable>
          </View>
        ) : visibleActivities.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {mode === 'nearby'
                ? 'Nessuna esperienza vicina'
                : mode === 'joined'
                  ? 'Nessuna esperienza a cui partecipi'
                  : mode === 'organized'
                    ? 'Nessun evento organizzato'
                    : 'Nessun evento passato'}
            </Text>
            <Text style={styles.emptyText}>
              {mode === 'nearby'
                ? 'Quando nascerà qualcosa entro 25 km da te lo troverai qui.'
                : mode === 'joined'
                  ? 'Quando partecipi a un’esperienza la ritrovi qui.'
                  : mode === 'organized'
                    ? 'Quando organizzi un’esperienza la ritrovi qui.'
                    : 'Gli eventi conclusi a cui hai partecipato o che hai organizzato compariranno qui per 30 giorni.'}
            </Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
              {visibleActivities.map((item) => {
                const activityId = String(item.id || '');
                const poster = imageUrl(item);
                const organizedByMe = currentUserId && String(item.creator_id || '') === currentUserId;
                const distance = 'distanceKm' in item && typeof item.distanceKm === 'number'
                  ? item.distanceKm
                  : null;

                return (
                  <Pressable
                    key={activityId}
                    style={styles.experienceCard}
                    onPress={() => router.push({ pathname: '/experience-detail' as any, params: { id: activityId } })}
                  >
                    <Pressable
                      style={styles.imageBox}
                      onPress={(event) => {
                        event.stopPropagation();
                        if (poster) setSelectedPosterUrl(poster);
                      }}
                    >
                      <Image source={poster ? { uri: poster } : bajujuLogo} style={styles.image} resizeMode="cover" />
                    </Pressable>

                    <View style={styles.cardBody}>
                      <View style={styles.badgesRow}>
                        <Text style={styles.categoryBadge}>
                          {getExperienceCategoryIcon(item.category)} {normalizeExperienceCategory(item.category)}
                        </Text>
                        {organizedByMe ? <Text style={styles.organizerBadge}>Organizzi tu</Text> : null}
                      </View>

                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title || 'Esperienza Bajuju'}</Text>
                      <Text style={styles.cardMeta}>{item.city || item.province || 'Luogo da definire'}</Text>
                      <Text style={styles.cardMeta}>{formatDate(item)}</Text>
                      {distance !== null ? <Text style={styles.distanceText}>{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} da te</Text> : null}

                      <View style={styles.cardFooter}>
                        <Text style={styles.participantsText}>
                          Partecipanti {participantCounts[activityId] || 0}/{item.max_participants || '∞'}
                        </Text>
                        <Text style={styles.openText}>Apri →</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {visibleCount < selectedActivities.length ? (
              <Pressable style={styles.moreButton} onPress={() => setVisibleCount((value) => value + PAGE_SIZE)}>
                <Text style={styles.moreButtonText}>Mostra altri {Math.min(PAGE_SIZE, selectedActivities.length - visibleCount)}</Text>
              </Pressable>
            ) : null}
          </>
        )}

        {mode === 'nearby' && !loading && !errorMessage ? (
          <View style={{ marginTop: 26 }}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Tutti gli eventi</Text>
                <Text style={styles.sectionSubtitle}>
                  {coordinates
                    ? 'Continua oltre i 25 km, dal più vicino al più lontano.'
                    : 'Tutti gli eventi disponibili. Attiva la posizione per ordinarli per distanza.'}
                </Text>
              </View>
              <View style={styles.counterPill}>
                <Text style={styles.counterText}>{allEventsActivities.length}</Text>
              </View>
            </View>

            {visibleAllEvents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nessun altro evento disponibile</Text>
                <Text style={styles.emptyText}>Quando verranno pubblicate altre esperienze le troverai qui.</Text>
              </View>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
                  {visibleAllEvents.map((item) => {
                    const activityId = String(item.id || '');
                    const poster = imageUrl(item);
                    const organizedByMe = currentUserId && String(item.creator_id || '') === currentUserId;
                    const distance = typeof item.distanceKm === 'number' ? item.distanceKm : null;

                    return (
                      <Pressable
                        key={activityId}
                        style={styles.experienceCard}
                        onPress={() => router.push({ pathname: '/experience-detail' as any, params: { id: activityId } })}
                      >
                        <Pressable
                          style={styles.imageBox}
                          onPress={(event) => {
                            event.stopPropagation();
                            if (poster) setSelectedPosterUrl(poster);
                          }}
                        >
                          <Image source={poster ? { uri: poster } : bajujuLogo} style={styles.image} resizeMode="cover" />
                        </Pressable>

                        <View style={styles.cardBody}>
                          <View style={styles.badgesRow}>
                            <Text style={styles.categoryBadge}>
                              {getExperienceCategoryIcon(item.category)} {normalizeExperienceCategory(item.category)}
                            </Text>
                            {organizedByMe ? <Text style={styles.organizerBadge}>Organizzi tu</Text> : null}
                          </View>

                          <Text style={styles.cardTitle} numberOfLines={2}>{item.title || 'Esperienza Bajuju'}</Text>
                          <Text style={styles.cardMeta}>{item.city || item.province || 'Luogo da definire'}</Text>
                          <Text style={styles.cardMeta}>{formatDate(item)}</Text>
                          {distance !== null ? (
                            <Text style={styles.distanceText}>
                              {distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1) + ' km'} da te
                            </Text>
                          ) : null}

                          <View style={styles.cardFooter}>
                            <Text style={styles.participantsText}>
                              Partecipanti {participantCounts[activityId] || 0}/{item.max_participants || '∞'}
                            </Text>
                            <Text style={styles.openText}>Apri →</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {allEventsVisibleCount < allEventsActivities.length ? (
                  <Pressable
                    style={styles.moreButton}
                    onPress={() => setAllEventsVisibleCount((value) => value + PAGE_SIZE)}
                  >
                    <Text style={styles.moreButtonText}>
                      Mostra altri {Math.min(PAGE_SIZE, allEventsActivities.length - allEventsVisibleCount)}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      <BajujuBottomNav active="find" />

      <Modal visible={Boolean(selectedPosterUrl)} transparent animationType="fade" onRequestClose={() => setSelectedPosterUrl(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedPosterUrl(null)}>
          {selectedPosterUrl ? <Image source={{ uri: selectedPosterUrl }} style={styles.modalImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7fb' },
  container: { padding: 18, paddingBottom: 140 },
  backButton: { alignSelf: 'flex-start', backgroundColor: '#fff0f7', borderRadius: 999, borderWidth: 1, borderColor: '#ffd1e6', paddingHorizontal: 14, paddingVertical: 9, marginBottom: 12 },
  backText: { color: '#e43f98', fontWeight: '900' },
  headerCard: { borderRadius: 28, padding: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ffd1e6' },
  title: { color: '#e43f98', fontSize: 29, fontWeight: '900' },
  subtitle: { marginTop: 6, color: '#6b3652', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  mapButton: { marginTop: 12, padding: 14, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f6c6dc', flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapIcon: { fontSize: 25 },
  mapTitle: { color: '#4b1430', fontWeight: '900', fontSize: 15 },
  mapSubtitle: { marginTop: 2, color: '#a95d86', fontWeight: '700', fontSize: 12 },
  mapArrow: { color: '#e43f98', fontSize: 22, fontWeight: '900' },
  tabsRow: { gap: 8, paddingVertical: 16, paddingRight: 18 },
  tabButton: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc' },
  tabButtonActive: { backgroundColor: '#e43f98', borderColor: '#e43f98' },
  tabText: { color: '#6b3652', fontWeight: '900' },
  tabTextActive: { color: '#ffffff' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sectionTitle: { color: '#4b1430', fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: '#8f5573', fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  counterPill: { minWidth: 38, height: 38, borderRadius: 19, backgroundColor: '#fff0f7', alignItems: 'center', justifyContent: 'center' },
  counterText: { color: '#e43f98', fontWeight: '900' },
  retentionNote: { marginBottom: 14, padding: 12, borderRadius: 16, backgroundColor: '#fff3f8', borderWidth: 1, borderColor: '#ffd1e6' },
  retentionText: { color: '#7a3c5e', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  cardsRow: { gap: 14, paddingRight: 18, paddingBottom: 8 },
  experienceCard: { width: 286, borderRadius: 24, overflow: 'hidden', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc' },
  imageBox: { height: 166, backgroundColor: '#fff0f7' },
  image: { width: '100%', height: '100%' },
  cardBody: { padding: 15 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  categoryBadge: { color: '#9b1f61', fontWeight: '900', fontSize: 12, backgroundColor: '#fff0f7', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  organizerBadge: { color: '#7a5a00', fontWeight: '900', fontSize: 11, backgroundColor: '#fff8d8', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  cardTitle: { color: '#4b1430', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  cardMeta: { marginTop: 5, color: '#745068', fontSize: 12, fontWeight: '700' },
  distanceText: { marginTop: 8, color: '#e43f98', fontWeight: '900', fontSize: 13 },
  cardFooter: { marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  participantsText: { flex: 1, color: '#7b4965', fontWeight: '800', fontSize: 12 },
  openText: { color: '#e43f98', fontWeight: '900' },
  moreButton: { marginTop: 14, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: '#e43f98' },
  moreButtonText: { color: '#ffffff', fontWeight: '900' },
  emptyCard: { minHeight: 170, borderRadius: 24, padding: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#e43f98', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  emptyText: { marginTop: 8, color: '#6b3652', fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#e43f98' },
  retryText: { color: '#ffffff', fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalImage: { width: '100%', height: '82%' },
});
