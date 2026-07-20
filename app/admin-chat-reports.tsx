import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../src/lib/supabase';

type LooseRow = Record<string, any>;

type ChatReportItem = {
  id: string;
  message: string;
  createdAt: string;
  activityId: string;
  senderId: string;
  source: string;
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

function formatDate(value: string) {
  if (!value) return 'Data non disponibile';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT');
}

export default function AdminChatReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<ChatReportItem[]>([]);

  const loadItems = useCallback(async () => {
    const collected: ChatReportItem[] = [];

    const attempts = [
      {
        source: 'activity_messages.reported',
        run: () => supabase.from('activity_messages').select('*').eq('reported', true).order('created_at', { ascending: false }).limit(100),
      },
      {
        source: 'activity_messages.is_reported',
        run: () => supabase.from('activity_messages').select('*').eq('is_reported', true).order('created_at', { ascending: false }).limit(100),
      },
      {
        source: 'activity_messages.reported_at',
        run: () => supabase.from('activity_messages').select('*').not('reported_at', 'is', null).order('created_at', { ascending: false }).limit(100),
      },
      {
        source: 'chat_reports',
        run: () => supabase.from('chat_reports').select('*').order('created_at', { ascending: false }).limit(100),
      },
      {
        source: 'message_reports',
        run: () => supabase.from('message_reports').select('*').order('created_at', { ascending: false }).limit(100),
      },
    ];

    for (const attempt of attempts) {
      try {
        const result = await attempt.run();

        if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
          collected.push(
            ...((result.data || []) as LooseRow[]).map((row, index) => ({
              id: String(firstValue(row, ['id', 'message_id', 'report_id']) || `${attempt.source}-${index}`),
              message: firstText(row, ['message', 'content', 'body', 'text'], 'Messaggio non disponibile'),
              createdAt: firstText(row, ['reported_at', 'created_at', 'date', 'data'], ''),
              activityId: firstText(row, ['activity_id', 'event_id', 'experience_id'], ''),
              senderId: firstText(row, ['sender_id', 'user_id', 'reported_user_id'], ''),
              source: attempt.source,
            }))
          );

          break;
        }
      } catch {
        // Prova successiva.
      }
    }

    setItems(collected);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);

      try {
        await loadItems();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadItems]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await loadItems();
    } finally {
      setRefreshing(false);
    }
  }, [loadItems]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Area Admin</Text>
        <Text style={styles.title}>Chat segnalate</Text>
        <Text style={styles.text}>Messaggi segnalati visibili: {items.length}</Text>

        <Pressable style={styles.backButton} onPress={() => router.push('/admin')}>
          <Text style={styles.backButtonText}>← Torna ad Admin</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico chat segnalate...</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna chat segnalata visibile.</Text>
        ) : (
          items.map((item) => (
            <View key={`${item.source}-${item.id}`} style={styles.reportBox}>
              <Text style={styles.reportTitle}>Messaggio segnalato</Text>
              <Text style={styles.reportSubtitle}>{item.message}</Text>
              <Text style={styles.reportMeta}>Evento ID: {item.activityId || 'Non disponibile'}</Text>
              <Text style={styles.reportMeta}>Utente ID: {item.senderId || 'Non disponibile'}</Text>
              <Text style={styles.reportMeta}>Fonte: {item.source}</Text>
              <Text style={styles.reportMeta}>{formatDate(item.createdAt)}</Text>

              {item.activityId ? (
                <Pressable style={styles.button} onPress={() => router.push(`/admin-event-detail?id=${item.activityId}`)}>
                  <Text style={styles.buttonText}>Apri evento collegato</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#fff8fb', padding: 18, paddingBottom: 40, gap: 14 },
  headerCard: { backgroundColor: '#ffffff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#ffd3e6' },
  card: { backgroundColor: '#ffffff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#ffd3e6' },
  kicker: { color: '#ef2d82', fontSize: 14, fontWeight: '900', marginBottom: 8 },
  title: { color: '#e43f98', fontSize: 29, fontWeight: '900', marginBottom: 8 },
  text: { color: '#4b1430', fontSize: 15, fontWeight: '800', marginBottom: 14 },
  backButton: { alignSelf: 'flex-start', backgroundColor: '#fff0f7', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffd3e6' },
  backButtonText: { color: '#9b1f61', fontSize: 14, fontWeight: '900' },
  loadingText: { color: '#7b4960', fontWeight: '800', marginTop: 8 },
  emptyText: { color: '#7b4960', fontSize: 15, fontWeight: '800' },
  reportBox: { backgroundColor: '#fff8fb', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#ffd3e6', marginBottom: 10 },
  reportTitle: { color: '#4b1430', fontSize: 17, fontWeight: '900', marginBottom: 6 },
  reportSubtitle: { color: '#7b4960', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  reportMeta: { color: '#9b1f61', fontSize: 12, fontWeight: '900', marginTop: 6 },
  button: { backgroundColor: '#ef2d82', borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#ffffff', fontWeight: '900', fontSize: 14 },
});
