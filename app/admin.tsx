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
      countRows('activities'),
      countRows('reports'),
      countRows('activity_messages'),
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
          Pannello rapido per controllare utenti, eventi, segnalazioni e chat.
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
            <Text style={styles.menuSubtitle}>Apri elenco utenti, filtra e gestisci blocchi.</Text>
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
            <Text style={styles.menuTitle}>Eventi totali</Text>
            <Text style={styles.menuSubtitle}>Apri elenco eventi, filtra per data e vedi partecipanti.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stats.activities}</Text>
          </View>
        </Pressable>

        <View style={styles.menuRowDisabled}>
          <View style={styles.menuIconBox}>
            <Text style={styles.menuIcon}>🚩</Text>
          </View>
          <View style={styles.menuTextBox}>
            <Text style={styles.menuTitle}>Segnalazioni</Text>
            <Text style={styles.menuSubtitle}>Prossimo step: pagina dedicata alle segnalazioni.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stats.reports}</Text>
          </View>
        </View>

        <View style={styles.menuRowDisabled}>
          <View style={styles.menuIconBox}>
            <Text style={styles.menuIcon}>💬</Text>
          </View>
          <View style={styles.menuTextBox}>
            <Text style={styles.menuTitle}>Chat segnalate</Text>
            <Text style={styles.menuSubtitle}>Prossimo step: pagina dedicata alle chat segnalate.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stats.chatReports}</Text>
          </View>
        </View>
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
  menuRowDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f3dce8',
    marginBottom: 10,
    gap: 12,
    opacity: 0.75,
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
