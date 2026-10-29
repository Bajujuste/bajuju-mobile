import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { countPendingLocationRequests } from '../../src/lib/bajujuLocations';
import { supabase } from '../../src/lib/supabase';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';

type AdminStats = {
  users: number;
  activities: number;
  reports: number;
  chatReports: number;
  groupApprovals: number;
  locationRequests: number;
  supportUnread: number;
};

function firstValue(row: Record<string, any> | null | undefined, keys: string[]) {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function firstText(row: Record<string, any> | null | undefined, keys: string[], fallback = '') {
  const value = firstValue(row, keys);
  return value === undefined || value === null ? fallback : String(value);
}

function boolValue(row: Record<string, any> | null | undefined, keys: string[], fallback = false) {
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

function isDeletedUser(row: Record<string, any>) {
  const deletedAt = firstText(row, ['deleted_at', 'eliminato_il', 'removed_at', 'archived_at']);
  if (deletedAt) return true;

  const status = firstText(row, ['status', 'stato', 'account_status']).toLowerCase().trim();
  if (['deleted', 'eliminato', 'eliminata', 'removed', 'archived', 'disattivato', 'disattivata'].includes(status)) {
    return true;
  }

  return boolValue(row, ['is_deleted', 'deleted', 'is_removed', 'removed']);
}

function isDeletedActivity(row: Record<string, any>) {
  if (firstValue(row, ['deleted_at', 'removed_at', 'cancelled_at', 'canceled_at', 'archived_at', 'eliminato_il'])) {
    return true;
  }

  if (
    boolValue(row, [
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
    ])
  ) {
    return true;
  }

  const status = firstText(row, ['status', 'stato', 'state', 'activity_status', 'event_status']).toLowerCase().trim();
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

function activityDate(row: Record<string, any>) {
  const value = firstValue(row, [
    'start_at',
    'starts_at',
    'start_time',
    'activity_date',
    'date',
    'data',
    'data_ora',
    'scheduled_at',
  ]);

  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function countActiveUsers() {
  try {
    const result = await supabase.from('profiles').select('*').limit(1000);
    if (result.error || !Array.isArray(result.data)) return 0;
    return result.data.filter((row) => !isDeletedUser(row as Record<string, any>)).length;
  } catch {
    return 0;
  }
}

async function countAvailableActivities() {
  try {
    const result = await supabase.from('activities').select('*').limit(1000);
    if (result.error || !Array.isArray(result.data)) return 0;

    const now = Date.now();
    return result.data.filter((row) => {
      const activity = row as Record<string, any>;
      if (isDeletedActivity(activity)) return false;
      const date = activityDate(activity);
      return !date || date.getTime() >= now;
    }).length;
  } catch {
    return 0;
  }
}

async function countRows(table: string) {
  try {
    const result = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (!result.error && typeof result.count === 'number') return result.count;
  } catch {
    // Prova successiva.
  }
  return 0;
}

async function countReports() {
  for (const table of ['reports', 'user_reports']) {
    const count = await countRows(table);
    if (count > 0) return count;
  }
  return 0;
}

async function countChatReports() {
  for (const table of ['chat_reports', 'message_reports']) {
    try {
      const result = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (!result.error && typeof result.count === 'number' && result.count > 0) return result.count;
    } catch {
      // Prova la tabella di segnalazioni successiva.
    }
  }

  return 0;
}


async function countPendingGroups() {
  try {
    const result = await supabase
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    return result.error ? 0 : result.count || 0;
  } catch {
    return 0;
  }
}

async function countSupportUnread() {
  try {
    const authResult = await supabase.auth.getUser();
    const userId = authResult.data.user?.id || '';
    if (!userId) return 0;

    const result = await supabase
      .from('admin_private_messages')
      .select('id', { count: 'exact', head: true })
      .neq('sender_id', userId)
      .is('read_at', null);

    return result.error ? 0 : result.count || 0;
  } catch {
    return 0;
  }
}

export default function AdminScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<AdminStats>({
    users: 0,
    activities: 0,
    reports: 0,
    chatReports: 0,
    groupApprovals: 0,
    locationRequests: 0,
    supportUnread: 0,
  });

  const loadStats = useCallback(async () => {
    const [users, activities, reports, chatReports, groupApprovals, locationRequests, supportUnread] = await Promise.all([
      countActiveUsers(),
      countAvailableActivities(),
      countReports(),
      countChatReports(),
      countPendingGroups(),
      countPendingLocationRequests().catch(() => 0),
      countSupportUnread(),
    ]);

    setStats({ users, activities, reports, chatReports, groupApprovals, locationRequests, supportUnread });
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setLoading(true);
      try {
        await loadStats();
      } catch {
        console.log('Errore caricamento statistiche admin.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadStats();
    } catch {
      console.log('Errore aggiornamento statistiche admin.');
    } finally {
      setRefreshing(false);
    }
  }, [loadStats]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E43F98" />}
      >
        <View style={styles.headerCard}>
          <Text style={styles.kicker}>Bajuju</Text>
          <Text style={styles.title}>Area Admin</Text>
          <Text style={styles.text}>
            Pannello rapido per controllare community, eventi, statistiche, segnalazioni e sicurezza.
          </Text>

          <BajujuBackButton onPress={() => router.push('/profile')} accessibilityLabel="Indietro" style={{ alignSelf: 'flex-start' }} />
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#E43F98" />
            <Text style={styles.loadingText}>Carico dati admin...</Text>
          </View>
        ) : null}

        <View style={styles.menuCard}>
          <Text style={styles.sectionTitle}>Controlli principali</Text>

          <AdminRow
            icon="🎙️"
            title="Crea evento con dettatura"
            subtitle="Detta i dati, controlla il riepilogo e pubblica l’evento."
            onPress={() => router.push('/admin-create-experience')}
          />

          <AdminRow
            icon="📊"
            title="Statistiche utilizzo"
            subtitle="Utenti attivi, aperture, partecipazioni, creazioni e località negli ultimi 7 o 30 giorni."
            onPress={() => router.push('/admin-analytics' as any)}
          />

          <AdminRow
            icon="👥"
            title="Iscritti attivi"
            subtitle="Controlla utenti attivi, stati profilo e azioni di sicurezza."
            count={stats.users}
            onPress={() => router.push('/admin-users')}
          />

          <AdminRow
            icon="✅"
            title="Gruppi da approvare"
            subtitle="Controlla le nuove richieste e scegli se pubblicarle."
            count={stats.groupApprovals}
            onPress={() => router.push('/admin-groups' as any)}
          />

          <AdminRow
            icon="🏠"
            title="Location da approvare"
            subtitle="Approva i locali che hanno chiesto di diventare Location, oppure crea tu una location."
            count={stats.locationRequests}
            onPress={() => router.push('/admin-locations' as any)}
          />

          <AdminRow
            icon="💌"
            title="Messaggi Bajuju"
            subtitle="Conversazioni private degli utenti con l’amministrazione."
            count={stats.supportUnread}
            onPress={() => router.push('/admin-support-inbox' as any)}
          />

          <AdminRow
            icon="📅"
            title="Eventi disponibili"
            subtitle="Controlla eventi disponibili, partecipanti e cancellazioni sicure."
            count={stats.activities}
            onPress={() => router.push('/admin-events')}
          />

          <AdminRow
            icon="🚩"
            title="Segnalazioni"
            subtitle="Apri l’elenco delle segnalazioni ricevute."
            count={stats.reports}
            onPress={() => router.push('/admin-reports')}
          />

          <AdminRow
            icon="💬"
            title="Chat segnalate"
            subtitle="Mostra solo i messaggi realmente segnalati."
            count={stats.chatReports}
            onPress={() => router.push('/admin-chat-reports')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AdminRow({
  icon,
  title,
  subtitle,
  count,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuIconBox}>
        <Text style={styles.menuIcon}>{icon}</Text>
      </View>
      <View style={styles.menuTextBox}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      {typeof count === 'number' ? (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : (
        <Text style={styles.arrow}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9FC' },
  page: {
    flexGrow: 1,
    backgroundColor: '#FFF9FC',
    padding: 18,
    paddingBottom: 40,
    gap: 14,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  kicker: { color: '#E43F98', fontSize: 14, fontFamily: 'FredokaBold', marginBottom: 8 },
  title: { color: '#E43F98', fontSize: 31, fontFamily: 'FredokaBold', marginBottom: 8 },
  text: { color: '#4B0C2D', fontSize: 15, lineHeight: 22, fontFamily: 'FredokaBold', marginBottom: 16 },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0F7',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  backButtonText: { color: '#4B0C2D', fontSize: 14, fontFamily: 'FredokaBold' },
  loadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F3C6DC',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: { color: '#8D5E77', fontFamily: 'FredokaBold' },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  sectionTitle: { color: '#4B0C2D', fontSize: 21, fontFamily: 'FredokaBold', marginBottom: 12 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9FC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3C6DC',
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
  menuIcon: { fontFamily: 'FredokaRegular', fontSize: 22 },
  menuTextBox: { flex: 1 },
  menuTitle: { color: '#4B0C2D', fontSize: 16, fontFamily: 'FredokaBold', marginBottom: 3 },
  menuSubtitle: { color: '#8D5E77', fontSize: 13, lineHeight: 18, fontFamily: 'FredokaBold' },
  countPill: {
    minWidth: 42,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E43F98',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  countText: { color: '#ffffff', fontSize: 15, fontFamily: 'FredokaBold' },
  arrow: { color: '#E43F98', fontSize: 28, fontFamily: 'FredokaBold' },
});
