import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  WalkTogetherPosition,
  WalkTogetherState,
  distanceMeters,
  endWalkTogether,
  formatWalkDistance,
  loadWalkPositions,
  loadWalkTogetherState,
  setWalkTogetherEnabled,
  shareWalkPosition,
  stopWalkSharing,
} from '../../lib/walkTogether';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import { toUsableCoordinates } from '../../utils/bajujuDeviceLocation';

// "Vediamoci in cammino" nella pagina evento.
// Solo con l'app aperta: mentre la pagina è visibile la posizione si aggiorna ogni 15 secondi.
// Se l'app va in background il telefono smette di inviarla e gli altri vedono "aggiornato N min fa".

type Person = { name: string; photo: string };

type Props = {
  activityId: string;
  currentUserId: string;
  getPerson: (userId: string) => Person;
};

const REFRESH_MS = 15000;
const STATE_REFRESH_MS = 60000;

type MyPosition = { latitude: number; longitude: number; accuracy: number | null };

function minutesAgo(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

export function BajujuWalkTogetherCard({ activityId, currentUserId, getPerson }: Props) {
  const [state, setState] = useState<WalkTogetherState | null>(null);
  const [positions, setPositions] = useState<WalkTogetherPosition[]>([]);
  const [myPosition, setMyPosition] = useState<MyPosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const myPositionRef = useRef<MyPosition | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  const refreshState = useCallback(async () => {
    if (!activityId || !currentUserId) return null;
    const next = await loadWalkTogetherState(activityId);
    setState(next);
    return next;
  }, [activityId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void refreshState();
      return () => setFocused(false);
    }, [refreshState])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppActive(next === 'active'));
    return () => sub.remove();
  }, []);

  // Lo stato (attivo, finito, mezzanotte) si ricontrolla ogni minuto.
  useEffect(() => {
    if (!focused || !appActive) return;
    const timer = setInterval(() => void refreshState(), STATE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [appActive, focused, refreshState]);

  const sharing = Boolean(state?.active && state?.sharing);
  const tracking = sharing && focused && appActive;

  const sendAndRefresh = useCallback(async () => {
    const mine = myPositionRef.current;
    if (mine) {
      try {
        await shareWalkPosition(activityId, mine.latitude, mine.longitude, mine.accuracy);
      } catch {
        // La gita può essere finita nel frattempo: lo stato si aggiorna sotto.
        await refreshState();
        return;
      }
    }
    setPositions(await loadWalkPositions(activityId));
  }, [activityId, refreshState]);

  // Mentre condivido: GPS acceso e invio ogni 15 secondi.
  useEffect(() => {
    if (!tracking) return;
    let alive = true;

    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (!alive || permission?.status !== 'granted') return;
      watcherRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 },
        (reading) => {
          const coords = toUsableCoordinates(reading.coords.latitude, reading.coords.longitude);
          if (!coords) return;
          const next = { ...coords, accuracy: reading.coords.accuracy ?? null };
          myPositionRef.current = next;
          setMyPosition(next);
        }
      ).catch(() => null);
      if (!alive) watcherRef.current?.remove();
    })();

    void sendAndRefresh();
    const timer = setInterval(() => void sendAndRefresh(), REFRESH_MS);

    return () => {
      alive = false;
      clearInterval(timer);
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
  }, [sendAndRefresh, tracking]);

  async function startSharing() {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Posizione', 'Per usare “Sono qui” consenti a Bajuju di usare la posizione.');
        return;
      }
      const reading = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = toUsableCoordinates(reading.coords.latitude, reading.coords.longitude);
      if (!coords) {
        Alert.alert('Posizione', 'Non riesco a trovare la tua posizione. Riprova all’aperto.');
        return;
      }
      const mine = { ...coords, accuracy: reading.coords.accuracy ?? null };
      myPositionRef.current = mine;
      setMyPosition(mine);
      await shareWalkPosition(activityId, mine.latitude, mine.longitude, mine.accuracy);
      await refreshState();
    } catch (error: unknown) {
      Alert.alert('Sono qui', error instanceof Error ? error.message : 'Riprova tra poco.');
    } finally {
      setBusy(false);
    }
  }

  async function stopSharing() {
    if (busy) return;
    setBusy(true);
    try {
      await stopWalkSharing(activityId);
      myPositionRef.current = null;
      setMyPosition(null);
      setPositions([]);
      await refreshState();
    } catch (error: unknown) {
      Alert.alert('Posizione', error instanceof Error ? error.message : 'Riprova tra poco.');
    } finally {
      setBusy(false);
    }
  }

  function confirmEnd() {
    Alert.alert('Fine gita', 'La posizione si spegne per tutti. Vuoi chiudere?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Fine gita',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await endWalkTogether(activityId);
            myPositionRef.current = null;
            setMyPosition(null);
            setPositions([]);
            await refreshState();
          } catch (error: unknown) {
            Alert.alert('Fine gita', error instanceof Error ? error.message : 'Riprova tra poco.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function reopen() {
    setBusy(true);
    try {
      await setWalkTogetherEnabled(activityId, true);
      await refreshState();
    } catch (error: unknown) {
      Alert.alert('Vediamoci in cammino', error instanceof Error ? error.message : 'Riprova tra poco.');
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => {
    return positions
      .map((item) => {
        const meters = myPosition ? distanceMeters(myPosition, item) : NaN;
        const rough = (item.accuracy ?? 0) > 100 || (myPosition?.accuracy ?? 0) > 100;
        return { ...item, meters, rough, ago: minutesAgo(item.updatedAt) };
      })
      .sort((a, b) => (Number.isFinite(a.meters) ? a.meters : 1e12) - (Number.isFinite(b.meters) ? b.meters : 1e12));
  }, [myPosition, positions]);

  if (!state || !state.allowed || !state.enabled) return null;
  if (!state.canJoin && !state.canManage) return null;

  const header = (
    <View style={styles.headerRow}>
      <Ionicons name="walk" size={20} color={BAJUJU_COLORS.pink} />
      <Text style={styles.title}>Vediamoci in cammino</Text>
    </View>
  );

  if (!state.isToday) {
    return (
      <View style={styles.card}>
        {header}
        <Text style={styles.text}>
          Il giorno dell’evento potrai premere “Sono qui” e vedere a che distanza sono gli altri, per non lasciare indietro nessuno.
        </Text>
      </View>
    );
  }

  if (state.ended) {
    return (
      <View style={styles.card}>
        {header}
        <Text style={styles.text}>La gita è finita. La posizione è spenta per tutti.</Text>
        {state.canManage ? (
          <Pressable style={styles.secondaryButton} onPress={() => void reopen()} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Riattiva</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const peopleCount = sharing ? rows.length + 1 : state.activeCount;

  return (
    <View style={styles.card}>
      {header}
      <Text style={styles.count}>
        {peopleCount === 1 ? '1 persona ha premuto “Sono qui”' : `${peopleCount} persone hanno premuto “Sono qui”`}
      </Text>

      {!sharing && state.canJoin ? (
        <>
          <Text style={styles.text}>
            Premi “Sono qui” per vedere a che distanza sono gli altri. Anche loro vedranno la tua distanza.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => void startSharing()} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={BAJUJU_COLORS.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Sono qui</Text>
            )}
          </Pressable>
        </>
      ) : null}

      {sharing ? (
        <>
          {rows.length === 0 ? (
            <Text style={styles.text}>Per ora ci sei solo tu. Appena gli altri premono “Sono qui” li vedi qui.</Text>
          ) : (
            rows.map((item) => {
              const person = getPerson(item.userId);
              const distance = Number.isFinite(item.meters) ? formatWalkDistance(item.meters) : 'distanza in arrivo';
              return (
                <View key={item.userId} style={styles.personRow}>
                  {person.photo ? (
                    <Image source={{ uri: person.photo }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarEmpty]}>
                      <Ionicons name="person" size={16} color={BAJUJU_COLORS.muted} />
                    </View>
                  )}
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>{person.name}</Text>
                    {item.ago !== null && item.ago >= 2 ? (
                      <Text style={styles.personMeta}>aggiornato {item.ago} min fa</Text>
                    ) : null}
                  </View>
                  <Text style={styles.distance}>
                    {item.rough && Number.isFinite(item.meters) && item.meters >= 30 ? 'circa ' : ''}
                    {distance}
                  </Text>
                </View>
              );
            })
          )}
          <Text style={styles.note}>Tieni l’app aperta su questa pagina: la distanza si aggiorna ogni 15 secondi.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void stopSharing()} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Spegni la mia posizione</Text>
          </Pressable>
        </>
      ) : null}

      {state.canManage ? (
        <Pressable style={styles.endButton} onPress={confirmEnd} disabled={busy}>
          <Text style={styles.endButtonText}>Fine gita</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: BAJUJU_COLORS.white,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  count: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  text: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 14, lineHeight: 19 },
  note: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  primaryButton: {
    backgroundColor: BAJUJU_COLORS.pink,
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: { color: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    borderRadius: 18,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryButtonText: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  endButton: {
    backgroundColor: BAJUJU_COLORS.plum,
    borderRadius: 18,
    paddingVertical: 11,
    alignItems: 'center',
  },
  endButtonText: { color: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: BAJUJU_COLORS.softPink,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarEmpty: { backgroundColor: BAJUJU_COLORS.softPink, alignItems: 'center', justifyContent: 'center' },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 15 },
  personMeta: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12 },
  distance: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
});
