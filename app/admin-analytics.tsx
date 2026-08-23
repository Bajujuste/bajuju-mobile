import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
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

import { supabase } from '../src/lib/supabase';

type AnalyticsSummary = {
  days?: number;
  events_total?: number;
  active_users?: number;
  home_opens?: number;
  find_opens?: number;
  notification_opens?: number;
  experiences_created?: number;
  experiences_joined?: number;
  tracked_experiences_joined?: number;
  waitlist_joins?: number;
  next_experience_opens?: number;
  network_errors?: number;
  app_errors?: number;
  future_experiences?: number;
  future_experiences_without_participants?: number;
  average_fill_rate?: number;
  daily_active_users?: Array<{ day?: string; users?: number }>;
  top_events?: Array<{ event?: string; count?: number }>;
  top_creation_locations?: Array<{ location?: string; count?: number }>;
  future_events_by_location?: Array<{ location?: string; count?: number }>;
  users_by_location?: Array<{ location?: string; count?: number }>;
  demand_without_events?: Array<{ location?: string; count?: number }>;
  top_error_endpoints?: Array<{ endpoint?: string; count?: number }>;
};

function numberValue(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function eventLabel(value: string) {
  switch (value) {
    case 'home_open': return 'Aperture Home';
    case 'find_open': return 'Aperture Trova';
    case 'notification_open': return 'Notifiche aperte';
    case 'experience_created': return 'Esperienze create';
    case 'experience_joined': return 'Partecipazioni tracciate';
    case 'waitlist_joined': return 'Ingressi in lista d’attesa';
    case 'waitlist_left': return 'Uscite dalla lista d’attesa';
    case 'next_experience_open': return 'Prossima esperienza aperta';
    case 'network_error': return 'Errori Supabase/rete';
    case 'app_error': return 'Errori app';
    default: return value.replace(/_/g, ' ');
  }
}

export default function AdminAnalyticsScreen() {
  const [days, setDays] = useState<7 | 30>(30);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSummary = useCallback(async (showRefresh = false, requestedDays = days) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');

    try {
      const result = await supabase.rpc('master_get_analytics_summary' as any, {
        days_back: requestedDays,
      });

      if (result.error) throw result.error;
      setSummary((result.data || {}) as AnalyticsSummary);
    } catch (error: unknown) {
      setSummary(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a caricare le statistiche.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useFocusEffect(
    useCallback(() => {
      void loadSummary(false, days);
    }, [days, loadSummary])
  );

  function changeDays(value: 7 | 30) {
    if (value === days) return;
    setDays(value);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadSummary(true, days)}
            tintColor="#e43f98"
          />
        }
      >
        <Pressable style={styles.backButton} onPress={() => router.replace('/admin' as any)}>
          <Text style={styles.backText}>← Area Admin</Text>
        </Pressable>

        <View style={styles.headerCard}>
          <Text style={styles.kicker}>BAJUJU ANALYTICS</Text>
          <Text style={styles.title}>Come viene usata l’app</Text>
          <Text style={styles.subtitle}>
            Utilizzo, salute tecnica e copertura territoriale. Nessun contenuto di chat o testo privato viene mostrato qui.
          </Text>

          <View style={styles.periodRow}>
            <PeriodButton active={days === 7} label="7 giorni" onPress={() => changeDays(7)} />
            <PeriodButton active={days === 30} label="30 giorni" onPress={() => changeDays(30)} />
          </View>
        </View>

        {loading ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color="#e43f98" />
            <Text style={styles.messageText}>Carico statistiche…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorTitle}>Statistiche non disponibili</Text>
            <Text style={styles.messageText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadSummary(false, days)}>
              <Text style={styles.retryText}>Riprova</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              <StatCard label="Utenti attivi" value={numberValue(summary?.active_users)} />
              <StatCard label="Eventi tracciati" value={numberValue(summary?.events_total)} />
              <StatCard label="Home aperte" value={numberValue(summary?.home_opens)} />
              <StatCard label="Trova aperto" value={numberValue(summary?.find_opens)} />
              <StatCard label="Esperienze create" value={numberValue(summary?.experiences_created)} />
              <StatCard label="Partecipazioni reali" value={numberValue(summary?.experiences_joined)} />
              <StatCard label="Lista d’attesa" value={numberValue(summary?.waitlist_joins)} />
              <StatCard label="Notifiche aperte" value={numberValue(summary?.notification_opens)} />
              <StatCard label="Eventi futuri" value={numberValue(summary?.future_experiences)} />
              <StatCard label="Futuri senza iscritti" value={numberValue(summary?.future_experiences_without_participants)} />
              <StatCard label="Riempimento medio" value={`${numberValue(summary?.average_fill_rate)}%`} />
              <StatCard label="Errori tecnici" value={numberValue(summary?.network_errors) + numberValue(summary?.app_errors)} />
            </View>

            <AnalyticsList
              title="Attività per giorno"
              emptyText="I dati giornalieri inizieranno a comparire con l’utilizzo dell’app."
              rows={(summary?.daily_active_users || []).map((item) => ({
                label: String(item.day || 'Data'),
                value: numberValue(item.users),
              }))}
            />

            <AnalyticsList
              title="Funzioni più usate"
              emptyText="Nessun utilizzo registrato nel periodo selezionato."
              rows={(summary?.top_events || []).map((item) => ({
                label: eventLabel(String(item.event || 'Altro')),
                value: numberValue(item.count),
              }))}
            />

            <AnalyticsList
              title="Dove vengono create le esperienze"
              emptyText="Nessuna esperienza creata nel periodo selezionato."
              rows={(summary?.top_creation_locations || []).map((item) => ({
                label: String(item.location || 'Non indicata'),
                value: numberValue(item.count),
              }))}
            />

            <AnalyticsList
              title="Eventi futuri per zona"
              emptyText="Nessun evento futuro disponibile."
              rows={(summary?.future_events_by_location || []).map((item) => ({
                label: String(item.location || 'Non indicata'),
                value: numberValue(item.count),
              }))}
            />

            <AnalyticsList
              title="Utenti per zona"
              emptyText="Nessuna località disponibile nei profili."
              rows={(summary?.users_by_location || []).map((item) => ({
                label: String(item.location || 'Non indicata'),
                value: numberValue(item.count),
              }))}
            />

            <AnalyticsList
              title="Zone con utenti ma senza eventi futuri"
              emptyText="Ottimo: non risultano zone scoperte tra quelle censite."
              rows={(summary?.demand_without_events || []).map((item) => ({
                label: String(item.location || 'Non indicata'),
                value: numberValue(item.count),
              }))}
            />

            <AnalyticsList
              title="Errori tecnici più frequenti"
              emptyText="Nessun errore Supabase/rete registrato nel periodo."
              rows={(summary?.top_error_endpoints || []).map((item) => ({
                label: String(item.endpoint || 'Sconosciuto'),
                value: numberValue(item.count),
              }))}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PeriodButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.periodButton, active && styles.periodButtonActive]} onPress={onPress}>
      <Text style={[styles.periodText, active && styles.periodTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AnalyticsList({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
  emptyText: string;
}) {
  return (
    <View style={styles.listCard}>
      <Text style={styles.listTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        rows.map((row, index) => (
          <View key={`${row.label}-${index}`} style={styles.listRow}>
            <Text style={styles.listLabel}>{row.label}</Text>
            <View style={styles.valuePill}>
              <Text style={styles.valuePillText}>{row.value}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff8fb' },
  container: { padding: 18, paddingBottom: 42, gap: 14 },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  backText: { color: '#9b1f61', fontSize: 14, fontWeight: '900' },
  headerCard: {
    padding: 20,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  kicker: { color: '#e43f98', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 6, color: '#4b1430', fontSize: 29, lineHeight: 34, fontWeight: '900' },
  subtitle: { marginTop: 7, color: '#745068', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  periodRow: { marginTop: 16, flexDirection: 'row', gap: 8 },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  periodButtonActive: { backgroundColor: '#e43f98', borderColor: '#e43f98' },
  periodText: { color: '#9b1f61', fontWeight: '900' },
  periodTextActive: { color: '#ffffff' },
  messageCard: {
    minHeight: 180,
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { color: '#9b1f61', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  messageText: { marginTop: 9, color: '#6b3652', fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#e43f98' },
  retryText: { color: '#ffffff', fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '48.4%',
    minHeight: 104,
    padding: 15,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    justifyContent: 'center',
  },
  statValue: { color: '#e43f98', fontSize: 28, fontWeight: '900' },
  statLabel: { marginTop: 4, color: '#5a2842', fontSize: 13, lineHeight: 17, fontWeight: '800' },
  listCard: {
    padding: 17,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  listTitle: { color: '#4b1430', fontSize: 19, fontWeight: '900', marginBottom: 11 },
  listRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#ffe5f0',
  },
  listLabel: { flex: 1, color: '#6b3652', fontSize: 14, fontWeight: '800' },
  valuePill: { minWidth: 38, height: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: '#fff0f7', alignItems: 'center', justifyContent: 'center' },
  valuePillText: { color: '#e43f98', fontWeight: '900' },
  emptyText: { color: '#8f5573', fontSize: 13, lineHeight: 19, fontWeight: '700' },
});
