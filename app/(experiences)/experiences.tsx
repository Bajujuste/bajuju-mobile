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
  useWindowDimensions,
  View,
} from 'react-native';

import { BajujuIcon } from '@/components/icons/BajujuIcon';
import { BajujuBottomNav } from '@/components/navigation/BajujuBottomNav';
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '@/constants/experienceCategories';
import { supabase } from '../../src/lib/supabase';
import { saveBajujuNotificationCoordinatesIfEnabled } from '../../src/utils/bajujuNotificationLocation';
import { refreshBajujuPushRegistrationIfAuthorized } from '../../src/utils/bajujuNotifications';
import { trackBajujuEvent } from '../../src/utils/bajujuAnalytics';
import { experienceDateLabel } from '../../src/utils/experienceDateLabel';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');
const PAGE_SIZE = 20;
const NEARBY_RADIUS_KM = 25;
const PAST_RETENTION_DAYS = 60;

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
  created_at?: string | null;
  max_participants?: number | null;
  join_approval_required?: boolean | null;
  min_age?: number | null;
  max_age?: number | null;
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
  return experienceDateLabel(activityMoment(row), Boolean(row.activity_time));
}

function formatDistance(distance: number) {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace('.', ',')} km`;
}

function imageUrl(row: ActivityRow) {
  return String(row.photo_url || row.image_url || row.cover_url || '').trim();
}

type ParticipantInfo = { label: string; ratio: number | null };

function participantInfo(
  activityId: string,
  item: ActivityRow,
  participantCounts: Record<string, number>
): ParticipantInfo {
  const current = Number(participantCounts[activityId] || 0);
  const max = Number(item.max_participants || 0);

  if (max <= 0) return { label: `${current} ${current === 1 ? 'partecipante' : 'partecipanti'}`, ratio: null };

  const remaining = Math.max(0, max - current);
  const ratio = Math.min(1, current / max);
  if (remaining < 1 || remaining > 3) return { label: `${current} / ${max} partecipanti`, ratio };

  return { label: `${current}/${max} · ${remaining} ${remaining === 1 ? 'posto rimasto' : 'posti rimasti'}`, ratio };
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
  if (
    row.latitude === null ||
    row.latitude === undefined ||
    row.longitude === null ||
    row.longitude === undefined ||
    String(row.latitude).trim() === '' ||
    String(row.longitude).trim() === ''
  ) {
    return null;
  }

  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
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

export default function ExperiencesScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(320, Math.max(260, screenWidth - 76));
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

      if (userId) {
        void trackBajujuEvent('find_open');
        await refreshBajujuPushRegistrationIfAuthorized(userId).catch(() => ({ ok: false }));
      }

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

      if (userId && resolvedCoordinates) {
        await saveBajujuNotificationCoordinatesIfEnabled(userId, resolvedCoordinates).catch(() => ({ ok: false }));
      }

      const oldestUsefulDate = new Date(
        Date.now() - PAST_RETENTION_DAYS * 24 * 60 * 60 * 1000
      ).toISOString().slice(0, 10);

      const activitiesResult = await supabase
        .from('activities')
        .select('id,creator_id,title,category,city,province,activity_date,activity_time,created_at,max_participants,join_approval_required,min_age,max_age,is_flash,photo_url,deleted_at,status,latitude,longitude')
        .neq('is_flash', true)
        .gte('activity_date', oldestUsefulDate)
        .order('activity_date', { ascending: true })
        .order('activity_time', { ascending: true })
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

        if (participantResult.error) throw participantResult.error;

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

  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));

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
      .sort((a, b) => {
        const startA = activityMoment(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const startB = activityMoment(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return startA - startB || Number(a.distanceKm ?? 9999) - Number(b.distanceKm ?? 9999);
      });
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
        return { ...row, distanceKm: coordinates && target ? distanceKm(coordinates, target) : null };
      })
      .sort((a, b) => {
        const publishedA = Date.parse(a.created_at || '') || 0;
        const publishedB = Date.parse(b.created_at || '') || 0;
        if (publishedA !== publishedB) return publishedB - publishedA;
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
  }, [activities, myActivityIds, currentUserId]);

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

  function waitlistButton(activityId: string, item: ActivityRow, organizedByMe: boolean) {
    const max = Number(item.max_participants || 0);
    const full = max > 0 && Number(participantCounts[activityId] || 0) >= max;
    const canWait = full && item.join_approval_required !== true && !organizedByMe && !myActivityIds.has(activityId) && mode !== 'past';

    if (!canWait) {
      return (
        <View style={styles.openButton}>
          <BajujuIcon name="arrow" size={20} color="#E43F98" />
        </View>
      );
    }

    return (
      <Pressable
        style={styles.waitlistButton}
        onPress={(event) => {
          event.stopPropagation();
          router.push({ pathname: '/experience-waitlist' as any, params: { id: activityId } });
        }}
      >
        <Text style={styles.waitlistButtonText}>Lista d’attesa</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>Esperienze</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trova eventi sulla mappa"
            style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}
            onPress={() => router.push('/experiences-map')}
          >
            <BajujuIcon name="pin" size={20} color="#E43F98" />
            <Text style={styles.mapLabel}>Mappa</Text>
          </Pressable>
        </View>

        <View style={styles.tabsRow}>
          <TabButton active={mode === 'nearby'} label="Vicino" accessibilityLabel="Vicino a te" onPress={() => selectMode('nearby')} />
          <TabButton active={mode === 'joined'} label="Partecipi" accessibilityLabel="A cui partecipi" onPress={() => selectMode('joined')} />
          <TabButton active={mode === 'organized'} label="Organizzi" accessibilityLabel="I tuoi eventi" onPress={() => selectMode('organized')} />
          <TabButton active={mode === 'past'} label="Passati" accessibilityLabel="Eventi passati" onPress={() => selectMode('past')} />
        </View>

        <SectionHeader
          title={mode === 'nearby' ? `Entro ${NEARBY_RADIUS_KM} km` : mode === 'joined' ? 'A cui partecipi' : mode === 'organized' ? 'I tuoi eventi' : 'I tuoi eventi passati'}
          count={selectedActivities.length}
          detail={mode === 'nearby' && coordinates ? 'dal più vicino' : ''}
          hint={mode === 'nearby' && !coordinates ? `Attiva la posizione per vedere gli eventi entro ${NEARBY_RADIUS_KM} km.` : ''}
        />

        {mode === 'past' ? (
          <View style={styles.retentionNote}>
            <Text style={styles.retentionText}>
              Gli eventi passati restano disponibili per 60 giorni. Dopo 60 giorni non vengono più mostrati tra i tuoi ricordi.
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
            <Pressable style={styles.retryButton} onPress={() => void loadAll()}><Text style={styles.retryText}>Riprova</Text></Pressable>
          </View>
        ) : visibleActivities.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {mode === 'nearby' ? 'Nessuna esperienza vicina' : mode === 'joined' ? 'Nessuna esperienza a cui partecipi' : mode === 'organized' ? 'Nessun evento organizzato' : 'Nessun evento passato'}
            </Text>
            <Text style={styles.emptyText}>
              {mode === 'nearby' ? 'Quando nascerà qualcosa entro 25 km da te lo troverai qui.'
                : mode === 'joined' ? 'Quando partecipi a un’esperienza la ritrovi qui.'
                : mode === 'organized' ? 'Quando organizzi un’esperienza la ritrovi qui.'
                : 'Gli eventi conclusi a cui hai partecipato compariranno qui per 30 giorni.'}
            </Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
              {visibleActivities.map((item) => {
                const activityId = String(item.id || '');
                const organizedByMe = Boolean(currentUserId && String(item.creator_id || '') === currentUserId);

                return (
                  <ExperienceCard
                    key={activityId}
                    item={item}
                    width={cardWidth}
                    distance={'distanceKm' in item && typeof item.distanceKm === 'number' ? item.distanceKm : null}
                    organizedByMe={organizedByMe}
                    participants={participantInfo(activityId, item, participantCounts)}
                    action={waitlistButton(activityId, item, organizedByMe)}
                    onOpen={() => router.push({ pathname: '/experience-detail' as any, params: { id: activityId } })}
                    onOpenPoster={setSelectedPosterUrl}
                  />
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
            <SectionHeader
              title="Tutti gli eventi"
              count={allEventsActivities.length}
              detail="dal più recente"
              hint="Scorri verso sinistra per vedere gli altri eventi."
            />

            {visibleAllEvents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nessun altro evento disponibile</Text>
                <Text style={styles.emptyText}>Quando verranno pubblicate altre esperienze le troverai qui.</Text>
              </View>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardsRow}
                  scrollEventThrottle={100}
                  onScroll={({ nativeEvent }) => {
                    const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
                    if (contentOffset.x + layoutMeasurement.width >= contentSize.width - 240) {
                      setAllEventsVisibleCount((count) => Math.min(count + PAGE_SIZE, allEventsActivities.length));
                    }
                  }}
                >
                  {visibleAllEvents.map((item) => {
                    const activityId = String(item.id || '');
                    const organizedByMe = Boolean(currentUserId && String(item.creator_id || '') === currentUserId);

                    return (
                      <ExperienceCard
                        key={activityId}
                        item={item}
                        width={cardWidth}
                        distance={typeof item.distanceKm === 'number' ? item.distanceKm : null}
                        organizedByMe={organizedByMe}
                        participants={participantInfo(activityId, item, participantCounts)}
                        action={waitlistButton(activityId, item, organizedByMe)}
                        onOpen={() => router.push({ pathname: '/experience-detail' as any, params: { id: activityId } })}
                        onOpenPoster={setSelectedPosterUrl}
                      />
                    );
                  })}
                </ScrollView>
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

function TabButton({ active, label, accessibilityLabel, onPress }: { active: boolean; label: string; accessibilityLabel: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text numberOfLines={1} style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, count, detail, hint }: { title: string; count: number; detail: string; hint: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>
          {count} {count === 1 ? 'evento' : 'eventi'}{detail ? ` · ${detail}` : ''}
        </Text>
      </View>
      {hint ? <Text style={styles.sectionSubtitle}>{hint}</Text> : null}
    </View>
  );
}

type ExperienceCardProps = {
  item: ActivityRow;
  width: number;
  distance: number | null;
  organizedByMe: boolean;
  participants: ParticipantInfo;
  action: React.ReactNode;
  onOpen: () => void;
  onOpenPoster: (url: string) => void;
};

function ExperienceCard({ item, width, distance, organizedByMe, participants, action, onOpen, onOpenPoster }: ExperienceCardProps) {
  const poster = imageUrl(item);
  const title = item.title || 'Esperienza Bajuju';
  const hasAgeRange = item.min_age !== null && item.min_age !== undefined && item.max_age !== null && item.max_age !== undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Apri esperienza ${title}`}
      style={({ pressed }) => [styles.experienceCard, { width }, pressed && styles.pressed]}
      onPress={onOpen}
    >
      <Pressable style={styles.imageBox} onPress={(event) => { event.stopPropagation(); if (poster) onOpenPoster(poster); }}>
        <Image source={poster ? { uri: poster } : bajujuLogo} style={styles.image} resizeMode="cover" />
        <Text style={[styles.imageChip, styles.categoryChip]} numberOfLines={1}>
          {getExperienceCategoryIcon(item.category)} {normalizeExperienceCategory(item.category)}
        </Text>
        {distance !== null ? <Text style={[styles.imageChip, styles.distanceChip]}>{formatDistance(distance)}</Text> : null}
        {organizedByMe ? <Text style={[styles.imageChip, styles.organizerChip]}>Organizzi tu</Text> : null}
      </Pressable>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
        <View style={styles.metaRow}>
          <BajujuIcon name="calendar" size={16} color="#C2287A" />
          <Text style={styles.cardMeta} numberOfLines={1}>{formatDate(item)}</Text>
        </View>
        <View style={styles.metaRow}>
          <BajujuIcon name="pin" size={16} color="#C2287A" />
          <Text style={styles.cardMeta} numberOfLines={1}>{item.city || item.province || 'Luogo da definire'}</Text>
        </View>
        <Text style={styles.tagsLine} numberOfLines={1}>
          <Text style={item.join_approval_required === true ? styles.tagRequest : styles.tagFree}>
            {item.join_approval_required === true ? 'Su richiesta' : 'Partecipazione libera'}
          </Text>
          {hasAgeRange ? <Text style={styles.tagAge}>{'  ·  '}{item.min_age}–{item.max_age} anni</Text> : null}
        </Text>
        <View style={styles.cardFooter}>
          <View style={styles.participantsBox}>
            <Text style={styles.participantsText} numberOfLines={1}>{participants.label}</Text>
            {participants.ratio !== null ? (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(participants.ratio * 100)}%` }]} />
              </View>
            ) : null}
          </View>
          {action}
        </View>
      </View>
    </Pressable>
  );
}

const PLUM = '#4B0C2D';
const PINK = '#E43F98';
const LINE = '#F3C6DC';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9FC' },
  container: { padding: 16, paddingTop: 20, paddingBottom: 140 },
  pressed: { opacity: 0.85 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  screenTitle: { color: PLUM, fontFamily: 'FredokaBold', fontSize: 28, letterSpacing: -0.5 },
  mapButton: { height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 999, borderWidth: 1.5, borderColor: LINE, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapLabel: { color: '#C2287A', fontFamily: 'FredokaSemiBold', fontSize: 15 },
  tabsRow: { marginTop: 16, marginBottom: 20, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  tabButton: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabButtonActive: { backgroundColor: PINK },
  tabText: { color: '#7A3C5E', fontFamily: 'FredokaMedium', fontSize: 14 },
  tabTextActive: { color: '#FFFFFF', fontFamily: 'FredokaSemiBold' },
  sectionHeader: { marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  sectionTitle: { color: PLUM, fontFamily: 'FredokaBold', fontSize: 21 },
  sectionCount: { color: '#8D5E77', fontFamily: 'FredokaMedium', fontSize: 14 },
  sectionSubtitle: { color: '#8F5573', fontFamily: 'FredokaMedium', fontSize: 13, lineHeight: 18, marginTop: 3 },
  retentionNote: { marginBottom: 14, padding: 12, borderRadius: 16, backgroundColor: '#fff3f8', borderWidth: 1, borderColor: '#ffd1e6' },
  retentionText: { color: '#7a3c5e', fontFamily: 'FredokaMedium', fontSize: 12, lineHeight: 17 },
  cardsRow: { gap: 12, paddingRight: 16, paddingBottom: 8 },
  experienceCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  imageBox: { height: 160, backgroundColor: '#FFF0F7' },
  image: { width: '100%', height: '100%' },
  imageChip: { position: 'absolute', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontFamily: 'FredokaSemiBold', fontSize: 13 },
  categoryChip: { top: 10, left: 10, maxWidth: '60%', backgroundColor: '#FFFFFF', color: '#9B1F61' },
  distanceChip: { top: 10, right: 10, backgroundColor: 'rgba(75, 12, 45, 0.82)', color: '#FFFFFF' },
  organizerChip: { bottom: 10, left: 10, backgroundColor: PINK, color: '#FFFFFF', fontSize: 12 },
  cardBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 6 },
  cardTitle: { color: PLUM, fontFamily: 'FredokaBold', fontSize: 18, lineHeight: 22, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMeta: { flex: 1, color: '#6B3652', fontFamily: 'FredokaMedium', fontSize: 14 },
  tagsLine: { fontFamily: 'FredokaMedium', fontSize: 13 },
  tagFree: { color: '#22633C' },
  tagRequest: { color: '#8A5B00' },
  tagAge: { color: '#6B3B8F' },
  cardFooter: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
  participantsBox: { flex: 1, gap: 5 },
  participantsText: { color: '#7B4965', fontFamily: 'FredokaSemiBold', fontSize: 13 },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: '#FFE3F0', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: PINK },
  openButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF0F7', alignItems: 'center', justifyContent: 'center' },
  waitlistButton: { borderRadius: 999, backgroundColor: '#fff0f7', borderWidth: 1, borderColor: PINK, paddingHorizontal: 10, paddingVertical: 8 },
  waitlistButtonText: { color: PINK, fontFamily: 'FredokaSemiBold', fontSize: 12 },
  moreButton: { marginTop: 14, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: PINK },
  moreButtonText: { color: '#ffffff', fontFamily: 'FredokaSemiBold', fontSize: 15 },
  emptyCard: { minHeight: 170, borderRadius: 22, padding: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: PINK, fontFamily: 'FredokaBold', fontSize: 18, textAlign: 'center' },
  emptyText: { marginTop: 8, color: '#6b3652', fontFamily: 'FredokaMedium', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: PINK },
  retryText: { color: '#ffffff', fontFamily: 'FredokaSemiBold', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalImage: { width: '100%', height: '82%' },
});
