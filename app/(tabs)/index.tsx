import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../../src/lib/supabase';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');

export default function WelcomeScreen() {
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    checkExistingSession();
  }, []);

  async function checkExistingSession() {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      router.replace('/home');
      return;
    }

    setCheckingSession(false);
  }

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#e43f98" size="large" />
          <Text style={styles.loadingText}>Apro Bajuju...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.logoCircle}>
            <Image source={bajujuLogo} style={styles.logoImage} resizeMode="contain" />
          </View>

          <Text style={styles.brand}>Bajuju</Text>
          <Text style={styles.claim}>Dal Vivo è Meglio</Text>

          <Text style={styles.description}>
            Trova esperienze, partecipa e conosci persone reali nella tua zona.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/login')}>
              <Text style={styles.primaryButtonText}>Accedi</Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={() => router.push('/register')}>
              <Text style={styles.secondaryButtonText}>Registrati</Text>
            </Pressable>
          </View>

          <Text style={styles.footerText}>
            Gratis per tutti · Community dal vivo · Bajuju Mobile
          </Text>

          <View style={styles.legalLinks}>
            <Pressable onPress={() => router.push('/privacy')}>
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </Pressable>

            <Text style={styles.legalSeparator}>·</Text>

            <Pressable onPress={() => router.push('/rules')}>
              <Text style={styles.legalLinkText}>Regole Bajuju</Text>
            </Pressable>
          </View>
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
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff8fb',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '900',
    color: '#e43f98',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: '#fff8fb',
  },
  heroCard: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 34,
    paddingVertical: 34,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    shadowColor: '#e43f98',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  logoCircle: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#fff0f7',
    borderWidth: 2,
    borderColor: '#ffc2df',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    overflow: 'hidden',
  },
  logoImage: {
    width: 205,
    height: 205,
  },
  brand: {
    fontSize: 48,
    fontWeight: '900',
    color: '#e43f98',
    letterSpacing: -0.8,
  },
  claim: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900',
    color: '#e43f98',
  },
  description: {
    marginTop: 16,
    maxWidth: 310,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    color: '#6b3652',
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    marginTop: 28,
    gap: 12,
  },
  primaryButton: {
    height: 54,
    borderRadius: 20,
    backgroundColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  secondaryButton: {
    height: 54,
    borderRadius: 20,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#e43f98',
    fontSize: 17,
    fontWeight: '900',
  },
  footerText: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    color: '#9b1f61',
    textAlign: 'center',
  },
  legalLinks: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  legalLinkText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#e43f98',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9b1f61',
  },
});
