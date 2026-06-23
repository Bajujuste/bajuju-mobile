import React from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { supabase } from '../src/lib/supabase';

export default function HomeScreen() {
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>Bajuju</Text>
          <Text style={styles.subtitle}>Di persona è meglio</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Home Bajuju Mobile</Text>
          <Text style={styles.description}>
            App mobile collegata allo stesso Supabase del sito bajuju.it.
          </Text>

          <View style={styles.homeGrid}>
            <Pressable style={styles.homeCard} onPress={() => router.push('/flash')}>
              <Text style={styles.homeIcon}>⚡</Text>
              <Text style={styles.homeTitle}>Bajuju Flash</Text>
              <Text style={styles.homeText}>
                Tutto può iniziare in pochi minuti.
              </Text>
            </Pressable>

            <Pressable style={styles.homeCard} onPress={() => router.push('/experiences')}>
              <Text style={styles.homeIcon}>🔎</Text>
              <Text style={styles.homeTitle}>Trova esperienza</Text>
              <Text style={styles.homeText}>
                Cerca attività dal vivo nella tua zona.
              </Text>
            </Pressable>

            <Pressable
              style={styles.homeCard}
              onPress={() => router.push('/create-experience')}
            >
              <Text style={styles.homeIcon}>➕</Text>
              <Text style={styles.homeTitle}>Crea esperienza</Text>
              <Text style={styles.homeText}>
                Organizza qualcosa da vivere insieme.
              </Text>
            </Pressable>

            <Pressable style={styles.homeCard} onPress={() => router.push('/profile')}>
              <Text style={styles.homeIcon}>👤</Text>
              <Text style={styles.homeTitle}>Profilo</Text>
              <Text style={styles.homeText}>
                Vedi il tuo account e i dati collegati a Supabase.
              </Text>
            </Pressable>
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
    justifyContent: 'center',
    padding: 24,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 46,
    fontWeight: '900',
    color: '#8b5a2b',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '700',
    color: '#b58a4a',
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
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7b6653',
    marginBottom: 24,
  },
  homeGrid: {
    gap: 12,
    marginBottom: 18,
  },
  homeCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#eadcc9',
  },
  homeIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  homeTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#5a3821',
    marginBottom: 4,
  },
  homeText: {
    fontSize: 13,
    color: '#7b6653',
    lineHeight: 18,
  },
  logoutButton: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#5a3821',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
});