import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';
import { sendBajujuPushNotification } from '../src/utils/bajujuNotifications';

type ContactType = 'telefono' | 'telegram';
type LooseRow = Record<string, any>;

type ParticipantRow = {
  user_id?: string | null;
  status?: string | null;
};

function firstText(row: LooseRow | null | undefined, keys: string[], fallback = '') {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
}

function participantIsActive(row: ParticipantRow) {
  const status = String(row.status || '').toLowerCase().trim();
  return ![
    'rejected',
    'rifiutato',
    'declined',
    'annullato',
    'annullata',
    'deleted',
    'eliminato',
    'eliminata',
    'removed',
    'cancellato',
    'cancellata',
  ].includes(status);
}

function creatorId(row: LooseRow | null) {
  return String(
    row?.creator_id ||
      row?.organizer_id ||
      row?.created_by ||
      row?.user_id ||
      row?.profile_id ||
      ''
  ).trim();
}

function activityHasStarted(row: LooseRow | null) {
  if (!row?.activity_date || !row?.activity_time) return false;
  const moment = new Date(`${row.activity_date}T${row.activity_time}`);
  return !Number.isNaN(moment.getTime()) && Date.now() >= moment.getTime();
}

export default function ShareContactScreen() {
  const params = useLocalSearchParams<{ targetUserId?: string; activityId?: string }>();
  const targetUserId = String(params.targetUserId || '').trim();
  const activityId = String(params.activityId || '').trim();

  const [currentUserId, setCurrentUserId] = useState('');
  const [targetName, setTargetName] = useState('questa persona');
  const [senderName, setSenderName] = useState('Un utente Bajuju');
  const [allowed, setAllowed] = useState(false);
  const [disabledReason, setDisabledReason] = useState('');
  const [contactType, setContactType] = useState<ContactType>('telefono');
  const [contactValue, setContactValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const placeholder = useMemo(
    () => contactType === 'telefono' ? 'Es. +39 333 1234567' : 'Es. @nomeutente',
    [contactType]
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setAllowed(false);
      setDisabledReason('');

      try {
        const authResult = await supabase.auth.getUser();
        if (authResult.error) throw authResult.error;

        const userId = String(authResult.data.user?.id || '').trim();
        if (!active) return;
        setCurrentUserId(userId);

        if (!userId || !targetUserId || !activityId) {
          setDisabledReason('Mancano i dati necessari per condividere il contatto.');
          return;
        }

        if (userId === targetUserId) {
          setDisabledReason('Non puoi condividere il contatto con te stesso.');
          return;
        }

        const [activityResult, targetProfileResult, senderProfileResult, participantsResult, blockedByMe, blockedMe] = await Promise.all([
          supabase.from('activities').select('*').eq('id', activityId).maybeSingle(),
          supabase.from('profiles').select('*').eq('id', targetUserId).maybeSingle(),
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('activity_participants').select('user_id,status').eq('activity_id', activityId),
          supabase.from('user_blocks').select('id').eq('blocker_id', userId).eq('blocked_id', targetUserId).maybeSingle(),
          supabase.from('user_blocks').select('id').eq('blocker_id', targetUserId).eq('blocked_id', userId).maybeSingle(),
        ]);

        if (activityResult.error) throw activityResult.error;
        if (targetProfileResult.error) throw targetProfileResult.error;
        if (senderProfileResult.error) throw senderProfileResult.error;
        if (participantsResult.error) throw participantsResult.error;
        if (blockedByMe.error) throw blockedByMe.error;
        if (blockedMe.error) throw blockedMe.error;

        const activity = activityResult.data as LooseRow | null;
        const targetProfile = targetProfileResult.data as LooseRow | null;
        const senderProfile = senderProfileResult.data as LooseRow | null;

        const loadedTargetName = firstText(
          targetProfile,
          ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'],
          'questa persona'
        );
        const loadedSenderName = firstText(
          senderProfile,
          ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'],
          'Un utente Bajuju'
        );

        if (!active) return;
        setTargetName(loadedTargetName);
        setSenderName(loadedSenderName);

        if (!activity) {
          setDisabledReason('Esperienza non trovata.');
          return;
        }

        if (!activityHasStarted(activity)) {
          setDisabledReason('I contatti diretti diventano disponibili dopo l’inizio dell’esperienza.');
          return;
        }

        if (blockedByMe.data || blockedMe.data) {
          setDisabledReason('Non puoi condividere contatti con questa persona.');
          return;
        }

        const directContactsEnabled = Boolean(
          targetProfile?.allow_direct_contacts ??
          targetProfile?.direct_contacts_enabled ??
          targetProfile?.receive_direct_contacts ??
          targetProfile?.ricevi_contatti_diretti ??
          true
        );

        if (!directContactsEnabled) {
          setDisabledReason(`${loadedTargetName} non accetta contatti diretti.`);
          return;
        }

        const activeParticipants = ((participantsResult.data || []) as ParticipantRow[])
          .filter(participantIsActive)
          .map((row) => String(row.user_id || '').trim())
          .filter(Boolean);

        const organizer = creatorId(activity);
        const currentWasThere = organizer === userId || activeParticipants.includes(userId);
        const targetWasThere = organizer === targetUserId || activeParticipants.includes(targetUserId);

        if (!currentWasThere || !targetWasThere) {
          setDisabledReason('I contatti diretti sono disponibili solo tra persone della stessa esperienza.');
          return;
        }

        setAllowed(true);
      } catch (error: unknown) {
        setDisabledReason(error instanceof Error ? error.message : 'Controllo contatti non riuscito.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [activityId, targetUserId]);

  async function sendContactRequest() {
    if (!allowed || !currentUserId || sending) return;

    let cleanValue = contactValue.trim();
    if (contactType === 'telegram' && cleanValue && !cleanValue.startsWith('@')) {
      cleanValue = `@${cleanValue}`;
    }

    if (cleanValue.length < 3) {
      Alert.alert('Contatto non valido', 'Inserisci il contatto che vuoi condividere.');
      return;
    }

    if (cleanValue.length > 80) {
      Alert.alert('Contatto troppo lungo', 'Controlla il dato inserito.');
      return;
    }

    setSending(true);

    try {
      const existingResult = await supabase
        .from('direct_contact_requests')
        .select('id,status,contact_type')
        .eq('requester_id', currentUserId)
        .eq('receiver_id', targetUserId)
        .in('contact_type', ['telefono', 'telegram'])
        .limit(1);

      if (existingResult.error) throw existingResult.error;

      if ((existingResult.data || []).length > 0) {
        Alert.alert(
          'Contatto già inviato',
          'Hai già inviato un contatto diretto a questa persona. Puoi farlo una sola volta, anche se è stato rifiutato.'
        );
        return;
      }

      const message = contactType === 'telefono'
        ? `${senderName} vuole condividere con te il suo numero di telefono/WhatsApp.`
        : `${senderName} vuole condividere con te il suo contatto Telegram.`;

      const insertResult = await supabase
        .from('direct_contact_requests')
        .insert({
          requester_id: currentUserId,
          sender_id: currentUserId,
          receiver_id: targetUserId,
          activity_id: activityId,
          contact_type: contactType,
          contact_value: cleanValue,
          status: 'pending',
          message,
        })
        .select('id')
        .single();

      if (insertResult.error) throw insertResult.error;

      await sendBajujuPushNotification({
        type: 'contact_request',
        actorUserId: currentUserId,
        targetUserId,
        title: `${senderName} vuole condividere un contatto`,
        body: contactType === 'telefono'
          ? 'Telefono/WhatsApp: apri Bajuju per accettare o rifiutare.'
          : 'Telegram: apri Bajuju per accettare o rifiutare.',
        data: {
          screen: 'direct-contacts',
          requestId: insertResult.data.id,
          activityId,
        },
      });

      Alert.alert('Richiesta inviata', `${targetName} potrà accettare o rifiutare prima di vedere il contatto.`);
      router.back();
    } catch (error: unknown) {
      Alert.alert('Errore', error instanceof Error ? error.message : 'Non sono riuscito a condividere il contatto.');
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Indietro</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>Invia WhatsApp o Telegram</Text>
          <Text style={styles.subtitle}>Con {targetName}. Il dato sarà visibile solo dopo l’accettazione.</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#e43f98" />
              <Text style={styles.helper}>Controllo esperienza e permessi…</Text>
            </View>
          ) : !allowed ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>{disabledReason || 'Contatto non disponibile.'}</Text>
            </View>
          ) : (
            <>
              <View style={styles.typeRow}>
                <Pressable
                  style={[styles.typeButton, contactType === 'telefono' && styles.typeButtonActive]}
                  onPress={() => setContactType('telefono')}
                >
                  <Text style={[styles.typeText, contactType === 'telefono' && styles.typeTextActive]}>Telefono / WhatsApp</Text>
                </Pressable>
                <Pressable
                  style={[styles.typeButton, contactType === 'telegram' && styles.typeButtonActive]}
                  onPress={() => setContactType('telegram')}
                >
                  <Text style={[styles.typeText, contactType === 'telegram' && styles.typeTextActive]}>Telegram</Text>
                </Pressable>
              </View>

              <TextInput
                value={contactValue}
                onChangeText={setContactValue}
                placeholder={placeholder}
                placeholderTextColor="#b26a91"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={contactType === 'telefono' ? 'phone-pad' : 'default'}
                maxLength={80}
                style={styles.input}
              />

              <Text style={styles.helper}>L’altra persona dovrà accettare prima di vedere questo dato.</Text>

              <Pressable
                style={[styles.sendButton, sending && styles.disabled]}
                onPress={() => void sendContactRequest()}
                disabled={sending}
              >
                <Text style={styles.sendText}>{sending ? 'Invio…' : 'Invia richiesta'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7fb' },
  container: { flex: 1, padding: 18 },
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff0f7', borderWidth: 1, borderColor: '#ffd1e6', marginBottom: 14 },
  backText: { color: '#e43f98', fontWeight: '900' },
  card: { backgroundColor: '#ffffff', borderRadius: 26, borderWidth: 1, borderColor: '#f3c6dc', padding: 18 },
  title: { color: '#e43f98', fontSize: 23, fontWeight: '900' },
  subtitle: { marginTop: 7, color: '#6b3652', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loadingBox: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 10 },
  warningBox: { marginTop: 18, borderRadius: 18, padding: 14, backgroundColor: '#fff2f8', borderWidth: 1, borderColor: '#f3c6dc' },
  warningText: { color: '#6b3652', fontWeight: '800', lineHeight: 20 },
  typeRow: { marginTop: 18, flexDirection: 'row', gap: 8 },
  typeButton: { flex: 1, minHeight: 48, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#f3c6dc', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffafd' },
  typeButtonActive: { backgroundColor: '#e43f98', borderColor: '#e43f98' },
  typeText: { color: '#6b3652', fontWeight: '900', textAlign: 'center', fontSize: 13 },
  typeTextActive: { color: '#ffffff' },
  input: { marginTop: 16, height: 54, borderWidth: 1, borderColor: '#f3c6dc', borderRadius: 18, paddingHorizontal: 14, color: '#4b1430', backgroundColor: '#fffafd', fontSize: 15 },
  helper: { marginTop: 9, color: '#a95d86', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  sendButton: { marginTop: 18, height: 52, borderRadius: 18, backgroundColor: '#e43f98', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#ffffff', fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
