import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '../src/lib/supabase';
import { sendBajujuPushNotification } from '../src/utils/bajujuNotifications';

export default function InviteOutScreen() {
  const params = useLocalSearchParams<{ targetUserId?: string; activityId?: string }>();
  const targetUserId = String(params.targetUserId || '').trim();
  const activityId = String(params.activityId || '').trim();

  const [targetName, setTargetName] = useState('questa persona');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        if (!targetUserId || !activityId) return;
        const profileResult = await supabase
          .from('profiles')
          .select('nickname')
          .eq('id', targetUserId)
          .maybeSingle();

        const nickname = String(profileResult.data?.nickname || '').trim();
        if (nickname) setTargetName(nickname);
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId, targetUserId]);

  async function sendInvite() {
    const cleanMessage = message.trim();

    if (!targetUserId || !activityId) {
      Alert.alert('Invito non disponibile', 'Mancano i dati dell’esperienza o della persona.');
      return;
    }

    if (cleanMessage.length < 2) {
      Alert.alert('Scrivi un messaggio', 'Aggiungi un breve messaggio prima di inviare l’invito.');
      return;
    }

    if (cleanMessage.length > 300) {
      Alert.alert('Messaggio troppo lungo', 'Il messaggio può contenere al massimo 300 caratteri.');
      return;
    }

    setSending(true);

    try {
      const authResult = await supabase.auth.getUser();
      const currentUserId = authResult.data.user?.id;
      if (!currentUserId) throw new Error('Utente non autenticato.');
      if (currentUserId === targetUserId) throw new Error('Non puoi invitare te stesso.');

      const [blockedByMe, blockedMe] = await Promise.all([
        supabase.from('user_blocks').select('id').eq('blocker_id', currentUserId).eq('blocked_id', targetUserId).maybeSingle(),
        supabase.from('user_blocks').select('id').eq('blocker_id', targetUserId).eq('blocked_id', currentUserId).maybeSingle(),
      ]);

      if (blockedByMe.data || blockedMe.data) {
        Alert.alert('Invito non disponibile', 'Non puoi inviare inviti a questa persona.');
        return;
      }

      const existingResult = await supabase
        .from('direct_contact_requests')
        .select('id,status')
        .eq('requester_id', currentUserId)
        .eq('receiver_id', targetUserId)
        .eq('activity_id', activityId)
        .eq('contact_type', 'experience_invite')
        .in('status', ['pending', 'accepted'])
        .limit(1);

      if (existingResult.error) throw existingResult.error;
      if ((existingResult.data || []).length > 0) {
        Alert.alert('Invito già inviato', 'Hai già un invito aperto con questa persona per questa esperienza.');
        return;
      }

      const senderProfileResult = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', currentUserId)
        .maybeSingle();
      const senderName = String(senderProfileResult.data?.nickname || 'Un utente Bajuju').trim() || 'Un utente Bajuju';

      const insertResult = await supabase
        .from('direct_contact_requests')
        .insert({
          requester_id: currentUserId,
          sender_id: currentUserId,
          receiver_id: targetUserId,
          activity_id: activityId,
          contact_value: activityId,
          contact_type: 'experience_invite',
          status: 'pending',
          message: cleanMessage,
        })
        .select('id')
        .single();

      if (insertResult.error) throw insertResult.error;

      await sendBajujuPushNotification({
        type: 'contact_request',
        actorUserId: currentUserId,
        targetUserId,
        title: `${senderName} ti ha invitato a uscire`,
        body: cleanMessage,
        data: {
          screen: 'date-invites',
          requestId: insertResult.data.id,
          activityId,
        },
      });

      Alert.alert('Invito inviato', `Il tuo invito a ${targetName} è stato inviato.`);
      router.back();
    } catch (error: unknown) {
      Alert.alert('Errore invito', error instanceof Error ? error.message : 'Non sono riuscito a inviare l’invito.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}><ActivityIndicator color="#e43f98" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Indietro</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>Invita {targetName} a uscire</Text>
          <Text style={styles.subtitle}>Scrivi un messaggio personale. L’altra persona potrà accettare o rifiutare l’invito.</Text>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Es. Ti va di prenderci qualcosa insieme uno di questi giorni?"
            placeholderTextColor="#b26a91"
            multiline
            maxLength={300}
            style={styles.input}
          />
          <Text style={styles.counter}>{message.length}/300</Text>

          <Pressable style={[styles.sendButton, sending && styles.disabled]} onPress={() => void sendInvite()} disabled={sending}>
            <Text style={styles.sendText}>{sending ? 'Invio…' : 'Invia invito'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7fb' },
  container: { flex: 1, padding: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff0f7', borderWidth: 1, borderColor: '#ffd1e6', marginBottom: 14 },
  backText: { color: '#e43f98', fontWeight: '900' },
  card: { backgroundColor: '#ffffff', borderRadius: 26, borderWidth: 1, borderColor: '#f3c6dc', padding: 18 },
  title: { color: '#e43f98', fontSize: 23, fontWeight: '900' },
  subtitle: { marginTop: 7, color: '#6b3652', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  input: { marginTop: 18, minHeight: 130, borderWidth: 1, borderColor: '#f3c6dc', borderRadius: 20, padding: 14, textAlignVertical: 'top', color: '#4b1430', backgroundColor: '#fffafd', fontSize: 15 },
  counter: { marginTop: 6, alignSelf: 'flex-end', color: '#a95d86', fontWeight: '700', fontSize: 12 },
  sendButton: { marginTop: 18, height: 52, borderRadius: 18, backgroundColor: '#e43f98', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#ffffff', fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
