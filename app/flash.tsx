import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type FlashTab = 'all' | 'mine' | 'joined';

const ACTIVE_PROVINCES = ['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Brescia', 'Torino'];

function firstValue(row: LooseRow | null | undefined, keys: string[], fallback: any = null) {
  if (!row) return fallback;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }

  return fallback;
}

function firstText(row: LooseRow | null | undefined, keys: string[], fallback = '') {
  const value = firstValue(row, keys, fallback);
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function booleanFromRow(row: LooseRow | null | undefined, keys: string[], fallback = false) {
  const value = firstValue(row, keys);

  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();

    if (['true', '1', 'yes', 'si', 'sì', 'attivo', 'active', 'flash'].includes(normalized)) return true;
    if (['false', '0', 'no', 'non attivo', 'inactive'].includes(normalized)) return false;
  }

  if (typeof value === 'number') return value === 1;

  return fallback;
}

function formatDate(value: any) {
  if (!value) return 'Orario non disponibile';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeDate(value: any) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const direct = new Date(trimmed);
    if (!Number.isNaN(direct.getTime())) return direct;

    const italianDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
    if (italianDate) {
      const [, day, month, year, hour = '0', minute = '0'] = italianDate;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function getFlashDate(row: LooseRow) {
  return normalizeDate(
    firstValue(row, [
      'start_at',
      'starts_at',
      'start_time',
      'event_start_at',
      'activity_start_at',
      'scheduled_at',
      'date_time',
      'activity_date',
      'event_date',
      'data_ora',
      'date',
      'data',
      'day',
      'giorno',
    ])
  );
}

function flashTitle(row: LooseRow) {
  return firstText(row, ['title', 'titolo', 'name', 'nome', 'activity_title'], 'Bajuju Flash');
}

function flashCity(row: LooseRow) {
  return firstText(row, ['city', 'citta', 'comune', 'location_city'], 'Comune non indicato');
}

function flashProvince(row: LooseRow) {
  return firstText(row, ['province', 'provincia', 'location_province'], '');
}

function flashPlace(row: LooseRow) {
  return firstText(row, ['place', 'luogo', 'address', 'indirizzo', 'meeting_point', 'punto_ritrovo'], '');
}

function isDeleted(row: LooseRow) {
  const deletedValue = firstValue(row, [
    'deleted_at',
    'removed_at',
    'cancelled_at',
    'canceled_at',
    'archived_at',
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

function isFlashRow(row: LooseRow) {
  if (booleanFromRow(row, ['is_flash', 'flash', 'bajuju_flash', 'isFlash'], false)) return true;

  const text = firstText(row, ['type', 'activity_type', 'event_type', 'category', 'categoria', 'kind'], '')
    .toLowerCase()
    .trim();

  return ['flash', 'bajuju_flash', 'bajuju flash', 'istantaneo', 'veloce'].includes(text);
}

function isFutureOrToday(row: LooseRow) {
  const date = getFlashDate(row);
  if (!date) return true;

  const now = new Date();
  return date.getTime() >= now.getTime();
}

function rowBelongsToUser(row: LooseRow, userId: string | null) {
  if (!userId) return false;

  const owner = firstValue(row, ['creator_id', 'organizer_id', 'created_by', 'user_id', 'profile_id']);

  return owner ? String(owner) === String(userId) : false;
}

export default function FlashScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<LooseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string>('Tutte');
  const [selectedTab, setSelectedTab] = useState<FlashTab>('all');

  const loadFlashRows = useCallback(async () => {
    setErrorMessage(null);

    const authResult = await supabase.auth.getUser();
    const currentUserId = authResult.data.user?.id || null;
    setUserId(currentUserId);

    const result = await supabase
      .from('activities')
      .select('*')
      .limit(120);

    if (result.error) {
      setRows([]);
      setErrorMessage(result.error.message || 'Non sono riuscito a caricare i Flash.');
      return;
    }

    const cleanRows = ((result.data || []) as LooseRow[])
      .filter((row) => !isDeleted(row))
      .filter(isFlashRow)
      .filter(isFutureOrToday)
      .sort((a, b) => {
        const dateA = getFlashDate(a)?.getTime() || 0;
        const dateB = getFlashDate(b)?.getTime() || 0;
        return dateA - dateB;
      });

    setRows(cleanRows);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadFlashRows();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadFlashRows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFlashRows();
    setRefreshing(false);
  }, [loadFlashRows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (selectedProvince !== 'Tutte') {
        const province = flashProvince(row).toLowerCase().trim();
        if (province !== selectedProvince.toLowerCase().trim()) return false;
      }

      if (selectedTab === 'mine') return rowBelongsToUser(row, userId);
      if (selectedTab === 'joined') return !rowBelongsToUser(row, userId);

      return true;
    });
  }, [rows, selectedProvince, selectedTab, userId]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju Flash</Text>
        <Text style={styles.title}>Tutto può iniziare in pochi minuti</Text>

        <Text style={styles.text}>
          Scegli la provincia e guarda i Flash disponibili collegati a Supabase.
        </Text>

        <Pressable style={styles.button} onPress={() => router.push('/home')}>
          <Text style={styles.buttonText}>Torna alla Home</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Provincia</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {['Tutte', ...ACTIVE_PROVINCES].map((province) => (
            <Pressable
              key={province}
              style={[styles.chip, selectedProvince === province && styles.chipActive]}
              onPress={() => setSelectedProvince(province)}
            >
              <Text style={[styles.chipText, selectedProvince === province && styles.chipTextActive]}>
                {province}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Filtro</Text>

        <View style={styles.tabsRow}>
          <Pressable
            style={[styles.tabButton, selectedTab === 'all' && styles.tabButtonActive]}
            onPress={() => setSelectedTab('all')}
          >
            <Text style={[styles.tabText, selectedTab === 'all' && styles.tabTextActive]}>Tutti</Text>
          </Pressable>

          <Pressable
            style={[styles.tabButton, selectedTab === 'mine' && styles.tabButtonActive]}
            onPress={() => setSelectedTab('mine')}
          >
            <Text style={[styles.tabText, selectedTab === 'mine' && styles.tabTextActive]}>I miei</Text>
          </Pressable>

          <Pressable
            style={[styles.tabButton, selectedTab === 'joined' && styles.tabButtonActive]}
            onPress={() => setSelectedTab('joined')}
          >
            <Text style={[styles.tabText, selectedTab === 'joined' && styles.tabTextActive]}>A cui partecipo</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Flash disponibili</Text>

        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>Caricamento Flash...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.emptyBox}>
            <Text style={styles.errorTitle}>Errore caricamento</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable style={styles.smallButton} onPress={loadFlashRows}>
              <Text style={styles.smallButtonText}>Riprova</Text>
            </Pressable>
          </View>
        ) : filteredRows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Nessun Flash trovato</Text>
            <Text style={styles.mutedText}>
              Non ci sono ancora Flash disponibili con questi filtri.
            </Text>
          </View>
        ) : (
          filteredRows.map((row, index) => (
            <View key={String(firstValue(row, ['id', 'activity_id']) || index)} style={styles.flashBox}>
              <Text style={styles.flashTitle}>{flashTitle(row)}</Text>
              <Text style={styles.flashMeta}>{flashCity(row)}{flashProvince(row) ? ` · ${flashProvince(row)}` : ''}</Text>
              <Text style={styles.flashMeta}>{formatDate(firstValue(row, [
                'start_at',
                'starts_at',
                'start_time',
                'event_start_at',
                'activity_start_at',
                'scheduled_at',
                'date_time',
                'activity_date',
                'event_date',
                'data_ora',
                'date',
                'data',
                'day',
                'giorno',
              ]))}</Text>

              {flashPlace(row) ? <Text style={styles.flashPlace}>{flashPlace(row)}</Text> : null}

              {rowBelongsToUser(row, userId) ? (
                <Text style={styles.ownerBadge}>Creato da te</Text>
              ) : null}
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
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  kicker: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 15,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 14,
  },
  text: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  chipsRow: {
    gap: 10,
    paddingBottom: 18,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  chipActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#ef2d82',
  },
  chipText: {
    color: '#7b4960',
    fontSize: 14,
    fontWeight: '800',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  tabsRow: {
    gap: 10,
  },
  tabButton: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  tabButtonActive: {
    backgroundColor: '#ffe3f0',
    borderColor: '#ef2d82',
  },
  tabText: {
    color: '#7b4960',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#ef2d82',
  },
  emptyBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 8,
  },
  emptyTitle: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
  },
  mutedText: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 21,
  },
  errorTitle: {
    color: '#b00020',
    fontSize: 17,
    fontWeight: '900',
  },
  errorText: {
    color: '#7b1d35',
    fontSize: 15,
    lineHeight: 21,
  },
  smallButton: {
    backgroundColor: '#ef2d82',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  smallButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  flashBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 12,
  },
  flashTitle: {
    color: '#4b1430',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  flashMeta: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
  },
  flashPlace: {
    color: '#4b1430',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    fontWeight: '700',
  },
  ownerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffe3f0',
    color: '#ef2d82',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    marginTop: 10,
  },
});
