import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';

type PendingGroup = {
  id: string;
  name: string | null;
  description: string | null;
  city: string | null;
  category: string | null;
  cover_url: string | null;
  owner_id: string | null;
  created_at: string | null;
};

export default function AdminGroupsScreen() {
  const [items, setItems] = useState<PendingGroup[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    const result = await supabase
      .from('groups')
      .select('id,name,description,city,category,cover_url,owner_id,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200);

    if (result.error) throw result.error;

    const rows = (result.data || []) as PendingGroup[];
    setItems(rows);

    const ownerIds = [...new Set(rows.map((row) => String(row.owner_id || '')).filter(Boolean))];
    if (ownerIds.length === 0) {
      setOwnerNames({});
      return;
    }

    const profilesResult = await supabase
      .from('profiles')
      .select('id,nickname')
      .in('id', ownerIds);

    if (profilesResult.error) throw profilesResult.error;

    const names: Record<string, string> = {};
    (profilesResult.data || []).forEach((row: any) => {
      names[String(row.id || '')] = String(row.nickname || 'Utente Bajuju');
    });
    setOwnerNames(names);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        setLoading(true);
        try {
          await load();
        } catch (error) {
          console.log('Errore caricamento gruppi da approvare:', error);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (error) {
      console.log('Errore aggiornamento gruppi da approvare:', error);
    } finally {
      setRefreshing(false);
    }
  }

  async function review(groupId: string, action: 'approve' | 'reject') {
    if (!groupId || busyId) return;
    setBusyId(groupId);
    try {
      const result = await supabase.rpc('admin_review_group' as any, {
        p_group_id: groupId,
        p_action: action,
        p_note: action === 'reject' ? 'Richiesta non approvata da Bajuju.' : null,
      });
      if (result.error) throw result.error;

      setItems((current) => current.filter((item) => item.id !== groupId));
      Alert.alert(
        action === 'approve' ? 'Gruppo approvato' : 'Gruppo rifiutato',
        action === 'approve'
          ? 'Il gruppo è ora pubblico e gli utenti possono iscriversi.'
          : 'Il creatore lo vedrà come “Da rivedere” e potrà reinviarlo.'
      );
    } catch (error: any) {
      Alert.alert('Operazione non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusyId('');
    }
  }

  function confirmReview(item: PendingGroup, action: 'approve' | 'reject') {
    Alert.alert(
      action === 'approve' ? 'Approvare il gruppo?' : 'Rifiutare il gruppo?',
      item.name || 'Gruppo Bajuju',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approva' : 'Rifiuta',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: () => { void review(item.id, action); },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={BAJUJU_COLORS.brightPink} />}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>← Admin</Text>
          </Pressable>
          <Text style={styles.kicker}>COMMUNITY</Text>
          <Text style={styles.title}>Gruppi da approvare</Text>
          <Text style={styles.subtitle}>
            Controlla le richieste prima che diventino visibili a tutti.
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={BAJUJU_COLORS.brightPink} />
            <Text style={styles.stateText}>Carico le richieste…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Tutto in ordine</Text>
            <Text style={styles.stateText}>Non ci sono gruppi in attesa di approvazione.</Text>
          </View>
        ) : (
          items.map((item) => {
            const ownerId = String(item.owner_id || '');
            const busy = busyId === item.id;
            return (
              <View key={item.id} style={styles.card}>
                {item.cover_url ? (
                  <Image source={{ uri: item.cover_url }} style={styles.cover} resizeMode="cover" />
                ) : null}

                <Text style={styles.cardTitle}>{item.name || 'Gruppo Bajuju'}</Text>
                <Text style={styles.meta}>
                  {[item.city, item.category].filter(Boolean).join(' · ') || 'Dati essenziali da controllare'}
                </Text>
                <Text style={styles.owner}>Creato da {ownerNames[ownerId] || 'Utente Bajuju'}</Text>
                <Text style={styles.description} numberOfLines={4}>
                  {item.description || 'Nessuna descrizione.'}
                </Text>

                <Pressable
                  style={styles.openButton}
                  onPress={() => router.push({ pathname: '/group-detail' as any, params: { id: item.id } })}
                >
                  <Text style={styles.openButtonText}>Apri e controlla il gruppo</Text>
                </Pressable>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.rejectButton, busy && styles.disabled]}
                    disabled={busy}
                    onPress={() => confirmReview(item, 'reject')}
                  >
                    <Text style={styles.rejectText}>Rifiuta</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.approveButton, busy && styles.disabled]}
                    disabled={busy}
                    onPress={() => confirmReview(item, 'approve')}
                  >
                    <Text style={styles.approveText}>{busy ? 'Attendi…' : 'Approva'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  page: { padding: 18, paddingBottom: 50 },
  header: {
    padding: 20,
    marginBottom: 14,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#fff',
    ...BAJUJU_SHADOW,
  },
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: BAJUJU_COLORS.softPink, marginBottom: 12 },
  backText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  kicker: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 11, letterSpacing: 1 },
  title: { marginTop: 3, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 29 },
  subtitle: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  stateCard: { padding: 26, borderRadius: 24, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', alignItems: 'center', gap: 8 },
  stateTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  stateText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, textAlign: 'center' },
  card: { marginBottom: 14, padding: 16, borderRadius: 25, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  cover: { width: '100%', aspectRatio: 16 / 7, marginBottom: 13, borderRadius: 18, backgroundColor: BAJUJU_COLORS.softPink },
  cardTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 21 },
  meta: { marginTop: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  owner: { marginTop: 6, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  description: { marginTop: 10, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 19 },
  openButton: { marginTop: 13, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.softPink },
  openButtonText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  actions: { marginTop: 10, flexDirection: 'row', gap: 10 },
  rejectButton: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1.5, borderColor: '#D86D96', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5F8' },
  rejectText: { color: '#A3345E', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  approveButton: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  approveText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  disabled: { opacity: 0.45 },
});
