import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
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

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.auth.getUser();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      router.replace('/');
      return;
    }

    setUserInfo({
      id: data.user.id,
      email: data.user.email || 'Email non disponibile',
    });

    setLoading(false);
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
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Torna alla Home</Text>
        </Pressable>

        <View style={styles.logoBox}>
          <Text style={styles.logoText}>Profilo</Text>
          <Text style={styles.subtitle}>Il tuo account Bajuju Mobile</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarText}>
              {userInfo?.email?.charAt(0).toUpperCase() || 'B'}
            </Text>
          </View>

          <Text style={styles.title}>Profilo personale</Text>
          <Text style={styles.description}>
            Questa schermata legge l’utente reale collegato a Supabase.
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{userInfo?.email}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>User ID Supabase</Text>
            <Text style={styles.infoValueSmall}>{userInfo?.id}</Text>
          </View>

          {!!message && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Errore</Text>
              <Text style={styles.errorText}>{message}</Text>
            </View>
          )}

          <View style={styles.nextBox}>
            <Text style={styles.nextTitle}>Prossimo step</Text>
            <Text style={styles.nextText}>
              Dopo questa base collegheremo i dati reali della tabella profili:
              nickname, città, foto profilo, descrizione, interessi e cosa non mi piace.
            </Text>
          </View>

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
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#8b5a2b',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 38,
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
  nextBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fbf7ef',
    borderWidth: 1,
    borderColor: '#eadcc9',
    marginTop: 6,
    marginBottom: 18,
  },
  nextTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 6,
  },
  nextText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7b6653',
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