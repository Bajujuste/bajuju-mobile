import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BajujuIcon } from '@/components/icons/BajujuIcon';
import { BajujuBackButton } from '@/components/navigation/BajujuBackButton';
import { BajujuBottomNav } from '@/components/navigation/BajujuBottomNav';
import { BajujuProfileButton } from '@/components/navigation/BajujuProfileButton';
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '@/constants/experienceCategories';
import { supabase } from '../../src/lib/supabase';
import { geocodeProfilePlace, getUsableDevicePosition, toUsableCoordinates } from '../../src/utils/bajujuDeviceLocation';
import { experienceDateLabel } from '../../src/utils/experienceDateLabel';
import { loadEventOrganizerNames } from '../../src/lib/eventCards';
import { EventCardImage } from '../../src/components/events/EventCardImage';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');
const PAGE_SIZE = 30;

// null = nessun limite di distanza; all'apertura si parte da 5 km.
const DISTANCE_OPTIONS: { km: number | null; label: string }[] = [
  { km: null, label: 'Distanza da te' },
  { km: 5, label: 'Entro 5 km' },
  { km: 10, label: 'Entro 10 km' },
  { km: 25, label: 'Entro 25 km' },
  { km: 50, label: 'Entro 50 km' },
];

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
  photo_url?: string | null;
  deleted_at?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type ParticipantRow = { activity_id?: string | null; user_id?: string | null; status?: string | null };
