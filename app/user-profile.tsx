import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';

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

function organizerGrade(count: number) {
  if (count > 20) return 'Organizzatore top';
  if (count > 10) return 'Organizzatore esperto';
  if (count > 5) return 'Organizzatore attivo';
  return 'Organizzatore base';
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
    ['admin', 'master', 'superadmin'].includes(firstText(profile, ['role', 'ruolo', 'user_role'], '').toLowerCase())
  );
}

function organizerGradeHint(count: number) {
  if (count > 20) return 'Ha organizzato molte esperienze Bajuju.';
  if (count > 10) return 'Ha già una buona esperienza come organizzatore.';
  if (count > 5) return 'Partecipa attivamente alla vita della community.';
  return 'Sta iniziando il suo percorso su Bajuju.';
}

async function safeFetchRows(table: string, column: string, userId: string) {
  const result = await supabase
    .from(table)
    .select('id,activity_id,deleted_at')
    .eq(column, userId)
    .is('deleted_at', null);

  if (result.error || !result.data) return [];

  return result.data as LooseRow[];
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
  const [organizedCount, setOrganizedCount] = useState(0);
  const [participatedCount, setParticipatedCount] = useState(0);
  const [errorText, setErrorText] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErrorText('');

    try {
      if (!userId) {
        setErrorText('Profilo non trovato.');
        return;
      }

      let loadedProfile: LooseRow | null = null;

      const byId = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!byId.error && byId.data) {
        loadedProfile = byId.data;
      }

      if (!loadedProfile) {
        setErrorText('Profilo non trovato.');
        return;
      }

      setProfile(loadedProfile);

      const profileId = String(loadedProfile.id || userId).trim();
      const profileUserId = profileId;

      const organizedIds = new Set<string>();

      const organizedByCreatorId = await safeFetchRows('activities', 'creator_id', profileId || profileUserId);
      organizedByCreatorId.forEach((row) => {
        if (row.id) organizedIds.add(String(row.id));
      });

      setOrganizedCount(organizedIds.size);

      const participatedRows = await safeFetchParticipantRows(profileUserId);
      const participatedIds = new Set<string>();

      participatedRows.forEach((row) => {
        const activityId = String(row.activity_id || '').trim();
        if (activityId && !organizedIds.has(activityId)) {
          participatedIds.add(activityId);
        }
      });

      setParticipatedCount(participatedIds.size);
    } catch (error: any) {
      setErrorText(error?.message || 'Errore durante il caricamento del profilo.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const name = firstText(profile, ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'], 'Utente Bajuju');
  const city = firstText(profile, ['city', 'citta', 'comune', 'location_city'], '');
  const age = firstText(profile, ['age', 'eta', 'età', 'user_age', 'age_range', 'fascia_eta', 'age_band', 'eta_range'], '');
  const gender = firstText(profile, ['gender', 'genere'], '');
  const photo = firstPhoto(profile);
  const isCreator = isCreatorProfile(profile);
  const isAdmin = isAdminProfile(profile);
  const isAdminOrCreator = isCreator || isAdmin;
  const grade = isCreator ? 'Creatore app' : isAdmin ? 'Admin' : organizerGrade(organizedCount);

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
            <View
              style={[
                styles.photoFrame,
                organizedCount > 20
                  ? styles.photoFrameGold
                  : organizedCount > 10
                    ? styles.photoFrameStrong
                    : organizedCount > 5
                      ? styles.photoFrameGreen
                      : styles.photoFrameBase,
              ]}
            >
              <Image source={photo ? { uri: photo } : bajujuLogo} style={styles.photo} resizeMode="cover" />
            </View>

            <Text style={styles.name}>{name}</Text>

            <View
              style={[
                styles.gradeBadge,
                  isAdminOrCreator
                    ? styles.gradeBadgeAdmin
                    : organizedCount > 20
                      ? styles.gradeBadgeGold
                      : organizedCount > 10
                        ? styles.gradeBadgeStrong
                        : organizedCount > 5
                          ? styles.gradeBadgeGreen
                          : styles.gradeBadgeBase,
              ]}
            >
              <Text style={styles.gradeText}>{grade}</Text>
            </View>

            <Text style={styles.gradeHint}>{isAdminOrCreator ? 'Profilo ufficiale Bajuju' : organizerGradeHint(organizedCount)}</Text>
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
              <Text style={styles.label}>Città</Text>
              <Text style={styles.value}>{city || 'Non indicata'}</Text>
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
  photoFrameBase: { borderWidth: 3, borderColor: '#ffffff' },
  photoFrameGreen: { borderWidth: 3, borderColor: '#2fb36d' },
  photoFrameStrong: { borderWidth: 3, borderColor: '#e44848' },
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
  },
  gradeBadgeBase: { backgroundColor: '#fff0f7' },
  gradeBadgeGreen: { backgroundColor: '#e8fff2' },
  gradeBadgeStrong: { backgroundColor: '#fff1f1' },
  gradeBadgeAdmin: { backgroundColor: '#ffe3f0' },
  gradeBadgeGold: { backgroundColor: '#fff7db' },
  gradeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9b1f61',
  },
  gradeHint: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#6b3652',
    textAlign: 'center',
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
