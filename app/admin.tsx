import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';

type AdminStats = {
  users: number;
  activities: number;
  reports: number;
  chatReports: number;
};

async function countRows(table: string) {
  try {
    const result = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (!result.error && typeof result.count === 'number') return result.count;
  } catch {
    // Tabella non presente o non leggibile.
  }

  return 0;
}

function firstAdminValue(row: Record<string, any> | null | undefined, keys: string[]) {
  if (!row) return undefined;

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }

  return undefined;
}

function firstAdminText(row: Record<string, any> | null | undefined, keys: string[], fallback = '') {
  const value = firstAdminValue(row, keys);

  if (value === undefined || value === null) return fallback;

  return String(value);
}

function booleanAdminValue(row: Record<string, any> | null | undefined, keys: string[], fallback = false) {
  const value = firstAdminValue(row, keys);

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();

    if (['true', '1', 'yes', 'si', 'sì', 'deleted', 'eliminato', 'hidden', 'archived'].includes(normalized)) return true;
    if (['false', '0', 'no', 'active', 'attivo'].includes(normalized)) return false;
  }

  return fallback;
}

function adminActivityDateValue(row: Record<string, any>) {
  return firstAdminValue(row, [
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

function parseAdminDate(value: any) {
  if (!value) return null;

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) return date;

  return null;
}

function isAdminDeletedActivity(row: Record<string, any>) {
  const deletedValue = firstAdminValue(row, [
    'deleted_at',
    'removed_at',
    'cancelled_at',
    'canceled_at',
    'archived_at',
    'eliminato_il',
  ]);

  if (deletedValue) return true;

  if (
    booleanAdminValue(
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

  const status = firstAdminText(row, ['status', 'stato', 'state', 'activity_status', 'event_status'], '').toLowerCase().trim();

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

function isAdminAvailableActivity(row: Record<string, any>) {
  if (isAdminDeletedActivity(row)) return false;

  const date = parseAdminDate(adminActivityDateValue(row));

  if (!date) return true;

  return date.getTime() >= new Date().getTime();
}

async function countAvailableActivities() {
  try {
    const result = await supabase
      .from('activities')
      .select('*')
      .limit(1000);

    if (result.error || !Array.isArray(result.data)) return 0;

    return result.data.filter((row) => isAdminAvailableActivity(row as Record<string, any>)).length;
  } catch {
    return 0;
  }
}

async function countReports() {
  const tables = ['reports', 'user_reports', 'activity_reports'];

  for (const table of tables) {
    const count = await countRows(table);
    if (count > 0) return count;
  }

  return 0;
}

async function countChatReports() {
  const attempts = [
    async () => supabase.from('activity_messages').select('*', { count: 'exact', head: true }).eq('reported', true),
    async () => supabase.from('activity_messages').select('*', { count: 'exact', head: true }).eq('is_reported', true),
    async () => supabase.from('activity_messages').select('*', { count: 'exact', head: true }).not('reported_at', 'is', null),
    async () => supabase.from('chat_reports').select('*', { count: 'exact', head: true }),
    async () => supabase.from('message_reports').select('*', { count: 'exact', head: true }),
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (!result.error && typeof result.count === 'number') return result.count;
    } catch {
      // Prova successiva.
    }
  }

  return 0;
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

  const loadStats = useCallback(async () => {
    const [users, activities, reports, chatReports] = await Promise.all([
      countRows('profiles'),
      countAvailableActivities(),
      countReports(),
      countChatReports(),
    ]);

    setStats({
      users,
      activities,
      reports,
      chatReports,
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadStats();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title}>Area Admin</Text>
        <Text style={styles.text}>
          Pannello rapido per controllare utenti, eventi, segnalazioni e chat segnalate.
        </Text>

        <Pressable style={styles.backButton} onPress={() => router.push('/profile')}>
          <Text style={styles.backButtonText}>← Torna al profilo</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico dati admin...</Text>
        </View>
      ) : null}

      <View style={styles.menuCard}>
        <Text style={styles.sectionTitle}>Controlli principali</Text>

        <Pressable style={styles.menuRow} onPress={() => router.push('/admin-users')}>
          <View style={styles.menuIconBox}>
            <Text style={styles.menuIcon}>👥</Text>
          </View>
          <View style={styles.menuTextBox}>
            <Text style={styles.menuTitle}>Iscritti totali</Text>
            <Text style={styles.menuSubtitle}>Elenco utenti, filtri e gestione profili.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stats.users}</Text>
          </View>
        </Pressable>

        <Pressable style={styles.menuRow} onPress={() => router.push('/admin-events')}>
          <View style={styles.menuIconBox}>
            <Text style={styles.menuIcon}>📅</Text>
          </View>
          <View style={styles.menuTextBox}>
            <Text style={styles.menuTitle}>Eventi disponibili</Text>
            <Text style={styles.menuSubtitle}>Elenco eventi, filtro data e partecipanti.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stats.activities}</Text>
          </View>
        </Pressable>

        <Pressable style={styles.menuRow} onPress={() => router.push('/admin-reports')}>
          <View style={styles.menuIconBox}>
            <Text style={styles.menuIcon}>🚩</Text>
          </View>
          <View style={styles.menuTextBox}>
            <Text style={styles.menuTitle}>Segnalazioni</Text>
            <Text style={styles.menuSubtitle}>Apri l’elenco delle segnalazioni ricevute.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stats.reports}</Text>
          </View>
        </Pressable>

        <Pressable style={styles.menuRow} onPress={() => router.push('/admin-chat-reports')}>
          <View style={styles.menuIconBox}>
            <Text style={styles.menuIcon}>💬</Text>
          </View>
          <View style={styles.menuTextBox}>
            <Text style={styles.menuTitle}>Chat segnalate</Text>
            <Text style={styles.menuSubtitle}>Mostra solo i messaggi realmente segnalati.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stats.chatReports}</Text>
          </View>
        </Pressable>
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
  kicker: {
    color: '#ef2d82',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 31,
    fontWeight: '900',
    marginBottom: 8,
  },
  text: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 16,
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
  loadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#7b4960',
    fontWeight: '800',
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 10,
    gap: 12,
  },
  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffe3f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 22,
  },
  menuTextBox: {
    flex: 1,
  },
  menuTitle: {
    color: '#4b1430',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 3,
  },
  menuSubtitle: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  countPill: {
    minWidth: 42,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ef2d82',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  countText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
