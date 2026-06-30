import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';

type LooseRow = Record<string, any>;

type ActivityItem = {
  id: string;
  title: string;
  city: string;
  date: string;
  dateObject: Date | null;
  organizerId: string;
  participantsCount: number;
  raw: LooseRow;
};

type ParticipantItem = {
  id: string;
  name: string;
  email: string;
};

function firstText(row: LooseRow | null | undefined, keys: string[], fallback = '') {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number') return String(value);
  }

  return fallback;
}

function firstValue(row: LooseRow | null | undefined, keys: string[]) {
  if (!row) return undefined;

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }

  return undefined;
}

function parseDate(value: any) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date;

  return null;
}

function formatDate(value: any) {
  const date = parseDate(value);
  if (!date) return String(value || 'Data non disponibile');

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function activityTitle(row: LooseRow) {
  return firstText(row, ['title', 'titolo', 'name', 'nome', 'activity_title'], 'Esperienza Bajuju');
}

function activityCity(row: LooseRow) {
  return firstText(row, ['city', 'citta', 'comune', 'location_city'], 'Comune non disponibile');
}

function activityDateValue(row: LooseRow) {
  return firstValue(row, [
    'start_at',
    'starts_at',
    'start_time',
    'activity_date',
    'date',
    'data',
    'data_ora',
    'scheduled_at',
  ]);
}

function activityOrganizerId(row: LooseRow) {
  return String(firstValue(row, ['creator_id', 'organizer_id', 'created_by', 'user_id', 'profile_id']) || '');
}

function booleanFromRow(row: LooseRow | null | undefined, keys: string[], fallback = false) {
  const value = firstValue(row, keys);

  if (typeof value === 'boolean') return value;

  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();

    if (['true', '1', 'yes', 'si', 'sì', 'deleted', 'eliminato', 'hidden', 'archived'].includes(normalized)) return true;
    if (['false', '0', 'no', 'active', 'attivo'].includes(normalized)) return false;
  }

  return fallback;
}

