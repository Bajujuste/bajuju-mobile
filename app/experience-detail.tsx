import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
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
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '@/src/constants/experienceCategories';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

type ActivityRow = {
  id?: string;
  creator_id?: string | null;
  organizer_id?: string | null;
  created_by?: string | null;
  user_id?: string | null;
  profile_id?: string | null;
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
  image_url?: string | null;
  photo_url?: string | null;
  cover_url?: string | null;
  activity_image_url?: string | null;
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
  username?: string | null;
  first_name?: string | null;
  nickname?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  photo_url?: string | null;
  profile_photo_url?: string | null;
  profile_image_url?: string | null;
  image_url?: string | null;
  foto?: string | null;
};

type AlbumPhotoRow = {
  id?: string | number;
  activity_id?: string | null;
  event_id?: string | null;
  user_id?: string | null;
  profile_id?: string | null;
  photo_url?: string | null;
  image_url?: string | null;
  url?: string | null;
  created_at?: string | null;
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

function getExperienceCreatorId(experience: ActivityRow | null) {
  return String(
    experience?.creator_id ||
      experience?.organizer_id ||
      experience?.created_by ||
      experience?.user_id ||
      experience?.profile_id ||
      ''
  ).trim();
}

function profileName(profile: ProfileRow | undefined, index: number) {
  if (!profile) return `Partecipa orante ${index + 1}`;

  const value =
    profile.full_name ||
    profile.display_name ||
    profile.name ||
    profile.nome ||
    profile.username ||
    profile.first_name ||
    profile.nickname ||
    profile.email ||
    '';

  return value ? String(value).trim() : `Partecipa orante ${index + 1}`;
}

function profilePhotoUrl(profile: ProfileRow | undefined) {
  return (
    profile?.avatar_url ||
    profile?.photo_url ||
    profile?.profile_photo_url ||
    profile?.profile_image_url ||
    profile?.image_url ||
    profile?.foto ||
    ''
  );
}

function experiencePhotoUrl(experience: ActivityRow | null) {
  return (
    experience?.image_url ||
    experience?.photo_url ||
    experience?.cover_url ||
    experience?.activity_image_url ||
    ''
  );
}


function albumPhotoUrl(row: AlbumPhotoRow) {
  return String(row.photo_url || row.image_url || row.url || '').trim();
}

function albumPhotoOwnerId(row: AlbumPhotoRow) {
  return String(row.user_id || row.profile_id || '').trim();
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

function canInviteOutAfterExperience(experience: ActivityRow | null) {
  if (!experience?.activity_date || !experience?.activity_time) return false;

  const activityMoment = new Date(`${experience.activity_date}T${experience.activity_time}`);

  if (Number.isNaN(activityMoment.getTime())) return false;

  const oneMinuteAfter = activityMoment.getTime() + 60 * 1000;

  return Date.now() >= oneMinuteAfter;
}

export default function ExperienceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const experienceId = params.id;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [experience, setExperience] = useState<ActivityRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhotoRow[]>([]);
  const [uploadingAlbumPhoto, setUploadingAlbumPhoto] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingInviteTo, setSendingInviteTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeParticipants = useMemo(() => {
    const seen = new Set<string>();
    const rows: ParticipantRow[] = [];

    participants.filter(participantIsActive).forEach((participant) => {
      const userId = String(participant.user_id || '').trim();

      if (!userId || seen.has(userId)) return;

      seen.add(userId);
      rows.push(participant);
    });

    return rows;
  }, [participants]);

  const displayedParticipants = useMemo(() => {
    const creatorId = getExperienceCreatorId(experience);
    const seen = new Set<string>();
    const rows: ParticipantRow[] = [];

    if (creatorId) {
      seen.add(creatorId);
      rows.push({ activity_id: experience?.id || null, user_id: creatorId, status: 'creator' });
    }

    activeParticipants.forEach((item) => {
      const userId = String(item.user_id || '').trim();

      if (!userId || seen.has(userId)) return;

      seen.add(userId);
      rows.push(item);
    });

    return rows;
  }, [activeParticipants, experience]);

  const isOrganizer =
    Boolean(currentUserId) &&
    Boolean(getExperienceCreatorId(experience)) &&
    String(currentUserId) === getExperienceCreatorId(experience);

  const isParticipant = activeParticipants.some(
    (item) => String(item.user_id || '') === String(currentUserId || '')
  );

  const participantCount = displayedParticipants.length;
  const userAlbumPhotoCount = albumPhotos.filter((photo) => albumPhotoOwnerId(photo) === String(currentUserId || '')).length;
  const canUseAlbum = Boolean(currentUserId && (isOrganizer || isParticipant));
  const albumIsFull = albumPhotos.length >= 15;
  const userAlbumLimitReached = userAlbumPhotoCount >= 3;

  const maxParticipants = Number(experience?.max_participants || 0);
  const isFull = maxParticipants > 0 && participantCount >= maxParticipants;

  const canUseChat = isOrganizer || isParticipant;
  const canShowInviteOut = canUseChat && canInviteOutAfterExperience(experience);

  const loadParticipants = useCallback(async (activityId: string, loadedExperience?: ActivityRow | null) => {
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

    const sourceExperience = loadedExperience || experience;
    const creatorId = getExperienceCreatorId(sourceExperience);

    if (creatorId && !userIds.includes(creatorId)) {
      userIds.push(creatorId);
    }

    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      setProfiles({});
      return;
    }

    const nextProfiles: Record<string, ProfileRow> = {};

    for (const userIdToFind of uniqueUserIds) {
      const byId = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userIdToFind)
        .maybeSingle();

      const profileById = byId.data as ProfileRow | null;

      if (profileById) {
        const id = String(profileById.id || '');
        const userId = String(profileById.user_id || '');

        nextProfiles[userIdToFind] = profileById;
        if (id) nextProfiles[id] = profileById;
        if (userId) nextProfiles[userId] = profileById;

        continue;
      }

      const byUserId = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userIdToFind)
        .maybeSingle();

      const profileByUserId = byUserId.data as ProfileRow | null;

      if (profileByUserId) {
        const id = String(profileByUserId.id || '');
        const userId = String(profileByUserId.user_id || '');

        nextProfiles[userIdToFind] = profileByUserId;
        if (id) nextProfiles[id] = profileByUserId;
        if (userId) nextProfiles[userId] = profileByUserId;
      }
    }

    setProfiles(nextProfiles);
  }, []);

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

    const loadedExperience = result.data as ActivityRow;

    setExperience(loadedExperience);

    await loadParticipants(experienceId, loadedExperience);
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
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore partecipazione: ${result.error.message}`);
        }
        return;
      }

      await loadParticipants(experienceId, experience);
      await loadMessages(experienceId);

      if (typeof window !== 'undefined') {
        window.alert('Partecipa orazione registrata.');
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

      await loadParticipants(experienceId, experience);
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

    Alert.alert(
      'Annullare esperienza',
      'Vuoi davvero annullare questa esperienza?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sì, annulla',
          style: 'destructive',
          onPress: async () => {
            const now = new Date().toISOString();

            const attempts = [
              { deleted_at: now, status: 'deleted' },
              { deleted_at: now },
              { is_deleted: true, status: 'deleted' },
              { hidden: true, status: 'deleted' },
              { status: 'deleted' },
              { stato: 'eliminato' },
            ];

            for (const payload of attempts) {
              const result = await supabase
                .from('activities')
                .update(payload)
                .eq('id', experienceId);

              if (!result.error) {
                Alert.alert('Esperienza annullata', 'L’esperienza è stata rimossa.');
                router.replace('/experiences');
                return;
              }
            }

            Alert.alert(
              'Errore annullamento',
              'Non sono riuscito ad annullare questa esperienza. Probabile policy Supabase o colonna mancante.'
            );
          },
        },
      ]
    );
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



  const loadAlbumPhotos = useCallback(async () => {
    if (!experienceId) {
      setAlbumPhotos([]);
      return;
    }

    try {
      const result = await supabase
        .from('event_album_photos')
        .select('*')
        .eq('activity_id', experienceId)
        .order('created_at', { ascending: false })
        .limit(15);

      if (!result.error && Array.isArray(result.data)) {
        setAlbumPhotos(result.data as AlbumPhotoRow[]);
        return;
      }

      const fallback = await supabase
        .from('event_album_photos')
        .select('*')
        .eq('event_id', experienceId)
        .order('created_at', { ascending: false })
        .limit(15);

      if (!fallback.error && Array.isArray(fallback.data)) {
        setAlbumPhotos(fallback.data as AlbumPhotoRow[]);
        return;
      }

      setAlbumPhotos([]);
    } catch {
      setAlbumPhotos([]);
    }
  }, [experienceId]);

  const uploadAlbumPhoto = useCallback(async () => {
    if (!experienceId || !currentUserId || uploadingAlbumPhoto) return;

    if (!canUseAlbum) {
      window.alert('Solo organizzatore e partecipanti possono caricare foto nella galleria evento.');
      return;
    }

    if (albumIsFull) {
      window.alert('La galleria è piena: massimo 15 foto totali per evento.');
      return;
    }

    if (userAlbumLimitReached) {
      window.alert('Hai già caricato 3 foto per questo evento.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        window.alert('Autorizza l’accesso alle immagini per caricare una foto.');
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.78,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      setUploadingAlbumPhoto(true);

      const asset = picked.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const extensionFromUri = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase();
      const extension = extensionFromUri && extensionFromUri.length <= 5 ? extensionFromUri : 'jpg';
      const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
      const filePath = `${experienceId}/${currentUserId}-${Date.now()}.${extension}`;

      const uploadResult = await supabase.storage
        .from('event-photos')
        .upload(filePath, arrayBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadResult.error) throw uploadResult.error;

      const publicUrlResult = supabase.storage.from('event-photos').getPublicUrl(filePath);
      const publicUrl = publicUrlResult.data.publicUrl;

      if (!publicUrl) throw new Error('URL foto non disponibile.');

      const insertResult = await supabase.from('event_album_photos').insert({
        activity_id: experienceId,
        event_id: experienceId,
        user_id: currentUserId,
        profile_id: currentUserId,
        photo_url: publicUrl,
        image_url: publicUrl,
        created_at: new Date().toISOString(),
      });

      if (insertResult.error) throw insertResult.error;

      window.alert('Foto caricata nella galleria.');
      await loadAlbumPhotos();
    } catch (error: any) {
      window.alert(
        error?.message ||
          'Non sono riuscito a caricare la foto. Controlla che esistano tabella event_album_photos e bucket event-photos.'
      );
    } finally {
      setUploadingAlbumPhoto(false);
    }
  }, [
    albumIsFull,
    canUseAlbum,
    currentUserId,
    experienceId,
    loadAlbumPhotos,
    uploadingAlbumPhoto,
    userAlbumLimitReached,
  ]);

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
              <View style={styles.eventTopRow}>
                <Image
                  source={experiencePhotoUrl(experience) ? { uri: experiencePhotoUrl(experience) } : bajujuLogo}
                  style={styles.eventPhoto}
                  resizeMode="cover"
                />

                <View style={styles.eventTopText}>
                  <Text style={styles.category}>{getExperienceCategoryIcon(experience.category)} {normalizeExperienceCategory(experience.category)}</Text>

                  <Text style={styles.title}>
                    {experience.title || 'Esperienza senza titolo'}
                  </Text>
                </View>
              </View>

              <View style={styles.compactInfoBox}>
                <View style={styles.compactInfoRow}>
                  <Text style={styles.compactInfoLabel}>Dove</Text>
                  <Text style={styles.compactInfoValue}>
                    {experience.city || 'Comune'} · {experience.province || 'Provincia'}
                  </Text>
                </View>

                <View style={styles.compactInfoDivider} />

                <View style={styles.compactInfoRow}>
                  <Text style={styles.compactInfoLabel}>Quando</Text>
                  <Text style={styles.compactInfoValue}>
                    {formatDateItalian(experience.activity_date)} · {experience.activity_time || 'Ora da definire'}
                  </Text>
                </View>

                <View style={styles.compactInfoDivider} />

                <View style={styles.compactInfoRow}>
                  <Text style={styles.compactInfoLabel}>Ritrovo</Text>
                  <Text style={styles.compactInfoValue}>
                    {experience.meeting_place || experience.city || 'Non indicato'}
                  </Text>
                </View>
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
                <Text style={styles.shareExperienceButtonIcon}>📲</Text>
                <Text style={styles.shareExperienceButtonText}>Condividi esperienza</Text>
              </Pressable>

              <View style={styles.participantsBox}>
                <Text style={styles.sectionTitle}>Persone nell’esperienza</Text>
                <Text style={styles.participantsCount}>
                  {participantCount}{maxParticipants > 0 ? ` / ${maxParticipants}` : ''} partecipanti
                </Text>

                {displayedParticipants.length === 0 ? (
                  <Text style={styles.emptySmallText}>
                    Ancora nessun partecipante. Puoi essere tu il primo.
                  </Text>
                ) : (
                  <View style={styles.participantsList}>
                    {displayedParticipants.map((participant, index) => {
                      const userId = String(participant.user_id || '');
                      const isCreator = userId === getExperienceCreatorId(experience);
                      const profile = profiles[userId];
                      const name = profileName(profile, index);
                      const photo = profilePhotoUrl(profile);

                      return (
                        <Pressable
                          key={`${userId}-${index}`}
                          style={styles.participantRow}
                          onPress={() => router.push(`/user-profile?userId=${userId}`)}
                        >
                          <Image
                            source={photo ? { uri: photo } : bajujuLogo}
                            style={styles.participantPhoto}
                            resizeMode="cover"
                          />

                          <View style={styles.participantInfo}>
                            <Text style={styles.participantName}>{name}</Text>
                            <Text
                              style={[
                                styles.participantRoleBadge,
                                isCreator ? styles.organizerRoleBadge : styles.normalRoleBadge,
                              ]}
                            >
                              {isCreator ? 'Organizzatore' : 'Partecipa orante'}
                            </Text>
                          </View>

                          {canShowInviteOut && userId !== String(currentUserId || '') ? (
                            <Pressable
                              style={styles.inviteOutButton}
                              onPress={() => sendGoingOutInvite(userId)}
                              disabled={sendingInviteTo === userId}
                            >
                              <Text style={styles.inviteOutButtonText}>
                                {sendingInviteTo === userId ? 'Invio...' : 'Invita'}
                              </Text>
                            </Pressable>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>


              <View style={styles.albumBox}>
                <View style={styles.albumHeaderRow}>
                  <View>
                    <Text style={styles.albumTitle}>Galleria evento</Text>
                    <Text style={styles.albumSubtitle}>
                      {albumPhotos.length}/15 foto · massimo 3 foto per partecipante
                    </Text>
                  </View>

                  {canUseAlbum ? (
                    <Pressable
                      style={[
                        styles.albumUploadButton,
                        (uploadingAlbumPhoto || albumIsFull || userAlbumLimitReached) && styles.albumUploadButtonDisabled,
                      ]}
                      onPress={uploadAlbumPhoto}
                      disabled={uploadingAlbumPhoto || albumIsFull || userAlbumLimitReached}
                    >
                      <Text style={styles.albumUploadButtonText}>
                        {uploadingAlbumPhoto ? 'Carico...' : 'Aggiungi foto'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {!canUseAlbum ? (
                  <Text style={styles.albumHint}>
                    La galleria si sblocca per organizzatore e partecipanti.
                  </Text>
                ) : userAlbumLimitReached ? (
                  <Text style={styles.albumHint}>
                    Hai raggiunto il limite di 3 foto per questo evento.
                  </Text>
                ) : albumIsFull ? (
                  <Text style={styles.albumHint}>
                    La galleria ha raggiunto il limite di 15 foto.
                  </Text>
                ) : null}

                {albumPhotos.length === 0 ? (
                  <View style={styles.albumEmptyBox}>
                    <Text style={styles.albumEmptyTitle}>Nessuna foto ancora</Text>
                    <Text style={styles.albumHint}>Le foto dei partecipanti appariranno qui.</Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumPhotosRow}>
                    {albumPhotos.map((photo, index) => {
                      const url = albumPhotoUrl(photo);

                      if (!url) return null;

                      return (
                        <View key={String(photo.id || `${url}-${index}`)} style={styles.albumPhotoCard}>
                          <Image source={{ uri: url }} style={styles.albumPhoto} resizeMode="cover" />
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={styles.chatBox}>
                <Text style={styles.sectionTitle}>Chat dell’esperienza</Text>

                {!canUseChat ? (
                  <Text style={styles.emptySmallText}>
                    La chat si sblocca quando partecipi all’esperienza.
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

              <View style={styles.bottomActionsBox}>
                {isOrganizer ? (
                  <>
                    <View style={styles.smallStatusButton}>
                      <Text style={styles.smallStatusButtonText}>Creata da te</Text>
                    </View>

                    <Pressable style={styles.smallCancelButton} onPress={cancelExperience}>
                      <Text style={styles.smallCancelButtonText}>Annulla</Text>
                    </Pressable>
                  </>
                ) : isParticipant ? (
                  <>
                    <View style={styles.smallStatusButton}>
                      <Text style={styles.smallStatusButtonText}>Ci sei anche tu</Text>
                    </View>

                    <Pressable
                      style={[
                        styles.smallLeaveButton,
                        leaving && styles.mainButtonDisabled,
                      ]}
                      onPress={leaveExperience}
                      disabled={leaving}
                    >
                      <Text style={styles.smallLeaveButtonText}>
                        {leaving ? 'Abbandono...' : 'Non partecipo più'}
                      </Text>
                    </Pressable>
                  </>
                ) : isFull ? (
                  <View style={styles.smallStatusButton}>
                    <Text style={styles.smallStatusButtonText}>Al completo</Text>
                  </View>
                ) : (
                  <Pressable
                    style={[
                      styles.smallJoinButton,
                      joining && styles.mainButtonDisabled,
                    ]}
                    onPress={joinExperience}
                    disabled={joining}
                  >
                    <Text style={styles.smallJoinButtonText}>
                      {joining ? 'Partecipa orazione...' : 'Partecipa ora'}
                    </Text>
                  </Pressable>
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
    paddingTop: 64,
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd1e6',
    color: '#e43f98',
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  eventPhoto: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  eventTopText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 0,
    letterSpacing: -0.5,
  },
  compactInfoBox: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 13,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    marginBottom: 14,
  },
  compactInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  compactInfoLabel: {
    width: 66,
    color: '#9b1f61',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compactInfoValue: {
    flex: 1,
    color: '#6b3652',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  compactInfoDivider: {
    height: 1,
    backgroundColor: '#ffe2ef',
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
    backgroundColor: '#e43f98',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
    shadowColor: '#e43f98',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  shareExperienceButtonIcon: {
    fontSize: 15,
  },
  shareExperienceButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  participantsBox: {

    backgroundColor: '#fff8fb',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ffd6e8',
    padding: 16,
    marginTop: 16,
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionTitle: {
    color: '#e43f98',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  participantsCount: {

    color: '#8d315f',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 12,
  },
  participantsList: {

    gap: 10,
    marginTop: 4,
  },
  participantRow: {

    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffe1ee',
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  participantPhoto: {

    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff0f7',
    borderWidth: 2,
    borderColor: '#f0328b',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {

    color: '#48172f',
    fontSize: 15,
    fontWeight: '900',
  },
  participantRoleBadge: {

    alignSelf: 'flex-start',
    backgroundColor: '#f0328b',
    borderRadius: 999,
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  organizerRoleBadge: {
    backgroundColor: '#fff6ce',
    color: '#8a6700',
  },
  normalRoleBadge: {
    backgroundColor: '#fff0f7',
    color: '#9b1f61',
  },
  inviteOutButton: {
    borderRadius: 999,
    backgroundColor: '#e43f98',
    paddingVertical: 7,
    paddingHorizontal: 11,
    alignSelf: 'center',
  },
  inviteOutButtonText: {
    color: '#ffffff',
    fontSize: 11,
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
  bottomActionsBox: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  smallStatusButton: {
    borderRadius: 999,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  smallStatusButtonText: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
  },
  smallLeaveButton: {
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e43f98',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  smallLeaveButtonText: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
  },
  smallJoinButton: {
    borderRadius: 999,
    backgroundColor: '#e43f98',
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  smallJoinButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  smallCancelButton: {
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#9b1f61',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  smallCancelButtonText: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
  },
  albumBox: {
    marginTop: 18,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  albumHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  albumTitle: {
    color: '#4a1230',
    fontSize: 18,
    fontWeight: '900',
  },
  albumSubtitle: {
    marginTop: 3,
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '800',
  },
  albumUploadButton: {
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#e43f98',
  },
  albumUploadButtonDisabled: {
    opacity: 0.6,
  },
  albumUploadButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  albumHint: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  albumEmptyBox: {
    marginTop: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffe0ef',
  },
  albumEmptyTitle: {
    color: '#4a1230',
    fontSize: 14,
    fontWeight: '900',
  },
  albumPhotosRow: {
    gap: 10,
    paddingVertical: 8,
  },
  albumPhotoCard: {
    width: 116,
    height: 116,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  albumPhoto: {
    width: '100%',
    height: '100%',
  },
  chatBox: {

    backgroundColor: '#fff8fb',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ffd6e8',
    padding: 16,
    marginTop: 16,
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  emptySmallText: {

    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffe1ee',
    color: '#8d315f',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    padding: 14,
    textAlign: 'center',
  },
  messagesList: {

    gap: 10,
    marginTop: 10,
  },
  messageBubble: {

    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffe1ee',
    maxWidth: '88%',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  messageBubbleMine: {

    alignSelf: 'flex-end',
    backgroundColor: '#f0328b',
    borderColor: '#f0328b',
  },
  messageAuthor: {

    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 3,
  },
  messageBody: {

    color: '#48172f',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  messageTime: {

    color: '#a95d86',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
  chatInputRow: {

    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  chatInput: {

    backgroundColor: '#ffffff',
    borderColor: '#ffd1e6',
    borderRadius: 18,
    borderWidth: 1,
    color: '#48172f',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
