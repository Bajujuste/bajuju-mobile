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

type LooseRow = Record<string, any>;

type ReportItem = {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  table: string;
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

function isArchived(row: LooseRow) {
  const status = firstText(row, ['status', 'stato', 'report_status'], '').toLowerCase().trim();

  if (['archived', 'archiviata', 'archiviato', 'closed', 'chiusa', 'chiuso'].includes(status)) return true;
  if (firstValue(row, ['archived_at', 'archiviata_il', 'closed_at'])) return true;
  if (firstValue(row, ['is_archived', 'archived']) === true) return true;

  return false;
}

function formatDate(value: string) {
  if (!value) return 'Data non disponibile';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminReportsArchivedScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);

  const loadReports = useCallback(async () => {
    const tables = ['reports', 'user_reports', 'activity_reports'];
    const collected: ReportItem[] = [];

    for (const table of tables) {
      try {
        const result = await supabase
          .from(table)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (!result.error && Array.isArray(result.data)) {
          collected.push(
            ...((result.data || []) as LooseRow[])
              .filter(isArchived)
              .map((row, index) => ({
                id: String(firstValue(row, ['id', 'report_id']) || `${table}-${index}`),
                title: firstText(row, ['title', 'titolo', 'reason', 'motivo', 'type', 'tipo'], 'Segnalazione archiviata'),
                subtitle: firstText(
                  row,
                  ['description', 'descrizione', 'message', 'messaggio', 'content', 'body', 'note'],
                  'Dettaglio non disponibile'
                ),
                createdAt: firstText(row, ['archived_at', 'created_at', 'date', 'data'], ''),
                table,
              }))
          );
        }
      } catch {
        // Tabella non presente.
      }
    }

    setReports(collected);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadReports();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadReports]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  }, [loadReports]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Area Admin</Text>
        <Text style={styles.title}>Archivate</Text>
        <Text style={styles.text}>Segnalazioni archiviate: {reports.length}</Text>

        <Pressable style={styles.backButton} onPress={() => router.push('/admin-reports')}>
          <Text style={styles.backButtonText}>← Torna alle segnalazioni</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico archivio...</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        {reports.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna segnalazione archiviata.</Text>
        ) : (
          reports.map((item) => (
            <View key={`${item.table}-${item.id}`} style={styles.reportBox}>
              <Text style={styles.reportTitle}>{item.title}</Text>
              <Text style={styles.reportSubtitle}>{item.subtitle}</Text>
              <Text style={styles.reportMeta}>Tabella: {item.table}</Text>
              <Text style={styles.reportMeta}>{formatDate(item.createdAt)}</Text>
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
  reportBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 10,
  },
  reportTitle: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  reportSubtitle: {
    color: '#7b4960',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  reportMeta: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },
});
