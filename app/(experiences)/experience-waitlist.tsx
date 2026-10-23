import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { supabase } from '../../src/lib/supabase';
import { trackBajujuEvent } from '../../src/utils/bajujuAnalytics';
import { sendBajujuPushNotification } from '../../src/utils/bajujuNotifications';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';

type ActivityRow = {
  id: string;
  creator_id?: string | null;
  title?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  max_participants?: number | null;
};

type WaitlistInfo = {
  id?: string;
  status?: 'waiting' | 'notified';
  position?: number;
  reservedUntil?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default function ExperienceWaitlistScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const activityId = String(params.id || '').trim();

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [participantCount, setParticipantCount] = useState(0);
  const [alreadyParticipant, setAlreadyParticipant] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const maxParticipants = Number(activity?.max_participants || 0);
  const isFull = maxParticipants > 0 && participantCount >= maxParticipants;

  const reservationLabel = useMemo(() => {
    if (waitlist?.status !== 'notified' || !waitlist.reservedUntil) return '';
    const until = new Date(waitlist.reservedUntil);
    if (Number.isNaN(until.getTime())) return '';
    return until.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }, [waitlist]);

  const loadAll = useCallback(async () => {
    if (!activityId) {
      setErrorMessage('Esperienza non trovata.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const authResult = await supabase.auth.getUser();
      const userId = authResult.data.user?.id || '';
      if (!userId) throw new Error('Devi fare login per usare la lista d’attesa.');
      setCurrentUserId(userId);

      const activityResult = await supabase
        .from('activities')
        .select('id,creator_id,title,city,province,activity_date,activity_time,max_participants')
        .eq('id', activityId)
        .single();

      if (activityResult.error || !activityResult.data) {
        throw activityResult.error || new Error('Esperienza non trovata.');
      }

      const loadedActivity = activityResult.data as ActivityRow;
      setActivity(loadedActivity);

      const participantsResult = await supabase
        .from('activity_participants')
        .select('user_id,status')
        .eq('activity_id', activityId)
        .limit(300);

      if (participantsResult.error) throw participantsResult.error;

      const activeUsers = new Set<string>();
      if (loadedActivity.creator_id) activeUsers.add(String(loadedActivity.creator_id));

      (participantsResult.data || []).forEach((row: any) => {
        const status = String(row.status || '').toLowerCase();
        if (status !== 'annullato' && row.user_id) activeUsers.add(String(row.user_id));
      });

      setParticipantCount(activeUsers.size);
      setAlreadyParticipant(activeUsers.has(userId));

      const waitlistResult = await supabase.rpc('get_my_activity_waitlist' as any, {
        p_activity_id: activityId,
      });

      if (waitlistResult.error) throw waitlistResult.error;
      setWaitlist((waitlistResult.data || null) as WaitlistInfo | null);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Non sono riuscito a caricare la lista d’attesa.');
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  async function joinWaitlist() {
    if (!activityId || working) return;
    setWorking(true);

    try {
      const result = await supabase.rpc('join_activity_waitlist' as any, {
        p_activity_id: activityId,
      });

      if (result.error) throw result.error;
      const data = result.data as any;

      if (data?.ok !== true) {
        if (data?.reason === 'EVENT_NOT_FULL') {
          Alert.alert('C’è un posto', 'L’esperienza non è più al completo: puoi partecipare subito.');
        } else if (data?.reason === 'ALREADY_JOINED') {
          Alert.alert('Sei già dentro', 'Risulti già partecipante a questa esperienza.');
        } else if (data?.reason === 'PROFILE_AGE_REQUIRED') {
          Alert.alert(
            'Età richiesta',
            'Inserisci la tua età precisa nel profilo prima di entrare in lista d’attesa.',
            [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Apri profilo', onPress: () => router.push('/profile' as any) },
            ]
          );
        } else if (data?.reason === 'AGE_RESTRICTED') {
          Alert.alert('Evento riservato per età', 'La tua età non rientra nella fascia prevista per questo evento.');
        } else {
          Alert.alert('Lista d’attesa', 'Non è possibile entrare in lista d’attesa in questo momento.');
        }
        await loadAll();
        return;
      }

      void trackBajujuEvent('waitlist_joined', {
        activityId,
        position: Number(data?.position || 0),
      });

      Alert.alert('Sei in lista', `Sei in posizione ${Number(data?.position || 1)}. Ti avviseremo quando si libera un posto.`);
      await loadAll();
    } catch (error: unknown) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Non sono riuscito ad aggiungerti alla lista d’attesa.');
    } finally {
      setWorking(false);
    }
  }

  async function leaveWaitlist() {
    if (!activityId || working) return;
    setWorking(true);

    try {
      const result = await supabase.rpc('leave_activity_waitlist' as any, {
        p_activity_id: activityId,
      });
      if (result.error) throw result.error;

      void trackBajujuEvent('waitlist_left', { activityId });
      setWaitlist(null);
      await loadAll();
    } catch (error: unknown) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Non sono riuscito a toglierti dalla lista.');
    } finally {
      setWorking(false);
    }
  }

  async function joinExperience() {
    if (!activityId || working) return;
    setWorking(true);

    try {
      const result = await supabase.rpc('join_standard_activity' as any, {
        p_activity_id: activityId,
      });

      if (result.error) throw result.error;
      const data = result.data as any;

      if (data?.ok !== true) {
        const reason = String(data?.reason || '');
        if (reason === 'FULL') {
          Alert.alert('Esperienza al completo', 'Il posto è stato occupato. Resti in lista d’attesa.');
        } else if (reason === 'RESERVED') {
          Alert.alert('Posto riservato', 'Il posto libero è temporaneamente riservato a chi è prima in lista d’attesa.');
        } else if (reason === 'PROFILE_AGE_REQUIRED') {
          Alert.alert(
            'Età richiesta',
            'Inserisci la tua età precisa nel profilo prima di partecipare.',
            [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Apri profilo', onPress: () => router.push('/profile' as any) },
            ]
          );
        } else if (reason === 'AGE_RESTRICTED') {
          Alert.alert('Evento riservato per età', 'La tua età non rientra nella fascia prevista per questo evento.');
        } else if (reason === 'BLOCKED') {
          Alert.alert('Non disponibile', 'Non puoi partecipare a questa esperienza.');
        } else {
          Alert.alert('Non disponibile', 'Non è possibile partecipare in questo momento.');
        }
        await loadAll();
        return;
      }

      void trackBajujuEvent('experience_joined', {
        activityId,
        source: waitlist?.status === 'notified' ? 'waitlist' : 'waitlist_screen',
      });

      if (currentUserId && activity?.creator_id && currentUserId !== activity.creator_id) {
        await sendBajujuPushNotification({
          type: 'new_participant',
          targetUserId: String(activity.creator_id),
          activityId,
        }).catch(() => undefined);
      }

      Alert.alert('Ci sei!', 'Partecipazione registrata.');
      router.replace({ pathname: '/experience-detail' as any, params: { id: activityId } });
    } catch (error: unknown) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Non sono riuscito a registrare la partecipazione.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <BajujuBackButton onPress={() => router.back()} accessibilityLabel="Indietro" />
          <Text style={styles.screenTitle} numberOfLines={1}>Lista d’attesa</Text>
          <BajujuProfileButton size={38} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{activity?.title || 'Esperienza Bajuju'}</Text>
          <Text style={styles.meta}>
            {[activity?.city || activity?.province, formatDate(activity?.activity_date), activity?.activity_time ? String(activity.activity_time).slice(0, 5) : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color="#E43F98" />
              <Text style={styles.infoText}>Caricamento…</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.noticeBox}>
              <Text style={styles.infoText}>{errorMessage}</Text>
              <Pressable style={styles.secondaryButton} onPress={() => void loadAll()}>
                <Text style={styles.secondaryButtonText}>Riprova</Text>
              </Pressable>
            </View>
          ) : alreadyParticipant ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeTitle}>Sei già partecipante</Text>
              <Pressable
                style={styles.mainButton}
                onPress={() => router.replace({ pathname: '/experience-detail' as any, params: { id: activityId } })}
              >
                <Text style={styles.mainButtonText}>Apri esperienza</Text>
              </Pressable>
            </View>
          ) : waitlist?.status === 'notified' ? (
            <View style={styles.priorityBox}>
              <Text style={styles.noticeTitle}>🎉 Si è liberato un posto</Text>
              <Text style={styles.infoText}>
                Il posto è riservato a te{reservationLabel ? ` fino alle ${reservationLabel}` : ' per 30 minuti'}.
              </Text>
              <Pressable style={styles.mainButton} onPress={joinExperience} disabled={working}>
                <Text style={styles.mainButtonText}>{working ? 'Registrazione…' : 'Partecipa ora'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={leaveWaitlist} disabled={working}>
                <Text style={styles.secondaryButtonText}>Rinuncia alla priorità</Text>
              </Pressable>
            </View>
          ) : waitlist?.status === 'waiting' ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeTitle}>Sei in lista</Text>
              <Text style={styles.positionText}>Posizione {Number(waitlist.position || 1)}</Text>
              <Text style={styles.infoText}>Ti avviseremo automaticamente quando si libera un posto.</Text>
              <Pressable style={styles.secondaryButton} onPress={leaveWaitlist} disabled={working}>
                <Text style={styles.secondaryButtonText}>{working ? 'Aggiornamento…' : 'Esci dalla lista'}</Text>
              </Pressable>
            </View>
          ) : isFull ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeTitle}>Esperienza al completo</Text>
              <Text style={styles.infoText}>{participantCount}/{maxParticipants} partecipanti. Entra in lista e ti avvisiamo appena si libera un posto.</Text>
              <Pressable style={styles.mainButton} onPress={joinWaitlist} disabled={working}>
                <Text style={styles.mainButtonText}>{working ? 'Inserimento…' : 'Entra in lista d’attesa'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeTitle}>C’è un posto disponibile</Text>
              <Text style={styles.infoText}>{participantCount}{maxParticipants > 0 ? `/${maxParticipants}` : ''} partecipanti.</Text>
              <Pressable style={styles.mainButton} onPress={joinExperience} disabled={working}>
                <Text style={styles.mainButtonText}>{working ? 'Registrazione…' : 'Partecipa ora'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <BajujuBottomNav active="find" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9FC' },
  container: { flex: 1, padding: 20, paddingTop: 58, paddingBottom: 120 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#FFF0F7', borderWidth: 1, borderColor: '#F3C6DC' },
  backText: { color: '#E43F98', fontFamily: 'FredokaBold' },
  screenTitle: { flex: 1, color: '#4B0C2D', fontSize: 24, fontFamily: 'FredokaBold' },
  card: { borderRadius: 28, padding: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#F3C6DC' },
  eyebrow: { color: '#E43F98', fontFamily: 'FredokaBold', fontSize: 12, letterSpacing: 1 },
  title: { color: '#4B0C2D', fontSize: 25, lineHeight: 30, fontFamily: 'FredokaBold' },
  meta: { marginTop: 7, color: '#8f5573', fontSize: 13, lineHeight: 19, fontFamily: 'FredokaBold' },
  centerBox: { paddingVertical: 34, alignItems: 'center', gap: 10 },
  noticeBox: { marginTop: 20, padding: 18, borderRadius: 22, backgroundColor: '#FFF9FC', borderWidth: 1, borderColor: '#F3C6DC' },
  priorityBox: { marginTop: 20, padding: 18, borderRadius: 22, backgroundColor: '#fff7dc', borderWidth: 1, borderColor: '#e4bf4f' },
  noticeTitle: { color: '#4B0C2D', fontSize: 19, fontFamily: 'FredokaBold', textAlign: 'center' },
  positionText: { marginTop: 10, color: '#E43F98', fontSize: 27, fontFamily: 'FredokaBold', textAlign: 'center' },
  infoText: { marginTop: 9, color: '#8D5E77', fontSize: 14, lineHeight: 20, fontFamily: 'FredokaBold', textAlign: 'center' },
  mainButton: { marginTop: 16, minHeight: 48, borderRadius: 999, backgroundColor: '#E43F98', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  mainButtonText: { color: '#ffffff', fontSize: 16, fontFamily: 'FredokaBold' },
  secondaryButton: { marginTop: 10, minHeight: 48, borderRadius: 999, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E43F98', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonText: { color: '#E43F98', fontSize: 14, fontFamily: 'FredokaBold' },
});
