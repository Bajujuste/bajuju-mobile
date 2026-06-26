import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';
import { shareBajujuExperience } from '../src/utils/shareBajuju';

type ActivityRow = {
  id?: string;
  creator_id?: string | null;
  title?: string | null;
  category?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  description?: string | null;
  meeting_place?: string | null;
  max_participants?: number | null;
  budget_amount?: number | null;
};

type ParticipantRow = {
  activity_id?: string | null;
  user_id?: string | null;
  status?: string | null;
};

type ProfileRow = {
  id?: string;
  user_id?: string;
  full_name?: string | null;
  display_name?: string | null;
  name?: string | null;
  nome?: string | null;
  email?: string | null;
};

type MessageRow = {
  id?: string;
  activity_id?: string | null;
  user_id?: string | null;
  sender_id?: string | null;
  message?: string | null;
  content?: string | null;
  body?: string | null;
  created_at?: string | null;
};

function formatDateItalian(value: string | null | undefined) {
  if (!value) return 'Data da definire';

  const parts = value.split('-');
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
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

function profileName(profile: ProfileRow | undefined, index: number) {
  if (!profile) return `Partecipante ${index + 1}`;

  return (
    profile.full_name ||
    profile.display_name ||
    profile.name ||
    profile.nome ||
    profile.email ||
    `Partecipante ${index + 1}`
  );
}

function messageText(row: MessageRow) {
  return row.message || row.content || row.body || '';
}

function formatMessageTime(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ExperienceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const experienceId = params.id;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [experience, setExperience] = useState<ActivityRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingInviteTo, setSendingInviteTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeParticipants = useMemo(
    () => participants.filter(participantIsActive),
    [participants]
  );

  const displayedParticipants = useMemo(() => {
    const creatorId = String(experience?.creator_id || '');
    const creatorParticipant = creatorId
      ? [{ activity_id: experience?.id || null, user_id: creatorId, status: 'creator' }]
      : [];

    const normalParticipants = activeParticipants.filter(
      (item) => String(item.user_id || '') !== creatorId
    );

    return [...creatorParticipant, ...normalParticipants];
  }, [activeParticipants, experience?.creator_id, experience?.id]);

  const isOrganizer =
    Boolean(currentUserId) &&
    Boolean(experience?.creator_id) &&
    String(currentUserId) === String(experience?.creator_id);

  const isParticipant = activeParticipants.some(
    (item) => String(item.user_id || '') === String(currentUserId || '')
  );

  const participantCount = activeParticipants.length + (experience?.creator_id ? 1 : 0);
  const maxParticipants = Number(experience?.max_participants || 0);
  const isFull = maxParticipants > 0 && participantCount >= maxParticipants;

  const canUseChat = isOrganizer || isParticipant;

  const loadParticipants = useCallback(async (activityId: string) => {
    const participantsResult = await supabase
      .from('activity_participants')
      .select('activity_id,user_id,status')
      .eq('activity_id', activityId)
      .limit(200);

    if (participantsResult.error) {
      setParticipants([]);
      setProfiles({});
      return;
    }

    const rows = ((participantsResult.data || []) as ParticipantRow[]).filter(participantIsActive);
    setParticipants(rows);

    const userIds = rows
      .map((item) => String(item.user_id || ''))
      .filter(Boolean);

    const creatorId = String(experience?.creator_id || '');
    if (creatorId && !userIds.includes(creatorId)) {
      userIds.push(creatorId);
    }

    if (userIds.length === 0) {
      setProfiles({});
      return;
    }

    const profilesResult = await supabase
      .from('profiles')
      .select('id,user_id,full_name,display_name,name,nome,email')
      .in('id', userIds);

    if (profilesResult.error) {
      setProfiles({});
      return;
    }

    const nextProfiles: Record<string, ProfileRow> = {};

    ((profilesResult.data || []) as ProfileRow[]).forEach((profile) => {
      const id = String(profile.id || profile.user_id || '');
      if (id) nextProfiles[id] = profile;
    });

    setProfiles(nextProfiles);
  }, [experience?.creator_id]);

  const loadMessages = useCallback(async (activityId: string) => {
    const messagesResult = await supabase
      .from('activity_messages')
      .select('*')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (messagesResult.error) {
      setMessages([]);
      return;
    }

    setMessages((messagesResult.data || []) as MessageRow[]);
  }, []);

  const loadExperience = useCallback(async () => {
    if (!experienceId) {
      setErrorMessage('Esperienza non trovata.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const authResult = await supabase.auth.getUser();
    const userId = authResult.data.user?.id || null;
    setCurrentUserId(userId);

    const result = await supabase
      .from('activities')
      .select('*')
      .eq('id', experienceId)
      .single();

    if (result.error) {
      setErrorMessage(result.error.message || 'Non sono riuscito a caricare l’esperienza.');
      setLoading(false);
      return;
    }

    setExperience(result.data as ActivityRow);

    await loadParticipants(experienceId);
    await loadMessages(experienceId);

    setLoading(false);
  }, [experienceId, loadMessages, loadParticipants]);

  useEffect(() => {
    loadExperience();
  }, [loadExperience]);

  async function joinExperience() {
    if (!experienceId || joining) return;

    if (!currentUserId) {
      if (typeof window !== 'undefined') {
        window.alert('Devi essere collegato per partecipare.');
      }
      return;
    }

    if (isOrganizer) {
      if (typeof window !== 'undefined') {
        window.alert('Questa esperienza l’hai creata tu.');
      }
      return;
    }

    if (isParticipant) {
      if (typeof window !== 'undefined') {
        window.alert('Stai già partecipando a questa esperienza.');
      }
      return;
    }

    if (isFull) {
      if (typeof window !== 'undefined') {
        window.alert('Questa esperienza ha già raggiunto il numero massimo di partecipanti.');
      }
      return;
    }

    setJoining(true);

    try {
      const result = await supabase.from('activity_participants').insert({
        activity_id: experienceId,
        user_id: currentUserId,
        status: 'accepted',
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore partecipazione: ${result.error.message}`);
        }
        return;
      }

      await loadParticipants(experienceId);
      await loadMessages(experienceId);

      if (typeof window !== 'undefined') {
        window.alert('Partecipazione registrata.');
      }
    } finally {
      setJoining(false);
    }
  }

  async function leaveExperience() {
    if (!experienceId || !currentUserId || leaving || isOrganizer) return;

    setLeaving(true);

    try {
      const result = await supabase
        .from('activity_participants')
        .delete()
        .eq('activity_id', experienceId)
        .eq('user_id', currentUserId);

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore abbandono esperienza: ${result.error.message}`);
        }
        return;
      }

      await loadParticipants(experienceId);
      await loadMessages(experienceId);

      if (typeof window !== 'undefined') {
        window.alert('Hai abbandonato questa esperienza.');
      }
    } finally {
      setLeaving(false);
    }
  }

  async function cancelExperience() {
    if (!experienceId || !currentUserId || !isOrganizer) return;

    const confirmCancel =
      typeof window === 'undefined'
        ? true
        : window.confirm('Vuoi davvero annullare questa esperienza?');

    if (!confirmCancel) return;

    const result = await supabase
      .from('activities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', experienceId)
      .eq('creator_id', currentUserId);

    if (result.error) {
      if (typeof window !== 'undefined') {
        window.alert(`Errore annullamento esperienza: ${result.error.message}`);
      }
      return;
    }

    if (typeof window !== 'undefined') {
      window.alert('Esperienza annullata.');
    }

    router.replace('/experiences');
  }

  async function sendGoingOutInvite(targetUserId: string) {
    if (!experienceId || !currentUserId || !canUseChat || !targetUserId) return;

    if (String(targetUserId) === String(currentUserId)) return;

    setSendingInviteTo(targetUserId);

    try {
      const existingResult = await supabase
        .from('direct_contact_requests')
        .select('id,status')
        .eq('requester_id', currentUserId)
        .eq('receiver_id', targetUserId)
        .eq('activity_id', experienceId)
        .in('status', ['pending', 'accepted'])
        .maybeSingle();

      if (existingResult.data) {
        if (typeof window !== 'undefined') {
          window.alert('Hai già inviato un invito a questa persona per questa esperienza.');
        }
        return;
      }

      const result = await supabase.from('direct_contact_requests').insert({
        requester_id: currentUserId,
        receiver_id: targetUserId,
        activity_id: experienceId,
        status: 'pending',
        message: 'Vorrei invitarti a uscire dopo aver partecipato alla stessa esperienza Bajuju.',
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore invito: ${result.error.message}`);
        }
        return;
      }

      if (typeof window !== 'undefined') {
        window.alert('Invito inviato.');
      }
    } finally {
      setSendingInviteTo(null);
    }
  }

  async function sendChatMessage() {
    if (!experienceId || sendingMessage) return;

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
        window.alert('Devi partecipare all’esperienza per scrivere in chat.');
      }
      return;
    }

    setSendingMessage(true);

    try {
      const result = await supabase.from('activity_messages').insert({
        activity_id: experienceId,
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
      await loadMessages(experienceId);
    } finally {
      setSendingMessage(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/experiences')}>
          <Text style={styles.backText}>← Trova esperienza</Text>
        </Pressable>

        <View style={styles.card}>
          {loading ? (
            <Text style={styles.messageText}>Caricamento esperienza...</Text>
          ) : errorMessage ? (
            <Text style={styles.messageText}>{errorMessage}</Text>
          ) : experience ? (
            <>
              <Text style={styles.category}>{experience.category || 'Esperienza'}</Text>

              <Text style={styles.title}>
                {experience.title || 'Esperienza senza titolo'}
              </Text>

              <View style={styles.infoBox}>
                <Text style={styles.label}>Dove</Text>
                <Text style={styles.value}>
                  {experience.city || 'Comune'} · {experience.province || 'Provincia'}
                </Text>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.label}>Quando</Text>
                <Text style={styles.value}>
                  {formatDateItalian(experience.activity_date)} · {experience.activity_time || 'Ora da definire'}
                </Text>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.label}>Punto di ritrovo</Text>
                <Text style={styles.value}>
                  {experience.meeting_place || experience.city || 'Non indicato'}
                </Text>
              </View>

              {experience.budget_amount !== null && experience.budget_amount !== undefined ? (
                <View style={styles.descriptionBox}>
                  <Text style={styles.label}>Budget indicativo</Text>
                  <Text style={styles.description}>Massimo {experience.budget_amount} €</Text>
                </View>
              ) : null}

              <View style={styles.descriptionBox}>
                <Text style={styles.label}>Descrizione</Text>
                <Text style={styles.description}>
                  {experience.description || 'Descrizione non ancora disponibile.'}
                </Text>
              </View>

              <Pressable
                style={styles.shareExperienceButton}
                onPress={() =>
                  shareBajujuExperience({
                    title: experience.title,
                    category: experience.category,
                    city: experience.city,
                    province: experience.province,
                    date: experience.activity_date,
                    time: experience.activity_time,
                  })
                }
              >
                <Text style={styles.shareExperienceButtonText}>Condividi esperienza</Text>
              </Pressable>

              <View style={styles.participantsBox}>
                <Text style={styles.sectionTitle}>Partecipanti</Text>
                <Text style={styles.participantsCount}>
                  {participantCount}{maxParticipants > 0 ? ` / ${maxParticipants}` : ''} partecipanti
                </Text>

                {displayedParticipants.length === 0 ? (
                  <Text style={styles.emptySmallText}>
                    Ancora nessun partecipante.
                  </Text>
                ) : (
                  <View style={styles.participantsList}>
                    {displayedParticipants.map((participant, index) => {
                      const userId = String(participant.user_id || '');
                      const isCreator = userId === String(experience.creator_id || '');
                      const name = isCreator
                        ? `${profileName(profiles[userId], index)} · Organizzatore`
                        : profileName(profiles[userId], index);

                      return (
                        <View key={`${userId}-${index}`} style={styles.participantPill}>
                          <Text style={styles.participantText}>{name}</Text>

                          {canUseChat && userId !== String(currentUserId || '') ? (
                            <Pressable
                              style={styles.inviteOutButton}
                              onPress={() => sendGoingOutInvite(userId)}
                              disabled={sendingInviteTo === userId}
                            >
                              <Text style={styles.inviteOutButtonText}>
                                {sendingInviteTo === userId ? 'Invio...' : 'Invita a uscire'}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {isOrganizer ? (
                <View style={[styles.mainButton, styles.mainButtonDisabled]}>
                  <Text style={styles.mainButtonText}>Esperienza creata da te</Text>
                </View>
              ) : isParticipant ? (
                <View style={styles.participantActionBox}>
                  <View style={[styles.mainButton, styles.mainButtonDisabled]}>
                    <Text style={styles.mainButtonText}>Stai partecipando</Text>
                  </View>

                  <Pressable
                    style={[
                      styles.leaveButton,
                      leaving && styles.mainButtonDisabled,
                    ]}
                    onPress={leaveExperience}
                    disabled={leaving}
                  >
                    <Text style={styles.leaveButtonText}>
                      {leaving ? 'Abbandono...' : 'Abbandona esperienza'}
                    </Text>
                  </Pressable>
                </View>
              ) : isFull ? (
                <View style={[styles.mainButton, styles.mainButtonDisabled]}>
                  <Text style={styles.mainButtonText}>Esperienza al completo</Text>
                </View>
              ) : (
                <Pressable
                  style={[
                    styles.mainButton,
                    joining && styles.mainButtonDisabled,
                  ]}
                  onPress={joinExperience}
                  disabled={joining}
                >
                  <Text style={styles.mainButtonText}>
                    {joining ? 'Partecipazione...' : 'Partecipa'}
                  </Text>
                </Pressable>
              )}

              {isOrganizer ? (
                <Pressable style={styles.cancelButton} onPress={cancelExperience}>
                  <Text style={styles.cancelButtonText}>Annulla esperienza</Text>
                </Pressable>
              ) : null}

              <View style={styles.chatBox}>
                <Text style={styles.sectionTitle}>Chat esperienza</Text>

                {!canUseChat ? (
                  <Text style={styles.emptySmallText}>
                    Partecipa all’esperienza per leggere e scrivere nella chat.
                  </Text>
                ) : (
                  <>
                    {messages.length === 0 ? (
                      <Text style={styles.emptySmallText}>
                        Ancora nessun messaggio.
                      </Text>
                    ) : (
                      <View style={styles.messagesList}>
                        {messages.map((item, index) => {
                          const userId = String(item.user_id || item.sender_id || '');
                          const isMine = currentUserId && userId === currentUserId;
                          const name = isMine
                            ? 'Tu'
                            : profileName(profiles[userId], index);

                          return (
                            <View
                              key={item.id || `${userId}-${index}`}
                              style={[
                                styles.messageBubble,
                                isMine && styles.messageBubbleMine,
                              ]}
                            >
                              <Text style={styles.messageAuthor}>{name}</Text>
                              <Text style={styles.messageBody}>{messageText(item)}</Text>
                              <Text style={styles.messageTime}>
                                {formatMessageTime(item.created_at)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    <View style={styles.chatInputRow}>
                      <TextInput
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Scrivi un messaggio..."
                        placeholderTextColor="#b36a91"
                        style={styles.chatInput}
                        multiline
                      />

                      <Pressable
                        style={[
                          styles.sendButton,
                          (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled,
                        ]}
                        onPress={sendChatMessage}
                        disabled={!newMessage.trim() || sendingMessage}
                      >
                        <Text style={styles.sendButtonText}>
                          {sendingMessage ? '...' : 'Invia'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.messageText}>Esperienza non trovata.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 18,
    paddingBottom: 32,
    backgroundColor: '#fff8fb',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  backText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9b1f61',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  category: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  infoBox: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    marginBottom: 12,
  },
  descriptionBox: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    marginBottom: 16,
  },
  label: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  value: {
    color: '#6b3652',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  description: {
    color: '#6b3652',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  shareExperienceButton: {
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  shareExperienceButtonText: {
    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
  },
  participantsBox: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#e43f98',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  participantsCount: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  participantsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  participantPill: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  participantText: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
  },
  inviteOutButton: {
    marginTop: 7,
    borderRadius: 999,
    backgroundColor: '#e43f98',
    paddingVertical: 7,
    paddingHorizontal: 11,
    alignSelf: 'flex-start',
  },
  inviteOutButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  mainButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  mainButtonDisabled: {
    opacity: 0.55,
  },
  mainButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  participantActionBox: {
    gap: 10,
  },
  leaveButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e43f98',
    backgroundColor: '#ffffff',
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
  },
  leaveButtonText: {
    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
  },
  cancelButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d92b2b',
    backgroundColor: '#ffffff',
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 14,
  },
  cancelButtonText: {
    color: '#d92b2b',
    fontSize: 14,
    fontWeight: '900',
  },
  chatBox: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  emptySmallText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  messagesList: {
    gap: 10,
    marginTop: 6,
    marginBottom: 12,
  },
  messageBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff0f7',
    borderColor: '#f7b8d6',
  },
  messageAuthor: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 3,
  },
  messageBody: {
    color: '#6b3652',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  messageTime: {
    color: '#b36a91',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    marginTop: 10,
  },
  chatInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: '#6b3652',
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#e43f98',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  messageText: {
    color: '#9b1f61',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