function isDeletedActivity(row: LooseRow) {
  const deletedValue = firstValue(row, [
    'deleted_at',
    'removed_at',
    'cancelled_at',
    'canceled_at',
    'archived_at',
    'eliminato_il',
  ]);

  if (deletedValue) return true;

  if (
    booleanFromRow(
      row,
      [
        'is_deleted',
        'deleted',
        'is_removed',
        'removed',
        'is_cancelled',
        'is_canceled',
        'cancelled',
        'canceled',
        'archived',
        'hidden',
      ],
      false
    )
  ) {
    return true;
  }

  const status = firstText(row, ['status', 'stato', 'state', 'activity_status', 'event_status'], '').toLowerCase().trim();

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

function isPastVisibleForTenDays(date: Date | null, now: Date) {
  if (!date) return false;

  const tenDaysAfterEnd = date.getTime() + 10 * 24 * 60 * 60 * 1000;

  return date.getTime() < now.getTime() && tenDaysAfterEnd >= now.getTime();
}

function isAvailableActivity(date: Date | null, now: Date) {
  if (!date) return true;

  return date.getTime() >= now.getTime();
}

function profileName(row: LooseRow | null | undefined, fallback: string) {
  return firstText(row, ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome', 'email'], fallback);
}

async function tryDeleteActivity(activity: ActivityItem) {
  const activityId = String(activity.id || firstValue(activity.raw, ['id', 'activity_id']) || '').trim();

  if (!activityId) {
    return {
      ok: false,
      message: 'ID evento non disponibile.',
    };
  }

  const now = new Date().toISOString();

  const result = await supabase
    .from('activities')
    .update({ deleted_at: now })
    .eq('id', activityId)
    .select('id,deleted_at')
    .maybeSingle();

  if (result.error) {
    return {
      ok: false,
      message: result.error.message || 'Errore Supabase durante eliminazione evento.',
    };
  }

  if (result.data?.deleted_at) {
    return { ok: true, message: '' };
  }

  return {
    ok: false,
    message: 'La riga evento è stata trovata, ma deleted_at non è stato compilato.',
  };
}

export default function AdminEventsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [dateFilter, setDateFilter] = useState('disponibili');

  const filteredActivities = useMemo(() => {
    const now = new Date();

    return activities.filter((item) => {
      if (isDeletedActivity(item.raw)) return false;

      const date = item.dateObject;

      if (dateFilter === 'passati') {
        return isPastVisibleForTenDays(date, now);
      }

      if (!isAvailableActivity(date, now)) return false;

      if (dateFilter === 'oggi') {
        if (!date) return false;
        return date.toDateString() === now.toDateString();
      }

      if (dateFilter === '7giorni') {
        if (!date) return false;
        const sevenDays = now.getTime() + 7 * 24 * 60 * 60 * 1000;
        return date.getTime() >= now.getTime() && date.getTime() <= sevenDays;
      }

      if (dateFilter === '30giorni') {
        if (!date) return false;
        const thirtyDays = now.getTime() + 30 * 24 * 60 * 60 * 1000;
        return date.getTime() >= now.getTime() && date.getTime() <= thirtyDays;
      }

      return true;
    });
  }, [activities, dateFilter]);

  const loadActivities = useCallback(async () => {
    const result = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250);

    if (result.error) {
      setActivities([]);
      Alert.alert('Errore', result.error.message || 'Non sono riuscito a caricare gli eventi.');
      return;
    }

    const rows = (result.data || []) as LooseRow[];
    const mapped: ActivityItem[] = [];

    for (const row of rows) {
      const id = String(firstValue(row, ['id', 'activity_id']) || '');
      if (!id) continue;

      let participantsCount = 0;

      try {
        const participantsResult = await supabase
          .from('activity_participants')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', id);

        participantsCount = participantsResult.count || 0;
      } catch {
        participantsCount = 0;
      }

      const dateValue = activityDateValue(row);

      mapped.push({
        id,
        title: activityTitle(row),
        city: activityCity(row),
        date: formatDate(dateValue),
        dateObject: parseDate(dateValue),
        organizerId: activityOrganizerId(row),
        participantsCount,
        raw: row,
      });
    }

    setActivities(mapped);
  }, []);

  const loadParticipants = useCallback(async (activityId: string) => {
    setParticipants([]);

    const participantsResult = await supabase
      .from('activity_participants')
      .select('*')
      .eq('activity_id', activityId)
      .limit(250);

    if (participantsResult.error) {
      return;
    }

    const rows = (participantsResult.data || []) as LooseRow[];
    const nextParticipants: ParticipantItem[] = [];

    for (const row of rows) {
      const userId = String(firstValue(row, ['user_id', 'profile_id', 'participant_id']) || '');
      if (!userId) continue;

      let profile: LooseRow | null = null;

      const byId = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!byId.error && byId.data) {
        profile = byId.data as LooseRow;
      }


      nextParticipants.push({
        id: userId,
        name: profileName(profile, `Partecipante ${nextParticipants.length + 1}`),
        email: firstText(profile, ['email'], 'Email non disponibile'),
      });
    }

    setParticipants(nextParticipants);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadActivities();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadActivities]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadActivities();
    if (selectedActivity) await loadParticipants(selectedActivity.id);
    setRefreshing(false);
  }, [loadActivities, loadParticipants, selectedActivity]);

  const openActivity = useCallback(
    async (item: ActivityItem) => {
      setSelectedActivity(item);
      await loadParticipants(item.id);
    },
    [loadParticipants]
  );

  const deleteActivity = useCallback(
    async (item: ActivityItem) => {
      Alert.alert('Rimuovere evento', `Vuoi eliminare "${item.title}"?`, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            const result = await tryDeleteActivity(item);

            if (!result.ok) {
              Alert.alert('Errore', result.message);
              return;
            }

            Alert.alert('Fatto', 'Evento rimosso.');
            setSelectedActivity(null);
            setParticipants([]);
            await loadActivities();
          },
        },
      ]);
    },
    [loadActivities]
  );

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Area Admin</Text>
        <Text style={styles.title}>Eventi disponibili</Text>
        <Text style={styles.text}>Eventi mostrati: {filteredActivities.length}</Text>

        <Pressable style={styles.backButton} onPress={() => router.push('/admin')}>
          <Text style={styles.backButtonText}>← Torna ad Admin</Text>
        </Pressable>
      </View>

      <View style={styles.filtersCard}>
        <Text style={styles.sectionTitle}>Scegli cosa vedere</Text>

        <View style={styles.filterRow}>
          {[
            ['disponibili', 'Disponibili'],
            ['oggi', 'Oggi'],
            ['7giorni', 'Prossimi 7 giorni'],
            ['30giorni', 'Prossimi 30 giorni'],
            ['passati', 'Eventi passati'],
          ].map(([value, label]) => (
            <Pressable
              key={value}
              style={[styles.filterChip, dateFilter === value && styles.filterChipActive]}
              onPress={() => setDateFilter(value)}
            >
              <Text style={[styles.filterChipText, dateFilter === value && styles.filterChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico eventi...</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Elenco eventi</Text>

        {filteredActivities.length === 0 ? (
          <Text style={styles.emptyText}>Nessun evento da mostrare qui.</Text>
        ) : (
          filteredActivities.map((item) => (
            <Pressable key={item.id} style={styles.listRow} onPress={() => router.push(`/admin-event-detail?id=${item.id}`)}>
              <View style={styles.listTextBox}>
                <Text style={styles.listTitle}>{item.title}</Text>
                <Text style={styles.listSubtitle}>{item.city} · {item.date}</Text>
                <Text style={styles.listSubtitle}>{item.participantsCount} partecipanti</Text>
              </View>
              <Text style={styles.openText}>Apri →</Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    padding: 18,
    paddingBottom: 40,
    gap: 14,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  detailCard: {
    backgroundColor: '#fff3f9',
    borderColor: '#ef2d82',
  },
  filtersCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  kicker: {
    color: '#ef2d82',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 29,
    fontWeight: '900',
    marginBottom: 8,
  },
  text: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    marginBottom: 14,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  backButtonText: {
    color: '#9b1f61',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#ef2d82',
  },
  filterChipText: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  loadingText: {
    color: '#7b4960',
    fontWeight: '800',
    marginTop: 8,
  },
  emptyText: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    backgroundColor: '#fff8fb',
    padding: 14,
    borderRadius: 16,
  },
  listRow: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listTextBox: {
    flex: 1,
  },
  listTitle: {
    color: '#4b1430',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  listSubtitle: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  openText: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 13,
  },
  detailRow: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 8,
  },
  detailLabel: {
    color: '#9b1f61',
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    color: '#4b1430',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 20,
  },
  participantsTitle: {
    color: '#4b1430',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
    marginBottom: 10,
  },
  participantRow: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 8,
  },
  actionGrid: {
    gap: 10,
    marginTop: 10,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 15,
  },
  dangerButton: {
    backgroundColor: '#b00020',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 15,
  },
  ghostButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef2d82',
  },
  ghostButtonText: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 15,
  },
});
