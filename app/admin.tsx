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

type UserItem = {
  id: string;
  email: string;
  name: string;
  city: string;
  age: string;
  status: string;
  raw: LooseRow;
};

type ActivityItem = {
  id: string;
  title: string;
  city: string;
  date: string;
  organizerId: string;
  participantsCount: number;
  raw: LooseRow;
};

type ReportItem = {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  raw: LooseRow;
};

type AdminStats = {
  users: number;
  activities: number;
  reports: number;
  chatReports: number;
};

function firstText(row: LooseRow | null | undefined, keys: string[], fallback = '') {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Sì' : 'No';
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

function userName(row: LooseRow) {
  return firstText(
    row,
    ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome', 'first_name', 'email'],
    'Utente Bajuju'
  );
}

function userEmail(row: LooseRow) {
  return firstText(row, ['email'], 'Email non disponibile');
}

function userId(row: LooseRow) {
  return String(firstValue(row, ['id', 'user_id', 'profile_id']) || '');
}

function userStatus(row: LooseRow) {
  const suspendedUntil = firstText(row, ['suspended_until', 'sospeso_fino'], '');
  const blockedUntil = firstText(row, ['blocked_until', 'bloccato_fino'], '');
  const deletedAt = firstText(row, ['deleted_at', 'eliminato_il'], '');
  const rawStatus = firstText(row, ['status', 'stato', 'account_status'], '');

  if (deletedAt) return 'Eliminato / disattivato';
  if (suspendedUntil) return `Sospeso fino a ${formatDate(suspendedUntil)}`;
  if (blockedUntil) return `Bloccato fino a ${formatDate(blockedUntil)}`;
  if (rawStatus) return rawStatus;

  return 'Attivo';
}

function activityTitle(row: LooseRow) {
  return firstText(row, ['title', 'titolo', 'name', 'nome', 'activity_title'], 'Esperienza Bajuju');
}

function activityCity(row: LooseRow) {
  return firstText(row, ['city', 'citta', 'comune', 'location_city'], 'Comune non disponibile');
}

function activityDate(row: LooseRow) {
  return firstText(row, ['start_at', 'starts_at', 'activity_date', 'date', 'data', 'data_ora'], '');
}

function activityOrganizerId(row: LooseRow) {
  return String(firstValue(row, ['creator_id', 'organizer_id', 'created_by', 'user_id', 'profile_id']) || '');
}

function reportTitle(row: LooseRow) {
  return firstText(row, ['title', 'titolo', 'reason', 'motivo', 'type', 'tipo'], 'Segnalazione');
}

function reportSubtitle(row: LooseRow) {
  return firstText(
    row,
    ['description', 'descrizione', 'message', 'messaggio', 'content', 'body', 'note'],
    'Dettaglio non disponibile'
  );
}

async function countRows(table: string) {
  try {
    const result = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (!result.error && typeof result.count === 'number') return result.count;
  } catch {
    // Ignoro: tabella non presente o non leggibile.
  }

  return 0;
}

async function tryUpdateById(table: string, id: string, payloads: LooseRow[]) {
  for (const payload of payloads) {
    try {
      const result = await supabase.from(table).update(payload).eq('id', id);

      if (!result.error) return { ok: true, message: '' };
    } catch {
      // Prova payload successivo.
    }
  }

  return { ok: false, message: 'Aggiornamento non riuscito. Probabile policy Supabase o colonne mancanti.' };
}

async function tryDeleteActivity(activity: ActivityItem) {
  const now = new Date().toISOString();

  const attempts = [
    { deleted_at: now, status: 'deleted' },
    { deleted_at: now },
    { is_deleted: true, status: 'deleted' },
    { hidden: true, status: 'deleted' },
    { status: 'deleted' },
    { stato: 'eliminato' },
  ];

  for (const payload of attempts) {
    try {
      const result = await supabase.from('activities').update(payload).eq('id', activity.id);

      if (!result.error) return { ok: true, message: '' };
    } catch {
      // Prova prossimo payload.
    }
  }

  return { ok: false, message: 'Non sono riuscito a eliminare l’evento. Probabile policy Supabase o colonna mancante.' };
}

export default function AdminScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<AdminStats>({
    users: 0,
    activities: 0,
    reports: 0,
    chatReports: 0,
  });
  const [users, setUsers] = useState<UserItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [chatReports, setChatReports] = useState<ReportItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedUserLines = useMemo(() => {
    if (!selectedUser) return [];

    return [
      ['Email', selectedUser.email],
      ['Nome', selectedUser.name],
      ['Città', selectedUser.city || 'Non indicata'],
      ['Età', selectedUser.age || 'Non indicata'],
      ['Stato', selectedUser.status],
      ['User ID', selectedUser.id],
    ];
  }, [selectedUser]);

  const loadUsers = useCallback(async () => {
    const result = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (result.error) {
      setUsers([]);
      return;
    }

    const mapped = ((result.data || []) as LooseRow[])
      .map((row) => ({
        id: userId(row),
        email: userEmail(row),
        name: userName(row),
        city: firstText(row, ['city', 'citta', 'comune', 'location_city'], ''),
        age: firstText(row, ['age', 'eta', 'età', 'user_age'], ''),
        status: userStatus(row),
        raw: row,
      }))
      .filter((item) => Boolean(item.id));

    setUsers(mapped);
  }, []);

  const loadActivities = useCallback(async () => {
    const result = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (result.error) {
      setActivities([]);
      return;
    }

    const rows = (result.data || []) as LooseRow[];

    const mapped: ActivityItem[] = [];

    for (const row of rows) {
      const id = String(firstValue(row, ['id', 'activity_id']) || '');
      if (!id) continue;

      let participantsCount = 0;

      try {
        const participants = await supabase
          .from('activity_participants')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', id);

        participantsCount = participants.count || 0;
      } catch {
        participantsCount = 0;
      }

      mapped.push({
        id,
        title: activityTitle(row),
        city: activityCity(row),
        date: activityDate(row),
        organizerId: activityOrganizerId(row),
        participantsCount,
        raw: row,
      });
    }

    setActivities(mapped);
  }, []);

  const loadReports = useCallback(async () => {
    const possibleTables = ['reports', 'user_reports', 'activity_reports'];
    const collected: ReportItem[] = [];

    for (const table of possibleTables) {
      try {
        const result = await supabase
          .from(table)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!result.error && Array.isArray(result.data)) {
          collected.push(
            ...((result.data || []) as LooseRow[]).map((row, index) => ({
              id: String(firstValue(row, ['id', 'report_id']) || `${table}-${index}`),
              title: reportTitle(row),
              subtitle: reportSubtitle(row),
              createdAt: firstText(row, ['created_at', 'date', 'data'], ''),
              raw: { ...row, _table: table },
            }))
          );
        }
      } catch {
        // Tabella non presente.
      }
    }

    setReports(collected);
  }, []);

  const loadChatReports = useCallback(async () => {
    const collected: ReportItem[] = [];

    const attempts = [
      async () =>
        supabase
          .from('activity_messages')
          .select('*')
          .eq('reported', true)
          .order('created_at', { ascending: false })
          .limit(50),
      async () =>
        supabase
          .from('activity_messages')
          .select('*')
          .eq('is_reported', true)
          .order('created_at', { ascending: false })
          .limit(50),
      async () =>
        supabase
          .from('activity_messages')
          .select('*')
          .neq('reported_at', null)
          .order('created_at', { ascending: false })
          .limit(50),
    ];

    for (const attempt of attempts) {
      try {
        const result = await attempt();

        if (!result.error && Array.isArray(result.data)) {
          collected.push(
            ...((result.data || []) as LooseRow[]).map((row, index) => ({
              id: String(firstValue(row, ['id', 'message_id']) || `chat-${index}`),
              title: 'Chat segnalata',
              subtitle: firstText(row, ['message', 'content', 'body'], 'Messaggio non disponibile'),
              createdAt: firstText(row, ['created_at', 'reported_at'], ''),
              raw: row,
            }))
          );

          break;
        }
      } catch {
        // Prova successiva.
      }
    }

    setChatReports(collected);
  }, []);

  const loadAll = useCallback(async () => {
    setErrorMessage('');

    try {
      const [usersCount, activitiesCount, reportsCount, chatReportsCount] = await Promise.all([
        countRows('profiles'),
        countRows('activities'),
        countRows('reports'),
        countRows('activity_messages'),
      ]);

      setStats({
        users: usersCount,
        activities: activitiesCount,
        reports: reportsCount,
        chatReports: chatReportsCount,
      });

      await Promise.all([loadUsers(), loadActivities(), loadReports(), loadChatReports()]);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Non sono riuscito a caricare l’Area Admin.');
    }
  }, [loadActivities, loadChatReports, loadReports, loadUsers]);

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

  const suspendUser = useCallback(
    async (item: UserItem) => {
      Alert.alert(
        'Sospendere utente',
        `Vuoi sospendere ${item.name}?`,
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Sospendi',
            style: 'destructive',
            onPress: async () => {
              const result = await tryUpdateById('profiles', item.id, [
                { status: 'suspended', suspended_at: new Date().toISOString() },
                { account_status: 'suspended', suspended_at: new Date().toISOString() },
                { stato: 'sospeso' },
              ]);

              if (!result.ok) {
                Alert.alert('Errore', result.message);
                return;
              }

              Alert.alert('Fatto', 'Utente sospeso.');
              await loadAll();
            },
          },
        ]
      );
    },
    [loadAll]
  );

  const blockUserSevenDays = useCallback(
    async (item: UserItem) => {
      const blockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      Alert.alert(
        'Bloccare utente',
        `Vuoi bloccare ${item.name} per una settimana?`,
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Blocca 7 giorni',
            style: 'destructive',
            onPress: async () => {
              const result = await tryUpdateById('profiles', item.id, [
                { blocked_until: blockedUntil, status: 'blocked' },
                { blocked_until: blockedUntil, account_status: 'blocked' },
                { is_blocked: true, blocked_until: blockedUntil },
                { bloccato_fino: blockedUntil, stato: 'bloccato' },
              ]);

              if (!result.ok) {
                Alert.alert('Errore', result.message);
                return;
              }

              Alert.alert('Fatto', 'Utente bloccato per 7 giorni.');
              await loadAll();
            },
          },
        ]
      );
    },
    [loadAll]
  );

  const deleteUser = useCallback(
    async (item: UserItem) => {
      Alert.alert(
        'Eliminare utente',
        `Vuoi eliminare/disattivare ${item.name}? Questa azione lo nasconde lato app, ma l’eliminazione completa Auth può richiedere una funzione admin Supabase.`,
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: async () => {
              const result = await tryUpdateById('profiles', item.id, [
                { deleted_at: new Date().toISOString(), status: 'deleted' },
                { deleted_at: new Date().toISOString(), account_status: 'deleted' },
                { is_deleted: true, status: 'deleted' },
                { stato: 'eliminato' },
              ]);

              if (!result.ok) {
                Alert.alert('Errore', result.message);
                return;
              }

              Alert.alert('Fatto', 'Utente eliminato/disattivato.');
              setSelectedUser(null);
              await loadAll();
            },
          },
        ]
      );
    },
    [loadAll]
  );

  const deleteActivity = useCallback(
    async (item: ActivityItem) => {
      Alert.alert(
        'Eliminare evento',
        `Vuoi eliminare "${item.title}"?`,
        [
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

              Alert.alert('Fatto', 'Evento eliminato.');
              setSelectedActivity(null);
              await loadAll();
            },
          },
        ]
      );
    },
    [loadAll]
  );

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title}>Area Admin</Text>
        <Text style={styles.text}>
          Controllo mobile per utenti, eventi, partecipanti, segnalazioni e chat segnalate.
        </Text>

        <Pressable style={styles.button} onPress={() => router.push('/profile')}>
          <Text style={styles.buttonText}>Torna al profilo</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Caricamento Area Admin...</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Errore</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.users}</Text>
          <Text style={styles.statLabel}>Iscritti totali</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.activities}</Text>
          <Text style={styles.statLabel}>Eventi totali</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{reports.length || stats.reports}</Text>
          <Text style={styles.statLabel}>Segnalazioni</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{chatReports.length}</Text>
          <Text style={styles.statLabel}>Chat segnalate</Text>
        </View>
      </View>

      {selectedUser ? (
        <View style={[styles.card, styles.detailCard]}>
          <Text style={styles.sectionTitle}>Dettaglio utente</Text>

          {selectedUserLines.map(([label, value]) => (
            <View key={label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{label}</Text>
              <Text style={styles.detailValue}>{value}</Text>
            </View>
          ))}

          <View style={styles.actionGrid}>
            <Pressable style={styles.warningButton} onPress={() => suspendUser(selectedUser)}>
              <Text style={styles.actionButtonText}>Sospendi</Text>
            </Pressable>

            <Pressable style={styles.warningButton} onPress={() => blockUserSevenDays(selectedUser)}>
              <Text style={styles.actionButtonText}>Blocca 7 giorni</Text>
            </Pressable>

            <Pressable style={styles.dangerButton} onPress={() => deleteUser(selectedUser)}>
              <Text style={styles.actionButtonText}>Elimina utente</Text>
            </Pressable>

            <Pressable style={styles.ghostButton} onPress={() => setSelectedUser(null)}>
              <Text style={styles.ghostButtonText}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {selectedActivity ? (
        <View style={[styles.card, styles.detailCard]}>
          <Text style={styles.sectionTitle}>Dettaglio evento</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Titolo</Text>
            <Text style={styles.detailValue}>{selectedActivity.title}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Comune</Text>
            <Text style={styles.detailValue}>{selectedActivity.city}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Data</Text>
            <Text style={styles.detailValue}>{selectedActivity.date || 'Non disponibile'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Partecipanti</Text>
            <Text style={styles.detailValue}>{selectedActivity.participantsCount}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Organizzatore ID</Text>
            <Text style={styles.detailValue}>{selectedActivity.organizerId || 'Non disponibile'}</Text>
          </View>

          <View style={styles.actionGrid}>
            <Pressable style={styles.button} onPress={() => router.push(`/experience-detail?id=${selectedActivity.id}`)}>
              <Text style={styles.buttonText}>Vedi evento</Text>
            </Pressable>

            <Pressable style={styles.dangerButton} onPress={() => deleteActivity(selectedActivity)}>
              <Text style={styles.actionButtonText}>Elimina evento</Text>
            </Pressable>

            <Pressable style={styles.ghostButton} onPress={() => setSelectedActivity(null)}>
              <Text style={styles.ghostButtonText}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Utenti iscritti</Text>
        <Text style={styles.sectionHint}>Tocca un utente per sospendere, bloccare o eliminare.</Text>

        {users.length === 0 ? (
          <Text style={styles.emptyText}>Nessun utente visibile.</Text>
        ) : (
          users.map((item) => (
            <Pressable key={item.id} style={styles.listRow} onPress={() => setSelectedUser(item)}>
              <View style={styles.listTextBox}>
                <Text style={styles.listTitle}>{item.name}</Text>
                <Text style={styles.listSubtitle}>{item.email}</Text>
                <Text style={styles.listSubtitle}>{item.city || 'Città non indicata'} · {item.status}</Text>
              </View>
              <Text style={styles.openText}>Apri →</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Eventi</Text>
        <Text style={styles.sectionHint}>Da qui puoi vedere partecipanti ed eliminare eventi.</Text>

        {activities.length === 0 ? (
          <Text style={styles.emptyText}>Nessun evento visibile.</Text>
        ) : (
          activities.map((item) => (
            <Pressable key={item.id} style={styles.listRow} onPress={() => setSelectedActivity(item)}>
              <View style={styles.listTextBox}>
                <Text style={styles.listTitle}>{item.title}</Text>
                <Text style={styles.listSubtitle}>{item.city} · {item.date || 'Data non disponibile'}</Text>
                <Text style={styles.listSubtitle}>{item.participantsCount} partecipanti</Text>
              </View>
              <Text style={styles.openText}>Apri →</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Segnalazioni</Text>

        {reports.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna segnalazione visibile.</Text>
        ) : (
          reports.map((item) => (
            <View key={item.id} style={styles.reportBox}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listSubtitle}>{item.subtitle}</Text>
              <Text style={styles.reportDate}>{formatDate(item.createdAt)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Chat segnalate</Text>

        {chatReports.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna chat segnalata visibile.</Text>
        ) : (
          chatReports.map((item) => (
            <View key={item.id} style={styles.reportBox}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listSubtitle}>{item.subtitle}</Text>
              <Text style={styles.reportDate}>{formatDate(item.createdAt)}</Text>
            </View>
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  detailCard: {
    borderColor: '#ef2d82',
    backgroundColor: '#fff3f9',
  },
  kicker: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 14,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 10,
  },
  text: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
    fontWeight: '700',
  },
  mutedText: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#fff0f3',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffb0c1',
  },
  errorTitle: {
    color: '#b00020',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  errorText: {
    color: '#7b1d35',
    fontSize: 15,
    lineHeight: 21,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  statsGrid: {
    gap: 10,
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  statNumber: {
    color: '#ef2d82',
    fontSize: 34,
    fontWeight: '900',
  },
  statLabel: {
    color: '#4b1430',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  sectionHint: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    fontWeight: '700',
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
  actionGrid: {
    gap: 10,
    marginTop: 10,
  },
  warningButton: {
    backgroundColor: '#9b1f61',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
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
  reportBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 10,
  },
  reportDate: {
    marginTop: 8,
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
  },
});
