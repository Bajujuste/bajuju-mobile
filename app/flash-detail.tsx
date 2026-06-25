import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';

type LooseRow = Record<string, any>;

function firstValue(row: LooseRow | null, keys: string[], fallback: any = '') {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return fallback;
}

function firstText(row: LooseRow | null, keys: string[], fallback = '') {
  const value = firstValue(row, keys, fallback);
  return String(value || fallback);
}

function formatDate(value: any) {
  if (!value) return 'Non indicata';

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function flashTitle(row: LooseRow | null) {
  return firstText(row, ['title', 'titolo', 'name', 'nome'], 'Flash senza titolo');
}

function flashCity(row: LooseRow | null) {
  return firstText(row, ['city', 'citta', 'comune', 'location_city'], 'Comune non indicato');
}

function flashProvince(row: LooseRow | null) {
  return firstText(row, ['province', 'provincia', 'location_province'], '');
}

function flashPlace(row: LooseRow | null) {
  return firstText(row, ['place', 'luogo', 'address', 'indirizzo', 'meeting_point', 'punto_ritrovo'], 'Indirizzo non indicato');
}

function flashExpiresAt(row: LooseRow | null) {
  return firstValue(row, ['expires_at', 'expiresAt', 'expiry_at', 'expires'], '');
}

export default function FlashDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const [flash, setFlash] = useState<LooseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);

  const flashId = Array.isArray(params.id) ? params.id[0] : params.id;

  const loadFlash = useCallback(async () => {
    if (!flashId) {
      setErrorMessage('Flash non trovato.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await supabase
        .from('activities')
        .select('*')
        .eq('id', flashId)
        .single();

      if (result.error) {
        setErrorMessage(result.error.message);
        setFlash(null);
        return;
      }

      setFlash(result.data as LooseRow);

      const participantsResult = await supabase
        .from('activity_participants')
        .select('activity_id')
        .eq('activity_id', flashId);

      if (!participantsResult.error) {
        setParticipantCount((participantsResult.data ?? []).length);
      }
    } finally {
      setLoading(false);
    }
  }, [flashId]);

  useEffect(() => {
    loadFlash();
  }, [loadFlash]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju Flash</Text>
        <Text style={styles.title}>Dettaglio Flash</Text>

        <Pressable style={styles.secondaryButton} onPress={() => router.push('/flash')}>
          <Text style={styles.secondaryButtonText}>Torna a Bajuju Flash</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Caricamento Flash...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Errore caricamento</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.button} onPress={loadFlash}>
            <Text style={styles.buttonText}>Riprova</Text>
          </Pressable>
        </View>
      ) : flash ? (
        <View style={styles.card}>
          <Text style={styles.flashTitle}>{flashTitle(flash)}</Text>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Comune</Text>
            <Text style={styles.value}>
              {flashCity(flash)}
              {flashProvince(flash) ? ` · ${flashProvince(flash)}` : ''}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Indirizzo</Text>
            <Text style={styles.value}>{flashPlace(flash)}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Partecipanti</Text>
            <Text style={styles.value}>{participantCount}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Disponibile fino a</Text>
            <Text style={styles.value}>{formatDate(flashExpiresAt(flash))}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Flash non disponibile</Text>
          <Text style={styles.mutedText}>Non sono riuscito a trovare questo Flash.</Text>
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
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 12,
  },
  kicker: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: '#3d1230',
    fontSize: 28,
    fontWeight: '900',
  },
  flashTitle: {
    color: '#3d1230',
    fontSize: 24,
    fontWeight: '900',
  },
  infoBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  label: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 4,
  },
  value: {
    color: '#3d1230',
    fontSize: 16,
    fontWeight: '700',
  },
  mutedText: {
    color: '#8f3d65',
    fontSize: 15,
    lineHeight: 21,
  },
  errorTitle: {
    color: '#b4235f',
    fontWeight: '900',
    fontSize: 18,
  },
  errorText: {
    color: '#8f3d65',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: '#fff0f7',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  secondaryButtonText: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 15,
  },
});
