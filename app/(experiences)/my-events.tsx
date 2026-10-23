import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { BajujuIcon } from '../../src/components/icons/BajujuIcon';
import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { supabase } from '../../src/lib/supabase';
import {
  BAJUJU_COLORS,
  BAJUJU_FONTS,
  BAJUJU_SHADOW,
} from '../../src/theme/bajujuTheme';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');
const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000;
const PAST_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

type MyActivity = {
  id: string;
  creator_id?: string | null;
  title?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  photo_url?: string | null;
  category?: string | null;
  status?: string | null;
};

type TemporalState = 'current' | 'upcoming' | 'past';

function activityStart(row: MyActivity) {
  if (!row.activity_date) return null;
  const rawTime = String(row.activity_time || '23:59').slice(0, 8);
  const date = new Date(`${row.activity_date}T${rawTime}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function temporalState(row: MyActivity, now: number): TemporalState {
  const start = activityStart(row);
  if (!start) return 'past';

  const startMs = start.getTime();
  if (now < startMs) return 'upcoming';
  if (now <= startMs + ACTIVE_WINDOW_MS) return 'current';
  return 'past';
}

function isCancelled(row: MyActivity) {
  const value = String(row.status || '').trim().toLowerCase();
  return ['annullata', 'annullato', 'cancelled', 'canceled', 'eliminata', 'bloccata'].includes(value);
}

function isActiveParticipationStatus(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return !['annullato', 'annullata', 'rejected', 'rifiutato', 'declined', 'deleted', 'removed'].includes(normalized);
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MONTHS_LONG = [
  'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE',
];

function formatEventMeta(row: MyActivity) {
  const date = activityStart(row);
  const place = row.city || row.province || '';
  if (!date) return ['Data da definire', place].filter(Boolean).join(' · ');

  const day = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  const time = String(row.activity_time || '').slice(0, 5);

  return [day, time, place].filter(Boolean).join(' · ');
}

function monthLabel(row: MyActivity, now: number) {
  const date = activityStart(row);
  if (!date) return 'DATA DA DEFINIRE';
  const label = MONTHS_LONG[date.getMonth()];
  return date.getFullYear() === new Date(now).getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

function groupByMonth(items: MyActivity[], now: number) {
  const groups: { label: string; items: MyActivity[] }[] = [];
  items.forEach((item) => {
    const label = monthLabel(item, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  });
  return groups;
}

export default function MyEventsScreen() {
  const [rows, setRows] = useState<MyActivity[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'past' | null>(null);

  const loadMyEvents = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');

    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;

      const userId = authResult.data.user?.id;
      if (!userId) {
        setRows([]);
        setCurrentUserId('');
        return;
      }

      setCurrentUserId(userId);

      const [participationResult, organizedResult] = await Promise.all([
        supabase
          .from('activity_participants')
          .select('activity_id,status')
          .eq('user_id', userId)
          .limit(1000),
        supabase
          .from('activities')
          .select('id,creator_id,title,city,province,activity_date,activity_time,photo_url,category,status')
          .eq('creator_id', userId)
          .eq('is_flash', false)
          .is('deleted_at', null)
          .limit(500),
      ]);

      if (participationResult.error) throw participationResult.error;
      if (organizedResult.error) throw organizedResult.error;

      const participantIds = Array.from(
        new Set(
          (participationResult.data || [])
            .filter((item: any) => isActiveParticipationStatus(item.status))
            .map((item: any) => String(item.activity_id || ''))
            .filter(Boolean)
        )
      );

      const collected: MyActivity[] = [
        ...((organizedResult.data || []) as MyActivity[]),
      ];

      if (participantIds.length > 0) {
        const joinedResult = await supabase
          .from('activities')
          .select('id,creator_id,title,city,province,activity_date,activity_time,photo_url,category,status')
          .in('id', participantIds)
          .eq('is_flash', false)
          .is('deleted_at', null)
          .limit(1000);

        if (joinedResult.error) throw joinedResult.error;
        collected.push(...((joinedResult.data || []) as MyActivity[]));
      }

      const unique = new Map<string, MyActivity>();
      collected.forEach((row) => {
        const id = String(row.id || '');
        if (id) unique.set(id, { ...row, id });
      });

      setRows(Array.from(unique.values()));
      setLoadedAt(Date.now());
    } catch (error: unknown) {
      console.log('Errore caricamento I miei eventi:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a caricare i tuoi eventi.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMyEvents('initial');
    }, [loadMyEvents])
  );

  const ordered = useMemo(() => {
    const now = loadedAt;

    return [...rows].sort((a, b) => {
      const stateA = temporalState(a, now);
      const stateB = temporalState(b, now);
      const rank = { current: 0, upcoming: 1, past: 2 } as const;
      const rankDifference = rank[stateA] - rank[stateB];

      if (rankDifference !== 0) return rankDifference;

      const timeA = activityStart(a)?.getTime() || 0;
      const timeB = activityStart(b)?.getTime() || 0;

      if (stateA === 'upcoming') return timeA - timeB;
      return timeB - timeA;
    });
  }, [loadedAt, rows]);

  const currentEvents = useMemo(
    () => ordered.filter((row) => temporalState(row, loadedAt) === 'current'),
    [loadedAt, ordered]
  );
  const upcomingEvents = useMemo(
    () => ordered.filter((row) => temporalState(row, loadedAt) === 'upcoming'),
    [loadedAt, ordered]
  );
  const pastEvents = useMemo(
    () => ordered.filter((row) => {
      if (temporalState(row, loadedAt) !== 'past') return false;
      const start = activityStart(row);
      if (!start) return false;
      return loadedAt - start.getTime() <= PAST_RETENTION_MS;
    }),
    [loadedAt, ordered]
  );

  function openEvent(item: MyActivity) {
    router.push({
      pathname: '/experience-detail' as any,
      params: { id: item.id },
    });
  }

  const comingCount = currentEvents.length + upcomingEvents.length;
  const activeTab = selectedTab ?? (comingCount === 0 && pastEvents.length > 0 ? 'past' : 'upcoming');

  function renderCard(item: MyActivity) {
    const state = temporalState(item, loadedAt);
    const cancelled = isCancelled(item);
    const organizedByMe = Boolean(currentUserId && item.creator_id === currentUserId);

    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Apri evento ${item.title || 'Bajuju'}`}
        onPress={() => openEvent(item)}
        style={({ pressed }) => [
          styles.eventCard,
          state === 'current' && !cancelled && styles.eventCardCurrent,
          pressed && styles.pressed,
        ]}
      >
        <Image
          source={item.photo_url ? { uri: item.photo_url } : bajujuLogo}
          resizeMode="cover"
          style={styles.eventImage}
        />

        <View style={styles.eventBody}>
          <Text style={[styles.eventTitle, cancelled && styles.eventTitleCancelled]} numberOfLines={2}>
            {item.title || 'Esperienza Bajuju'}
          </Text>
          <Text style={styles.eventMeta} numberOfLines={1}>{formatEventMeta(item)}</Text>

          {cancelled || organizedByMe || state === 'current' ? (
            <View style={styles.badgesRow}>
              {cancelled ? (
                <Text style={[styles.statusBadge, styles.statusBadgeCancelled]}>ANNULLATO</Text>
              ) : state === 'current' ? (
                <Text style={[styles.statusBadge, styles.statusBadgeCurrent]}>IN CORSO</Text>
              ) : null}
              {organizedByMe ? <Text style={styles.roleBadge}>Organizzi tu</Text> : null}
            </View>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={20} color={BAJUJU_COLORS.pink} />
      </Pressable>
    );
  }

  function renderGroups(items: MyActivity[]) {
    return groupByMonth(items, loadedAt).map((group) => (
      <View key={group.label} style={styles.monthGroup}>
        <Text style={styles.monthLabel}>{group.label}</Text>
        <View style={styles.cardsList}>{group.items.map(renderCard)}</View>
      </View>
    ));
  }

  function renderTabButton(tab: 'upcoming' | 'past', label: string, count: number) {
    const selected = activeTab === tab;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => setSelectedTab(tab)}
        style={[styles.tabButton, selected && styles.tabButtonSelected]}
      >
        <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
        <View style={[styles.tabCount, selected && styles.tabCountSelected]}>
          <Text style={[styles.tabCountText, selected && styles.tabCountTextSelected]}>{count}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadMyEvents('refresh')}
            tintColor={BAJUJU_COLORS.brightPink}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>I miei eventi</Text>
            <Text style={styles.subtitle}>A cui partecipi o che organizzi</Text>
          </View>
          <BajujuProfileButton />
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={BAJUJU_COLORS.brightPink} />
            <Text style={styles.stateText}>Carico i tuoi eventi…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Non riesco a caricarli</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadMyEvents('initial')}>
              <Text style={styles.retryText}>Riprova</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.stateCard}>
            <View style={styles.emptyIcon}>
              <BajujuIcon name="calendar" size={34} color={BAJUJU_COLORS.brightPink} />
            </View>
            <Text style={styles.stateTitle}>Qui compariranno i tuoi eventi</Text>
            <Text style={styles.stateText}>
              Quando partecipi a un evento o ne organizzi uno, lo ritrovi qui senza doverlo cercare.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.tabs} accessibilityRole="tablist">
              {renderTabButton('upcoming', 'Prossimi', comingCount)}
              {renderTabButton('past', 'Passati', pastEvents.length)}
            </View>

            {activeTab === 'upcoming' ? (
              comingCount === 0 ? (
                <Text style={styles.emptyTabText}>Nessun evento in programma.</Text>
              ) : (
                <>
                  {currentEvents.length > 0 ? (
                    <View style={styles.monthGroup}>
                      <Text style={styles.monthLabel}>ADESSO</Text>
                      <View style={styles.cardsList}>{currentEvents.map(renderCard)}</View>
                    </View>
                  ) : null}
                  {renderGroups(upcomingEvents)}
                </>
              )
            ) : pastEvents.length === 0 ? (
              <Text style={styles.emptyTabText}>Nessun evento negli ultimi 60 giorni.</Text>
            ) : (
              renderGroups(pastEvents)
            )}
          </>
        )}
      </ScrollView>

      <BajujuBottomNav active="myEvents" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BAJUJU_COLORS.background,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 142,
  },
  header: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginBottom: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabButtonSelected: {
    backgroundColor: BAJUJU_COLORS.pink,
  },
  tabText: {
    color: '#7A3C5E',
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
  },
  tabTextSelected: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.semiBold,
  },
  tabCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  tabCountSelected: {
    backgroundColor: BAJUJU_COLORS.white,
  },
  tabCountText: {
    color: '#7A3C5E',
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  tabCountTextSelected: {
    color: '#C2287A',
  },
  monthGroup: {
    marginTop: 14,
  },
  monthLabel: {
    marginBottom: 8,
    color: '#9B5A7C',
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  emptyTabText: {
    marginTop: 24,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
    textAlign: 'center',
  },
  cardsList: {
    gap: 10,
  },
  eventCard: {
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...BAJUJU_SHADOW,
    shadowOpacity: 0.06,
    elevation: 1,
  },
  eventCardCurrent: {
    borderColor: '#E7C56A',
    backgroundColor: '#FFFDF5',
  },
  eventImage: {
    width: 76,
    height: 76,
    borderRadius: 14,
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  eventBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 11,
  },
  statusBadgeCurrent: {
    backgroundColor: '#E5F8EE',
    color: '#168653',
  },
  statusBadgeCancelled: {
    backgroundColor: '#F3F0F2',
    color: '#765D69',
  },
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#FFF4D6',
    color: '#7A5A00',
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  eventTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 17,
    lineHeight: 20,
  },
  eventTitleCancelled: {
    color: BAJUJU_COLORS.muted,
  },
  eventMeta: {
    color: '#8D5E77',
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
  },
  stateCard: {
    minHeight: 245,
    padding: 28,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...BAJUJU_SHADOW,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 27,
    marginBottom: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  stateTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 20,
    textAlign: 'center',
  },
  stateText: {
    marginTop: 8,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  retryText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.76,
  },
});