type Coordinates = { latitude: number; longitude: number };
type EventWithDistance = ActivityRow & { distanceKm: number | null };

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

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatFilterDayShort(date: Date) {
  return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDistance(distance: number) {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace('.', ',')} km`;
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
  if (row.latitude === null || row.latitude === undefined || row.longitude === null || row.longitude === undefined) return null;
  return toUsableCoordinates(Number(row.latitude), Number(row.longitude));
}

function participantsLabel(current: number, max: number) {
  if (max > 0) return `${current}/${max} partecipanti`;
  return `${current} ${current === 1 ? 'partecipante' : 'partecipanti'}`;
}

export default function AllEventsScreen() {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [organizerNames, setOrganizerNames] = useState<Record<string, string>>({});
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [maxKm, setMaxKm] = useState<number | null>(5);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDistanceMenu, setShowDistanceMenu] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const authResult = await supabase.auth.getUser();
      const userId = authResult.data.user?.id || '';

      let resolvedCoordinates: Coordinates | null = null;
      if (userId) {
        const preferenceResult = await supabase
          .from('notification_preferences')
          .select('latitude,longitude')
          .eq('user_id', userId)
          .maybeSingle();
        resolvedCoordinates = toUsableCoordinates(preferenceResult.data?.latitude, preferenceResult.data?.longitude);
      }

      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const devicePosition = await getUsableDevicePosition();
          if (devicePosition) resolvedCoordinates = devicePosition;
        }
      } catch {
        // Se il GPS non risponde teniamo le coordinate salvate.
      }

      if (!resolvedCoordinates && userId) {
        // Senza posizione usiamo la città del profilo, come in Home ed Esperienze.
        const profileResult = await supabase.from('profiles').select('city,province').eq('id', userId).maybeSingle();
        resolvedCoordinates = await geocodeProfilePlace(profileResult.data?.city, profileResult.data?.province);
      }
      setCoordinates(resolvedCoordinates);

      const today = new Date().toISOString().slice(0, 10);
      const result = await supabase.from('activities')
        .select('id,creator_id,title,category,city,province,activity_date,activity_time,max_participants,photo_url,deleted_at,status,latitude,longitude,is_flash,location_owner_id')
        .neq('is_flash', true)
        .gte('activity_date', today)
        .order('activity_date', { ascending: true })
        .order('activity_time', { ascending: true })
        .limit(500);
      if (result.error) throw result.error;

      const clean = ((result.data || []) as ActivityRow[]).filter((row) => !isDeleted(row));
      setActivities(clean);
      void loadEventOrganizerNames(clean).then(setOrganizerNames).catch(() => undefined);

      const ids = clean.map((row) => String(row.id || '')).filter(Boolean);
      const countSets: Record<string, Set<string>> = {};
      clean.forEach((row) => {
        const id = String(row.id || '');
        if (!id) return;
        countSets[id] = new Set<string>();
        if (row.creator_id) countSets[id].add(String(row.creator_id));
      });

      if (ids.length > 0) {
        const participantResult = await supabase
          .from('activity_participants')
          .select('activity_id,user_id,status')
          .in('activity_id', ids)
          .limit(10000);
        if (participantResult.error) throw participantResult.error;
        ((participantResult.data || []) as ParticipantRow[])
          .filter(participantIsActive)
          .forEach((row) => {
            const id = String(row.activity_id || '');
            if (id && row.user_id) countSets[id]?.add(String(row.user_id));
          });
      }

      const counts: Record<string, number> = {};
      Object.entries(countSets).forEach(([id, users]) => { counts[id] = users.size; });
      setParticipantCounts(counts);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Non sono riuscito a caricare gli eventi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));

  const filterDayKey = filterDate ? localDayKey(filterDate) : '';

  const filteredEvents = useMemo<EventWithDistance[]>(() => {
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
      .filter((row) => maxKm === null || (row.distanceKm !== null && row.distanceKm <= maxKm))
      .filter((row) => !filterDayKey || String(row.activity_date || '').slice(0, 10) === filterDayKey)
      .sort((a, b) => {
        const startA = activityMoment(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const startB = activityMoment(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return startA - startB || Number(a.distanceKm ?? 9999) - Number(b.distanceKm ?? 9999);
      });
  }, [activities, coordinates, maxKm, filterDayKey]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);

  function openDatePicker() {
    setPendingDate(filterDate || new Date());
    setShowDatePicker(true);
  }

  function applyFilterDate(date: Date | null) {
    setFilterDate(date);
    setVisibleCount(PAGE_SIZE);
  }

  function handleFilterDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'ios') {
      if (selectedDate) setPendingDate(selectedDate);
      return;
    }
    setShowDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    applyFilterDate(selectedDate);
  }

  function selectDistance(km: number | null) {
    setShowDistanceMenu(false);
    setMaxKm(km);
    setVisibleCount(PAGE_SIZE);
  }

  const distanceLabel = DISTANCE_OPTIONS.find((option) => option.km === maxKm)?.label || 'Distanza da te';

  const listHeader = (
    <View>
      <View style={styles.screenHeader}>
        <BajujuBackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/experiences'))} />
        <Text style={styles.screenTitle} numberOfLines={1}>Tutti gli eventi</Text>
        <BajujuProfileButton />
      </View>

      <View style={styles.filterBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scegli la distanza"
          style={({ pressed }) => [styles.modeSelect, pressed && styles.pressed]}
          onPress={() => setShowDistanceMenu(true)}
        >
          <Text style={styles.modeSelectText} numberOfLines={1}>{distanceLabel}</Text>
          <Text style={styles.modeSelectArrow}>▾</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filterDate ? 'Cambia data' : 'Scegli una data'}
          style={({ pressed }) => [styles.dateFilterButton, pressed && styles.pressed]}
          onPress={openDatePicker}
        >
          <BajujuIcon name="calendar" size={18} color="#FFFFFF" />
          <Text style={styles.dateFilterButtonText} numberOfLines={1}>{filterDate ? formatFilterDayShort(filterDate) : 'Scegli data'}</Text>
          {filterDate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Togli la data"
              hitSlop={10}
              style={styles.dateFilterClear}
              onPress={(event) => { event.stopPropagation(); applyFilterDate(null); }}
            >
              <Text style={styles.dateFilterClearText}>✕</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </View>

      {showDatePicker ? (
        Platform.OS === 'ios' ? (
          <View style={styles.iosPickerContainer}>
            <DateTimePicker value={pendingDate} mode="date" display="inline" minimumDate={new Date()} locale="it-IT" onChange={handleFilterDateChange} />
            <View style={styles.iosPickerActions}>
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.iosPickerAction}>
                <Text style={styles.iosPickerCancelText}>Annulla</Text>
              </Pressable>
              <Pressable onPress={() => { applyFilterDate(pendingDate); setShowDatePicker(false); }} style={styles.iosPickerAction}>
                <Text style={styles.iosPickerConfirmText}>Mostra eventi</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <DateTimePicker value={pendingDate} mode="date" display="calendar" minimumDate={new Date()} onChange={handleFilterDateChange} />
        )
      ) : null}

      {!loading && !errorMessage ? (
        <Text style={styles.countText}>
          {filteredEvents.length} {filteredEvents.length === 1 ? 'evento' : 'eventi'}
        </Text>
      ) : null}
      {maxKm !== null && !coordinates && !loading ? (
        <Text style={styles.hintText}>Attiva la posizione per filtrare per distanza.</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={loading || errorMessage ? [] : visibleEvents}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        onEndReachedThreshold={0.5}
        onEndReached={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredEvents.length))}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color={PINK} />
              <Text style={styles.emptyText}>Caricamento eventi…</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{errorMessage}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadAll()}><Text style={styles.retryText}>Riprova</Text></Pressable>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nessun evento</Text>
              <Text style={styles.emptyText}>Prova a cambiare distanza o data.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const id = String(item.id || '');
          const title = item.title || 'Esperienza Bajuju';
          const organizerName = organizerNames[String(item.creator_id || '')] || '';
          const place = item.city || item.province || 'Luogo da definire';
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri evento ${title}`}
              style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/experience-detail' as any, params: { id } })}
            >
              <EventCardImage uri={String(item.photo_url || '').trim()} fallback={bajujuLogo} style={styles.thumb} resizeMode="cover" />
              <View style={styles.eventBody}>
                <Text style={styles.eventCategory} numberOfLines={1}>
                  {getExperienceCategoryIcon(item.category)} {normalizeExperienceCategory(item.category)}
                </Text>
                <Text style={styles.eventTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.eventMeta} numberOfLines={1}>{experienceDateLabel(activityMoment(item), Boolean(item.activity_time))}</Text>
                <Text style={styles.eventMeta} numberOfLines={1}>
                  {place}{item.distanceKm !== null ? ` · ${formatDistance(item.distanceKm)}` : ''}
                </Text>
                <Text style={styles.eventPeople} numberOfLines={1}>
                  {participantsLabel(Number(participantCounts[id] || 0), Number(item.max_participants || 0))}
                  {organizerName ? ` · ${organizerName}` : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <BajujuBottomNav active="find" />

      <Modal visible={showDistanceMenu} transparent animationType="fade" onRequestClose={() => setShowDistanceMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setShowDistanceMenu(false)}>
          <View style={styles.menuCard}>
            {DISTANCE_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                style={({ pressed }) => [styles.menuItem, option.km === maxKm && styles.menuItemActive, pressed && styles.pressed]}
                onPress={() => selectDistance(option.km)}
              >
                <Text style={[styles.menuItemText, option.km === maxKm && styles.menuItemTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const PLUM = '#4B0C2D';
const PINK = '#E43F98';
const LINE = '#F3C6DC';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9FC' },
  container: { padding: 16, paddingTop: 20, paddingBottom: 140 },
  pressed: { opacity: 0.85 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  screenTitle: { flex: 1, color: PLUM, fontFamily: 'FredokaBold', fontSize: 26, letterSpacing: -0.5 },
  filterBar: { marginTop: 16, marginBottom: 14, flexDirection: 'row', gap: 10 },
  modeSelect: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  modeSelectText: { flexShrink: 1, color: PLUM, fontFamily: 'FredokaSemiBold', fontSize: 16 },
  modeSelectArrow: { color: PINK, fontSize: 18 },
  dateFilterButton: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: PINK },
  dateFilterButtonText: { flexShrink: 1, color: '#FFFFFF', fontFamily: 'FredokaSemiBold', fontSize: 16 },
  dateFilterClear: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  dateFilterClearText: { color: '#FFFFFF', fontFamily: 'FredokaBold', fontSize: 13 },
  countText: { color: '#8D5E77', fontFamily: 'FredokaMedium', fontSize: 14, marginBottom: 10 },
  hintText: { color: '#8F5573', fontFamily: 'FredokaMedium', fontSize: 13, marginBottom: 10 },
  eventRow: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  thumb: { width: 96, height: 96, borderRadius: 14, backgroundColor: '#FFF0F7' },
  eventBody: { flex: 1, justifyContent: 'center', gap: 2 },
  eventCategory: { color: '#C2287A', fontFamily: 'FredokaSemiBold', fontSize: 12 },
  eventTitle: { color: PLUM, fontFamily: 'FredokaBold', fontSize: 16, lineHeight: 20 },
  eventMeta: { color: '#8D5E77', fontFamily: 'FredokaMedium', fontSize: 13 },
  eventPeople: { color: '#7B4965', fontFamily: 'FredokaSemiBold', fontSize: 12 },
  iosPickerContainer: { marginBottom: 12, padding: 8, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  iosPickerActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 4 },
  iosPickerAction: { paddingHorizontal: 12, paddingVertical: 10 },
  iosPickerCancelText: { color: '#8D5E77', fontFamily: 'FredokaSemiBold', fontSize: 15 },
  iosPickerConfirmText: { color: PINK, fontFamily: 'FredokaBold', fontSize: 15 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(75,12,45,0.35)', justifyContent: 'center', padding: 32 },
  menuCard: { borderRadius: 22, padding: 8, backgroundColor: '#FFFFFF' },
  menuItem: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 },
  menuItemActive: { backgroundColor: '#FFF0F7' },
  menuItemText: { color: PLUM, fontFamily: 'FredokaMedium', fontSize: 17 },
  menuItemTextActive: { color: PINK, fontFamily: 'FredokaSemiBold' },
  emptyCard: { minHeight: 170, borderRadius: 22, padding: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: PINK, fontFamily: 'FredokaBold', fontSize: 18, textAlign: 'center' },
  emptyText: { marginTop: 8, color: '#8D5E77', fontFamily: 'FredokaMedium', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: PINK },
  retryText: { color: '#ffffff', fontFamily: 'FredokaSemiBold', fontSize: 15 },
});
