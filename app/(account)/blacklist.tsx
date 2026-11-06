import { Ionicons } from '@expo/vector-icons';
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
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';
import { loadBajujuBlacklist, removeFromBajujuBlacklist } from '../../src/hooks/useBajujuBlacklist';

type BlacklistUser = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  city: string | null;
};

// La mia blacklist personale: la vedo solo io, chi c'è dentro non lo sa.
export default function BlacklistScreen() {
  const [items, setItems] = useState<BlacklistUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ids = [...(await loadBajujuBlacklist(true))];
      if (ids.length === 0) {
        setItems([]);
        return;
      }
      const result = await supabase
        .from('profiles')
        .select('id,nickname,avatar_url,city')
        .in('id', ids);
      if (result.error) throw result.error;
      const byId = new Map(((result.data || []) as BlacklistUser[]).map((row) => [String(row.id), row]));
      setItems(ids.map((id) => byId.get(id) || { id, nickname: null, avatar_url: null, city: null }));
    } catch (error) {
      console.log('Errore caricamento blacklist:', error);
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

  async function remove(userId: string) {
    if (!userId || busyId) return;
    setBusyId(userId);
    try {
      await removeFromBajujuBlacklist(userId);
      setItems((current) => current.filter((item) => item.id !== userId));
    } catch (error: any) {
      Alert.alert('Operazione non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topRow}>
          <BajujuBackButton onPress={() => router.back()} accessibilityLabel="Indietro" style={{ alignSelf: 'flex-start' }} />
          <BajujuProfileButton />
        </View>

        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="book" size={26} color="#111111" />
            <Text style={styles.title}>Blacklist</Text>
          </View>
          <Text style={styles.subtitle}>
            La vedi solo tu. Queste persone le vedi con il cerchio nero e per entrare nei tuoi eventi e gruppi devono chiederti il permesso.
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#111111" />
            <Text style={styles.stateText}>Carico la blacklist…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>La tua blacklist è vuota</Text>
            <Text style={styles.stateText}>Per aggiungere qualcuno apri il suo profilo e tocca “Metti in blacklist”.</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Pressable
                style={styles.person}
                onPress={() => router.push({ pathname: '/user-profile' as any, params: { userId: item.id } })}
              >
                <View style={styles.avatarRing}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarFallbackText}>👤</Text>
                    </View>
                  )}
                </View>

                <View style={styles.copy}>
                  <Text style={styles.name} numberOfLines={1}>{item.nickname || 'Utente Bajuju'}</Text>
                  {item.city ? <Text style={styles.city} numberOfLines={1}>{item.city}</Text> : null}
                </View>
              </Pressable>

              <Pressable
                style={[styles.removeButton, busyId === item.id && styles.disabled]}
                disabled={Boolean(busyId)}
                onPress={() => {
                  Alert.alert(
                    'Togliere dalla blacklist?',
                    'Il cerchio nero sparirà e potrà di nuovo entrare normalmente nei tuoi eventi e gruppi.',
                    [
                      { text: 'Annulla', style: 'cancel' },
                      { text: 'Togli', onPress: () => { void remove(item.id); } },
                    ]
                  );
                }}
              >
                <Text style={styles.removeText}>{busyId === item.id ? 'Attendi…' : 'Togli'}</Text>
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
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  header: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: '#F3C6DC', backgroundColor: '#fff', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#111111', fontSize: 28, fontFamily: 'FredokaBold' },
  subtitle: { marginTop: 7, color: '#8D5E77', fontSize: 14, lineHeight: 20, fontFamily: 'FredokaBold' },
  stateCard: { padding: 24, borderRadius: 22, borderWidth: 1, borderColor: '#F3C6DC', backgroundColor: '#fff', alignItems: 'center', gap: 8 },
  stateTitle: { color: '#4B0C2D', fontSize: 18, fontFamily: 'FredokaBold' },
  stateText: { color: '#8D5E77', fontSize: 14, lineHeight: 19, fontFamily: 'FredokaBold', textAlign: 'center' },
  card: { minHeight: 84, padding: 12, marginBottom: 10, borderRadius: 22, borderWidth: 1, borderColor: '#F3C6DC', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  person: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF0F7' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontFamily: 'FredokaRegular', fontSize: 24 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: '#4B0C2D', fontSize: 16, fontFamily: 'FredokaBold' },
  city: { marginTop: 3, color: '#8D5E77', fontSize: 12, fontFamily: 'FredokaBold' },
  removeButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#ffffff', fontSize: 13, fontFamily: 'FredokaBold' },
  disabled: { opacity: 0.5 },
});
