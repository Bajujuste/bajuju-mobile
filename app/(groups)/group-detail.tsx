import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useBajujuPhotoPicker } from '../../src/components/useBajujuPhotoPicker';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BajujuGroupChat } from '../../src/components/groups/BajujuGroupChat';
import { BajujuGroupPolls } from '../../src/components/groups/BajujuGroupPolls';
import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { BajujuAdminRing } from '../../src/components/profile/BajujuAdminRing';
import { useBajujuAdminIds } from '../../src/hooks/useBajujuAdminIds';
import {
  cancelBajujuGroupJoinRequest,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GroupJoinRequest,
  GroupJoinState,
  joinBajujuGroup,
  leaveBajujuGroup,
  loadBajujuGroupJoinRequests,
  loadBajujuGroupJoinState,
  reviewBajujuGroupJoinRequest,
  uploadBajujuGroupCover,
} from '../../src/lib/bajujuGroups';
import { supabase } from '../../src/lib/supabase';
import { withLocationIdentity } from '../../src/lib/bajujuLocations';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../src/theme/bajujuTheme';
import { shareBajujuGroup } from '../../src/utils/shareBajuju';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';

type MemberRow = {
  user_id?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  age_range?: string | null;
  origin?: string | null;
};

type ExperienceRow = {
  id?: string | null;
  title?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
};

const DESCRIPTION_PREVIEW_LINES = 6;

