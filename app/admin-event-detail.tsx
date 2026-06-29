import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

type ParticipantItem = {
  id: string;
  name: string;
  email: string;
};

type OrganizerItem = {
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

function formatDate(value: any) {
  if (!value) return 'Data non disponibile';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function activityTitle(row: LooseRow | null) {
  return firstText(row, ['title', 'titolo', 'name', 'nome', 'activity_title'], 'Esperienza Bajuju');
}

function activityDateValue(row: LooseRow | null) {
  return firstValue(row, ['start_at', 'starts_at', 'start_time', 'activity_date', 'date', 'data', 'data_ora', 'scheduled_at']);
}

function profileName(row: LooseRow | null | undefined, fallback: string) {
  return firstText(row, ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome', 'email'], fallback);
}

function getOrganizerId(row: LooseRow | null | undefined) {
  return String(firstValue(row, ['creator_id', 'organizer_id', 'created_by', 'user_id', 'profile_id']) || '').trim();
}

async function tryDeleteActivity(activityId: string) {
  const cleanActivityId = String(activityId || '').trim();

  if (!cleanActivityId) {
    return {
      ok: false,
      message: 'ID evento non disponibile.',
    };
  }

  const now = new Date().toISOString();

  const result = await supabase
    .from('activities')
    .update({ deleted_at: now })
    .eq('id', cleanActivityId)
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

export default function AdminEventDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const activityId = String(params.id || '');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activity, setActivity] = useState<LooseRow | null>(null);
  const [organizer, setOrganizer] = useState<OrganizerItem | null>(null);
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);

  const loadActivity = useCallback(async () => {
    if (!activityId) {
      setActivity(null);
      return;
    }

    const result = await supabase.from('activities').select('*').eq('id', activityId).maybeSingle();

    if (!result.error && result.data) {
      setActivity(result.data as LooseRow);
    } else {
      setActivity(null);
    }
  }, [activityId]);

  const loadOrganizer = useCallback(async () => {
    setOrganizer(null);

    if (!activityId) return;

    const activityResult = await supabase.from('activities').select('*').eq('id', activityId).maybeSingle();

    if (activityResult.error || !activityResult.data) return;

    const row = activityResult.data as LooseRow;
    const organizerId = getOrganizerId(row);

    if (!organizerId) return;

    let profile: LooseRow | null = null;

    const byId = await supabase.from('profiles').select('*').eq('id', organizerId).maybeSingle();
    if (!byId.error && byId.data) profile = byId.data as LooseRow;

    if (!profile) {
      const byUserId = await supabase.from('profiles').select('*').eq('user_id', organizerId).maybeSingle();
      if (!byUserId.error && byUserId.data) profile = byUserId.data as LooseRow;
    }

    setOrganizer({
      id: String(firstValue(profile, ['id', 'user_id']) || organizerId),
      name: profileName(profile, 'Organizzatore non trovato'),
      email: firstText(profile, ['email'], 'Email non disponibile'),
    });
  }, [activityId]);

  const loadParticipants = useCallback(async () => {
    setParticipants([]);

    if (!activityId) return;

    const participantsResult = await supabase
      .from('activity_participants')
      .select('*')
      .eq('activity_id', activityId)
      .limit(250);

    if (participantsResult.error) return;

    const rows = (participantsResult.data || []) as LooseRow[];
    const nextParticipants: ParticipantItem[] = [];

    for (const row of rows) {
      const userId = String(firstValue(row, ['user_id', 'profile_id', 'participant_id']) || '');
      if (!userId) continue;

      let profile: LooseRow | null = null;

      const byId = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!byId.error && byId.data) profile = byId.data as LooseRow;

      if (!profile) {
        const byUserId = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
        if (!byUserId.error && byUserId.data) profile = byUserId.data as LooseRow;
      }

      nextParticipants.push({
        id: userId,
        name: profileName(profile, `Partecipante ${nextParticipants.length + 1}`),
        email: firstText(profile, ['email'], 'Email non disponibile'),
      });
    }

    setParticipants(nextParticipants);
  }, [activityId]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadActivity(), loadOrganizer(), loadParticipants()]);
  }, [loadActivity, loadOrganizer, loadParticipants]);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadAll();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const deleteActivity = useCallback(() => {
    if (!activityId || !activity) return;

    Alert.alert('Rimuovere evento', `Vuoi eliminare "${activityTitle(activity)}"?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          const result = await tryDeleteActivity(activityId);

          if (!result.ok) {
            Alert.alert('Errore', result.message);
            return;
          }

          Alert.alert('Fatto', 'Evento rimosso.');
          router.replace('/admin-events');
        },
      },
    ]);
  }, [activity, activityId]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Area Admin</Text>
        <Text style={styles.title}>Dettaglio evento</Text>

        <Pressable style={styles.backButton} onPress={() => router.push('/admin-events')}>
          <Text style={styles.backButtonText}>← Torna agli eventi</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico evento...</Text>
        </View>
      ) : null}

      {!loading && !activity ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>Evento non trovato.</Text>
        </View>
      ) : null}

      {activity ? (
        <>
          <View style={styles.card}>
            <Text style={styles.name}>{activityTitle(activity)}</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Comune / Provincia</Text>
              <Text style={styles.detailValue}>
                {firstText(activity, ['city', 'citta', 'comune'], 'Comune non disponibile')} ·{' '}
                {firstText(activity, ['province', 'provincia'], 'Provincia non disponibile')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Data</Text>
              <Text style={styles.detailValue}>{formatDate(activityDateValue(activity))}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Organizzatore</Text>

              {organizer ? (
                <Pressable
                  style={styles.organizerButton}
                  onPress={() => router.push(`/admin-user-detail?id=${organizer.id}`)}
                >
                  <Text style={styles.organizerName}>{organizer.name}</Text>
                  <Text style={styles.organizerEmail}>{organizer.email}</Text>
                </Pressable>
              ) : (
                <Text style={styles.detailValue}>Organizzatore non disponibile</Text>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Partecipanti evento</Text>

            {participants.length === 0 ? (
              <Text style={styles.emptyText}>Nessun partecipante visibile.</Text>
            ) : (
              participants.map((item) => (
                <View key={item.id} style={styles.participantRow}>
                  <Text style={styles.listTitle}>{item.name}</Text>
                  <Text style={styles.listSubtitle}>{item.email}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Azioni evento</Text>

            <Pressable style={styles.button} onPress={() => router.push(`/experience-detail?id=${activityId}`)}>
              <Text style={styles.buttonText}>Apri evento pubblico</Text>
            </Pressable>

            <Pressable style={styles.dangerButton} onPress={deleteActivity}>
              <Text style={styles.actionButtonText}>Rimuovi evento</Text>
            </Pressable>
          </View>
        </>
      ) : null}
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
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 10,
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
    marginBottom: 12,
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
  loadingText: {
    color: '#7b4960',
    fontWeight: '800',
    marginTop: 8,
  },
  emptyText: {
    color: '#7b4960',
    fontSize: 15,
    fontWeight: '800',
  },
  name: {
    color: '#4b1430',
    fontSize: 24,
    fontWeight: '900',
  },
  organizerButton: {
    backgroundColor: '#fff0f7',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  organizerName: {
    color: '#e43f98',
    fontSize: 16,
    fontWeight: '900',
  },
  organizerEmail: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 8,
  },
  detailRow: {
    backgroundColor: '#fff8fb',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  detailLabel: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  detailValue: {
    color: '#4b1430',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  participantRow: {
    backgroundColor: '#fff8fb',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
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
});
