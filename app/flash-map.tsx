import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';

type FlashRow = {
  id?: string;
  title?: string | null;
  city?: string | null;
  province?: string | null;
  meeting_place?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  expires_at?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function cleanText(value: any, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'Scadenza non disponibile';

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

function isAvailable(row: FlashRow) {
  const status = cleanText(row.status).toLowerCase().trim();

  if (
    [
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
    ].includes(status)
  ) {
    return false;
  }

  if (!row.expires_at) return true;

  const expiresAt = new Date(row.expires_at);

  if (Number.isNaN(expiresAt.getTime())) return true;

  return expiresAt.getTime() >= new Date().getTime();
}

function getCoordinates(row: FlashRow) {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

  return { latitude, longitude };
}

function openMap(row: FlashRow) {
  const coordinates = getCoordinates(row);

  if (!coordinates) {
    if (typeof window !== 'undefined') {
      window.alert('Coordinate non disponibili per questo Flash.');
    }
    return;
  }

  const { latitude, longitude } = coordinates;
  const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}&layers=N&marker=${latitude},${longitude}`;

  Linking.openURL(url).catch(() => {
    if (typeof window !== 'undefined') {
      window.alert('Non riesco ad aprire la mappa.');
    }
  });
}

export default function FlashMapScreen() {
  const [rows, setRows] = useState<FlashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMapRows = useCallback(async () => {
    setErrorMessage(null);

    const result = await supabase
      .from('activities')
      .select('id,title,city,province,meeting_place,latitude,longitude,expires_at,status,created_at')
      .eq('is_flash', true)
      .limit(200);

    if (result.error) {
      setRows([]);
      setErrorMessage(result.error.message || 'Non sono riuscito a caricare i Flash.');
      return;
    }

    const availableRows = ((result.data || []) as FlashRow[])
      .filter(isAvailable)
      .filter((row) => Boolean(getCoordinates(row)))
      .sort((a, b) => {
        const dateA = a.expires_at ? new Date(a.expires_at).getTime() : 0;
        const dateB = b.expires_at ? new Date(b.expires_at).getTime() : 0;
        return dateA - dateB;
      });

    setRows(availableRows);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadMapRows();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadMapRows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMapRows();
    setRefreshing(false);
  }, [loadMapRows]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.heroCard}>
        <Pressable style={styles.backButton} onPress={() => router.push('/flash')}>
          <Text style={styles.backButtonText}>← Flash</Text>
        </Pressable>

        <Text style={styles.kicker}>Bajuju Flash</Text>
        <Text style={styles.title}>Flash sulla mappa</Text>

        <View style={styles.previewBox}>
          <View style={styles.pinCircle}>
            <Text style={styles.pinIcon}>📍</Text>
          </View>

          <Text style={styles.counter}>{rows.length}</Text>
          <Text style={styles.counterLabel}>
            {rows.length === 1 ? 'Flash disponibile con coordinate' : 'Flash disponibili con coordinate'}
          </Text>
        </View>

      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Caricamento Flash disponibili...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Errore caricamento</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>

          <Pressable style={styles.button} onPress={loadMapRows}>
            <Text style={styles.buttonText}>Riprova</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Nessun Flash disponibile</Text>
          <Text style={styles.mutedText}>
            Non ci sono Flash attivi con coordinate valide. Crea un Flash con indirizzo completo e numero civico.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Flash disponibili</Text>

          {rows.map((row) => (
            <View key={String(row.id)} style={styles.flashBox}>
              <View style={styles.flashHeader}>
                <View style={styles.smallPin}>
                  <Text style={styles.smallPinText}>📍</Text>
                </View>

                <View style={styles.flashHeaderText}>
                  <Text style={styles.flashTitle}>{cleanText(row.title, 'Bajuju Flash')}</Text>
                  <Text style={styles.flashMeta}>
                    {[row.city, row.province].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>

              <Text style={styles.addressText}>
                {cleanText(row.meeting_place, 'Indirizzo non disponibile')}
              </Text>

              <Text style={styles.flashExpires}>
                Disponibile fino a: {formatDate(row.expires_at)}
              </Text>

              <Pressable style={styles.smallButton} onPress={() => openMap(row)}>
                <Text style={styles.smallButtonText}>Apri su mappa</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    padding: 20,
    paddingTop: 64,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9b1f61',
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
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 14,
  },
  text: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
  },
  previewBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    padding: 24,
    alignItems: 'center',
    marginBottom: 18,
  },
  pinCircle: {
    width: 68,
    height: 68,
    borderRadius: 999,
    backgroundColor: '#ffe3f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pinIcon: {
    fontSize: 34,
  },
  counter: {
    color: '#ef2d82',
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 48,
  },
  counterLabel: {
    color: '#4b1430',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
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
  mutedText: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
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
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  flashBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 12,
  },
  flashHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  smallPin: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#ffe3f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallPinText: {
    fontSize: 21,
  },
  flashHeaderText: {
    flex: 1,
  },
  flashTitle: {
    color: '#4b1430',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 3,
  },
  flashMeta: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
  },
  addressText: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  flashExpires: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 8,
  },
  smallButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ef2d82',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  smallButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});
