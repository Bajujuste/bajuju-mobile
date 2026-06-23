import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';

type UserInfo = {
  id: string;
  email: string;
};

type ProfileData = {
  id: string;
  nickname: string | null;
  city: string | null;
  area: string | null;
  bio: string | null;
  dislikes: string | null;
  interests: string[] | string | null;
  avatar_url: string | null;
};

type InterestOption = {
  value: string;
  label: string;
  icon: string;
};

const interestOptions: InterestOption[] = [
  { value: 'viaggi', label: 'Viaggi', icon: '✈️' },
  { value: 'sport', label: 'Sport', icon: '⚽' },
  { value: 'musica', label: 'Musica', icon: '🎵' },
  { value: 'natura', label: 'Natura', icon: '🌳' },
  { value: 'cinema', label: 'Cinema', icon: '🎬' },
  { value: 'cucina', label: 'Cucina', icon: '🍝' },
  { value: 'aperitivi', label: 'Aperitivi', icon: '🥂' },
  { value: 'passeggiate', label: 'Passeggiate', icon: '👟' },
  { value: 'arte', label: 'Arte', icon: '🎨' },
  { value: 'libri', label: 'Libri', icon: '📚' },
  { value: 'teatro', label: 'Teatro', icon: '🎭' },
  { value: 'animali', label: 'Animali', icon: '🐾' },
  { value: 'fotografia', label: 'Fotografia', icon: '📷' },
  { value: 'giochi', label: 'Giochi', icon: '🎲' },
  { value: 'volontariato', label: 'Volontariato', icon: '🤝' },
];

function normalizeInterests(value: ProfileData['interests']) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function getInterestLabel(value: string) {
  const option = interestOptions.find((item) => item.value === value);

  if (option) {
    return `${option.icon} ${option.label}`;
  }

  return value;
}

function toSecureUrl(value: string | null | undefined) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  const cleanValue = value.trim();

  if (!cleanValue) {
    return '';
  }

  if (cleanValue.startsWith('http://')) {
    return `https://${cleanValue.slice('http://'.length)}`;
  }

  return cleanValue;
}

function getInitial(profile: ProfileData | null, userInfo: UserInfo | null) {
  const source =
    profile?.nickname ||
    userInfo?.email ||
    'B';

  return source.charAt(0).toUpperCase();
}

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [message, setMessage] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  const interests = useMemo(() => {
    return normalizeInterests(profile?.interests || null);
  }, [profile?.interests]);

  const avatarUrl = useMemo(() => {
    return toSecureUrl(profile?.avatar_url);
  }, [profile?.avatar_url]);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  async function loadProfile() {
    setLoading(true);
    setMessage('');

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setMessage(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      router.replace('/');
      return;
    }

    const nextUserInfo = {
      id: authData.user.id,
      email: authData.user.email || 'Email non disponibile',
    };

    setUserInfo(nextUserInfo);

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id,nickname,city,area,bio,dislikes,interests,avatar_url')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      setMessage(profileError.message);
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(profileData || null);
    setLoading(false);
  }

  async function refreshProfile() {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#8b5a2b" size="large" />
          <Text style={styles.loadingText}>Carico il profilo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshProfile} />
        }
      >
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Torna alla Home</Text>
        </Pressable>

        <View style={styles.logoBox}>
          <Text style={styles.logoText}>Profilo</Text>
          <Text style={styles.subtitle}>Il tuo profilo Bajuju reale</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.avatarBox}>
            {avatarUrl && !avatarFailed ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <Text style={styles.avatarText}>
                {getInitial(profile, userInfo)}
              </Text>
            )}
          </View>

          <Text style={styles.title}>
            {profile?.nickname || 'Profilo personale'}
          </Text>

          <Text style={styles.description}>
            Dati letti dalla tabella reale profili di Supabase.
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{userInfo?.email}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Nickname</Text>
            <Text style={styles.infoValue}>
              {profile?.nickname || 'Non indicato'}
            </Text>
          </View>

          <View style={styles.twoColumns}>
            <View style={styles.halfInfoBox}>
              <Text style={styles.infoLabel}>Comune / città</Text>
              <Text style={styles.infoValue}>
                {profile?.city || 'Non indicato'}
              </Text>
            </View>

            <View style={styles.halfInfoBox}>
              <Text style={styles.infoLabel}>Zona / area</Text>
              <Text style={styles.infoValue}>
                {profile?.area || 'Non indicata'}
              </Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Descrizione</Text>
            <Text style={styles.longValue}>
              {profile?.bio || 'Nessuna descrizione inserita.'}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Interessi</Text>

            {interests.length > 0 ? (
              <View style={styles.interestsBox}>
                {interests.map((interest) => (
                  <View key={interest} style={styles.interestPill}>
                    <Text style={styles.interestText}>
                      {getInterestLabel(interest)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.longValue}>Nessun interesse inserito.</Text>
            )}
          </View>

          <View style={styles.dislikeBox}>
            <Text style={styles.infoLabel}>👎 Cosa non mi piace</Text>
            <Text style={styles.longValue}>
              {profile?.dislikes || 'Non indicato.'}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>User ID Supabase</Text>
            <Text style={styles.infoValueSmall}>{userInfo?.id}</Text>
          </View>

          {!profile && !message && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Profilo non ancora compilato</Text>
              <Text style={styles.warningText}>
                L’account esiste, ma nella tabella profili non ho trovato ancora dati salvati.
              </Text>
            </View>
          )}

          {!!message && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Errore</Text>
              <Text style={styles.errorText}>{message}</Text>
            </View>
          )}

          <Pressable style={styles.refreshButton} onPress={refreshProfile}>
            <Text style={styles.refreshText}>Aggiorna profilo</Text>
          </Pressable>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Esci</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fbf7ef',
  },
  container: {
    flexGrow: 1,
    padding: 24,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '800',
    color: '#8b5a2b',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#eadcc9',
  },
  backText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8b5a2b',
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#8b5a2b',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#b58a4a',
    textAlign: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadcc9',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  avatarBox: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#8b5a2b',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 96,
    height: 96,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '900',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7b6653',
    marginBottom: 24,
    textAlign: 'center',
  },
  infoBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#eadcc9',
    marginBottom: 12,
  },
  twoColumns: {
    gap: 12,
    marginBottom: 12,
  },
  halfInfoBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#eadcc9',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#5a3821',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3a2415',
  },
  infoValueSmall: {
    fontSize: 12,
    color: '#6d5847',
    lineHeight: 18,
  },
  longValue: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6d5847',
  },
  interestsBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestPill: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadcc9',
  },
  interestText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5a3821',
  },
  dislikeBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fff4f1',
    borderWidth: 1,
    borderColor: '#f0b8aa',
    marginBottom: 12,
  },
  warningBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fbf7ef',
    borderWidth: 1,
    borderColor: '#eadcc9',
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: '#6d5847',
    lineHeight: 19,
  },
  errorBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fff4f1',
    borderWidth: 1,
    borderColor: '#f0b8aa',
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#6d5847',
    lineHeight: 19,
  },
  refreshButton: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#8b5a2b',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  refreshText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  logoutButton: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#5a3821',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
});