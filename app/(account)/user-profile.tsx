import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../../src/lib/supabase';
import {
  effectiveOrganizerGrade,
  organizerGradeHint,
} from '../../src/utils/organizerGrade';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { LocationProfileView } from '../../src/components/location/LocationProfileView';
import { BajujuLocation, loadBajujuLocation } from '../../src/lib/bajujuLocations';
import { BajujuBackButton, BajujuRoundIconButton } from '../../src/components/navigation/BajujuBackButton';
import { BajujuActionBar, BajujuButton } from '../../src/components/BajujuActionBar';
import { LinearGradient } from 'expo-linear-gradient';
import { BajujuAdminRing } from '../../src/components/profile/BajujuAdminRing';
import { Ionicons } from '@expo/vector-icons';
import {
  addToBajujuBlacklist,
  removeFromBajujuBlacklist,
  useIsBajujuBlacklisted,
} from '../../src/hooks/useBajujuBlacklist';
import { BAJUJU_COLORS } from '../../src/theme/bajujuTheme';
import { EventCardImage } from '../../src/components/events/EventCardImage';
import { experienceDateLabel } from '../../src/utils/experienceDateLabel';
import { getExperienceCategoryIcon, normalizeExperienceCategory } from '../../src/constants/experienceCategories';
import { BajujuPhotoViewer } from '../../src/components/chat/BajujuPhotoViewer';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');

const BAJUJU_CREATOR_EMAIL = 'royaleventi@gmail.com';
const BAJUJU_PINK = '#E43F98';

type LooseRow = Record<string, any>;

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

function firstPhoto(row: LooseRow | null | undefined) {
  return firstText(
    row,
    ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto'],
    ''
  );
}

function booleanFromRow(row: LooseRow | null | undefined, keys: string[], fallback = false) {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'boolean') return value;

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (['true', '1', 'yes', 'si', 'sì'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
    }

    if (typeof value === 'number') return value === 1;
  }

  return fallback;
}

function isCreatorProfile(profile: LooseRow | null) {
  const email = firstText(profile, ['email'], '').trim().toLowerCase();
  return email === BAJUJU_CREATOR_EMAIL;
}

function isAdminProfile(profile: LooseRow | null) {
  return (
    booleanFromRow(profile, ['is_admin', 'admin', 'is_master', 'master'], false) ||
    ['admin', 'master', 'superadmin'].includes(
      firstText(profile, ['role', 'ruolo', 'user_role'], '').toLowerCase()
    )
  );
}

async function fetchOrganizedExperienceIds(userId: string) {
  const result = await supabase
    .from('activities')
    .select('id,deleted_at')
    .eq('creator_id', userId)
    .is('deleted_at', null);

  if (result.error || !result.data) return new Set<string>();

  return new Set(
    (result.data as LooseRow[])
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)
  );
}

function isClosedActivity(row: LooseRow) {
  if (row.deleted_at) return true;
  return ['deleted', 'eliminato', 'eliminata', 'removed', 'cancelled', 'canceled', 'annullato', 'annullata', 'archived', 'closed']
    .includes(String(row.status || '').trim().toLowerCase());
}