export default function GroupDetailScreen() {
  const { pickPhoto, photoPickerModal } = useBajujuPhotoPicker();
  const params = useLocalSearchParams<{ id?: string; section?: string }>();
  const groupScrollRef = useRef<ScrollView>(null);
  const groupId = String(params.id || '').trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const adminIds = useBajujuAdminIds();
  const [group, setGroup] = useState<any>(null);
  const [ownerName, setOwnerName] = useState('Bajuju');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selectedMemberPhotoUrl, setSelectedMemberPhotoUrl] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [joined, setJoined] = useState(false);
  const [joinState, setJoinState] = useState<GroupJoinState>('none');
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(params.section === 'requests');
  const [reviewBusyUserId, setReviewBusyUserId] = useState('');
  const [approvalModeBusy, setApprovalModeBusy] = useState(false);
  const [ageModeBusy, setAgeModeBusy] = useState(false);
  const [ageRestrictedDraft, setAgeRestrictedDraft] = useState(false);
  const [minAgeDraft, setMinAgeDraft] = useState('18');
  const [maxAgeDraft, setMaxAgeDraft] = useState('80');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionLong, setDescriptionLong] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const managementY = useRef<number | null>(null);
  const scrollToManagementOnLayout = useRef(false);
  // Le sezioni stanno dentro il blocco sotto la copertina: per scorrere serve sommare la sua posizione.
  const contentY = useRef(0);
  const insets = useSafeAreaInsets();

  const refresh = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;
      const userId = authResult.data.user?.id || '';
      setCurrentUserId(userId);

      const [groupResult, profileResult] = await Promise.all([
        supabase
          .from('groups')
          .select('id,name,description,city,province,category,cover_url,owner_id,status,review_note,join_approval_required,min_age,max_age')
          .eq('id', groupId)
          .maybeSingle(),
        userId
          ? supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      if (groupResult.error) throw groupResult.error;
      if (profileResult.error) throw profileResult.error;
      setIsAdmin(profileResult.data?.is_admin === true);

      if (!groupResult.data) {
        setGroup(null);
        return;
      }

      setGroup(groupResult.data);
      setDescriptionDraft(String(groupResult.data.description || ''));
      setNameDraft(String(groupResult.data.name || ''));
      const hasAgeRestriction =
        Number.isInteger(Number(groupResult.data.min_age)) &&
        Number.isInteger(Number(groupResult.data.max_age));
      setAgeRestrictedDraft(hasAgeRestriction);
      setMinAgeDraft(hasAgeRestriction ? String(groupResult.data.min_age) : '18');
      setMaxAgeDraft(hasAgeRestriction ? String(groupResult.data.max_age) : '80');

      const ownerId = String(groupResult.data.owner_id || '');
      const canManageJoinRequests = Boolean(
        userId && (ownerId === userId || profileResult.data?.is_admin === true)
      );
      const [currentJoinState, pendingJoinRequests] = await Promise.all([
        userId ? loadBajujuGroupJoinState(groupId) : Promise.resolve('none' as GroupJoinState),
        canManageJoinRequests ? loadBajujuGroupJoinRequests(groupId) : Promise.resolve([] as GroupJoinRequest[]),
      ]);
      setJoinState(currentJoinState);
      setJoinRequests(await withLocationIdentity(pendingJoinRequests, {
        idKey: 'user_id',
        nameKeys: ['nickname'],
        avatarKey: 'avatar_url',
      }));

      const [ownerResult, membersResult, linksResult, memberCountResult] = await Promise.all([
        ownerId
          ? supabase.from('profiles').select('nickname').eq('id', ownerId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.rpc('get_group_member_profiles', { p_group_id: groupId }),
        supabase.from('group_activities').select('activity_id').eq('group_id', groupId),
        supabase.rpc('get_group_member_count' as any, { p_group_id: groupId }),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (linksResult.error) throw linksResult.error;

      setOwnerName(String(ownerResult.data?.nickname || 'Bajuju'));
      const safeMembers = (membersResult.data || []) as MemberRow[];
      const memberIds = safeMembers
        .map((member) => String(member.user_id || '').trim())
        .filter(Boolean);

      const avatarsResult = memberIds.length
        ? await supabase.from('profiles').select('id,avatar_url').in('id', memberIds)
        : ({ data: [], error: null } as any);

      if (avatarsResult.error) throw avatarsResult.error;

      const avatarByUserId = new Map<string, string>(
        (avatarsResult.data || []).map(
          (profile: any): [string, string] => [
            String(profile.id || ''),
            String(profile.avatar_url || '').trim(),
          ]
        )
      );

      const membersWithPhotos = safeMembers.map((member) => ({
        ...member,
        avatar_url: avatarByUserId.get(String(member.user_id || '')) || null,
      }));

      setMembers(await withLocationIdentity(membersWithPhotos, {
        idKey: 'user_id',
        nameKeys: ['nickname'],
        avatarKey: 'avatar_url',
      }));
      // Se la funzione di conteggio non è ancora disponibile si usa la lunghezza dell'elenco.
      setMemberCount(
        !memberCountResult.error && memberCountResult.data !== null && memberCountResult.data !== undefined
          ? Number(memberCountResult.data)
          : safeMembers.length
      );
      setJoined(
        currentJoinState === 'joined'
        || safeMembers.some((member) => String(member.user_id || '') === userId)
      );

      const activityIds = [
        ...new Set(
          (linksResult.data || [])
            .map((row: any) => String(row.activity_id || ''))
            .filter(Boolean)
        ),
      ];

      if (activityIds.length === 0) {
        setExperiences([]);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const activitiesResult = await supabase
          .from('activities')
          .select('id,title,city,province,activity_date,activity_time')
          .in('id', activityIds)
          .eq('is_flash', false)
          .is('deleted_at', null)
          .gte('activity_date', today)
          .order('activity_date', { ascending: true })
          .order('activity_time', { ascending: true });

        if (activitiesResult.error) throw activitiesResult.error;
        setExperiences((activitiesResult.data || []) as ExperienceRow[]);
      }
    } catch (error) {
      console.log('Errore dettaglio gruppo:', error);
      Alert.alert('Errore', 'Non sono riuscito a caricare il gruppo.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function resubmitForApproval() {
    if (!groupId || !currentUserId || manageBusy || !group) return;
    if (String(group.owner_id || '') !== currentUserId || String(group.status || '') !== 'rejected') return;

    setManageBusy(true);
    try {
      const result = await supabase.rpc('resubmit_group_for_approval' as any, {
        p_group_id: groupId,
      });
      if (result.error) throw result.error;
      await refresh();
      Alert.alert('Richiesta inviata', 'Il gruppo è tornato in approvazione.');
    } catch (error: any) {
      Alert.alert('Invio non riuscito', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setManageBusy(false);
    }
  }

  async function toggleMembership() {
    if (!currentUserId || !groupId || busy || !group) return;
    if (String(group.owner_id || '') === currentUserId) return;

    setBusy(true);
    try {
      if (joined) {
        await leaveBajujuGroup(groupId, currentUserId);
      } else {
        const nextState = await joinBajujuGroup(groupId, currentUserId);
        if (nextState === 'age_required') {
          Alert.alert(
            'Età richiesta',
            'Inserisci la tua età precisa nel profilo prima di iscriverti a un gruppo.',
            [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Apri profilo', onPress: () => router.push('/profile' as any) },
            ]
          );
          return;
        }
        if (nextState === 'age_restricted') {
          Alert.alert('Gruppo riservato per età', 'La tua età non rientra nella fascia prevista per questo gruppo.');
          return;
        }
        if (nextState === 'pending') {
          Alert.alert('Richiesta inviata', 'Il gestore del gruppo potrà accettarla o rifiutarla.');
        }
      }
      await refresh();
    } catch (error: any) {
      Alert.alert('Operazione non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelJoinRequest() {
    if (!groupId || busy) return;

    setBusy(true);
    try {
      await cancelBajujuGroupJoinRequest(groupId);
      await refresh();
    } catch (error: any) {
      Alert.alert('Operazione non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusy(false);
    }
  }

  async function setApprovalRequirement(required: boolean) {
    if (!groupId || !group || approvalModeBusy) return;
    const canManage = isAdmin || String(group.owner_id || '') === currentUserId;
    if (!canManage) return;

    setApprovalModeBusy(true);
    try {
      const result = await supabase
        .from('groups')
        .update({ join_approval_required: required })
        .eq('id', groupId)
        .select('id,join_approval_required')
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('La modifica non è stata applicata.');

      setGroup((current: any) => current ? { ...current, join_approval_required: required } : current);
    } catch (error: any) {
      Alert.alert('Modifica non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setApprovalModeBusy(false);
    }
  }

  async function saveAgeRestriction() {
    if (!groupId || !group || ageModeBusy) return;
    const canManage = isAdmin || String(group.owner_id || '') === currentUserId;
    if (!canManage) return;

    const parsedMin = Number(minAgeDraft);
    const parsedMax = Number(maxAgeDraft);

    if (
      ageRestrictedDraft &&
      (
        !Number.isInteger(parsedMin) ||
        !Number.isInteger(parsedMax) ||
        parsedMin < 18 ||
        parsedMax > 80 ||
        parsedMin > parsedMax
      )
    ) {
      Alert.alert('Fascia non valida', 'Inserisci un’età minima e massima valide, da 18 a 80 anni.');
      return;
    }

    setAgeModeBusy(true);
    try {
      const payload = ageRestrictedDraft
        ? { min_age: parsedMin, max_age: parsedMax }
        : { min_age: null, max_age: null };

      const result = await supabase
        .from('groups')
        .update(payload)
        .eq('id', groupId)
        .select('id,min_age,max_age')
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('La modifica non è stata applicata.');

      setGroup((current: any) => current ? { ...current, ...result.data } : current);
      Alert.alert(
        'Fascia d’età aggiornata',
        'La nuova regola vale solo per le nuove iscrizioni. Chi è già nel gruppo rimane iscritto.'
      );
    } catch (error: any) {
      Alert.alert('Modifica non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setAgeModeBusy(false);
    }
  }

  async function reviewJoinRequest(userId: string, accept: boolean) {
    if (!groupId || !userId || reviewBusyUserId) return;

    setReviewBusyUserId(userId);
    try {
      await reviewBajujuGroupJoinRequest(groupId, userId, accept);
      await refresh();
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('BAJUJU_PROFILE_AGE_REQUIRED')) {
        Alert.alert('Età mancante', 'Questo utente deve inserire la sua età precisa prima di poter essere accettato.');
      } else if (message.includes('BAJUJU_AGE_RESTRICTED')) {
        Alert.alert('Fuori fascia', 'Questo utente non rientra più nella fascia d’età impostata per il gruppo. La richiesta resta in attesa.');
      } else {
        Alert.alert('Operazione non riuscita', message || 'Riprova tra poco.');
      }
    } finally {
      setReviewBusyUserId('');
    }
  }

  async function handleShareGroup() {
    if (!group) return;

    try {
      await shareBajujuGroup({
        id: groupId,
        name: group.name,
        category: group.category,
        city: group.city,
        province: group.province,
      });
    } catch (error: unknown) {
      Alert.alert(
        'Condivisione non riuscita',
        error instanceof Error ? error.message : 'Non sono riuscito a condividere il gruppo.'
      );
    }
  }

  async function handleChangeCover() {
    if (!group || !currentUserId || coverBusy) return;
    const canManageCover = isAdmin || String(group.owner_id || '') === currentUserId;
    if (!canManageCover) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Copertina gruppo', 'Autorizza l’accesso alle immagini per scegliere la copertina del gruppo.');
        return;
      }

      const picked = await pickPhoto({ aspect: [16, 9], quality: 0.9 });
      if (!picked) return;

      setCoverBusy(true);
      const resized = await ImageManipulator.manipulateAsync(
        picked.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
      );

      await uploadBajujuGroupCover({
        groupId,
        userId: currentUserId,
        localUri: resized.uri,
      });

      await refresh();
      Alert.alert('Copertina aggiornata', 'La nuova immagine del gruppo è online.');
    } catch (error: unknown) {
      Alert.alert(
        'Copertina non aggiornata',
        error instanceof Error ? error.message : 'Non sono riuscito ad aggiornare la copertina.'
      );
    } finally {
      setCoverBusy(false);
    }
  }

  async function saveDescription() {
    const cleanDescription = descriptionDraft.trim();
    if (!groupId || manageBusy || cleanDescription.length < 10) {
      if (cleanDescription.length < 10) {
        Alert.alert('Descrizione troppo corta', 'Inserisci almeno 10 caratteri.');
      }
      return;
    }

    setManageBusy(true);
    try {
      const result = await supabase
        .from('groups')
        .update({ description: cleanDescription })
        .eq('id', groupId)
        .select('id,description')
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('La modifica non è stata applicata.');

      const savedDescription = result.data.description;
      setGroup((current: any) => current ? { ...current, description: savedDescription } : current);
      setDescriptionDraft(String(savedDescription || ''));
      Alert.alert('Descrizione aggiornata', 'La nuova descrizione del gruppo è online.');
    } catch (error: any) {
      Alert.alert('Modifica non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setManageBusy(false);
    }
  }

  async function saveGroupChanges() {
    const cleanName = nameDraft.trim();
    const cleanDescription = descriptionDraft.trim();

    if (!isAdmin || !groupId || manageBusy) return;
    if (cleanName.length < 3) {
      Alert.alert('Nome troppo corto', 'Inserisci almeno 3 caratteri.');
      return;
    }
    if (cleanDescription.length < 10) {
      Alert.alert('Descrizione troppo corta', 'Inserisci almeno 10 caratteri.');
      return;
    }

    setManageBusy(true);
    try {
      const result = await supabase
        .from('groups')
        .update({
          name: cleanName,
          description: cleanDescription,
        })
        .eq('id', groupId)
        .select('id,name,description')
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('Le modifiche non sono state applicate.');

      const savedGroup = result.data;
      setGroup((current: any) => current ? { ...current, ...savedGroup } : current);
      setNameDraft(String(savedGroup.name || ''));
      setDescriptionDraft(String(savedGroup.description || ''));
      Alert.alert('Gruppo aggiornato', 'Nome e descrizione sono stati salvati.');
    } catch (error: any) {
      Alert.alert('Modifica non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setManageBusy(false);
    }
  }

  function confirmTakeOwnership() {
    if (!isAdmin || !groupId || !currentUserId || manageBusy) return;

    Alert.alert(
      'Prendere possesso del gruppo?',
      `Il gruppo passerà da ${ownerName} al tuo account Admin. Gli iscritti e le esperienze resteranno invariati.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Prendi possesso',
          onPress: () => {
            void (async () => {
              setManageBusy(true);
              try {
                const result = await supabase
                  .from('groups')
                  .update({ owner_id: currentUserId })
                  .eq('id', groupId);
                if (result.error) throw result.error;
                await refresh();
                Alert.alert('Proprietà trasferita', 'Ora sei il proprietario del gruppo.');
              } catch (error: any) {
                Alert.alert('Trasferimento non riuscito', String(error?.message || 'Riprova tra poco.'));
              } finally {
                setManageBusy(false);
              }
            })();
          },
        },
      ]
    );
  }

  function confirmDeleteGroup() {
    if (!isAdmin || !groupId || manageBusy) return;

    Alert.alert(
      'Eliminare definitivamente il gruppo?',
      'Il gruppo verrà rimosso. Questa operazione è riservata agli Admin e non può essere annullata.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina gruppo',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setManageBusy(true);
              try {
                const result = await supabase.from('groups').delete().eq('id', groupId);
                if (result.error) throw result.error;
                router.replace('/groups' as any);
              } catch (error: any) {
                Alert.alert('Eliminazione non riuscita', String(error?.message || 'Riprova tra poco.'));
                setManageBusy(false);
              }
            })();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={BAJUJU_COLORS.brightPink} />
          <Text style={styles.loadingText}>Carico il gruppo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <Text style={styles.notFoundTitle}>Gruppo non trovato</Text>
          <Pressable style={styles.backPill} onPress={() => router.replace('/groups' as any)}>
            <Text style={styles.backPillText}>Torna ai gruppi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = String(group.owner_id || '') === currentUserId;
  const place = String(group.city || '').trim();
  const canManageGroup = isOwner || isAdmin;
  const coverUrl = String(group.cover_url || '').trim();
  const groupStatus = String(group.status || 'active').toLowerCase();
  const isPublicGroup = groupStatus === 'active';
  const requiresApproval = group.join_approval_required === true;
  const hasPendingJoinRequest = joinState === 'pending';

  const ageLabel = group.min_age !== null && group.min_age !== undefined && group.max_age !== null && group.max_age !== undefined
    ? `${group.min_age}–${group.max_age} anni`
    : 'Tutte le età';
  const infoTiles = [
    { label: 'Dove', value: place || 'Non indicato', icon: 'location-outline' as const },
    isPublicGroup
      ? { label: 'Iscritti', value: `${memberCount} ${memberCount === 1 ? 'iscritto' : 'iscritti'}`, icon: 'people-outline' as const }
      : { label: 'Stato', value: groupStatus === 'rejected' ? 'Da rivedere' : 'In approvazione', icon: 'time-outline' as const },
    { label: 'Età', value: ageLabel, icon: 'person-outline' as const },
    {
      label: 'Ingresso',
      value: requiresApproval ? 'Su richiesta' : 'Libero',
      icon: requiresApproval ? ('lock-closed-outline' as const) : ('lock-open-outline' as const),
      valueStyle: requiresApproval ? styles.infoValueRequest : styles.infoValueFree,
    },
  ];
  const hasMenuItems = isPublicGroup || canManageGroup;

  function openManagement() {
    setMenuOpen(false);
    setManageOpen(true);
    if (managementY.current !== null) {
      groupScrollRef.current?.scrollTo({ y: Math.max(0, contentY.current + managementY.current - 12), animated: true });
    } else {
      scrollToManagementOnLayout.current = true;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {photoPickerModal}
      <KeyboardAwareScrollView
        ref={groupScrollRef}
        contentContainerStyle={[styles.container, { paddingBottom: 130 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}><Ionicons name="people-outline" size={56} color={BAJUJU_COLORS.pink} /></View>
          )}
          <LinearGradient
            colors={['rgba(75,12,45,0)', 'rgba(75,12,45,0.78)']}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.heroTopBar}>
            <Pressable
              style={styles.heroIconButton}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/groups' as any))}
              accessibilityRole="button"
              accessibilityLabel="Torna ai gruppi"
            >
              <Ionicons name="chevron-back" size={20} color={BAJUJU_COLORS.plum} />
            </Pressable>

            <View style={styles.heroTopActions}>
              {hasMenuItems ? (
                <Pressable
                  style={styles.heroIconButton}
                  onPress={() => setMenuOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Altre azioni del gruppo"
                >
                  <Ionicons name="ellipsis-horizontal" size={19} color={BAJUJU_COLORS.plum} />
                </Pressable>
              ) : null}
              <BajujuProfileButton size={38} />
            </View>
          </View>

          <View style={styles.heroText}>
            {group.category ? <Text style={styles.categoryChip} numberOfLines={1}>{group.category}</Text> : null}
            <Text style={styles.title} numberOfLines={3}>{group.name}</Text>
          </View>
        </View>

        <View style={styles.content} onLayout={(event) => { contentY.current = event.nativeEvent.layout.y; }}>
        {!coverUrl && (isOwner || isAdmin) ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Copertina obbligatoria mancante</Text>
            <Text style={styles.statusText}>
              Questo gruppo è stato creato prima dell’obbligo di copertina.
              {isOwner ? ' Carica un’immagine per completarlo.' : ' L’Admin può aggiungerla senza iscriversi.'}
            </Text>
            <Pressable
              style={[styles.resubmitButton, coverBusy && styles.disabled]}
              disabled={coverBusy}
              onPress={() => { void handleChangeCover(); }}
            >
              <Text style={styles.resubmitButtonText}>
                {coverBusy ? 'Caricamento...' : 'Aggiungi copertina ora'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.infoGrid}>
          {infoTiles.map((tile) => (
            <View key={tile.label} style={styles.infoTile}>
              <View style={styles.infoLabelRow}>
                <Ionicons name={tile.icon} size={13} color={BAJUJU_COLORS.pink} />
                <Text style={styles.infoLabel}>{tile.label}</Text>
              </View>
              <Text style={[styles.infoValue, tile.valueStyle]} numberOfLines={1}>{tile.value}</Text>
            </View>
          ))}
        </View>

        {group.description ? (
          <View>
            <Text
              style={styles.description}
              numberOfLines={descriptionOpen ? undefined : DESCRIPTION_PREVIEW_LINES}
              onTextLayout={(event) => {
                if (!descriptionOpen && event.nativeEvent.lines.length > DESCRIPTION_PREVIEW_LINES) setDescriptionLong(true);
              }}
            >
              {String(group.description).trim()}
            </Text>
            {descriptionLong ? (
              <Pressable onPress={() => setDescriptionOpen((current) => !current)} accessibilityRole="button">
                <Text style={styles.descriptionToggle}>{descriptionOpen ? 'Mostra meno' : 'Leggi tutto'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          style={styles.ownerRow}
          disabled={!group.owner_id}
          onPress={() => router.push({
            pathname: '/user-profile' as any,
            params: { userId: String(group.owner_id || '') },
          })}
          accessibilityRole="button"
          accessibilityLabel={`Apri i dettagli di ${ownerName}`}
        >
          <View style={styles.ownerIcon}>
            <Ionicons name="person" size={18} color={BAJUJU_COLORS.pink} />
          </View>
          <View style={styles.ownerCopy}>
            <Text style={styles.ownerLabel}>Gestito da</Text>
            <Text style={styles.ownerName} numberOfLines={1}>{isOwner ? `${ownerName} · sei tu` : ownerName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={BAJUJU_COLORS.muted} />
        </Pressable>

        {!isPublicGroup ? (
          <View style={[styles.statusCard, groupStatus === 'rejected' && styles.statusCardRejected]}>
            <Text style={[styles.statusTitle, groupStatus === 'rejected' && styles.statusTitleRejected]}>
              {groupStatus === 'rejected' ? 'Da rivedere' : 'In approvazione'}
            </Text>
            <Text style={styles.statusText}>
              {groupStatus === 'rejected'
                ? String(group.review_note || 'Bajuju non ha approvato questa versione del gruppo. Puoi correggerla e inviarla di nuovo.')
                : 'Il gruppo è visibile solo a te e agli Admin finché Bajuju non lo approva.'}
            </Text>
            {isOwner && groupStatus === 'rejected' ? (
              <Pressable
                style={[styles.resubmitButton, manageBusy && styles.disabled]}
                disabled={manageBusy}
                onPress={() => { void resubmitForApproval(); }}
              >
                <Text style={styles.resubmitButtonText}>{manageBusy ? 'Invio...' : 'Invia di nuovo per approvazione'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* L'Admin vede il pulsante come ogni utente: può iscriversi e restare Admin. */}
        {/* Il proprietario si riconosce dalla riga "Gestito da": niente pulsante per lui. */}
        {isOwner ? null : isPublicGroup ? (
          <>
            <Pressable
              style={[
                styles.joinButton,
                joined && styles.leaveButton,
                hasPendingJoinRequest && styles.pendingJoinButton,
                busy && styles.disabled,
              ]}
              disabled={busy || hasPendingJoinRequest}
              onPress={() => { void toggleMembership(); }}
            >
              <Text style={[
                styles.joinButtonText,
                joined && styles.leaveButtonText,
                hasPendingJoinRequest && styles.pendingJoinButtonText,
              ]}>
                {busy
                  ? 'Aggiorno...'
                  : joined
                    ? 'Abbandona gruppo'
                    : hasPendingJoinRequest
                      ? 'Richiesta inviata'
                      : requiresApproval
                        ? (joinState === 'rejected' ? 'Richiedi di nuovo' : 'Richiedi di entrare')
                        : 'Iscriviti al gruppo'}
              </Text>
            </Pressable>
            {hasPendingJoinRequest ? (
              <Pressable
                style={styles.cancelRequestButton}
                disabled={busy}
                onPress={() => { void cancelJoinRequest(); }}
              >
                <Text style={styles.cancelRequestButtonText}>Annulla richiesta</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {canManageGroup ? (
          <View
            style={styles.managementCard}
            onLayout={(event) => {
              managementY.current = event.nativeEvent.layout.y;
              if (scrollToManagementOnLayout.current) {
                scrollToManagementOnLayout.current = false;
                groupScrollRef.current?.scrollTo({ y: Math.max(0, contentY.current + event.nativeEvent.layout.y - 12), animated: true });
              }
            }}
          >
            <Pressable
              style={styles.managementHeader}
              onPress={() => setManageOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: manageOpen }}
            >
              <View>
                <Text style={styles.managementEyebrow}>{isAdmin ? 'GESTIONE ADMIN' : 'GESTIONE GRUPPO'}</Text>
                <Text style={styles.managementTitle}>Gestisci il gruppo</Text>
              </View>
              <Ionicons name={manageOpen ? 'chevron-up' : 'chevron-down'} size={20} color={BAJUJU_COLORS.brightPink} />
            </Pressable>

            {manageOpen ? (
            <View style={styles.managementBody}>

            <Text style={styles.fieldLabel}>Iscrizione degli utenti</Text>
            <Text style={styles.approvalHelper}>
              Scegli se gli utenti entrano subito oppure devono essere approvati da chi gestisce il gruppo.
            </Text>
            <View style={styles.approvalModeRow}>
              <Pressable
                style={[styles.approvalModeButton, !requiresApproval && styles.approvalModeButtonSelected]}
                disabled={approvalModeBusy}
                onPress={() => { void setApprovalRequirement(false); }}
              >
                <Text style={[styles.approvalModeButtonText, !requiresApproval && styles.approvalModeButtonTextSelected]}>
                  Libera
                </Text>
              </Pressable>
              <Pressable
                style={[styles.approvalModeButton, requiresApproval && styles.approvalModeButtonSelected]}
                disabled={approvalModeBusy}
                onPress={() => { void setApprovalRequirement(true); }}
              >
                <Text style={[styles.approvalModeButtonText, requiresApproval && styles.approvalModeButtonTextSelected]}>
                  Con approvazione
                </Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Età degli iscritti</Text>
            <Text style={styles.approvalHelper}>
              La fascia vale solo per le nuove iscrizioni. Chi è già nel gruppo resta dentro anche se la modifichi.
            </Text>
            <View style={styles.approvalModeRow}>
              <Pressable
                style={[styles.approvalModeButton, !ageRestrictedDraft && styles.approvalModeButtonSelected]}
                disabled={ageModeBusy}
                onPress={() => setAgeRestrictedDraft(false)}
              >
                <Text style={[styles.approvalModeButtonText, !ageRestrictedDraft && styles.approvalModeButtonTextSelected]}>
                  Tutte le età
                </Text>
              </Pressable>
              <Pressable
                style={[styles.approvalModeButton, ageRestrictedDraft && styles.approvalModeButtonSelected]}
                disabled={ageModeBusy}
                onPress={() => setAgeRestrictedDraft(true)}
              >
                <Text style={[styles.approvalModeButtonText, ageRestrictedDraft && styles.approvalModeButtonTextSelected]}>
                  Fascia d’età
                </Text>
              </Pressable>
            </View>

            {ageRestrictedDraft ? (
              <View style={styles.ageInputsRow}>
                <View style={styles.ageInputBox}>
                  <Text style={styles.fieldLabel}>Da</Text>
                  <TextInput
                    value={minAgeDraft}
                    onChangeText={(value) => setMinAgeDraft(value.replace(/[^0-9]/g, '').slice(0, 2))}
                    keyboardType="numeric"
                    style={styles.input}
                    maxLength={2}
                  />
                </View>
                <View style={styles.ageInputBox}>
                  <Text style={styles.fieldLabel}>A</Text>
                  <TextInput
                    value={maxAgeDraft}
                    onChangeText={(value) => setMaxAgeDraft(value.replace(/[^0-9]/g, '').slice(0, 2))}
                    keyboardType="numeric"
                    style={styles.input}
                    maxLength={2}
                  />
                </View>
              </View>
            ) : null}

            <Pressable
              style={[styles.secondaryAction, ageModeBusy && styles.disabled]}
              disabled={ageModeBusy}
              onPress={() => { void saveAgeRestriction(); }}
            >
              <Text style={styles.secondaryActionText}>
                {ageModeBusy ? 'Salvataggio...' : 'Salva fascia d’età'}
              </Text>
            </Pressable>

            <Text style={styles.fieldLabel}>Immagine di copertina</Text>
            <Pressable
              style={[styles.secondaryAction, coverBusy && styles.disabled]}
              disabled={coverBusy}
              onPress={() => { void handleChangeCover(); }}
            >
              <Text style={styles.secondaryActionText}>
                {coverBusy ? 'Caricamento...' : coverUrl ? 'Cambia immagine di copertina' : 'Aggiungi immagine di copertina'}
              </Text>
            </Pressable>

            {isAdmin ? (
              <>
                <Text style={styles.fieldLabel}>Nome gruppo</Text>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  maxLength={60}
                  style={styles.input}
                  placeholder="Nome gruppo"
                  placeholderTextColor={BAJUJU_COLORS.muted}
                />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Descrizione</Text>
            <TextInput
              value={descriptionDraft}
              onChangeText={setDescriptionDraft}
              maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textArea]}
              placeholder="Descrizione del gruppo"
              placeholderTextColor={BAJUJU_COLORS.muted}
            />
            <Text style={styles.counter}>{descriptionDraft.length}/{GROUP_DESCRIPTION_MAX_LENGTH}</Text>
            <Pressable
              style={[styles.saveButton, manageBusy && styles.disabled]}
              disabled={manageBusy}
              onPress={() => { void (isAdmin ? saveGroupChanges() : saveDescription()); }}
            >
              <Text style={styles.saveButtonText}>
                {manageBusy ? 'Salvataggio...' : isAdmin ? 'Salva modifiche' : 'Salva descrizione'}
              </Text>
            </Pressable>

            {isAdmin ? (
              <View style={styles.adminDangerZone}>
                {!isOwner ? (
                  <Pressable
                    style={[styles.takeOwnershipButton, manageBusy && styles.disabled]}
                    disabled={manageBusy}
                    onPress={confirmTakeOwnership}
                  >
                    <Text style={styles.takeOwnershipText}>Prendi possesso del gruppo</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  style={[styles.deleteButton, manageBusy && styles.disabled]}
                  disabled={manageBusy}
                  onPress={confirmDeleteGroup}
                >
                  <Text style={styles.deleteButtonText}>Elimina gruppo</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.ownerRuleText}>
                Il creatore può modificare copertina e descrizione. Nome, proprietà ed eliminazione sono riservati agli Admin.
              </Text>
            )}
            </View>
            ) : null}
          </View>
        ) : null}

        {canManageGroup && isPublicGroup && joinRequests.length > 0 ? (
          <View style={styles.requestsCard} onLayout={(event) => {
            if (params.section === 'requests') {
              groupScrollRef.current?.scrollTo({ y: Math.max(0, contentY.current + event.nativeEvent.layout.y - 18), animated: true });
            }
          }}>
            <Pressable
              style={styles.requestsHeader}
              onPress={() => setRequestsOpen((current) => !current)}
            >
              <View>
                <Text style={styles.requestsEyebrow}>GESTIONE ISCRIZIONI</Text>
                <Text style={styles.requestsTitle}>Richieste in attesa · {joinRequests.length}</Text>
              </View>
              <Text style={styles.requestsChevron}>{requestsOpen ? '−' : '+'}</Text>
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
                      <BajujuAdminRing size={52} isAdmin={adminIds.has(requestUserId)}>
                        <Pressable
                          style={styles.memberAvatar}
                          disabled={!avatarUrl}
                          onPress={() => {
                            if (avatarUrl) setSelectedMemberPhotoUrl(avatarUrl);
                          }}
                        >
                          {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.memberAvatarImage} resizeMode="cover" />
                          ) : (
                            <Text style={styles.memberAvatarText}>
                              {String(request.nickname || '?').slice(0, 1).toUpperCase()}
                            </Text>
                          )}
                        </Pressable>
                      </BajujuAdminRing>

                      <View style={styles.requestMain}>
                        <Pressable
                          disabled={!requestUserId}
                          onPress={() => {
                            if (!requestUserId) return;
                            router.push({ pathname: '/user-profile' as any, params: { userId: requestUserId } });
                          }}
                        >
                          <Text style={styles.memberName}>{request.nickname || 'Utente Bajuju'}</Text>
                          <Text style={styles.memberMeta}>
                            {[
                              request.gender || '',
                              request.age_range ? `${request.age_range} anni` : '',
                              request.origin || '',
                            ].filter(Boolean).join(' · ') || 'Apri il profilo per vedere i dettagli'}
                          </Text>
                        </Pressable>

                        <View style={styles.requestActions}>
                          <Pressable
                            style={[styles.rejectRequestButton, requestBusy && styles.disabled]}
                            disabled={requestBusy}
                            onPress={() => { void reviewJoinRequest(requestUserId, false); }}
                          >
                            <Text style={styles.rejectRequestText}>Rifiuta</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.acceptRequestButton, requestBusy && styles.disabled]}
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

        {isPublicGroup ? (
          <>
        <BajujuGroupPolls
          groupId={groupId}
          currentUserId={currentUserId}
          canUsePolls={joined || isOwner || isAdmin}
        />

        <BajujuGroupChat
          groupId={groupId}
          currentUserId={currentUserId}
          canUseChat={joined || isOwner || isAdmin}
          members={members}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prossime esperienze</Text>
          {experiences.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nessuna esperienza associata al gruppo al momento.</Text>
            </View>
          ) : (
            experiences.map((experience) => (
              <Pressable
                key={String(experience.id)}
                style={styles.experienceCard}
                onPress={() => router.push({ pathname: '/experience-detail' as any, params: { id: String(experience.id || '') } })}
              >
                <Text style={styles.experienceTitle}>{experience.title || 'Esperienza Bajuju'}</Text>
                <Text style={styles.experienceMeta}>
                  {[experience.city || experience.province, experience.activity_date, experience.activity_time?.slice(0, 5)].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.experienceArrow}>Apri esperienza ›</Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Iscritti</Text>
          <Text style={styles.privacyText}>Tocca la foto per ingrandirla oppure il nome per aprire il profilo.</Text>
          <View style={styles.membersCard}>
            {members.map((member, index) => {
              const memberId = String(member.user_id || '').trim();
              const avatarUrl = String(member.avatar_url || '').trim();
              return (
                <View key={memberId || String(index)} style={[styles.memberRow, index > 0 && styles.memberBorder]}>
                  <BajujuAdminRing size={52} isAdmin={adminIds.has(memberId)}>
                    <Pressable
                      style={styles.memberAvatar}
                      disabled={!avatarUrl}
                      onPress={() => {
                        if (avatarUrl) setSelectedMemberPhotoUrl(avatarUrl);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={avatarUrl ? `Ingrandisci la foto di ${member.nickname || 'questo utente'}` : undefined}
                    >
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.memberAvatarImage} resizeMode="cover" />
                      ) : (
                        <Text style={styles.memberAvatarText}>{String(member.nickname || '?').slice(0, 1).toUpperCase()}</Text>
                      )}
                    </Pressable>
                  </BajujuAdminRing>

                  <Pressable
                    style={styles.memberCopy}
                    disabled={!memberId}
                    onPress={() => {
                      if (!memberId) return;
                      router.push({ pathname: '/user-profile' as any, params: { userId: memberId } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Apri il profilo di ${member.nickname || 'questo utente'}`}
                  >
                    <Text style={styles.memberName}>{member.nickname || 'Utente Bajuju'}</Text>
                    <Text style={styles.memberMeta}>
                      {[
                        member.age_range ? `${member.age_range} anni` : '',
                        member.origin || '',
                      ].filter(Boolean).join(' · ') || 'Informazioni non disponibili'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
          </>
        ) : (
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Le iscrizioni e le esperienze del gruppo si attivano dopo l’approvazione.
              </Text>
            </View>
          </View>
        )}
        </View>
      </KeyboardAwareScrollView>

      <BajujuBottomNav active="find" />

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle} numberOfLines={1}>{group.name}</Text>

          {isPublicGroup ? (
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                void handleShareGroup();
              }}
            >
              <Ionicons name="share-social-outline" size={20} color={BAJUJU_COLORS.pink} />
              <Text style={styles.menuItemText}>Condividi gruppo</Text>
            </Pressable>
          ) : null}

          {canManageGroup ? (
            <Pressable style={styles.menuItem} onPress={openManagement}>
              <Ionicons name="settings-outline" size={20} color={BAJUJU_COLORS.pink} />
              <Text style={styles.menuItemText}>{isAdmin ? 'Gestisci il gruppo · Admin' : 'Gestisci il gruppo'}</Text>
            </Pressable>
          ) : null}

          {canManageGroup ? (
            <Pressable
              style={[styles.menuItem, coverBusy && styles.disabled]}
              disabled={coverBusy}
              onPress={() => {
                setMenuOpen(false);
                void handleChangeCover();
              }}
            >
              <Ionicons name="image-outline" size={20} color={BAJUJU_COLORS.pink} />
              <Text style={styles.menuItemText}>{coverUrl ? 'Cambia foto copertina' : 'Aggiungi foto copertina'}</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={Boolean(selectedMemberPhotoUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMemberPhotoUrl(null)}
      >
        <Pressable style={styles.photoModalBackdrop} onPress={() => setSelectedMemberPhotoUrl(null)}>
          <Pressable style={styles.photoModalContent} onPress={() => {}}>
            {selectedMemberPhotoUrl ? (
              <Image source={{ uri: selectedMemberPhotoUrl }} style={styles.photoModalImage} resizeMode="contain" />
            ) : null}
            <Pressable style={styles.photoModalClose} onPress={() => setSelectedMemberPhotoUrl(null)}>
              <Text style={styles.photoModalCloseText}>Chiudi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { backgroundColor: BAJUJU_COLORS.background },
  hero: { height: 270, backgroundColor: BAJUJU_COLORS.softPink, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroTopBar: { position: 'absolute', top: 12, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTopActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 18, gap: 8 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoTile: { flexBasis: '48%', flexGrow: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoLabel: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  infoValue: { marginTop: 2, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 15 },
  infoValueFree: { color: '#1F7A52' },
  infoValueRequest: { color: '#8A5B00' },
  ownerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.softPink },
  ownerCopy: { flex: 1, minWidth: 0 },
  managementHeader: { minHeight: 68, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  managementBody: { paddingBottom: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(75,12,45,0.35)' },
  sheet: { backgroundColor: BAJUJU_COLORS.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: BAJUJU_COLORS.line, marginBottom: 14 },
  sheetTitle: { marginBottom: 4, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BAJUJU_COLORS.palePink },
  menuItemText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 16 },
  backPill: { alignSelf: 'center', marginTop: 16, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: BAJUJU_COLORS.line },
  backPillText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  coverPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.softPink },
  categoryChip: { alignSelf: 'flex-start', maxWidth: '80%', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: BAJUJU_COLORS.white, color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  title: { color: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.bold, fontSize: 26, lineHeight: 30 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white },
  ownerLabel: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12 },
  ownerName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 15 },
  description: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.regular, fontSize: 15, lineHeight: 22 },
  descriptionToggle: { marginTop: 4, color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  joinButton: { minHeight: 50, paddingHorizontal: 22, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.pink },
  counter: { marginTop: 5, alignSelf: 'flex-end', color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  loadingText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  notFoundTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 24 },
  statusCard: {
    padding: 14,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#F0D58E',
    backgroundColor: '#FFF9E7',
  },
  statusCardRejected: { borderColor: '#F4C6D7', backgroundColor: '#FFF1F6' },
  statusTitle: { color: '#7A5A00', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  statusTitleRejected: { color: '#A3345E' },
  statusText: { marginTop: 5, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 13, lineHeight: 18 },
  resubmitButton: { marginTop: 12, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  resubmitButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  joinButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  leaveButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: BAJUJU_COLORS.brightPink },
  leaveButtonText: { color: BAJUJU_COLORS.brightPink },
  pendingJoinButton: { backgroundColor: BAJUJU_COLORS.palePink },
  pendingJoinButtonText: { color: BAJUJU_COLORS.brightPink },
  cancelRequestButton: { minHeight: 40, marginTop: -8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  cancelRequestButtonText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12, textDecorationLine: 'underline' },
  disabled: { opacity: 0.5 },
  managementCard: { marginTop: 8, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff' },
  managementEyebrow: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 11, letterSpacing: 0.9 },
  managementTitle: { marginTop: 2, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  approvalHelper: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  approvalModeRow: { flexDirection: 'row', gap: 9, marginBottom: 4 },
  approvalModeButton: { flex: 1, minHeight: 44, paddingHorizontal: 10, borderRadius: 22, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  approvalModeButtonSelected: { borderColor: BAJUJU_COLORS.brightPink, backgroundColor: BAJUJU_COLORS.palePink },
  approvalModeButtonText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12, textAlign: 'center' },
  approvalModeButtonTextSelected: { color: BAJUJU_COLORS.brightPink },
  fieldLabel: { marginTop: 16, marginBottom: 7, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, color: BAJUJU_COLORS.plum, backgroundColor: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  textArea: { minHeight: 112, maxHeight: 220, paddingTop: 13, textAlignVertical: 'top' },
  saveButton: { minHeight: 50, marginTop: 11, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  saveButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  ageInputsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  ageInputBox: { flex: 1 },
  secondaryAction: { minHeight: 48, marginTop: 10, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  secondaryActionText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  adminDangerZone: { marginTop: 20, paddingTop: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line, gap: 10 },
  takeOwnershipButton: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4D8', borderWidth: 1, borderColor: '#E7C56A' },
  takeOwnershipText: { color: '#7A5A00', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  deleteButton: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F0', borderWidth: 1.5, borderColor: '#E15A5A' },
  deleteButtonText: { color: '#B82424', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  ownerRuleText: { marginTop: 14, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  requestsCard: { borderRadius: 22, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', overflow: 'hidden' },
  requestsHeader: { minHeight: 74, paddingHorizontal: 17, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  requestsEyebrow: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 10, letterSpacing: 0.8 },
  requestsTitle: { marginTop: 2, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  requestsChevron: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 28 },
  requestsList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line },
  requestRow: { padding: 14, flexDirection: 'row', alignItems: 'flex-start' },
  requestBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line },
  requestMain: { flex: 1, minWidth: 0, marginLeft: 12 },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rejectRequestButton: { flex: 1, minHeight: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#E3A0B8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  rejectRequestText: { color: '#A3345E', fontFamily: BAJUJU_FONTS.bold, fontSize: 12 },
  acceptRequestButton: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  acceptRequestText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 12 },
  section: { marginTop: 10 },
  sectionTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 20 },
  privacyText: { marginTop: 4, marginBottom: 11, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  emptyCard: { marginTop: 11, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff' },
  emptyText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  experienceCard: { marginTop: 11, padding: 17, borderRadius: 22, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff' },
  experienceTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  experienceMeta: { marginTop: 5, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  experienceArrow: { marginTop: 9, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  membersCard: { borderRadius: 23, overflow: 'hidden', borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff' },
  memberRow: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  memberBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line },
  memberAvatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  memberAvatarImage: { width: '100%', height: '100%' },
  memberAvatarText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  memberCopy: { flex: 1, minWidth: 0, marginLeft: 12, paddingVertical: 12 },
  memberName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  memberMeta: { marginTop: 3, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  photoModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  photoModalContent: { width: '100%', height: '86%', alignItems: 'center', justifyContent: 'center' },
  photoModalImage: { width: '100%', height: '100%', borderRadius: 18 },
  photoModalClose: { position: 'absolute', top: 12, right: 12, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  photoModalCloseText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
});
