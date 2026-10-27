import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';

type LooseRow = Record<string, any>;

function firstValue(row: LooseRow | null, keys: string[], fallback: any = '') {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return fallback;
}

function firstText(row: LooseRow | null, keys: string[], fallback = '') {
  const value = firstValue(row, keys, fallback);
  return String(value || fallback);
}

function formatDate(value: any) {
  if (!value) return 'Non indicata';

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function flashTitle(row: LooseRow | null) {
  return firstText(row, ['title', 'titolo', 'name', 'nome'], 'Flash senza titolo');
}

function flashDescription(row: LooseRow | null) {
  return firstText(row, ['description', 'descrizione'], '').trim();
}

function flashCity(row: LooseRow | null) {
  return firstText(row, ['city', 'citta', 'comune', 'location_city'], 'Comune non indicato');
}

function flashProvince(row: LooseRow | null) {
  return firstText(row, ['province', 'provincia', 'location_province'], '');
}

function flashPlace(row: LooseRow | null) {
  return firstText(row, ['place', 'luogo', 'address', 'indirizzo', 'meeting_point', 'punto_ritrovo'], 'Indirizzo non indicato');
}

function flashExpiresAt(row: LooseRow | null) {
  return firstValue(row, ['expires_at', 'expiresAt', 'expiry_at', 'expires'], '');
}


function flashCreatorId(row: LooseRow | null) {
  return String(firstValue(row, ['creator_id', 'created_by', 'user_id', 'organizer_id', 'owner_id'], '') || '');
}

function participantIsActive(row: LooseRow) {
  const status = String(firstValue(row, ['status'], '') || '').toLowerCase().trim();

  return ![
    'rejected',
    'rifiutato',
    'declined',
    'annullato',
    'annullata',
    'deleted',
    'eliminato',
    'eliminata',
    'cancelled',
    'canceled',
  ].includes(status);
}

function profileName(row: LooseRow | null) {
  return firstText(
    row,
    ['full_name', 'display_name', 'name', 'nome', 'username', 'first_name', 'nickname'],
    'Utente Bajuju'
  );
}

function messageText(row: LooseRow) {
  return firstText(row, ['message', 'content', 'body'], '');
}

function messageSenderId(row: LooseRow) {
  return String(firstValue(row, ['sender_id', 'user_id', 'profile_id'], '') || '');
}

export default function FlashDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const [flash, setFlash] = useState<LooseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<LooseRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, LooseRow>>({});
  const [messages, setMessages] = useState<LooseRow[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const flashId = Array.isArray(params.id) ? params.id[0] : params.id;

  const loadMessages = useCallback(async (activityId: string) => {
    const messagesResult = await supabase
      .from('activity_messages')
      .select('*')
      .eq('activity_id', activityId)
      // Ultimi 100 messaggi: ordine decrescente per il limite, poi invertito per mostrarli dal più vecchio.
      .order('created_at', { ascending: false })
      .limit(100);

    if (messagesResult.error) {
      setMessages([]);
      return;
    }

    setMessages(((messagesResult.data || []) as LooseRow[]).reverse());
  }, []);

  const loadFlash = useCallback(async () => {
    if (!flashId) {
      setErrorMessage('Flash non trovato.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const authResult = await supabase.auth.getUser();
      const userId = authResult.data.user?.id || null;
      setCurrentUserId(userId);

      const result = await supabase
        .from('activities')
        .select('*')
        .eq('id', flashId)
        .single();

      if (result.error) {
        setErrorMessage('Flash non disponibile.');
        setFlash(null);
        setParticipants([]);
        setProfiles({});
        setMessages([]);
        return;
      }

      const loadedFlash = result.data as LooseRow;
      setFlash(loadedFlash);

      const participantsResult = await supabase
        .from('activity_participants')
        .select('*')
        .eq('activity_id', flashId)
        .limit(200);

      const participantRows = participantsResult.error
        ? []
        : ((participantsResult.data || []) as LooseRow[]).filter(participantIsActive);

      // La RLS nasconde già i partecipanti bloccati in entrambe le direzioni.
      setParticipants(participantRows);

      const userIds = participantRows
        .map((item) => String(firstValue(item, ['user_id'], '') || ''))
        .filter(Boolean);

      const creatorId = flashCreatorId(loadedFlash);

      if (creatorId && !userIds.includes(creatorId)) {
        userIds.push(creatorId);
      }

      const uniqueUserIds = [...new Set(userIds)];
      const nextProfiles: Record<string, LooseRow> = {};

      // Una sola query per tutti i profili (prima una o due query in sequenza per partecipante).
      if (uniqueUserIds.length > 0) {
        const profilesResult = await supabase
          .from('profiles')
          .select('*')
          .in('id', uniqueUserIds);

        ((profilesResult.data || []) as LooseRow[]).forEach((profile) => {
          const id = String(firstValue(profile, ['id'], '') || '');
          if (id) nextProfiles[id] = profile;
        });
      }

      setProfiles(nextProfiles);
      await loadMessages(flashId);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore imprevisto durante il caricamento del Flash.';

      setFlash(null);
      setParticipants([]);
      setProfiles({});
      setMessages([]);
      setErrorMessage(message === 'BAJUJU_BLOCKED' ? 'Flash non disponibile.' : message);
    } finally {
      setLoading(false);
    }
  }, [flashId, loadMessages]);

  useEffect(() => {
    loadFlash();
  }, [loadFlash]);
  useEffect(() => {
    if (!flashId) return;

    // Nome univoco per istanza: evita di riusare un canale ancora aperto con lo stesso nome.
    const channel = supabase
      .channel(`flash-messages-${flashId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_messages',
          filter: `activity_id=eq.${flashId}`,
        },
        () => {
          void loadMessages(flashId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [flashId, loadMessages]);


  const displayedParticipants = useMemo(() => {
    const creatorId = flashCreatorId(flash);
    const seen = new Set<string>();
    const rows: LooseRow[] = [];

    if (creatorId && (creatorId === String(currentUserId || '') || Boolean(profiles[creatorId]))) {
      seen.add(creatorId);
      rows.push({ user_id: creatorId, status: 'creator' });
    }

    participants.forEach((item) => {
      const userId = String(firstValue(item, ['user_id'], '') || '');

      if (!userId || seen.has(userId)) return;

      seen.add(userId);
      rows.push(item);
    });

    return rows;
  }, [currentUserId, flash, participants, profiles]);

  const isOrganizer =
    Boolean(currentUserId) &&
    Boolean(flashCreatorId(flash)) &&
    String(currentUserId) === flashCreatorId(flash);

  const isParticipant = participants.some(
    (item) => String(firstValue(item, ['user_id'], '') || '') === String(currentUserId || '')
  );

  const canUseChat = isOrganizer || isParticipant;

  async function sendChatMessage() {
    if (!flashId || sendingMessage) return;

    const cleanMessage = newMessage.trim();

    if (!cleanMessage) return;

    if (!currentUserId) {
      if (typeof window !== 'undefined') {
        window.alert('Devi essere collegato per scrivere in chat.');
      }
      return;
    }

    if (!canUseChat) {
      if (typeof window !== 'undefined') {
        window.alert('Devi partecipare al Flash per scrivere in chat.');
      }
      return;
    }

    setSendingMessage(true);

    try {
      const result = await supabase.from('activity_messages').insert({
        activity_id: flashId,
        sender_id: currentUserId,
        message: cleanMessage,
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore invio messaggio: ${result.error.message}`);
        }
        return;
      }

      setNewMessage('');
      await loadMessages(flashId);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore imprevisto durante l’invio del messaggio.';

      Alert.alert('Errore invio messaggio', message);
    } finally {
      setSendingMessage(false);
    }
  }

  function confirmDeleteMessage(item: LooseRow) {
    const messageId = String(firstValue(item, ['id'], '') || '').trim();
    if (!flashId || !messageId || item.deleted_at || !currentUserId || messageSenderId(item) !== currentUserId) return;

    Alert.alert('Eliminare il messaggio?', 'Al suo posto resterà la scritta “Messaggio eliminato”.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const result = await supabase.rpc('bajuju_delete_my_message', { p_chat: 'activity', p_message_id: messageId });
            if (result.error) {
              Alert.alert('Messaggio non eliminato', 'Riprova tra poco.');
              return;
            }
            await loadMessages(flashId);
          })();
        },
      },
    ]);
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju Flash</Text>
        <Text style={styles.title}>Dettaglio Flash</Text>

        {/* dismissTo torna alla schermata Flash già aperta invece di impilarne una nuova copia. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.dismissTo('/flash')}>
          <Text style={styles.secondaryButtonText}>Torna a Bajuju Flash</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Caricamento Flash...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Errore caricamento</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.button} onPress={loadFlash}>
            <Text style={styles.buttonText}>Riprova</Text>
          </Pressable>
        </View>
      ) : flash ? (
        <>
        <View style={styles.card}>
          <Text style={styles.flashTitle}>{flashTitle(flash)}</Text>

          {flashDescription(flash) ? (
            <Text style={styles.flashDescription}>
              {flashDescription(flash)}
            </Text>
          ) : null}

          <View style={styles.infoBox}>
            <Text style={styles.label}>Comune</Text>
            <Text style={styles.value}>
              {flashCity(flash)}
              {flashProvince(flash) ? ` · ${flashProvince(flash)}` : ''}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Indirizzo</Text>
            <Text style={styles.value}>{flashPlace(flash)}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Partecipanti</Text>
            <Text style={styles.value}>{displayedParticipants.length}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Disponibile fino a</Text>
            <Text style={styles.value}>{formatDate(flashExpiresAt(flash))}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Partecipanti</Text>

          {displayedParticipants.length === 0 ? (
            <Text style={styles.mutedText}>Non ci sono ancora partecipanti.</Text>
          ) : (
            displayedParticipants.map((item, index) => {
              const userId = String(firstValue(item, ['user_id'], '') || '');
              const profile = profiles[userId] || null;
              const isCreator = String(firstValue(item, ['status'], '') || '') === 'creator';

              return (
                <View key={`${userId}-${index}`} style={styles.participantRow}>
                  <Text style={styles.participantName}>{profileName(profile)}</Text>
                  {isCreator ? <Text style={styles.participantBadge}>Organizzatore</Text> : null}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Chat Flash</Text>

          {!canUseChat ? (
            <Text style={styles.mutedText}>La chat è visibile, ma puoi scrivere solo se partecipi al Flash.</Text>
          ) : null}

          {messages.length === 0 ? (
            <Text style={styles.mutedText}>Ancora nessun messaggio.</Text>
          ) : (
            messages.map((item, index) => {
              const senderId = messageSenderId(item);
              const profile = profiles[senderId] || null;
              const deleted = Boolean(item.deleted_at);
              const isMine = Boolean(currentUserId) && senderId === currentUserId;

              return (
                <View key={`${firstValue(item, ['id'], index)}-${index}`} style={styles.messageBox}>
                  <Text style={styles.messageAuthor}>{profileName(profile)}</Text>
                  <Text style={[styles.messageText, deleted && styles.messageTextDeleted]}>
                    {deleted ? 'Messaggio eliminato' : messageText(item)}
                  </Text>
                  {isMine && !deleted ? (
                    <Pressable onPress={() => confirmDeleteMessage(item)} hitSlop={8} accessibilityLabel="Elimina messaggio">
                      <Text style={styles.deleteMessageText}>Elimina</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}

          {canUseChat ? (
            <View style={styles.chatComposer}>
              <TextInput
                style={styles.chatInput}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Scrivi un messaggio..."
                multiline
              />

              <Pressable
                style={[
                  styles.button,
                  (!newMessage.trim() || sendingMessage) && styles.buttonDisabled,
                ]}
                onPress={sendChatMessage}
                disabled={!newMessage.trim() || sendingMessage}
              >
                <Text style={styles.buttonText}>{sendingMessage ? 'Invio...' : 'Invia'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Flash non disponibile</Text>
          <Text style={styles.mutedText}>Non sono riuscito a trovare questo Flash.</Text>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: '#FFF9FC',
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#F3C6DC',
    gap: 12,
  },
  kicker: {
    color: '#E43F98',
    fontFamily: 'FredokaBold',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: '#4B0C2D',
    fontSize: 28,
    fontFamily: 'FredokaBold',
  },
  flashDescription: {
    color: '#6f4258',
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'FredokaBold',
    marginTop: 8,
    marginBottom: 12,
  },
  flashTitle: {
    color: '#4B0C2D',
    fontSize: 24,
    fontFamily: 'FredokaBold',
  },
  infoBox: {
    backgroundColor: '#FFF9FC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  label: {
    color: '#E43F98',
    fontFamily: 'FredokaBold',
    fontSize: 13,
    marginBottom: 4,
  },
  value: {
    color: '#4B0C2D',
    fontSize: 16,
    fontFamily: 'FredokaBold',
  },
  mutedText: {
    color: '#8D5E77',
    fontFamily: 'FredokaRegular',
    fontSize: 15,
    lineHeight: 21,
  },
  errorTitle: {
    color: '#b4235f',
    fontFamily: 'FredokaBold',
    fontSize: 18,
  },
  errorText: {
    color: '#8D5E77',
    fontFamily: 'FredokaRegular',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#E43F98',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontFamily: 'FredokaBold',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: '#FFF0F7',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  secondaryButtonText: {
    color: '#E43F98',
    fontFamily: 'FredokaBold',
    fontSize: 15,
  },

  sectionTitle: {
    color: '#7a1f4f',
    fontSize: 20,
    fontFamily: 'FredokaBold',
    marginBottom: 12,
  },
  participantRow: {
    backgroundColor: '#FFF9FC',
    borderColor: '#F3C6DC',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    padding: 12,
  },
  participantName: {
    color: '#4B0C2D',
    fontSize: 15,
    fontFamily: 'FredokaBold',
  },
  participantBadge: {
    color: '#E43F98',
    fontSize: 12,
    fontFamily: 'FredokaBold',
    marginTop: 4,
  },
  messageBox: {
    backgroundColor: '#FFF9FC',
    borderColor: '#F3C6DC',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  messageAuthor: {
    color: '#7a1f4f',
    fontSize: 13,
    fontFamily: 'FredokaBold',
    marginBottom: 4,
  },
  messageText: {
    color: '#4B0C2D',
    fontFamily: 'FredokaRegular',
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextDeleted: {
    fontStyle: 'italic',
    opacity: 0.7,
  },
  deleteMessageText: {
    alignSelf: 'flex-end',
    color: '#7a1f4f',
    fontFamily: 'FredokaRegular',
    fontSize: 11,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  chatComposer: {
    gap: 10,
    marginTop: 14,
  },
  chatInput: {
    backgroundColor: '#FFF9FC',
    borderColor: '#F3C6DC',
    borderRadius: 16,
    borderWidth: 1,
    color: '#4B0C2D',
    minHeight: 86,
    maxHeight: 180,
    padding: 12,
    textAlignVertical: 'top',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
