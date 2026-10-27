import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBajujuPhotoPicker } from '../../src/components/useBajujuPhotoPicker';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../../src/lib/supabase';
import {
  BajujuLocation,
  LOCATION_COLOR,
  LOCATION_COLOR_SOFT,
  loadBajujuLocation,
  locationAddressLine,
  withLocationIdentity,
} from '../../src/lib/bajujuLocations';
import { shareBajujuExperience } from '../../src/utils/shareBajuju';
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '@/constants/experienceCategories';
import { sendBajujuPushNotification } from '../../src/utils/bajujuNotifications';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');

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
  join_approval_required?: boolean | null;
  min_age?: number | null;
  max_age?: number | null;
  budget_amount?: number | null;
  image_url?: string | null;
  photo_url?: string | null;
  cover_url?: string | null;
  activity_image_url?: string | null;
  location_owner_id?: string | null;
};

type ParticipantRow = {
  activity_id?: string | null;
  user_id?: string | null;
  status?: string | null;
};

type ActivityJoinState = 'none' | 'owner' | 'joined' | 'pending' | 'approved' | 'rejected';

type ActivityJoinRequest = {
  user_id?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  age_range?: string | null;
  gender?: string | null;
  origin?: string | null;
  requested_at?: string | null;
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
  deleted_at?: string | null;
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
  if (!profile) return `Partecipante ${index + 1}`;

  const value =
    profile.full_name ||
    profile.display_name ||
    profile.name ||
    profile.nome ||
    profile.username ||
    profile.first_name ||
    profile.nickname ||
    '';

  return value ? String(value).trim() : `Partecipante ${index + 1}`;
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
  const { pickPhoto, photoPickerModal } = useBajujuPhotoPicker();
  // SafeAreaView di react-native copre solo iOS: su Android la barra di navigazione
  // di sistema si sovrappone alla barra fissa in basso, quindi aggiungiamo l'inset a mano.
  const safeAreaInsets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === 'android' ? safeAreaInsets.bottom : 0;
  const pageScrollRef = useRef<any>(null);
  const chatAutoScrollDoneRef = useRef(false);
  const params = useLocalSearchParams<{ id?: string; section?: string }>();
  const experienceId = params.id;
  const requestedSection = params.section;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isCurrentUserAdmin, setIsCurrentUserAdmin] = useState(false);
  const [experience, setExperience] = useState<ActivityRow | null>(null);
  const [eventLocation, setEventLocation] = useState<BajujuLocation | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhotoRow[]>([]);
  const [selectedAlbumPhotoIndex, setSelectedAlbumPhotoIndex] = useState<number | null>(null);
  const [uploadingAlbumPhoto, setUploadingAlbumPhoto] = useState(false);
  const albumUploadLockRef = useRef(false);
  const [updatingCoverPhoto, setUpdatingCoverPhoto] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [joinState, setJoinState] = useState<ActivityJoinState>('none');
  const [joinRequests, setJoinRequests] = useState<ActivityJoinRequest[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [reviewBusyUserId, setReviewBusyUserId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'gallery'>('chat');
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatFocused, setChatFocused] = useState(false);

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

    if (creatorId && (creatorId === String(currentUserId || '') || Boolean(profiles[creatorId]))) {
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
  }, [activeParticipants, currentUserId, experience, profiles]);

  const isOrganizer =
    Boolean(currentUserId) &&
    Boolean(getExperienceCreatorId(experience)) &&
    String(currentUserId) === getExperienceCreatorId(experience);

  const isParticipant = activeParticipants.some(
    (item) => String(item.user_id || '') === String(currentUserId || '')
  );

  const canEditExperience = isOrganizer || isCurrentUserAdmin;

  const participantCount = displayedParticipants.length;
  const userAlbumPhotoCount = albumPhotos.filter((photo) => albumPhotoOwnerId(photo) === String(currentUserId || '')).length;
  const canUseAlbum = Boolean(currentUserId && (isOrganizer || isParticipant));
  const albumIsFull = albumPhotos.length >= 15;
  const userAlbumLimitReached = userAlbumPhotoCount >= 3;

  const visibleAlbumPhotos = albumPhotos.filter((photo) => !!albumPhotoUrl(photo));
  const selectedAlbumPhoto =
    selectedAlbumPhotoIndex !== null ? visibleAlbumPhotos[selectedAlbumPhotoIndex] : null;
  const selectedAlbumPhotoUrl = selectedAlbumPhoto ? albumPhotoUrl(selectedAlbumPhoto) : '';

  function openAlbumPhoto(index: number) {
    setSelectedAlbumPhotoIndex(index);
  }

  function closeAlbumPhoto() {
    setSelectedAlbumPhotoIndex(null);
  }

  function showPreviousAlbumPhoto() {
    if (selectedAlbumPhotoIndex === null || visibleAlbumPhotos.length === 0) return;
    setSelectedAlbumPhotoIndex(
      selectedAlbumPhotoIndex === 0 ? visibleAlbumPhotos.length - 1 : selectedAlbumPhotoIndex - 1
    );
  }

  function showNextAlbumPhoto() {
    if (selectedAlbumPhotoIndex === null || visibleAlbumPhotos.length === 0) return;
    setSelectedAlbumPhotoIndex(
      selectedAlbumPhotoIndex >= visibleAlbumPhotos.length - 1 ? 0 : selectedAlbumPhotoIndex + 1
    );
  }

  const maxParticipants = Number(experience?.max_participants || 0);
  const isFull = maxParticipants > 0 && participantCount >= maxParticipants;
  const approvalRequired = experience?.join_approval_required === true;

  const canUseChat = isOrganizer || isParticipant;
  const canShowInviteOut = canUseChat && canInviteOutAfterExperience(experience);

  useEffect(() => {
    chatAutoScrollDoneRef.current = false;
  }, [experienceId, requestedSection]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (requestedSection !== 'chat') return;
    if (loading || !canUseChat || chatAutoScrollDoneRef.current) return;

    const timeout = setTimeout(() => {
      pageScrollRef.current?.scrollToEnd({ animated: true });
      chatAutoScrollDoneRef.current = true;
    }, 350);

    return () => clearTimeout(timeout);
  }, [canUseChat, loading, messages.length, requestedSection]);

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

    // La RLS nasconde già i partecipanti bloccati in entrambe le direzioni.
    const rows = ((participantsResult.data || []) as ParticipantRow[]).filter(participantIsActive);
    setParticipants(rows);

    const userIds = rows
      .map((item) => String(item.user_id || ''))
      .filter(Boolean);

    const sourceExperience = loadedExperience ?? null;
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

    const profilesResult = await supabase
      .from('profiles')
      .select('*')
      .in('id', uniqueUserIds);

    const loadedProfiles = await withLocationIdentity((profilesResult.data || []) as ProfileRow[], {
      idKey: 'id',
      nameKeys: ['full_name', 'nickname'],
      avatarKey: 'avatar_url',
    });

    loadedProfiles.forEach((profile) => {
      const id = String(profile.id || '');
      if (id) nextProfiles[id] = profile;
    });

    setProfiles(nextProfiles);
  }, []);

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

    setMessages(((messagesResult.data || []) as MessageRow[]).reverse());
  }, []);

  const loadJoinApprovalState = useCallback(async (
    activityId: string,
    userId: string | null,
    loadedExperience: ActivityRow | null
  ) => {
    if (!userId) {
      setJoinState('none');
      setJoinRequests([]);
      return;
    }

    const organizerId = getExperienceCreatorId(loadedExperience);
    const canManageRequests = organizerId === userId;

    const [stateResult, requestsResult] = await Promise.all([
      supabase.rpc('get_activity_join_state' as any, { p_activity_id: activityId }),
      canManageRequests
        ? supabase.rpc('get_activity_join_requests' as any, { p_activity_id: activityId })
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (!stateResult.error) {
      setJoinState(String(stateResult.data || 'none') as ActivityJoinState);
    } else {
      setJoinState('none');
    }

    if (!requestsResult.error && Array.isArray(requestsResult.data)) {
      setJoinRequests(await withLocationIdentity(requestsResult.data as ActivityJoinRequest[], {
        idKey: 'user_id',
        nameKeys: ['nickname'],
        avatarKey: 'avatar_url',
      }));
    } else {
      setJoinRequests([]);
    }
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

    if (userId) {
      const profileResult = await supabase
        .from('profiles')
        .select('is_admin,is_deleted')
        .eq('id', userId)
        .maybeSingle();

      setIsCurrentUserAdmin(
        !profileResult.error &&
        profileResult.data?.is_admin === true &&
        profileResult.data?.is_deleted !== true
      );
    } else {
      setIsCurrentUserAdmin(false);
    }

    const result = await supabase
      .from('activities')
      .select('*')
      .eq('id', experienceId)
      .single();

    if (result.error) {
      setExperience(null);
      setParticipants([]);
      setProfiles({});
      setMessages([]);
      setAlbumPhotos([]);
      setErrorMessage('Esperienza non disponibile.');
      setLoading(false);
      return;
    }

    const loadedExperience = result.data as ActivityRow;

    setExperience(loadedExperience);

    const locationOwnerId = String(loadedExperience.location_owner_id || '').trim();
    setEventLocation(
      locationOwnerId ? await loadBajujuLocation(locationOwnerId).catch(() => null) : null
    );

    await Promise.all([
      loadParticipants(experienceId, loadedExperience),
      loadMessages(experienceId),
      loadJoinApprovalState(experienceId, userId, loadedExperience),
    ]);

    setLoading(false);
  }, [experienceId, loadJoinApprovalState, loadMessages, loadParticipants]);

  useEffect(() => {
    loadExperience();
  }, [loadExperience]);

  useEffect(() => {
    if (requestedSection === 'requests' && joinRequests.length > 0) {
      setRequestsOpen(true);
    }
  }, [joinRequests.length, requestedSection]);

  useEffect(() => {
    if (!experienceId) return;

    // Nome univoco per istanza: supabase.channel() riusa un canale con lo stesso nome ancora aperto
    // (es. schermata aperta due volte da una push) e registrare postgres_changes su un canale già
    // collegato genera un errore.
    const channel = supabase
      .channel(`experience-messages-${experienceId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_messages',
          filter: `activity_id=eq.${experienceId}`,
        },
        () => {
          void loadMessages(experienceId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [experienceId, loadMessages]);

  async function joinExperience() {
    if (!experienceId || joining) return;

    if (!currentUserId) {
      Alert.alert('Login richiesto', 'Devi essere collegato per partecipare.');
      return;
    }

    if (isOrganizer) {
      Alert.alert('La organizzi tu', 'Questa esperienza l’hai creata tu.');
      return;
    }

    if (isParticipant) {
      Alert.alert('Sei già dentro', 'Stai già partecipando a questa esperienza.');
      return;
    }

    if (isFull && !approvalRequired) {
      router.push({
        pathname: '/experience-waitlist' as any,
        params: { id: experienceId },
      });
      return;
    }

    setJoining(true);

    try {
      const result = await supabase.rpc('request_activity_join' as any, {
        p_activity_id: experienceId,
      });

      if (result.error) throw result.error;
      const data = result.data as any;

      if (data?.ok !== true) {
        const reason = String(data?.reason || '');

        if (reason === 'FULL') {
          Alert.alert(
            'Esperienza al completo',
            'Nel frattempo l’ultimo posto è stato occupato. Puoi entrare in lista d’attesa.',
            [
              { text: 'Chiudi', style: 'cancel' },
              {
                text: 'Lista d’attesa',
                onPress: () =>
                  router.push({
                    pathname: '/experience-waitlist' as any,
                    params: { id: experienceId },
                  }),
              },
            ]
          );
        } else if (reason === 'RESERVED') {
          Alert.alert(
            'Posto riservato',
            'Il posto libero è temporaneamente riservato a chi è prima in lista d’attesa.',
            [
              { text: 'Chiudi', style: 'cancel' },
              {
                text: 'Apri lista',
                onPress: () =>
                  router.push({
                    pathname: '/experience-waitlist' as any,
                    params: { id: experienceId },
                  }),
              },
            ]
          );
        } else if (reason === 'PROFILE_AGE_REQUIRED') {
          Alert.alert(
            'Età richiesta',
            'Inserisci la tua età precisa nel profilo prima di partecipare a un evento.',
            [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Apri profilo', onPress: () => router.push('/profile' as any) },
            ]
          );
        } else if (reason === 'AGE_RESTRICTED') {
          Alert.alert('Evento riservato per età', 'La tua età non rientra nella fascia prevista per questo evento.');
        } else if (reason === 'BLOCKED') {
          Alert.alert('Non disponibile', 'Non puoi partecipare a questa esperienza.');
        } else if (reason === 'PAST' || reason === 'UNAVAILABLE') {
          Alert.alert('Esperienza non disponibile', 'Non è più possibile partecipare a questa esperienza.');
        } else {
          Alert.alert('Non disponibile', 'Non è possibile partecipare in questo momento.');
        }
        return;
      }

      if (String(data?.status || '') === 'already_joined') {
        setJoinState('joined');
        await loadParticipants(experienceId, experience);
        Alert.alert('Sei già dentro', 'Risulti già partecipante a questa esperienza.');
        return;
      }

      if (String(data?.status || '') === 'pending') {
        setJoinState('pending');
        const organizerId = getExperienceCreatorId(experience);
        if (organizerId && organizerId !== currentUserId) {
          await sendBajujuPushNotification({
            type: 'experience_join_request',
            targetUserId: organizerId,
            activityId: experienceId,
          }).catch(() => {
            console.log('Errore notifica richiesta partecipazione.');
          });
        }
        Alert.alert('Richiesta inviata', 'L’organizzatore vedrà la tua richiesta direttamente dentro l’esperienza.');
        return;
      }

      const organizerId = getExperienceCreatorId(experience);
      if (organizerId && organizerId !== currentUserId) {
        await sendBajujuPushNotification({
          type: 'new_participant',
          targetUserId: organizerId,
          activityId: experienceId,
        }).catch(() => {
          console.log('Errore notifica nuovo partecipante.');
        });
      }

      setJoinState('joined');
      await loadParticipants(experienceId, experience);
      await loadMessages(experienceId);
      Alert.alert('Ci sei!', 'Partecipazione registrata.');
    } catch (error: unknown) {
      console.log('Errore partecipazione esperienza.');
      Alert.alert(
        'Errore partecipazione',
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a registrare la partecipazione. Riprova tra poco.'
      );
    } finally {
      setJoining(false);
    }
  }

  async function cancelJoinRequest() {
    if (!experienceId || !currentUserId || joining) return;

    setJoining(true);
    try {
      const result = await supabase.rpc('cancel_activity_join_request' as any, {
        p_activity_id: experienceId,
      });
      if (result.error) throw result.error;
      setJoinState('none');
      Alert.alert('Richiesta annullata', 'La richiesta di partecipazione è stata annullata.');
    } catch (error: unknown) {
      Alert.alert(
        'Errore',
        error instanceof Error ? error.message : 'Non sono riuscito ad annullare la richiesta.'
      );
    } finally {
      setJoining(false);
    }
  }

  async function reviewJoinRequest(requestUserId: string, accept: boolean) {
    if (!experienceId || !currentUserId || !isOrganizer || !requestUserId || reviewBusyUserId) return;

    setReviewBusyUserId(requestUserId);
    try {
      const result = await supabase.rpc('review_activity_join_request' as any, {
        p_activity_id: experienceId,
        p_user_id: requestUserId,
        p_accept: accept,
      });
      if (result.error) throw result.error;

      await Promise.all([
        loadParticipants(experienceId, experience),
        loadJoinApprovalState(experienceId, currentUserId, experience),
      ]);

      await sendBajujuPushNotification({
        type: accept ? 'experience_join_accepted' : 'experience_join_rejected',
        targetUserId: requestUserId,
        activityId: experienceId,
      }).catch(() => {
        console.log('Errore notifica esito richiesta partecipazione.');
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.includes('BAJUJU_EVENT_FULL') || message.includes('BAJUJU_SPOT_RESERVED')) {
        Alert.alert('Evento al completo', 'Non ci sono posti disponibili in questo momento. La richiesta resta in attesa.');
      } else if (message.includes('BAJUJU_PROFILE_AGE_REQUIRED')) {
        Alert.alert('Età mancante', 'Questo utente deve inserire la sua età precisa prima di poter essere accettato.');
      } else if (message.includes('BAJUJU_AGE_RESTRICTED')) {
        Alert.alert('Fuori fascia', 'Questo utente non rientra più nella fascia d’età impostata per l’evento. La richiesta resta in attesa.');
      } else {
        Alert.alert('Errore richiesta', message || 'Non sono riuscito a gestire la richiesta.');
      }
    } finally {
      setReviewBusyUserId('');
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
    } catch (error: any) {
      console.log('Errore abbandono esperienza.');

      if (typeof window !== 'undefined') {
        window.alert(
          error?.message ||
            'Non sono riuscito ad abbandonare l’esperienza. Riprova tra poco.'
        );
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
            try {
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
                  .eq('id', experienceId)
                  .select('id')
                  .maybeSingle();

                if (!result.error && result.data) {
                  const participantsResult = await supabase
                    .from('activity_participants')
                    .select('user_id')
                    .eq('activity_id', experienceId);

                  if (participantsResult.error) {
                    console.log('Errore lettura partecipanti esperienza annullata.');
                  }

                  const participantIds = (participantsResult.data || [])
                    .map((row: any) => String(row.user_id || ''))
                    .filter((id: string) => id && id !== currentUserId);

                  await Promise.all(
                    participantIds.map((targetUserId: string) =>
                      sendBajujuPushNotification({
                        type: 'experience_cancelled',
                        targetUserId,
                        activityId: experienceId,
                      }).catch((error) => {
                        console.log('Errore notifica esperienza annullata.');
                      })
                    )
                  );

                  Alert.alert(
                    'Esperienza annullata',
                    'L’esperienza è stata rimossa.'
                  );
                  router.replace('/experiences');
                  return;
                }
              }

              Alert.alert(
                'Errore annullamento',
                'Non sono riuscito ad annullare questa esperienza. Probabile policy Supabase o colonna mancante.'
              );
            } catch (error: any) {
              console.log('Errore generale annullamento esperienza.');

              Alert.alert(
                'Errore annullamento',
                error?.message ||
                  'Non sono riuscito ad annullare questa esperienza. Riprova tra poco.'
              );
            }
          },
        },
      ]
    );
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

      if (Platform.OS !== 'web') {
        void supabase.functions
          .invoke('send-bajuju-chat-push', {
            body: {
              activityId: experienceId,
              message: cleanMessage,
            },
          })
          .then(({ error }) => {
            if (error) {
              console.log('Push chat non inviata.');
            }
          })
          .catch(() => {
            console.log('Push chat non disponibile.');
          });
      }
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

  async function reportMessage(item: MessageRow) {
    if (!experienceId || !currentUserId) {
      if (typeof window !== 'undefined') {
        window.alert('Devi essere collegato per segnalare un messaggio.');
      }
      return;
    }

    const messageId = item.id;
    const reportedUserId = String(item.user_id || item.sender_id || '').trim();

    if (!messageId || !reportedUserId) {
      if (typeof window !== 'undefined') {
        window.alert('Non riesco a identificare questo messaggio.');
      }
      return;
    }

    if (reportedUserId === currentUserId) {
      return;
    }

    try {
      const result = await supabase.from('message_reports').insert({
        message_id: messageId,
        activity_id: experienceId,
        event_id: experienceId,
        experience_id: experienceId,
        reporter_id: currentUserId,
        reported_by: currentUserId,
        user_id: reportedUserId,
        sender_id: reportedUserId,
        reported_user_id: reportedUserId,
        reason: 'Messaggio chat segnalato dall’utente',
        message: messageText(item),
        content: messageText(item),
        body: messageText(item),
        text: messageText(item),
        status: 'open',
        report_status: 'open',
        reported_at: new Date().toISOString(),
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore segnalazione: ${result.error.message}`);
        }
        return;
      }

      if (typeof window !== 'undefined') {
        window.alert('Messaggio segnalato. Grazie, lo controlleremo.');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore imprevisto durante la segnalazione del messaggio.';

      Alert.alert('Errore segnalazione', message);
    }
  }

  function confirmDeleteMessage(item: MessageRow) {
    const messageId = String(item.id || '').trim();
    const authorId = String(item.user_id || item.sender_id || '').trim();
    if (!experienceId || !messageId || item.deleted_at || !currentUserId || authorId !== currentUserId) return;

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
            await loadMessages(experienceId);
          })();
        },
      },
    ]);
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

  useFocusEffect(
    useCallback(() => {
      void loadAlbumPhotos();
    }, [loadAlbumPhotos])
  );

  const uploadAlbumPhoto = useCallback(async () => {
    if (!experienceId || !currentUserId || uploadingAlbumPhoto || albumUploadLockRef.current) return;

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

    albumUploadLockRef.current = true;
    setUploadingAlbumPhoto(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        window.alert('Autorizza l’accesso alle immagini per caricare una foto.');
        return;
      }

      const picked = await pickPhoto({ quality: 0.78 });
      if (!picked) return;

      const asset = picked;
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
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a caricare la foto. Controlla che esistano tabella event_album_photos e bucket event-photos.';

      window.alert(message);
    } finally {
      albumUploadLockRef.current = false;
      setUploadingAlbumPhoto(false);
    }
  }, [
    albumIsFull,
    canUseAlbum,
    currentUserId,
    experienceId,
    loadAlbumPhotos,
    pickPhoto,
    uploadingAlbumPhoto,
    userAlbumLimitReached,
  ]);

  const updateCoverPhoto = useCallback(async () => {
    if (!experienceId || !currentUserId || !isOrganizer || updatingCoverPhoto) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permesso richiesto", "Autorizza l’accesso alle immagini per scegliere la foto copertina.");
        return;
      }

      const picked = await pickPhoto({ aspect: [16, 9], quality: 0.8 });
      if (!picked) return;

      setUpdatingCoverPhoto(true);

      const asset = picked;
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const filePath = `${experienceId}/${currentUserId}-cover-${Date.now()}.jpg`;

      const uploadResult = await supabase.storage
        .from("event-photos")
        .upload(filePath, arrayBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadResult.error) throw uploadResult.error;

      const publicUrlResult = supabase.storage
        .from("event-photos")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlResult.data.publicUrl;

      if (!publicUrl) throw new Error("URL pubblico della foto non disponibile.");

      const updateResult = await supabase
        .from("activities")
        .update({ photo_url: publicUrl })
        .eq("id", experienceId)
        .eq("creator_id", currentUserId);

      if (updateResult.error) throw updateResult.error;

      setExperience((current) =>
        current ? { ...current, photo_url: publicUrl } : current
      );

      Alert.alert("Foto aggiornata", "La foto copertina dell’evento è stata aggiornata.");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Non sono riuscito ad aggiornare la foto copertina.";

      Alert.alert("Errore foto", message);
    } finally {
      setUpdatingCoverPhoto(false);
    }
  }, [currentUserId, experienceId, isOrganizer, pickPhoto, updatingCoverPhoto]);

  const shareExperience = () => {
    if (!experience) return;
    shareBajujuExperience({
      id: experienceId,
      title: experience.title,
      category: experience.category,
      city: experience.city,
      province: experience.province,
      date: experience.activity_date,
      time: experience.activity_time,
    });
  };

  const openEditExperience = () => {
    setMenuOpen(false);
    router.push({
      pathname: '/edit-experience' as any,
      params: { id: experienceId || '' },
    });
  };

  const openParticipantProfile = (userId: string) => {
    setParticipantsOpen(false);
    router.push({
      pathname: '/user-profile' as any,
      params: {
        userId,
        activityId: experienceId || '',
        postEvent: canShowInviteOut ? '1' : '0',
      },
    });
  };

  const creatorId = getExperienceCreatorId(experience);
  const creatorIndex = displayedParticipants.findIndex(
    (participant) => String(participant.user_id || '') === creatorId
  );
  const organizerName = creatorIndex >= 0 ? profileName(profiles[creatorId], creatorIndex) : '';
  const freeSpots = maxParticipants > 0 ? Math.max(maxParticipants - participantCount, 0) : null;
  const description = experience?.description || 'Descrizione non ancora disponibile.';
  const showBottomBar = !!experience && !loading && !errorMessage && !chatFocused;

  const isOfficialLocationEvent = Boolean(
    eventLocation && experience?.creator_id && experience.creator_id === eventLocation.ownerId
  );

  const infoTiles = experience
    ? [
        {
          label: 'Quando',
          value: formatDateItalian(experience.activity_date),
          detail: experience.activity_time ? String(experience.activity_time).slice(0, 5) : 'Ora da definire',
        },
        {
          label: eventLocation ? 'Dove' : 'Ritrovo',
          value: eventLocation?.name || experience.meeting_place || experience.city || 'Non indicato',
          detail: `${experience.city || 'Comune'} · ${experience.province || 'Provincia'}`,
        },
        {
          label: 'Ingresso',
          value: approvalRequired ? 'Su richiesta' : 'Libero',
          valueStyle: approvalRequired ? styles.infoValueRequest : styles.infoValueFree,
          detail:
            experience.min_age !== null && experience.min_age !== undefined &&
            experience.max_age !== null && experience.max_age !== undefined
              ? `${experience.min_age}–${experience.max_age} anni`
              : 'Aperto a tutti',
        },
        {
          label: 'Budget',
          value:
            experience.budget_amount !== null && experience.budget_amount !== undefined
              ? `Max ${experience.budget_amount} €`
              : 'Non indicato',
          detail: 'indicativo',
        },
      ]
    : [];

  const renderParticipantRow = (participant: ParticipantRow, index: number) => {
    const userId = String(participant.user_id || '');
    const isCreator = userId === creatorId;
    const profile = profiles[userId];
    const name = profileName(profile, index);
    const photo = profilePhotoUrl(profile);

    return (
      <Pressable
        key={`${userId}-${index}`}
        style={styles.participantRow}
        onPress={() => openParticipantProfile(userId)}
      >
        <Image
          source={photo ? { uri: photo } : bajujuLogo}
          style={[styles.participantPhoto, isCreator && styles.participantPhotoOrganizer]}
          resizeMode="cover"
        />

        <View style={styles.participantInfo}>
          <Text style={styles.participantName} numberOfLines={1}>{name}</Text>
          <Text
            style={[
              styles.participantRoleBadge,
              isCreator ? styles.organizerRoleBadge : styles.normalRoleBadge,
            ]}
          >
            {isCreator ? 'Organizzatore' : 'Partecipante'}
          </Text>
        </View>

        {canShowInviteOut && userId !== String(currentUserId || '') ? (
          <Pressable
            style={styles.inviteOutButton}
            onPress={(event) => {
              event.stopPropagation();
              setParticipantsOpen(false);
              router.push({
                pathname: '/user-profile' as any,
                params: {
                  userId,
                  activityId: experienceId || '',
                  postEvent: '1',
                },
              });
            }}
          >
            <Text style={styles.inviteOutButtonText}>Interagisci</Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {photoPickerModal}
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          ref={pageScrollRef}
          contentContainerStyle={[
            styles.container,
            showBottomBar && { paddingBottom: 110 + androidBottomInset },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {loading || errorMessage || !experience ? (
            <View style={styles.stateBox}>
              <Pressable style={styles.stateBackButton} onPress={() => router.replace('/experiences')}>
                <Text style={styles.stateBackText}>← Trova esperienza</Text>
              </Pressable>
              <Text style={styles.messageText}>
                {loading ? 'Caricamento esperienza...' : errorMessage || 'Esperienza non trovata.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.hero}>
                <Image
                  source={experiencePhotoUrl(experience) ? { uri: experiencePhotoUrl(experience) } : bajujuLogo}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['rgba(75,12,45,0)', 'rgba(75,12,45,0.78)']}
                  locations={[0.35, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                <View style={styles.heroTopBar}>
                  <Pressable
                    style={styles.heroIconButton}
                    onPress={() => router.replace('/experiences')}
                    accessibilityLabel="Torna a Trova esperienza"
                  >
                    <Ionicons name="chevron-back" size={20} color={BAJUJU_COLORS.plum} />
                  </Pressable>

                  <View style={styles.heroTopActions}>
                    <Pressable
                      style={styles.heroIconButton}
                      onPress={shareExperience}
                      accessibilityLabel="Condividi esperienza"
                    >
                      <Ionicons name="share-outline" size={19} color={BAJUJU_COLORS.plum} />
                    </Pressable>

                    {canEditExperience ? (
                      <Pressable
                        style={styles.heroIconButton}
                        onPress={() => setMenuOpen(true)}
                        accessibilityLabel="Gestisci esperienza"
                      >
                        <Ionicons name="ellipsis-horizontal" size={19} color={BAJUJU_COLORS.plum} />
                      </Pressable>
                    ) : null}

                    <BajujuProfileButton size={38} />
                  </View>
                </View>

                <View style={styles.heroText}>
                  {isOfficialLocationEvent && eventLocation ? (
                    <View style={styles.officialBadge}>
                      <Ionicons name="home" size={13} color={C.white} />
                      <Text style={styles.officialBadgeText} numberOfLines={1}>
                        Evento ufficiale · {eventLocation.name}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.category}>
                    {getExperienceCategoryIcon(experience.category)} {normalizeExperienceCategory(experience.category)}
                  </Text>
                  <Text style={styles.title} numberOfLines={3}>
                    {experience.title || 'Esperienza senza titolo'}
                  </Text>
                </View>
              </View>

              <View style={styles.content}>
                <View style={styles.infoGrid}>
                  {infoTiles.map((tile) => (
                    <View key={tile.label} style={styles.infoTile}>
                      <Text style={styles.infoLabel}>{tile.label}</Text>
                      <Text style={[styles.infoValue, tile.valueStyle]} numberOfLines={1}>{tile.value}</Text>
                      <Text style={styles.infoDetail} numberOfLines={1}>{tile.detail}</Text>
                    </View>
                  ))}
                </View>

                {eventLocation ? (
                  <Pressable
                    style={[styles.locationCard, isOfficialLocationEvent && styles.locationCardOfficial]}
                    onPress={() => router.push({ pathname: '/user-profile' as any, params: { userId: eventLocation.ownerId } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Apri la pagina di ${eventLocation.name}`}
                  >
                    {eventLocation.photos[0] ? (
                      <Image
                        source={{ uri: eventLocation.photos[0] }}
                        style={[styles.locationCardPhoto, isOfficialLocationEvent && styles.locationCardPhotoOfficial]}
                        resizeMode="cover"
                      />
                    ) : null}
                    <View style={styles.locationCardCopy}>
                      <Text style={[styles.locationCardKicker, isOfficialLocationEvent && styles.locationCardTextOfficial]}>
                        {isOfficialLocationEvent ? 'Organizzato da' : 'Si svolge da'}
                      </Text>
                      <Text style={[styles.locationCardName, isOfficialLocationEvent && styles.locationCardTextOfficial]} numberOfLines={1}>
                        {eventLocation.name}
                      </Text>
                      <Text style={[styles.locationCardMeta, isOfficialLocationEvent && styles.locationCardMetaOfficial]} numberOfLines={1}>
                        {eventLocation.category} · {locationAddressLine(eventLocation)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={isOfficialLocationEvent ? C.white : LOCATION_COLOR} />
                  </Pressable>
                ) : null}

                <Pressable onPress={() => setDescriptionExpanded((current) => !current)}>
                  <Text style={styles.description} numberOfLines={descriptionExpanded ? undefined : 3}>
                    {description}
                  </Text>
                  {description.length > 140 ? (
                    <Text style={styles.readMore}>{descriptionExpanded ? 'Mostra meno' : 'Leggi tutto'}</Text>
                  ) : null}
                </Pressable>

                <Pressable style={styles.peopleRow} onPress={() => setParticipantsOpen(true)}>
                  {displayedParticipants.length > 0 ? (
                    <View style={styles.avatarStack}>
                      {displayedParticipants.slice(0, 5).map((participant, index) => {
                        const userId = String(participant.user_id || '');
                        const photo = profilePhotoUrl(profiles[userId]);
                        return (
                          <Image
                            key={`${userId}-${index}`}
                            source={photo ? { uri: photo } : bajujuLogo}
                            style={[
                              styles.stackAvatar,
                              index > 0 && styles.stackAvatarOverlap,
                              userId === creatorId && styles.stackAvatarOrganizer,
                            ]}
                            resizeMode="cover"
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  <View style={styles.peopleCopy}>
                    <Text style={styles.peopleCount}>
                      {participantCount}{maxParticipants > 0 ? ` / ${maxParticipants}` : ''} partecipanti
                    </Text>
                    <Text style={styles.peopleMeta} numberOfLines={1}>
                      {displayedParticipants.length === 0
                        ? isOrganizer
                          ? 'Ancora nessuno, li vedrai qui'
                          : 'Puoi essere tu il primo'
                        : organizerName
                          ? `Organizza ${organizerName}`
                          : 'Guarda chi partecipa'}
                    </Text>
                  </View>

                  {displayedParticipants.length > 0 ? (
                    <Text style={styles.peopleLink}>Vedi tutti ›</Text>
                  ) : null}
                </Pressable>

                {isOrganizer && joinRequests.length > 0 ? (
                  <View style={styles.requestsCard}>
                    <Pressable
                      style={styles.requestsHeader}
                      onPress={() => setRequestsOpen((current) => !current)}
                    >
                      <Text style={styles.requestsTitle}>
                        {joinRequests.length === 1 ? '1 richiesta in attesa' : `${joinRequests.length} richieste in attesa`}
                      </Text>
                      <Ionicons
                        name={requestsOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={BAJUJU_COLORS.plum}
                      />
                    </Pressable>

                    {requestsOpen ? (
                      <View style={styles.requestsList}>
                        {joinRequests.map((request, index) => {
                          const requestUserId = String(request.user_id || '').trim();
                          const avatarUrl = String(request.avatar_url || '').trim();
                          const requestBusy = reviewBusyUserId === requestUserId;
                          return (
                            <View
                              key={requestUserId || String(index)}
                              style={[styles.requestRow, index > 0 && styles.requestBorder]}
                            >
                              <Pressable
                                onPress={() => {
                                  if (!requestUserId) return;
                                  router.push({ pathname: '/user-profile' as any, params: { userId: requestUserId } });
                                }}
                              >
                                <Image
                                  source={avatarUrl ? { uri: avatarUrl } : bajujuLogo}
                                  style={styles.requestAvatar}
                                  resizeMode="cover"
                                />
                              </Pressable>

                              <View style={styles.requestMain}>
                                <Pressable
                                  disabled={!requestUserId}
                                  onPress={() => {
                                    if (!requestUserId) return;
                                    router.push({ pathname: '/user-profile' as any, params: { userId: requestUserId } });
                                  }}
                                >
                                  <Text style={styles.requestName}>{request.nickname || 'Utente Bajuju'}</Text>
                                  <Text style={styles.requestMeta}>
                                    {[
                                      request.gender || '',
                                      request.age_range ? `${request.age_range} anni` : '',
                                      request.origin || '',
                                    ].filter(Boolean).join(' · ') || 'Apri il profilo per vedere i dettagli'}
                                  </Text>
                                </Pressable>

                                <View style={styles.requestActions}>
                                  <Pressable
                                    style={[styles.rejectRequestButton, requestBusy && styles.buttonDisabled]}
                                    disabled={requestBusy}
                                    onPress={() => { void reviewJoinRequest(requestUserId, false); }}
                                  >
                                    <Text style={styles.rejectRequestText}>Rifiuta</Text>
                                  </Pressable>
                                  <Pressable
                                    style={[styles.acceptRequestButton, requestBusy && styles.buttonDisabled]}
                                    disabled={requestBusy}
                                    onPress={() => { void reviewJoinRequest(requestUserId, true); }}
                                  >
                                    <Text style={styles.acceptRequestText}>{requestBusy ? '...' : 'Accetta'}</Text>
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.tabs}>
                  <Pressable
                    style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
                    onPress={() => setActiveTab('chat')}
                  >
                    <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
                      Chat{canUseChat && messages.length > 0 ? ` · ${messages.length}` : ''}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tab, activeTab === 'gallery' && styles.tabActive]}
                    onPress={() => setActiveTab('gallery')}
                  >
                    <Text style={[styles.tabText, activeTab === 'gallery' && styles.tabTextActive]}>
                      Galleria{albumPhotos.length > 0 ? ` · ${albumPhotos.length}` : ''}
                    </Text>
                  </Pressable>
                </View>

                {activeTab === 'chat' ? (
                  !canUseChat ? (
                    <Text style={styles.emptySmallText}>
                      La chat si sblocca quando partecipi all’esperienza. L’organizzatore può sempre scrivere.
                    </Text>
                  ) : (
                    <View>
                      {messages.length === 0 ? (
                        <Text style={styles.emptySmallText}>Ancora nessun messaggio.</Text>
                      ) : (
                        <View style={styles.messagesList}>
                          {messages.map((item, index) => {
                            const userId = String(item.user_id || item.sender_id || '');
                            const isMine = currentUserId && userId === currentUserId;
                            const name = isMine
                              ? 'Tu'
                              : profileName(profiles[userId], index);
                            const deleted = Boolean(item.deleted_at);

                            return (
                              <View
                                key={item.id || `${userId}-${index}`}
                                style={[
                                  styles.messageBubble,
                                  isMine && styles.messageBubbleMine,
                                ]}
                              >
                                <Text style={[styles.messageAuthor, isMine && styles.messageAuthorMine]}>{name}</Text>
                                <Text style={[styles.messageBody, isMine && styles.messageBodyMine, deleted && styles.messageBodyDeleted]}>
                                  {deleted ? 'Messaggio eliminato' : messageText(item)}
                                </Text>
                                <View style={styles.messageFooter}>
                                  <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                                    {formatMessageTime(item.created_at)}
                                  </Text>
                                  {!isMine && !deleted ? (
                                    <Pressable onPress={() => reportMessage(item)} hitSlop={8}>
                                      <Text style={styles.reportMessageText}>Segnala</Text>
                                    </Pressable>
                                  ) : null}
                                  {isMine && !deleted ? (
                                    <Pressable onPress={() => confirmDeleteMessage(item)} hitSlop={8} accessibilityLabel="Elimina messaggio">
                                      <Text style={[styles.reportMessageText, styles.deleteMessageTextMine]}>Elimina</Text>
                                    </Pressable>
                                  ) : null}
                                </View>
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
                          placeholderTextColor={BAJUJU_COLORS.muted}
                          style={styles.chatInput}
                          multiline
                          onFocus={() => {
                            setChatFocused(true);
                            setTimeout(() => {
                              pageScrollRef.current?.scrollToEnd({ animated: true });
                            }, 250);
                          }}
                          onBlur={() => setChatFocused(false)}
                        />

                        <Pressable
                          style={[
                            styles.sendButton,
                            (!newMessage.trim() || sendingMessage) && styles.buttonDisabled,
                          ]}
                          onPress={sendChatMessage}
                          disabled={!newMessage.trim() || sendingMessage}
                          accessibilityLabel="Invia messaggio"
                        >
                          {sendingMessage ? (
                            <Text style={styles.sendButtonText}>...</Text>
                          ) : (
                            <Ionicons name="send" size={17} color={BAJUJU_COLORS.white} />
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )
                ) : (
                  <View>
                    <View style={styles.albumHeaderRow}>
                      <Text style={styles.albumSubtitle}>
                        {albumPhotos.length}/15 foto · massimo 3 a testa
                      </Text>

                      {canUseAlbum ? (
                        <Pressable
                          style={[
                            styles.albumUploadButton,
                            (uploadingAlbumPhoto || albumIsFull || userAlbumLimitReached) && styles.buttonDisabled,
                          ]}
                          onPress={uploadAlbumPhoto}
                          disabled={uploadingAlbumPhoto || albumIsFull || userAlbumLimitReached}
                        >
                          <Text style={styles.albumUploadButtonText}>
                            {uploadingAlbumPhoto ? 'Carico...' : '+ Aggiungi foto'}
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
                      <Text style={styles.emptySmallText}>
                        Nessuna foto ancora. Le foto dei partecipanti appariranno qui.
                      </Text>
                    ) : (
                      <View style={styles.albumGrid}>
                        {visibleAlbumPhotos.map((photo, index) => {
                          const url = albumPhotoUrl(photo);

                          return (
                            <Pressable
                              key={String(photo.id || `${url}-${index}`)}
                              style={styles.albumPhotoCard}
                              onPress={() => openAlbumPhoto(index)}
                            >
                              <Image source={{ uri: url }} style={styles.albumPhoto} resizeMode="cover" />
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            </>
          )}
        </KeyboardAwareScrollView>

        {showBottomBar ? (
          <View style={[styles.bottomBar, androidBottomInset > 0 && { paddingBottom: 14 + androidBottomInset }]}>
            {isOrganizer ? (
              <>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>Organizzi tu</Text>
                </View>
                <Pressable style={styles.primaryButton} onPress={openEditExperience}>
                  <Text style={styles.primaryButtonText}>Modifica evento</Text>
                </Pressable>
              </>
            ) : isParticipant ? (
              <>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>Ci sei anche tu</Text>
                </View>
                <Pressable
                  style={[styles.secondaryButton, leaving && styles.buttonDisabled]}
                  onPress={leaveExperience}
                  disabled={leaving}
                >
                  <Text style={styles.secondaryButtonText}>
                    {leaving ? 'Abbandono...' : 'Non partecipo più'}
                  </Text>
                </Pressable>
              </>
            ) : joinState === 'pending' ? (
              <>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>Richiesta inviata</Text>
                </View>
                <Pressable
                  style={[styles.secondaryButton, joining && styles.buttonDisabled]}
                  onPress={cancelJoinRequest}
                  disabled={joining}
                >
                  <Text style={styles.secondaryButtonText}>
                    {joining ? 'Annullamento...' : 'Annulla richiesta'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.spotsBox}>
                  <Text style={styles.spotsValue}>
                    {freeSpots === null ? participantCount : freeSpots}
                  </Text>
                  <Text style={styles.spotsLabel}>
                    {freeSpots === null ? 'iscritti' : freeSpots === 1 ? 'posto libero' : 'posti liberi'}
                  </Text>
                </View>

                {isFull && !approvalRequired ? (
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() =>
                      router.push({
                        pathname: '/experience-waitlist' as any,
                        params: { id: experienceId || '' },
                      })
                    }
                  >
                    <Text style={styles.primaryButtonText}>Lista d’attesa</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.primaryButton, joining && styles.buttonDisabled]}
                    onPress={joinExperience}
                    disabled={joining}
                  >
                    <Text style={styles.primaryButtonText}>
                      {joining
                        ? approvalRequired ? 'Invio richiesta...' : 'Registrazione...'
                        : approvalRequired ? (joinState === 'rejected' ? 'Richiedi di nuovo' : 'Richiedi di partecipare') : 'Partecipa ora'}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        ) : null}
      </View>

      <Modal visible={participantsOpen} transparent animationType="slide" onRequestClose={() => setParticipantsOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setParticipantsOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Persone nell’esperienza</Text>
          <Text style={styles.sheetSubtitle}>
            {participantCount}{maxParticipants > 0 ? ` / ${maxParticipants}` : ''} partecipanti
          </Text>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.participantsList}>
            {displayedParticipants.map(renderParticipantRow)}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Gestisci esperienza</Text>

          <Pressable style={styles.menuItem} onPress={openEditExperience}>
            <Ionicons name="create-outline" size={20} color={BAJUJU_COLORS.pink} />
            <Text style={styles.menuItemText}>
              {isOrganizer ? 'Modifica evento' : 'Modifica evento · Admin'}
            </Text>
          </Pressable>

          {isOrganizer ? (
            <Pressable
              style={[styles.menuItem, updatingCoverPhoto && styles.buttonDisabled]}
              disabled={updatingCoverPhoto}
              onPress={() => {
                setMenuOpen(false);
                void updateCoverPhoto();
              }}
            >
              <Ionicons name="image-outline" size={20} color={BAJUJU_COLORS.pink} />
              <Text style={styles.menuItemText}>
                {updatingCoverPhoto ? 'Caricamento...' : 'Cambia foto copertina'}
              </Text>
            </Pressable>
          ) : null}

          {isOrganizer ? (
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                cancelExperience();
              }}
            >
              <Ionicons name="close-circle-outline" size={20} color={BAJUJU_COLORS.plum} />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Annulla esperienza</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>

      <Modal visible={!!selectedAlbumPhotoUrl} transparent animationType="fade" onRequestClose={closeAlbumPhoto}>
        <View style={styles.photoModalBackdrop}>
          <Pressable style={styles.photoModalClose} onPress={closeAlbumPhoto}>
            <Text style={styles.photoModalCloseText}>Chiudi</Text>
          </Pressable>

          {selectedAlbumPhotoUrl ? (
            <Image source={{ uri: selectedAlbumPhotoUrl }} style={styles.photoModalImage} resizeMode="contain" />
          ) : null}

          {visibleAlbumPhotos.length > 1 ? (
            <View style={styles.photoModalControls}>
              <Pressable style={styles.photoModalArrow} onPress={showPreviousAlbumPhoto}>
                <Ionicons name="chevron-back" size={28} color={BAJUJU_COLORS.plum} />
              </Pressable>

              <Text style={styles.photoModalCounter}>
                {(selectedAlbumPhotoIndex ?? 0) + 1}/{visibleAlbumPhotos.length}
              </Text>

              <Pressable style={styles.photoModalArrow} onPress={showNextAlbumPhoto}>
                <Ionicons name="chevron-forward" size={28} color={BAJUJU_COLORS.plum} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const C = BAJUJU_COLORS;
const F = BAJUJU_FONTS;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  container: {
    paddingBottom: 24,
    backgroundColor: C.background,
  },
  stateBox: {
    padding: 18,
    gap: 18,
  },
  stateBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  stateBackText: {
    fontFamily: F.semiBold,
    fontSize: 14,
    color: C.plum,
  },
  messageText: {
    fontFamily: F.medium,
    color: C.muted,
    fontSize: 15,
    textAlign: 'center',
  },

  hero: {
    height: 270,
    backgroundColor: C.softPink,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroTopBar: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    gap: 8,
  },
  category: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    backgroundColor: C.white,
    borderRadius: 999,
    color: C.pink,
    fontFamily: F.semiBold,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  title: {
    fontFamily: F.bold,
    fontSize: 26,
    lineHeight: 30,
    color: C.white,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    backgroundColor: LOCATION_COLOR_SOFT,
    borderWidth: 1,
    borderColor: '#E4D2F5',
  },
  locationCardOfficial: { backgroundColor: LOCATION_COLOR, borderColor: LOCATION_COLOR },
  locationCardPhoto: { width: 54, height: 54, borderRadius: 14 },
  locationCardPhotoOfficial: { borderWidth: 2, borderColor: C.white },
  locationCardTextOfficial: { color: C.white },
  locationCardMetaOfficial: { color: 'rgba(255,255,255,0.85)' },
  officialBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LOCATION_COLOR,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  officialBadgeText: { flexShrink: 1, fontFamily: F.semiBold, fontSize: 13, color: C.white },
  locationCardCopy: { flex: 1, minWidth: 0 },
  locationCardKicker: {
    fontFamily: F.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: LOCATION_COLOR,
  },
  locationCardName: { marginTop: 1, fontFamily: F.bold, fontSize: 16, color: C.plum },
  locationCardMeta: { marginTop: 1, fontFamily: F.medium, fontSize: 12, color: C.muted },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoTile: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoLabel: {
    fontFamily: F.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.pink,
  },
  infoValue: {
    marginTop: 2,
    fontFamily: F.semiBold,
    fontSize: 15,
    color: C.plum,
  },
  infoValueFree: {
    color: '#1F7A52',
  },
  infoValueRequest: {
    color: '#8A5B00',
  },
  infoDetail: {
    fontFamily: F.regular,
    fontSize: 12,
    color: C.muted,
  },
  description: {
    fontFamily: F.regular,
    fontSize: 15,
    lineHeight: 22,
    color: C.plum,
  },
  readMore: {
    marginTop: 4,
    fontFamily: F.semiBold,
    fontSize: 14,
    color: C.pink,
  },

  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatarStack: {
    flexDirection: 'row',
  },
  stackAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: C.white,
    backgroundColor: C.softPink,
  },
  stackAvatarOverlap: {
    marginLeft: -10,
  },
  stackAvatarOrganizer: {
    borderColor: C.pink,
  },
  peopleCopy: {
    flex: 1,
    minWidth: 0,
  },
  peopleCount: {
    fontFamily: F.semiBold,
    fontSize: 15,
    color: C.plum,
  },
  peopleMeta: {
    fontFamily: F.regular,
    fontSize: 12,
    color: C.muted,
  },
  peopleLink: {
    fontFamily: F.semiBold,
    fontSize: 13,
    color: C.pink,
  },

  requestsCard: {
    backgroundColor: C.softPink,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  requestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestsTitle: {
    fontFamily: F.semiBold,
    fontSize: 14,
    color: C.plum,
  },
  requestsList: { marginTop: 8 },
  requestRow: {
    flexDirection: 'row',
    gap: 11,
    paddingVertical: 10,
  },
  requestBorder: {
    borderTopWidth: 1,
    borderTopColor: C.palePink,
  },
  requestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: C.brightPink,
    backgroundColor: C.white,
  },
  requestMain: { flex: 1, minWidth: 0 },
  requestName: {
    fontFamily: F.semiBold,
    color: C.plum,
    fontSize: 15,
  },
  requestMeta: {
    marginTop: 2,
    fontFamily: F.regular,
    color: C.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  rejectRequestButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.pink,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectRequestText: {
    fontFamily: F.semiBold,
    color: C.pink,
    fontSize: 13,
  },
  acceptRequestButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptRequestText: {
    fontFamily: F.semiBold,
    color: C.white,
    fontSize: 13,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: C.softPink,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: C.white,
    ...BAJUJU_SHADOW,
  },
  tabText: {
    fontFamily: F.semiBold,
    fontSize: 14,
    color: C.muted,
  },
  tabTextActive: {
    color: C.pink,
  },

  emptySmallText: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.palePink,
    color: C.muted,
    fontFamily: F.regular,
    fontSize: 14,
    lineHeight: 20,
    padding: 14,
    textAlign: 'center',
  },
  messagesList: {
    gap: 8,
  },
  messageBubble: {
    alignSelf: 'flex-start',
    backgroundColor: C.white,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: C.palePink,
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: C.pink,
    borderColor: C.pink,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  messageAuthor: {
    fontFamily: F.semiBold,
    color: C.pink,
    fontSize: 12,
    marginBottom: 2,
  },
  messageAuthorMine: {
    color: C.palePink,
  },
  messageBody: {
    fontFamily: F.regular,
    color: C.plum,
    fontSize: 15,
    lineHeight: 20,
  },
  messageBodyMine: {
    color: C.white,
  },
  messageBodyDeleted: {
    fontStyle: 'italic',
    opacity: 0.75,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  messageTime: {
    fontFamily: F.regular,
    color: C.muted,
    fontSize: 11,
  },
  messageTimeMine: {
    color: C.white,
    opacity: 0.85,
  },
  reportMessageText: {
    fontFamily: F.medium,
    color: C.muted,
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  deleteMessageTextMine: {
    color: C.white,
    opacity: 0.85,
  },
  chatInputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chatInput: {
    backgroundColor: C.white,
    borderColor: C.line,
    borderRadius: 22,
    borderWidth: 1,
    color: C.plum,
    flex: 1,
    fontFamily: F.regular,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 130,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontFamily: F.bold,
    color: C.white,
    fontSize: 14,
  },

  albumHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  albumSubtitle: {
    flex: 1,
    fontFamily: F.medium,
    color: C.muted,
    fontSize: 13,
  },
  albumUploadButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.pink,
  },
  albumUploadButtonText: {
    fontFamily: F.semiBold,
    color: C.white,
    fontSize: 13,
  },
  albumHint: {
    fontFamily: F.regular,
    color: C.muted,
    fontSize: 13,
    marginBottom: 10,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  albumPhotoCard: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: C.softPink,
  },
  albumPhoto: {
    width: '100%',
    height: '100%',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 14,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  spotsBox: {
    minWidth: 64,
  },
  spotsValue: {
    fontFamily: F.bold,
    fontSize: 20,
    lineHeight: 22,
    color: C.plum,
  },
  spotsLabel: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.muted,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.success,
  },
  statusPillText: {
    fontFamily: F.semiBold,
    fontSize: 13,
    color: C.plum,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
    ...BAJUJU_SHADOW,
  },
  primaryButtonText: {
    fontFamily: F.bold,
    fontSize: 16,
    color: C.white,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.pink,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: F.semiBold,
    fontSize: 15,
    color: C.pink,
  },
  buttonDisabled: {
    opacity: 0.55,
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(75,12,45,0.35)',
  },
  sheet: {
    maxHeight: '75%',
    backgroundColor: C.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 34,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.line,
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: F.bold,
    fontSize: 20,
    color: C.plum,
  },
  sheetSubtitle: {
    marginTop: 2,
    marginBottom: 12,
    fontFamily: F.regular,
    fontSize: 13,
    color: C.muted,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  participantsList: {
    gap: 8,
    paddingBottom: 6,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.palePink,
    padding: 10,
  },
  participantPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.softPink,
    borderWidth: 2,
    borderColor: C.palePink,
  },
  participantPhotoOrganizer: {
    borderColor: C.pink,
  },
  participantInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  participantName: {
    fontFamily: F.semiBold,
    fontSize: 15,
    color: C.plum,
  },
  participantRoleBadge: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    fontFamily: F.medium,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  organizerRoleBadge: {
    backgroundColor: C.pink,
    color: C.white,
  },
  normalRoleBadge: {
    backgroundColor: C.softPink,
    color: C.muted,
  },
  inviteOutButton: {
    borderRadius: 999,
    backgroundColor: C.pink,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inviteOutButtonText: {
    fontFamily: F.semiBold,
    color: C.white,
    fontSize: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.palePink,
  },
  menuItemText: {
    fontFamily: F.semiBold,
    fontSize: 16,
    color: C.plum,
  },
  menuItemDanger: {
    color: C.hotPink,
  },

  photoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 10, 28, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  photoModalClose: {
    position: 'absolute',
    top: 48,
    right: 18,
    zIndex: 2,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: C.white,
  },
  photoModalCloseText: {
    fontFamily: F.semiBold,
    color: C.plum,
    fontSize: 14,
  },
  photoModalImage: {
    width: '100%',
    height: '72%',
    borderRadius: 22,
  },
  photoModalControls: {
    position: 'absolute',
    bottom: 42,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoModalArrow: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoModalCounter: {
    fontFamily: F.semiBold,
    color: C.white,
    fontSize: 15,
  },
});
