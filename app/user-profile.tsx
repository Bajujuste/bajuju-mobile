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

import { supabase } from '../src/lib/supabase';
import {
  effectiveOrganizerGrade,
  organizerGradeHint,
} from '../src/utils/organizerGrade';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

const BAJUJU_CREATOR_EMAIL = 'royaleventi@gmail.com';
const BAJUJU_PINK = '#e43f98';

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
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = String(params.userId || '').trim();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<LooseRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [reportingUser, setReportingUser] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [organizedCount, setOrganizedCount] = useState(0);
  const [participatedCount, setParticipatedCount] = useState(0);
  const [errorText, setErrorText] = useState('');

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
        setErrorText('Profilo non trovato.');
        return;
      }

      const loadedProfile = byId.data as LooseRow;
      setProfile(loadedProfile);

      const profileId = String(loadedProfile.id || userId).trim();
      const organizedIds = await fetchOrganizedExperienceIds(profileId);
      setOrganizedCount(organizedIds.size);

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
        'L’utente è stato bloccato. Non potrà più interagire con te e non riceverà notifiche relative alle tue attività.'
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

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Indietro</Text>
      </Pressable>

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
      ) : (
        <>
          <View style={styles.card}>
            <View style={[styles.photoFrame, photoFrameStyle]}>
              <Image
                source={photo ? { uri: photo } : bajujuLogo}
                style={styles.photo}
                resizeMode="cover"
              />
            </View>

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

            {currentUserId && currentUserId !== userId ? (
              <>
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
              </>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{organizedCount}</Text>
              <Text style={styles.statLabel}>Eventi organizzati</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{participatedCount}</Text>
              <Text style={styles.statLabel}>Eventi partecipati</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Informazioni</Text>

            <View style={styles.infoBox}>
              <Text style={styles.label}>Di dove sei</Text>
              <Text style={styles.value}>{homeCity || 'Non indicato'}</Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.label}>Età</Text>
              <Text style={styles.value}>{age || 'Non indicata'}</Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.label}>Genere</Text>
              <Text style={styles.value}>{gender || 'Non indicato'}</Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff8fb' },
  content: { padding: 22, paddingTop: 58 },
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
  backText: { fontSize: 14, fontWeight: '900', color: '#9b1f61' },
  center: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#9b1f61',
    fontWeight: '800',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
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
  photoFrameAdmin: { borderWidth: 3, borderColor: BAJUJU_PINK },
  photoFrameGold: { borderWidth: 3, borderColor: '#d9a441' },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 61,
    backgroundColor: '#fff0f7',
  },
  name: {
    fontSize: 28,
    fontWeight: '900',
    color: '#e43f98',
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
    fontWeight: '900',
    color: '#6b3652',
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
    fontWeight: '900',
  },
  gradeHint: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#6b3652',
    textAlign: 'center',
  },
  premiumHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#6e31a8',
    textAlign: 'center',
  },
  reportUserButton: {
    marginTop: 16,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  reportUserText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
  },
  blockUserButton: {
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  blockUserText: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '900',
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
    borderColor: '#ffd3e7',
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 30,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#9b1f61',
    textAlign: 'center',
  },
  sectionTitle: {
    width: '100%',
    fontSize: 20,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 14,
  },
  infoBox: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    padding: 14,
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9b1f61',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '800',
    color: '#5f2445',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6b3652',
    textAlign: 'center',
  },
});
