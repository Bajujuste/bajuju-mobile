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
import { supabase } from '../../src/lib/supabase';
import {
  BAJUJU_COLORS,
  BAJUJU_FONTS,
  BAJUJU_SHADOW,
} from '../../src/theme/bajujuTheme';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');
const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

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

function formatEventDate(row: MyActivity) {
  const date = activityStart(row);
  if (!date) return 'Data da definire';

  const day = date.toLocaleDateString('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const time = String(row.activity_time || '').slice(0, 5);

  return [day, time].filter(Boolean).join(' · ');
}

function eventPlace(row: MyActivity) {
  return [row.city, row.province].filter(Boolean).join(' · ') || 'Luogo da definire';
}

export default function MyEventsScreen() {
  const [rows, setRows] = useState<MyActivity[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadedAt, setLoadedAt] = useState(Date.now());

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
    () => ordered.filter((row) => temporalState(row, loadedAt) === 'past'),
    [loadedAt, ordered]
  );

  function openEvent(item: MyActivity) {
    router.push({
      pathname: '/experience-detail' as any,
      params: { id: item.id },
    });
  }

  function renderCard(item: MyActivity) {
    const state = temporalState(item, loadedAt);
    const cancelled = isCancelled(item);
    const organizedByMe = Boolean(currentUserId && item.creator_id === currentUserId);
    const badgeLabel = cancelled
      ? 'ANNULLATO'
      : state === 'current'
        ? 'IN CORSO'
        : state === 'upcoming'
          ? 'PROSSIMO'
          : 'CONCLUSO';

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
          <View style={styles.badgesRow}>
            <Text
              style={[
                styles.statusBadge,
                state === 'current' && !cancelled && styles.statusBadgeCurrent,
                cancelled && styles.statusBadgeCancelled,
              ]}
            >
              {badgeLabel}
            </Text>
            <Text style={styles.roleBadge}>
              {organizedByMe ? 'Organizzi tu' : 'Partecipi'}
            </Text>
          </View>

          <Text style={styles.eventTitle} numberOfLines={2}>
            {item.title || 'Esperienza Bajuju'}
          </Text>
          <Text style={styles.eventMeta}>{formatEventDate(item)}</Text>
          <Text style={styles.eventMeta} numberOfLines={1}>{eventPlace(item)}</Text>

          <View style={styles.openRow}>
            <Text style={styles.openText}>Apri evento</Text>
            <BajujuIcon name="arrow" size={20} color={BAJUJU_COLORS.brightPink} />
          </View>
        </View>
      </Pressable>
    );
  }

  function renderSection(title: string, subtitle: string, items: MyActivity[]) {
    if (items.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          </View>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>{items.length}</Text>
          </View>
        </View>
        <View style={styles.cardsList}>{items.map(renderCard)}</View>
      </View>
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
          <View style={styles.headerIcon}>
            <BajujuIcon name="calendar" size={30} color={BAJUJU_COLORS.brightPink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>I miei eventi</Text>
            <Text style={styles.subtitle}>
              Quelli a cui partecipi, hai partecipato o che organizzi.
            </Text>
          </View>
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
            {renderSection(
              'In corso',
              'Quelli che stai vivendo adesso: sono sempre i primi.',
              currentEvents
            )}
            {renderSection(
              'Prossimi',
              'Dal più vicino nel tempo in avanti.',
              upcomingEvents
            )}
            {renderSection(
              'Passati',
              'Dal più recente al più vecchio.',
              pastEvents
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 22,
  },
  headerIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.softPink,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
  },
  title: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 30,
    letterSpacing: -0.7,
  },
  subtitle: {
    marginTop: 3,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    marginBottom: 27,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 22,
  },
  sectionSubtitle: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  counterPill: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  counterText: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 14,
  },
  cardsList: {
    gap: 12,
  },
  eventCard: {
    minHeight: 124,
    padding: 11,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    flexDirection: 'row',
    gap: 13,
    ...BAJUJU_SHADOW,
  },
  eventCardCurrent: {
    borderColor: '#E7C56A',
    backgroundColor: '#FFFDF5',
  },
  eventImage: {
    width: 92,
    height: 102,
    borderRadius: 19,
    backgroundColor: BAJUJU_COLORS.softPink,
  },
  eventBody: {
    flex: 1,
    paddingVertical: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: BAJUJU_COLORS.softPink,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 10,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#FFF4C7',
    color: '#7A5A00',
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 10,
  },
  eventTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
    lineHeight: 21,
  },
  eventMeta: {
    marginTop: 3,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 12,
  },
  openRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openText: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
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
