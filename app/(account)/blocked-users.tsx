import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../../src/lib/supabase';

type BlockedUser = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  city: string | null;
};

export default function BlockedUsersScreen() {
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabase.rpc('bajuju_get_users_blocked_by_me' as any);
      if (result.error) throw result.error;
      setItems((result.data || []) as BlockedUser[]);
    } catch (error) {
      console.log('Errore caricamento utenti bloccati:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function unblock(userId: string) {
    if (!userId || busyId) return;
    setBusyId(userId);
    try {
      const authResult = await supabase.auth.getUser();
      const currentUserId = authResult.data.user?.id || '';
      if (!currentUserId) throw new Error('Utente non autenticato.');

      const result = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', userId);

      if (result.error) throw result.error;

      setItems((current) => current.filter((item) => item.user_id !== userId));
      Alert.alert('Utente sbloccato', 'Ora potrete tornare a vedervi e interagire su Bajuju.');
    } catch (error: any) {
      Alert.alert('Sblocco non riuscito', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Profilo</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.kicker}>PRIVACY</Text>
          <Text style={styles.title}>Utenti bloccati</Text>
          <Text style={styles.subtitle}>
            Gli utenti bloccati non possono vederti, contattarti o vedere gli eventi a cui partecipi, salvo quelli che avevate già entrambi in corso al momento del blocco.
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#E43F98" />
            <Text style={styles.stateText}>Carico gli utenti bloccati…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Nessun utente bloccato</Text>
            <Text style={styles.stateText}>Qui compariranno le persone che decidi di bloccare.</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.user_id} style={styles.card}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>👤</Text>
                </View>
              )}

              <View style={styles.copy}>
                <Text style={styles.name}>{item.nickname || 'Utente Bajuju'}</Text>
                {item.city ? <Text style={styles.city}>{item.city}</Text> : null}
              </View>

              <Pressable
                style={[styles.unblockButton, busyId === item.user_id && styles.disabled]}
                disabled={Boolean(busyId)}
                onPress={() => {
                  Alert.alert(
                    'Sbloccare questo utente?',
                    'Tornerete a potervi vedere e interagire su Bajuju.',
                    [
                      { text: 'Annulla', style: 'cancel' },
                      { text: 'Sblocca', onPress: () => { void unblock(item.user_id); } },
                    ]
                  );
                }}
              >
                <Text style={styles.unblockText}>{busyId === item.user_id ? 'Attendi…' : 'Sblocca'}</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9FC' },
  page: { padding: 18, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#FFF0F7', marginBottom: 12 },
  backText: { color: '#E43F98', fontSize: 14, fontWeight: '900' },
  header: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: '#FFD3E6', backgroundColor: '#fff', marginBottom: 14 },
  kicker: { color: '#E43F98', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 3, color: '#4B1430', fontSize: 28, fontWeight: '900' },
  subtitle: { marginTop: 7, color: '#7B4960', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  stateCard: { padding: 24, borderRadius: 22, borderWidth: 1, borderColor: '#FFD3E6', backgroundColor: '#fff', alignItems: 'center', gap: 8 },
  stateTitle: { color: '#4B1430', fontSize: 18, fontWeight: '900' },
  stateText: { color: '#7B4960', fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  card: { minHeight: 84, padding: 12, marginBottom: 10, borderRadius: 22, borderWidth: 1, borderColor: '#FFD3E6', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#FFF0F7' },
  avatarFallback: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#FFF0F7', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 24 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: '#4B1430', fontSize: 16, fontWeight: '900' },
  city: { marginTop: 3, color: '#7B4960', fontSize: 12, fontWeight: '700' },
  unblockButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: '#FFF0F7', alignItems: 'center', justifyContent: 'center' },
  unblockText: { color: '#E43F98', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
