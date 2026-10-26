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

import {
  type BajujuLocation,
  LOCATION_COLOR,
  LOCATION_COLOR_SOFT,
  loadPendingLocationRequests,
  locationAddressLine,
  reviewLocationRequest,
} from '../../src/lib/bajujuLocations';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';

export default function AdminLocationsScreen() {
  const [items, setItems] = useState<BajujuLocation[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    const rows = await loadPendingLocationRequests();
    setItems(rows);

    const ownerIds = rows.map((row) => row.ownerId);
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
          console.log('Errore caricamento Location da approvare:', error);
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
      console.log('Errore aggiornamento Location da approvare:', error);
    } finally {
      setRefreshing(false);
    }
  }

  async function review(ownerId: string, action: 'approve' | 'reject') {
    if (!ownerId || busyId) return;
    setBusyId(ownerId);
    try {
      await reviewLocationRequest(ownerId, action);
      setItems((current) => current.filter((item) => item.ownerId !== ownerId));
      Alert.alert(
        action === 'approve' ? 'Location approvata' : 'Richiesta rifiutata',
        action === 'approve'
          ? 'Il locale è ora sulla mappa e il proprietario ha ricevuto l’avviso.'
          : 'Il proprietario lo vedrà come “Non approvata” e potrà correggere e reinviare.'
      );
    } catch (error: any) {
      Alert.alert('Operazione non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusyId('');
    }
  }

  function confirmReview(item: BajujuLocation, action: 'approve' | 'reject') {
    Alert.alert(
      action === 'approve' ? 'Approvare la Location?' : 'Rifiutare la richiesta?',
      item.name,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approva' : 'Rifiuta',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: () => { void review(item.ownerId, action); },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={LOCATION_COLOR} />}
      >
        <View style={styles.header}>
          <BajujuBackButton onPress={() => router.back()} accessibilityLabel="Indietro" style={{ alignSelf: 'flex-start', marginBottom: 12 }} />
          <Text style={styles.kicker}>LOCATION</Text>
          <Text style={styles.title}>Location da approvare</Text>
          <Text style={styles.subtitle}>
            Locali che hanno compilato la pagina da “Diventa Location”. Finché non approvi, nessuno li vede.
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={LOCATION_COLOR} />
            <Text style={styles.stateText}>Carico le richieste…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Tutto in ordine</Text>
            <Text style={styles.stateText}>Non ci sono richieste Location in attesa.</Text>
          </View>
        ) : (
          items.map((item) => {
            const busy = busyId === item.ownerId;
            const links = [
              item.instagramUrl ? 'Instagram' : '',
              item.facebookUrl ? 'Facebook' : '',
              item.websiteUrl ? 'Sito' : '',
              item.phone ? `Tel. ${item.phone}` : '',
              item.whatsapp ? 'WhatsApp' : '',
            ].filter(Boolean);
            return (
              <View key={item.ownerId} style={styles.card}>
                {item.photos[0] ? (
                  <Image source={{ uri: item.photos[0] }} style={styles.cover} resizeMode="cover" />
                ) : null}

                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.meta}>{item.category} · {locationAddressLine(item)}</Text>
                <Text style={styles.owner}>Richiesta di {ownerNames[item.ownerId] || 'Utente Bajuju'}</Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={4}>{item.description}</Text>
                ) : null}
                <Text style={styles.meta}>
                  {item.photos.length} foto
                  {links.length > 0 ? ` · ${links.join(' · ')}` : ' · nessun link'}
                </Text>

                <Pressable
                  style={styles.openButton}
                  onPress={() => router.push({ pathname: '/user-profile' as any, params: { userId: item.ownerId } })}
                >
                  <Text style={styles.openButtonText}>Apri e controlla la pagina</Text>
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
  kicker: { color: LOCATION_COLOR, fontFamily: BAJUJU_FONTS.bold, fontSize: 11, letterSpacing: 1 },
  title: { marginTop: 3, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 29 },
  subtitle: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  stateCard: { padding: 26, borderRadius: 24, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', alignItems: 'center', gap: 8 },
  stateTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  stateText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, textAlign: 'center' },
  card: { marginBottom: 14, padding: 16, borderRadius: 25, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  cover: { width: '100%', aspectRatio: 4 / 3, marginBottom: 13, borderRadius: 18, backgroundColor: LOCATION_COLOR_SOFT },
  cardTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 21 },
  meta: { marginTop: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  owner: { marginTop: 6, color: LOCATION_COLOR, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  description: { marginTop: 10, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 19 },
  openButton: { marginTop: 13, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: LOCATION_COLOR_SOFT },
  openButtonText: { color: LOCATION_COLOR, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  actions: { marginTop: 10, flexDirection: 'row', gap: 10 },
  rejectButton: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1.5, borderColor: '#D86D96', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5F8' },
  rejectText: { color: '#A3345E', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  approveButton: { flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: LOCATION_COLOR },
  approveText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  disabled: { opacity: 0.45 },
});
