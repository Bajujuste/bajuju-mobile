import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { supabase } from '../src/lib/supabase';
import { sendBajujuPushNotification } from '../src/utils/bajujuNotifications';

type InviteRow = {
  id: string;
  requester_id: string | null;
  sender_id: string;
  receiver_id: string;
  activity_id: string | null;
  message: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
};

type InviteView = InviteRow & {
  otherName: string;
  direction: 'received' | 'sent';
};

const RESPONSE_MARKER = '\n\n--- RISPOSTA BAJUJU ---\n';

function splitMessage(message: string | null) {
  const value = String(message || '');
  const index = value.indexOf(RESPONSE_MARKER);
  if (index < 0) return { original: value, response: '' };
  return {
    original: value.slice(0, index).trim(),
    response: value.slice(index + RESPONSE_MARKER.length).trim(),
  };
}

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case 'accepted':
      return 'Accettato';
    case 'rejected':
    case 'declined':
      return 'Rifiutato';
    default:
      return 'In attesa';
  }
}

export default function DateInvitesScreen() {
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('Utente Bajuju');
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyRequestId, setReplyRequestId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadInvites = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const authResult = await supabase.auth.getUser();
      const currentUserId = authResult.data.user?.id;
      if (!currentUserId) throw new Error('Utente non autenticato.');
      setUserId(currentUserId);

      const profileResult = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', currentUserId)
        .maybeSingle();
      const currentName = String(profileResult.data?.nickname || 'Utente Bajuju').trim() || 'Utente Bajuju';
      setUserName(currentName);

      const [receivedResult, sentResult] = await Promise.all([
        supabase
          .from('direct_contact_requests')
          .select('id,requester_id,sender_id,receiver_id,activity_id,message,status,created_at,responded_at')
          .eq('contact_type', 'experience_invite')
          .eq('receiver_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('direct_contact_requests')
          .select('id,requester_id,sender_id,receiver_id,activity_id,message,status,created_at,responded_at')
          .eq('contact_type', 'experience_invite')
          .eq('requester_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (receivedResult.error) throw receivedResult.error;
      if (sentResult.error) throw sentResult.error;

      const received = (receivedResult.data || []) as InviteRow[];
      const sent = (sentResult.data || []) as InviteRow[];
      const otherIds = Array.from(new Set([
        ...received.map((row) => String(row.requester_id || row.sender_id || '')).filter(Boolean),
        ...sent.map((row) => String(row.receiver_id || '')).filter(Boolean),
      ]));

      const names = new Map<string, string>();
      if (otherIds.length > 0) {
        const profilesResult = await supabase
          .from('profiles')
          .select('id,nickname')
          .in('id', otherIds);

        if (!profilesResult.error) {
          (profilesResult.data || []).forEach((row: { id: string; nickname: string | null }) => {
            names.set(String(row.id), String(row.nickname || 'Utente Bajuju').trim() || 'Utente Bajuju');
          });
        }
      }

      const combined: InviteView[] = [
        ...received.map((row) => ({
          ...row,
          direction: 'received' as const,
          otherName: names.get(String(row.requester_id || row.sender_id || '')) || 'Utente Bajuju',
        })),
        ...sent.map((row) => ({
          ...row,
          direction: 'sent' as const,
          otherName: names.get(String(row.receiver_id || '')) || 'Utente Bajuju',
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setInvites(combined);
    } catch (error: unknown) {
      Alert.alert('Errore inviti', error instanceof Error ? error.message : 'Non sono riuscito a caricare gli inviti.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadInvites();
    }, [loadInvites])
  );

  async function answerInvite(invite: InviteView, status: 'accepted' | 'rejected') {
    if (invite.direction !== 'received' || busyId) return;
    setBusyId(invite.id);

    try {
      const updateResult = await supabase
        .from('direct_contact_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', invite.id)
        .eq('receiver_id', userId)
        .select('id')
        .maybeSingle();

      if (updateResult.error || !updateResult.data) {
        throw updateResult.error || new Error('Invito non aggiornato.');
      }

      const requesterId = String(invite.requester_id || invite.sender_id || '').trim();
      if (requesterId) {
        await sendBajujuPushNotification({
          type: status === 'accepted' ? 'contact_accepted' : 'contact_rejected',
          actorUserId: userId,
          targetUserId: requesterId,
          title: status === 'accepted'
            ? `${userName} ha accettato il tuo invito`
            : `${userName} ha rifiutato il tuo invito`,
          body: status === 'accepted'
            ? 'Puoi vedere la risposta nella sezione Inviti a uscire.'
            : 'L’invito a uscire non è stato accettato.',
          data: {
            screen: 'date-invites',
            requestId: invite.id,
            activityId: invite.activity_id || undefined,
          },
        });
      }

      if (status === 'accepted') {
        setReplyRequestId(invite.id);
        setReplyText('');
      }

      await loadInvites();
    } catch (error: unknown) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Non sono riuscito ad aggiornare l’invito.');
    } finally {
      setBusyId(null);
    }
  }

  async function sendOneReply(invite: InviteView) {
    if (invite.direction !== 'received' || invite.status !== 'accepted' || busyId) return;
    const cleanReply = replyText.trim();

    if (cleanReply.length < 2) {
      Alert.alert('Scrivi una risposta', 'Inserisci un breve messaggio.');
      return;
    }

    if (cleanReply.length > 300) {
      Alert.alert('Messaggio troppo lungo', 'La risposta può contenere al massimo 300 caratteri.');
      return;
    }

    const parts = splitMessage(invite.message);
    if (parts.response) {
      Alert.alert('Risposta già inviata', 'Per questo invito hai già inviato la tua risposta.');
      return;
    }

    setBusyId(invite.id);

    try {
      const nextMessage = `${parts.original}${RESPONSE_MARKER}${userName}: ${cleanReply}`;
      const updateResult = await supabase
        .from('direct_contact_requests')
        .update({ message: nextMessage })
        .eq('id', invite.id)
        .eq('receiver_id', userId)
        .eq('status', 'accepted')
        .select('id')
        .maybeSingle();

      if (updateResult.error || !updateResult.data) {
        throw updateResult.error || new Error('Risposta non salvata.');
      }

      const requesterId = String(invite.requester_id || invite.sender_id || '').trim();
      if (requesterId) {
        await sendBajujuPushNotification({
          type: 'contact_accepted',
          actorUserId: userId,
          targetUserId: requesterId,
          title: `${userName} ti ha risposto`,
          body: cleanReply,
          data: {
            screen: 'date-invites',
            requestId: invite.id,
            activityId: invite.activity_id || undefined,
          },
        });
      }

      setReplyRequestId(null);
      setReplyText('');
      await loadInvites();
    } catch (error: unknown) {
      Alert.alert('Errore risposta', error instanceof Error ? error.message : 'Non sono riuscito a inviare la risposta.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Inviti a uscire</Text>
          <Text style={styles.subtitle}>Inviti, risposte e stato delle richieste</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#e43f98" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadInvites(true)} />}
        >
          {invites.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nessun invito</Text>
              <Text style={styles.emptyText}>Quando qualcuno ti invita a uscire dopo un’esperienza, lo trovi qui.</Text>
            </View>
          ) : invites.map((invite) => {
            const parts = splitMessage(invite.message);
            const status = invite.status.toLowerCase();
            const isPending = status === 'pending';
            const isAccepted = status === 'accepted';
            const canReply = invite.direction === 'received' && isAccepted && !parts.response;

            return (
              <View key={`${invite.direction}-${invite.id}`} style={styles.card}>
                <Text style={styles.directionLabel}>{invite.direction === 'received' ? 'RICEVUTO' : 'INVIATO'}</Text>
                <Text style={styles.cardTitle}>
                  {invite.direction === 'received' ? `Invito da ${invite.otherName}` : `Invito a ${invite.otherName}`}
                </Text>
                <Text style={styles.message}>{parts.original || 'Nessun messaggio.'}</Text>
                <Text style={[styles.status, isAccepted && styles.statusAccepted]}>{statusLabel(status)}</Text>

                {parts.response ? (
                  <View style={styles.replyBox}>
                    <Text style={styles.replyLabel}>Risposta</Text>
                    <Text style={styles.replyText}>{parts.response}</Text>
                  </View>
                ) : null}

                {invite.direction === 'received' && isPending ? (
                  <View style={styles.actionsRow}>
                    <Pressable style={styles.acceptButton} onPress={() => void answerInvite(invite, 'accepted')} disabled={busyId === invite.id}>
                      <Text style={styles.acceptText}>{busyId === invite.id ? 'Attendi…' : 'Accetta'}</Text>
                    </Pressable>
                    <Pressable style={styles.rejectButton} onPress={() => void answerInvite(invite, 'rejected')} disabled={busyId === invite.id}>
                      <Text style={styles.rejectText}>Rifiuta</Text>
                    </Pressable>
                  </View>
                ) : null}

                {canReply && replyRequestId !== invite.id ? (
                  <Pressable style={styles.replyButton} onPress={() => { setReplyRequestId(invite.id); setReplyText(''); }}>
                    <Text style={styles.replyButtonText}>Invia una risposta</Text>
                  </Pressable>
                ) : null}

                {canReply && replyRequestId === invite.id ? (
                  <View style={styles.replyComposer}>
                    <TextInput
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder="Scrivi la tua risposta…"
                      placeholderTextColor="#b26a91"
                      multiline
                      maxLength={300}
                      style={styles.input}
                    />
                    <Text style={styles.counter}>{replyText.length}/300</Text>
                    <View style={styles.actionsRow}>
                      <Pressable style={styles.acceptButton} onPress={() => void sendOneReply(invite)} disabled={busyId === invite.id}>
                        <Text style={styles.acceptText}>Invia risposta</Text>
                      </Pressable>
                      <Pressable style={styles.rejectButton} onPress={() => { setReplyRequestId(null); setReplyText(''); }}>
                        <Text style={styles.rejectText}>Annulla</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7fb' },
  header: { minHeight: 76, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#8f1658', fontSize: 36, lineHeight: 38, marginTop: -4 },
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  title: { color: '#e43f98', fontSize: 24, fontWeight: '900' },
  subtitle: { marginTop: 2, color: '#a95d86', fontWeight: '700', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 15, paddingBottom: 36 },
  emptyCard: { padding: 26, borderRadius: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc', alignItems: 'center' },
  emptyTitle: { color: '#e43f98', fontSize: 19, fontWeight: '900' },
  emptyText: { marginTop: 7, color: '#6b3652', lineHeight: 20, textAlign: 'center', fontWeight: '700' },
  card: { marginBottom: 12, padding: 16, borderRadius: 23, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3c6dc' },
  directionLabel: { color: '#a95d86', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  cardTitle: { marginTop: 5, color: '#4b1430', fontSize: 18, fontWeight: '900' },
  message: { marginTop: 9, color: '#6b3652', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  status: { marginTop: 10, alignSelf: 'flex-start', color: '#8f5573', backgroundColor: '#fff0f7', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, fontWeight: '900', fontSize: 11 },
  statusAccepted: { color: '#217a4b', backgroundColor: '#eaf8f0' },
  actionsRow: { marginTop: 14, flexDirection: 'row', gap: 9 },
  acceptButton: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: '#e43f98', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  acceptText: { color: '#ffffff', fontWeight: '900' },
  rejectButton: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: '#fff0f7', borderWidth: 1, borderColor: '#f3c6dc', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  rejectText: { color: '#8f1658', fontWeight: '900' },
  replyBox: { marginTop: 12, padding: 12, borderRadius: 15, backgroundColor: '#fff8fb' },
  replyLabel: { color: '#e43f98', fontSize: 11, fontWeight: '900' },
  replyText: { marginTop: 4, color: '#5a2842', lineHeight: 19, fontWeight: '700' },
  replyButton: { marginTop: 14, minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: '#e43f98', alignItems: 'center', justifyContent: 'center' },
  replyButtonText: { color: '#e43f98', fontWeight: '900' },
  replyComposer: { marginTop: 12 },
  input: { minHeight: 90, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#f3c6dc', color: '#4b1430', textAlignVertical: 'top', backgroundColor: '#fffafd' },
  counter: { alignSelf: 'flex-end', marginTop: 5, color: '#a95d86', fontSize: 11, fontWeight: '700' },
});