function activityMoment(row: LooseRow) {
  if (!row.activity_date) return null;
  const value = new Date(`${row.activity_date}T${row.activity_time || '23:59'}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

// Eventi che la persona organizza e che devono ancora svolgersi.
// La visibilità (eventi privati, blocchi) la decide la policy di Supabase, come nel resto dell'app.
async function fetchUpcomingOrganizedEvents(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await supabase
    .from('activities')
    .select('id,title,category,city,province,activity_date,activity_time,photo_url,deleted_at,status,is_flash')
    .eq('creator_id', userId)
    .neq('is_flash', true)
    .is('deleted_at', null)
    .gte('activity_date', today)
    .order('activity_date', { ascending: true })
    .order('activity_time', { ascending: true })
    .limit(30);

  if (result.error || !result.data) return [];

  const now = Date.now();
  return (result.data as LooseRow[]).filter((row) => {
    if (isClosedActivity(row)) return false;
    const moment = activityMoment(row);
    return !moment || moment.getTime() >= now;
  });
}

async function safeFetchParticipantRows(userId: string) {
  const result = await supabase
    .from('activity_participants')
    .select('id,activity_id,status,user_id')
    .eq('user_id', userId);

  if (result.error || !result.data) return [];

  return (result.data as LooseRow[]).filter((row) => {
    const status = String(row.status || '').toLowerCase();

    return !['cancelled', 'canceled', 'rejected', 'left', 'deleted'].includes(status);
  });
}

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ userId?: string; activityId?: string; postEvent?: string }>();
  const userId = String(params.userId || '').trim();
  const activityId = String(params.activityId || '').trim();
  const canUsePostExperienceActions = String(params.postEvent || '') === '1';

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<LooseRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [viewerIsOfficialAdmin, setViewerIsOfficialAdmin] = useState(false);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [reportingUser, setReportingUser] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [blacklistBusy, setBlacklistBusy] = useState(false);
  const isInMyBlacklist = useIsBajujuBlacklisted(userId);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [organizedCount, setOrganizedCount] = useState(0);
  const [participatedCount, setParticipatedCount] = useState(0);
  const [location, setLocation] = useState<BajujuLocation | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<LooseRow[]>([]);
  const [errorText, setErrorText] = useState('');
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErrorText('');

    try {
      const authResult = await supabase.auth.getUser();

      if (authResult.error) {
        throw authResult.error;
      }

      const authUserId = authResult.data.user?.id || '';
      setCurrentUserId(authUserId);
      // Solo l'Admin principale può firmare messaggi con il nome ufficiale Bajuju.
      const mainAdminResult = authUserId
        ? await supabase.rpc('bajuju_main_admin_id' as any)
        : { data: null, error: null };
      setViewerIsOfficialAdmin(
        Boolean(authUserId && !mainAdminResult.error && mainAdminResult.data === authUserId)
      );
      const viewerResult = authUserId
        ? await supabase.from('profiles').select('is_admin').eq('id', authUserId).maybeSingle()
        : { data: null };
      setViewerIsAdmin((viewerResult.data as LooseRow | null)?.is_admin === true);

      if (authUserId && userId && authUserId !== userId) {
        const blockResult = await supabase
          .from('user_blocks')
          .select('id')
          .eq('blocker_id', authUserId)
          .eq('blocked_id', userId)
          .maybeSingle();

        if (blockResult.error) {
          throw blockResult.error;
        }

        setIsBlockedByMe(Boolean(blockResult.data));
      } else {
        setIsBlockedByMe(false);
      }

      if (!userId) {
        setProfile(null);
        setErrorText('Profilo non trovato.');
        return;
      }

      const byId = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (byId.error) {
        throw byId.error;
      }

      if (!byId.data) {
        setProfile(null);
        setErrorText('Profilo non disponibile.');
        return;
      }

      const loadedProfile = byId.data as LooseRow;
      setProfile(loadedProfile);

      // Un profilo attivato come Location con la pagina compilata si mostra come locale.
      // Una richiesta "Diventa Location" in attesa la vedono solo il proprietario e gli admin
      // (lo garantisce la policy SELECT): così l'Admin controlla la pagina prima di approvarla.
      const loadedLocation = await loadBajujuLocation(userId).catch(() => null);
      setLocation(
        loadedProfile.is_location_organizer === true || loadedLocation?.requestStatus === 'pending'
          ? loadedLocation
          : null
      );

      const profileId = String(loadedProfile.id || userId).trim();
      const organizedIds = await fetchOrganizedExperienceIds(profileId);
      setOrganizedCount(organizedIds.size);
      setUpcomingEvents(await fetchUpcomingOrganizedEvents(profileId).catch(() => []));

      const participatedRows = await safeFetchParticipantRows(profileId);
      const participatedIds = new Set<string>();

      participatedRows.forEach((row) => {
        const activityId = String(row.activity_id || '').trim();

        if (activityId && !organizedIds.has(activityId)) {
          participatedIds.add(activityId);
        }
      });

      setParticipatedCount(participatedIds.size);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore durante il caricamento del profilo.';

      setProfile(null);
      setErrorText(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function reportUser() {
    if (!profile || !userId || reportingUser) return;

    if (!currentUserId) {
      Alert.alert('Accesso richiesto', 'Devi essere collegato per segnalare un utente.');
      return;
    }

    if (currentUserId === userId) {
      Alert.alert('Segnalazione non valida', 'Non puoi segnalare il tuo profilo.');
      return;
    }

    setReportingUser(true);

    try {
      const reportedName = firstText(
        profile,
        ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'],
        'Utente Bajuju'
      );

      const result = await supabase.from('user_reports').insert({
        reporter_id: currentUserId,
        reported_by: currentUserId,
        user_id: userId,
        reported_user_id: userId,
        target_user_id: userId,
        reason: 'Profilo utente segnalato dall’app',
        message: `Profilo segnalato: ${reportedName}`,
        content: `Profilo segnalato: ${reportedName}`,
        body: `Profilo segnalato: ${reportedName}`,
        text: `Profilo segnalato: ${reportedName}`,
        status: 'open',
        report_status: 'open',
        reported_at: new Date().toISOString(),
      });

      if (result.error) {
        Alert.alert('Errore segnalazione', result.error.message);
        return;
      }

      Alert.alert('Segnalazione inviata', 'Grazie, controlleremo questo profilo.');
    } finally {
      setReportingUser(false);
    }
  }

  async function toggleBlacklist() {
    if (!userId || blacklistBusy) return;
    if (!currentUserId || currentUserId === userId) return;

    setBlacklistBusy(true);
    try {
      if (isInMyBlacklist) {
        await removeFromBajujuBlacklist(userId);
        Alert.alert('Tolto dalla blacklist', 'Il cerchio nero non comparirà più.');
      } else {
        await addToBajujuBlacklist(userId);
        Alert.alert(
          'Messo in blacklist',
          'Lo vedrai con il cerchio nero. Lo sai solo tu: per entrare nei tuoi eventi e gruppi dovrà chiederti il permesso.'
        );
      }
    } catch (error: any) {
      Alert.alert('Operazione non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBlacklistBusy(false);
    }
  }

  async function blockUser() {
    if (!profile || !userId || blockingUser) return;

    if (!currentUserId) {
      Alert.alert('Accesso richiesto', 'Devi essere collegato per bloccare un utente.');
      return;
    }

    if (currentUserId === userId) {
      Alert.alert('Blocco non valido', 'Non puoi bloccare il tuo profilo.');
      return;
    }

    if (isAdminOrCreator) {
      Alert.alert('Blocco non consentito', 'Non puoi bloccare un amministratore Bajuju.');
      return;
    }

    setBlockingUser(true);

    try {
      if (isBlockedByMe) {
        const result = await supabase
          .from('user_blocks')
          .delete()
          .eq('blocker_id', currentUserId)
          .eq('blocked_id', userId);

        if (result.error) {
          Alert.alert('Errore sblocco', result.error.message);
          return;
        }

        setIsBlockedByMe(false);
        Alert.alert('Utente sbloccato', 'Ora puoi tornare a interagire con questo utente.');
        return;
      }

      const existing = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', userId)
        .maybeSingle();

      if (existing.error) {
        throw existing.error;
      }

      if (existing.data) {
        setIsBlockedByMe(true);
        Alert.alert('Utente già bloccato', 'Questo utente è già stato bloccato.');
        return;
      }

      const result = await supabase.from('user_blocks').insert({
        blocker_id: currentUserId,
        blocked_id: userId,
      });

      if (result.error) {
        Alert.alert('Errore blocco', result.error.message);
        return;
      }

      setIsBlockedByMe(true);
      Alert.alert(
        'Utente bloccato',
        'Da ora non vi vedrete più su Bajuju, non potrete contattarvi e non vedrete gli eventi a cui l’altro partecipa. Se eravate già entrambi nello stesso evento, l’evento resta disponibile ma non vedrete più profilo, messaggi o foto reciproci.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore imprevisto durante il blocco dell’utente.';

      Alert.alert('Errore blocco', message);
    } finally {
      setBlockingUser(false);
    }
  }

  const name = firstText(
    profile,
    ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'],
    'Utente Bajuju'
  );
  const homeCity = firstText(profile, ['city', 'citta', 'comune', 'location_city'], '').slice(0, 40);
  const age = firstText(profile, ['age', 'eta', 'età', 'user_age', 'age_range', 'fascia_eta', 'age_band', 'eta_range'], '');
  const gender = firstText(profile, ['gender', 'genere'], '');
  const photo = firstPhoto(profile);
  const isCreator = isCreatorProfile(profile);
  const isAdmin = isAdminProfile(profile);
  const isAdminOrCreator = isCreator || isAdmin;
  const isPremium = booleanFromRow(
    profile,
    ['is_premium_organizer', 'is_premium', 'premium', 'premium_user'],
    false
  );
  const manualGrade = firstText(profile, ['organizer_grade_override'], '');
  const gradeInfo = effectiveOrganizerGrade(organizedCount, manualGrade);
  const gradeLabel = isCreator
    ? 'Creatore app'
    : isAdmin
      ? 'Admin'
      : gradeInfo.label;
  const gradeHint = isAdminOrCreator
    ? 'Profilo ufficiale Bajuju'
    : organizerGradeHint(gradeInfo);

  const photoFrameStyle = isAdminOrCreator
    ? styles.photoFrameAdmin
    : gradeInfo.level === 'top'
      ? styles.photoFrameGold
      : gradeInfo.level === 'expert'
        ? styles.photoFrameExpert
        : gradeInfo.level === 'active'
          ? styles.photoFrameGreen
          : styles.photoFrameBase;

  const gradeBadgeStyle = isAdminOrCreator
    ? styles.gradeBadgeAdmin
    : gradeInfo.level === 'top'
      ? styles.gradeBadgeGold
      : gradeInfo.level === 'expert'
        ? styles.gradeBadgeExpert
        : gradeInfo.level === 'active'
          ? styles.gradeBadgeGreen
          : styles.gradeBadgeBase;

  const profileActions = currentUserId && currentUserId !== userId ? (
    <>
      {viewerIsAdmin ? (
        <Pressable
          style={styles.adminMessageButton}
          onPress={() => router.push({
            pathname: '/admin-private-chat' as any,
            params: { userId },
          })}
          accessibilityRole="button"
          accessibilityLabel="Scrivi un messaggio privato come Bajuju Admin"
        >
          <Text style={styles.adminMessageButtonText}>Scrivi come Bajuju</Text>
        </Pressable>
      ) : null}
  
      {canUsePostExperienceActions && activityId ? (
        <View style={{ width: '100%', gap: 8, marginTop: 12 }}>
          <Pressable
            style={{
              width: '100%',
              borderRadius: 999,
              paddingVertical: 12,
              paddingHorizontal: 16,
              alignItems: 'center',
              backgroundColor: BAJUJU_PINK,
            }}
            onPress={() => router.push({
              pathname: '/invite-out' as any,
              params: { targetUserId: userId, activityId },
            })}
          >
            <Text style={{ color: '#ffffff', fontFamily: 'FredokaBold' }}>Invita a uscire</Text>
          </Pressable>
  
          <Pressable
            style={{
              width: '100%',
              borderRadius: 999,
              paddingVertical: 12,
              paddingHorizontal: 16,
              alignItems: 'center',
              backgroundColor: '#FFF0F7',
              borderWidth: 1,
              borderColor: '#F3C6DC',
            }}
            onPress={() => router.push({
              pathname: '/share-contact' as any,
              params: { targetUserId: userId, activityId },
            })}
          >
            <Text style={{ color: BAJUJU_PINK, fontFamily: 'FredokaBold' }}>Invia WhatsApp o Telegram</Text>
          </Pressable>
        </View>
      ) : null}
  
      <Pressable
        style={styles.reportUserButton}
        onPress={reportUser}
        disabled={reportingUser}
      >
        <Text style={styles.reportUserText}>
          {reportingUser ? 'Invio segnalazione...' : 'Segnala utente'}
        </Text>
      </Pressable>
  
      {!isAdminOrCreator ? (
        <Pressable
          style={styles.blockUserButton}
          onPress={blockUser}
          disabled={blockingUser}
        >
          <Text style={styles.blockUserText}>
            {blockingUser ? 'Aggiorno...' : isBlockedByMe ? 'Sblocca utente' : 'Blocca utente'}
          </Text>
        </Pressable>
      ) : null}

      {!isAdminOrCreator && currentUserId && currentUserId !== userId ? (
        <Pressable
          style={[styles.blacklistButton, isInMyBlacklist && styles.blacklistButtonActive]}
          onPress={() => { void toggleBlacklist(); }}
          disabled={blacklistBusy}
        >
          <Ionicons name="book" size={16} color={isInMyBlacklist ? '#111111' : '#ffffff'} />
          <Text style={[styles.blacklistText, isInMyBlacklist && styles.blacklistTextActive]}>
            {blacklistBusy ? 'Aggiorno...' : isInMyBlacklist ? 'Togli dalla blacklist' : 'Metti in blacklist'}
          </Text>
        </Pressable>
      ) : null}
    </>
  ) : null;

  const isOtherUser = Boolean(currentUserId && currentUserId !== userId);
  const canInvite = isOtherUser && canUsePostExperienceActions && Boolean(activityId);

  function openProfileMenu() {
    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (viewerIsAdmin) {
      options.push({
        text: 'Scrivi come Bajuju',
        onPress: () => router.push({ pathname: '/admin-private-chat' as any, params: { userId } }),
      });
    }
    options.push({ text: 'Segnala utente', onPress: () => { void reportUser(); } });
    if (!isAdminOrCreator) {
      options.push({
        text: isBlockedByMe ? 'Sblocca utente' : 'Blocca utente',
        style: 'destructive',
        onPress: () => { void blockUser(); },
      });
    }
    options.push({ text: 'Annulla', style: 'cancel' });
    Alert.alert(name || 'Profilo', undefined, options);
  }

  const profileBio = typeof profile?.bio === 'string' ? profile.bio.trim() : '';
  const profileInterests = Array.isArray(profile?.interests) ? (profile.interests as unknown[]).map(String).filter(Boolean).slice(0, 5) : [];

  const infoTiles = [
    { label: 'Organizzati', value: `${organizedCount} ${organizedCount === 1 ? 'evento' : 'eventi'}` },
    { label: 'Partecipati', value: `${participatedCount} ${participatedCount === 1 ? 'evento' : 'eventi'}` },
    { label: 'Di dove', value: homeCity || 'Non indicato' },
    { label: 'Età', value: age || 'Non indicata' },
    { label: 'Genere', value: gender || 'Non indicato' },
  ];

  if (!loading && !errorText && !location) {
    return (
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.personContent}>
          <View style={styles.cover}>
            <LinearGradient
              colors={['#B98EA3', '#4B0C2D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.coverTopBar}>
              <BajujuBackButton onPress={() => router.back()} accessibilityLabel="Indietro" style={styles.coverButton} />
              <View style={styles.coverActions}>
                {isOtherUser && (reportingUser || blockingUser) ? (
                  <View style={styles.coverButtonPlain}><ActivityIndicator color="#4B0C2D" /></View>
                ) : isOtherUser ? (
                  <BajujuRoundIconButton
                    icon="ellipsis-horizontal"
                    accessibilityLabel="Altre azioni"
                    onPress={openProfileMenu}
                    style={styles.coverButton}
                  />
                ) : null}
                <BajujuProfileButton size={38} />
              </View>
            </View>
          </View>

          <View style={styles.identity}>
            <BajujuAdminRing
              size={132}
              isAdmin={isAdminOrCreator}
              userId={userId}
              style={styles.adminRing}
            >
              <Pressable
                style={[styles.photoFrame, photoFrameStyle, (isAdminOrCreator || isInMyBlacklist) && styles.photoFrameInRing]}
                onPress={() => { if (photo) setPhotoViewerOpen(true); }}
                disabled={!photo}
                accessibilityRole="imagebutton"
                accessibilityLabel="Ingrandisci foto profilo"
              >
                <Image source={photo ? { uri: photo } : bajujuLogo} style={styles.photo} resizeMode="cover" />
              </Pressable>
            </BajujuAdminRing>

            <Text style={styles.name}>{name}</Text>

            <View style={[styles.gradeBadge, gradeBadgeStyle]}>
              <Text style={styles.gradeText}>{gradeLabel}</Text>
            </View>

            {!isAdminOrCreator && isPremium ? (
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>Organizzatore Premium</Text>
              </View>
            ) : null}

            <Text style={styles.gradeHint}>{gradeHint}</Text>

            {!isAdminOrCreator && isPremium ? (
              <Text style={styles.premiumHint}>Premium verificato direttamente da Bajuju.</Text>
            ) : null}
          </View>

          {profileBio || profileInterests.length > 0 ? (
            <View style={styles.aboutBox}>
              {profileBio ? <Text style={styles.aboutText}>{profileBio}</Text> : null}
              {profileInterests.length > 0 ? (
                <View style={styles.aboutChips}>
                  {profileInterests.map((item) => (
                    <Text key={item} style={styles.aboutChip}>{item}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {upcomingEvents.length > 0 ? (
            <View style={styles.upcomingSection}>
              <Text style={styles.upcomingTitle}>Sta organizzando</Text>
              {upcomingEvents.map((item) => {
                const id = String(item.id || '');
                const title = String(item.title || '').trim() || 'Esperienza Bajuju';
                const place = item.city || item.province || 'Luogo da definire';
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={`Apri evento ${title}`}
                    style={({ pressed }) => [styles.upcomingRow, pressed && styles.upcomingPressed]}
                    onPress={() => router.push({ pathname: '/experience-detail' as any, params: { id } })}
                  >
                    <EventCardImage uri={String(item.photo_url || '').trim()} fallback={bajujuLogo} style={styles.upcomingThumb} resizeMode="cover" />
                    <View style={styles.upcomingBody}>
                      <Text style={styles.upcomingCategory} numberOfLines={1}>
                        {getExperienceCategoryIcon(item.category)} {normalizeExperienceCategory(item.category)}
                      </Text>
                      <Text style={styles.upcomingEventTitle} numberOfLines={2}>{title}</Text>
                      <Text style={styles.upcomingMeta} numberOfLines={1}>
                        {experienceDateLabel(activityMoment(item), Boolean(item.activity_time))}
                      </Text>
                      <Text style={styles.upcomingMeta} numberOfLines={1}>{place}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.infoGrid}>
            {infoTiles.map((tile) => (
              <View key={tile.label} style={styles.infoTile}>
                <Text style={styles.infoLabel}>{tile.label}</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{tile.value}</Text>
              </View>
            ))}
          </View>

          {viewerIsAdmin && isOtherUser ? (
            // Solo admin: apre la chat "Chiedi a Bajuju" con questa persona, il messaggio arriva come Bajuju.
            <Pressable
              style={styles.adminMessageButton}
              onPress={() => router.push({ pathname: '/admin-private-chat' as any, params: { userId } })}
              accessibilityRole="button"
              accessibilityLabel="Scrivi un messaggio come Bajuju"
            >
              <Text style={styles.adminMessageButtonText}>Scrivi come Bajuju</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {canInvite ? (
          <BajujuActionBar>
            <BajujuButton
              label="WhatsApp o Telegram"
              variant="secondary"
              onPress={() => router.push({ pathname: '/share-contact' as any, params: { targetUserId: userId, activityId } })}
            />
            <BajujuButton
              label="Invita a uscire"
              onPress={() => router.push({ pathname: '/invite-out' as any, params: { targetUserId: userId, activityId } })}
            />
          </BajujuActionBar>
        ) : null}

        <BajujuPhotoViewer uri={photoViewerOpen && photo ? photo : null} onClose={() => setPhotoViewerOpen(false)} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <BajujuBackButton onPress={() => router.back()} accessibilityLabel="Indietro" />
        <BajujuProfileButton size={38} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico il profilo...</Text>
        </View>
      ) : errorText ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Profilo</Text>
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : location ? (
        <LocationProfileView
          location={location}
          isOwner={currentUserId === userId}
          canAdminEdit={viewerIsAdmin && location.managedByAdmin}
          footer={<View style={styles.locationActions}>{profileActions}</View>}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  personContent: { paddingBottom: 32 },
  cover: { height: 170, overflow: 'hidden', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  coverTopBar: { position: 'absolute', top: 52, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coverActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coverButton: { borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.94)' },
  coverButtonPlain: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  identity: { alignItems: 'center', marginTop: -66, paddingHorizontal: 22 },
  aboutBox: { marginHorizontal: 18, marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3C6DC' },
  aboutText: { fontFamily: 'FredokaMedium', fontSize: 15, lineHeight: 21, color: '#4B0C2D' },
  aboutChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  aboutChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFF0F7', fontFamily: 'FredokaSemiBold', fontSize: 12, color: '#E43F98' },
  upcomingSection: { marginHorizontal: 18, marginTop: 18, gap: 10 },
  upcomingTitle: { fontFamily: 'FredokaBold', fontSize: 18, color: '#4B0C2D' },
  upcomingRow: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3C6DC' },
  upcomingPressed: { opacity: 0.85 },
  upcomingThumb: { width: 80, height: 80, borderRadius: 14, backgroundColor: '#FFF0F7' },
  upcomingBody: { flex: 1, justifyContent: 'center', gap: 2 },
  upcomingCategory: { color: '#C2287A', fontFamily: 'FredokaSemiBold', fontSize: 12 },
  upcomingEventTitle: { color: '#4B0C2D', fontFamily: 'FredokaBold', fontSize: 16, lineHeight: 20 },
  upcomingMeta: { color: '#8D5E77', fontFamily: 'FredokaMedium', fontSize: 13 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18, marginTop: 18 },
  infoTile: {
    flexBasis: '45%',
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3C6DC',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoLabel: { fontFamily: 'FredokaSemiBold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: '#E43F98' },
  infoValue: { marginTop: 2, fontFamily: 'FredokaSemiBold', fontSize: 15, color: '#4B0C2D' },
  page: { flex: 1, backgroundColor: '#FFF9FC' },
  content: { padding: 22, paddingTop: 58 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  backText: { fontSize: 14, fontFamily: 'FredokaBold', color: '#4B0C2D' },
  center: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#4B0C2D',
    fontFamily: 'FredokaBold',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F3C6DC',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoFrame: {
    width: 132,
    height: 132,
    borderRadius: 66,
    padding: 5,
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  photoFrameBase: { borderWidth: 3, borderColor: '#e9dfe4' },
  photoFrameGreen: { borderWidth: 3, borderColor: '#2fb36d' },
  photoFrameExpert: { borderWidth: 3, borderColor: '#e44848' },
  photoFrameAdmin: { borderWidth: 3, borderColor: BAJUJU_COLORS.gold },
  photoFrameInRing: { marginBottom: 0 },
  adminRing: { marginBottom: 16 },
  adminMessageButton: {
    width: '100%',
    minHeight: 52,
    marginTop: 14,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_PINK,
  },
  adminMessageButtonText: { color: '#fff', fontSize: 15, fontFamily: 'FredokaBold' },
  photoFrameGold: { borderWidth: 3, borderColor: '#d9a441' },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 61,
    backgroundColor: '#FFF0F7',
  },
  name: {
    fontSize: 26,
    fontFamily: 'FredokaBold',
    color: '#4B0C2D',
    textAlign: 'center',
    marginBottom: 12,
  },
  gradeBadge: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  gradeBadgeBase: { backgroundColor: '#ffffff', borderColor: '#e9dfe4' },
  gradeBadgeGreen: { backgroundColor: '#e8fff2', borderColor: '#b8e8cb' },
  gradeBadgeExpert: { backgroundColor: '#fff1f1', borderColor: '#f0b9b9' },
  gradeBadgeAdmin: { backgroundColor: '#ffe3f0', borderColor: '#ffc3df' },
  gradeBadgeGold: { backgroundColor: '#fff7db', borderColor: '#ead58a' },
  gradeText: {
    fontSize: 14,
    fontFamily: 'FredokaBold',
    color: '#8D5E77',
  },
  premiumBadge: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    marginBottom: 8,
    backgroundColor: '#f4eaff',
    borderWidth: 1,
    borderColor: '#cfa8f4',
  },
  premiumBadgeText: {
    color: '#6e31a8',
    fontSize: 13,
    fontFamily: 'FredokaBold',
  },
  gradeHint: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'FredokaBold',
    color: '#8D5E77',
    textAlign: 'center',
  },
  premiumHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'FredokaBold',
    color: '#6e31a8',
    textAlign: 'center',
  },
  locationActions: { alignItems: 'center' },
  reportUserButton: {
    marginTop: 16,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFF0F7',
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  reportUserText: {
    color: '#4B0C2D',
    fontSize: 13,
    fontFamily: 'FredokaBold',
  },
  blockUserButton: {
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  blockUserText: {
    color: '#8D5E77',
    fontSize: 13,
    fontFamily: 'FredokaBold',
  },
  blacklistButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#1c1c1c',
  },
  blacklistButtonActive: {
    backgroundColor: '#ffffff',
  },
  blacklistText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'FredokaBold',
  },
  blacklistTextActive: {
    color: '#111111',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F3C6DC',
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 30,
    fontFamily: 'FredokaBold',
    color: '#E43F98',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'FredokaBold',
    color: '#4B0C2D',
    textAlign: 'center',
  },
  sectionTitle: {
    width: '100%',
    fontSize: 20,
    fontFamily: 'FredokaBold',
    color: '#E43F98',
    marginBottom: 14,
  },
  infoBox: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#FFF9FC',
    borderWidth: 1,
    borderColor: '#F3C6DC',
    padding: 14,
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontFamily: 'FredokaBold',
    color: '#4B0C2D',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontFamily: 'FredokaBold',
    color: '#4B0C2D',
  },
  errorTitle: {
    fontSize: 22,
    fontFamily: 'FredokaBold',
    color: '#E43F98',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'FredokaBold',
    color: '#8D5E77',
    textAlign: 'center',
  },
});
