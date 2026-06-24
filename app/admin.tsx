import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { supabase } from '../src/lib/supabase';

type DeletionRequest = {
  id?: string | number;
  user_id?: string | null;
  email?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return 'Data non disponibile';

  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDeletionRequests = useCallback(async () => {
    setErrorMessage(null);

    const { data, error } = await supabase
      .from('profile_deletion_requests')
      .select('id,user_id,email,status,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setRequests([]);
      setErrorMessage(error.message || 'Non sono riuscito a caricare le richieste.');
      return;
    }

    setRequests((data || []) as DeletionRequest[]);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadDeletionRequests();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadDeletionRequests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDeletionRequests();
    setRefreshing(false);
  }, [loadDeletionRequests]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title}>Area Admin</Text>
        <Text style={styles.text}>
          Area Admin mobile attiva. Da qui puoi controllare le richieste di eliminazione profilo ricevute.
        </Text>

        <TouchableOpacity style={styles.button} onPress={() => router.push('/profile')}>
          <Text style={styles.buttonText}>Torna al profilo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Richieste eliminazione profilo</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>Caricamento richieste...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.emptyBox}>
            <Text style={styles.errorTitle}>Errore caricamento</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>

            <TouchableOpacity style={styles.smallButton} onPress={loadDeletionRequests}>
              <Text style={styles.smallButtonText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Nessuna richiesta trovata</Text>
            <Text style={styles.mutedText}>
              Quando un utente chiede l’eliminazione del profilo, la richiesta comparirà qui.
            </Text>
          </View>
        ) : (
          requests.map((item, index) => (
            <View key={String(item.id || `${item.user_id}-${item.created_at}-${index}`)} style={styles.requestBox}>
              <View style={styles.requestHeader}>
                <Text style={styles.requestEmail}>{item.email || 'Email non disponibile'}</Text>
                <Text style={styles.statusBadge}>{item.status || 'pending'}</Text>
              </View>

              <Text style={styles.requestInfo}>Data richiesta: {formatDate(item.created_at)}</Text>
              <Text style={styles.requestInfo}>User ID: {item.user_id || 'Non disponibile'}</Text>
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
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
  },
  text: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 22,
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
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 14,
  },
  loadingBox: {
    gap: 10,
    alignItems: 'center',
    paddingVertical: 18,
  },
  emptyBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  emptyTitle: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
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
    marginBottom: 6,
  },
  errorText: {
    color: '#7b1d35',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 12,
  },
  smallButton: {
    backgroundColor: '#ef2d82',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  smallButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  requestBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 12,
  },
  requestHeader: {
    gap: 8,
    marginBottom: 10,
  },
  requestEmail: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffe3f0',
    color: '#ef2d82',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  requestInfo: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
  },
});