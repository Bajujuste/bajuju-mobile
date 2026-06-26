import React from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

export default function HomeScreen() {
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.topProfileButton} onPress={() => router.push('/profile')}>
            <Text style={styles.topProfileIcon}>👤</Text>
          </Pressable>

          <View style={styles.logoCard}>
            <Image source={bajujuLogo} style={styles.logoImage} resizeMode="contain" />
          </View>

          <Text style={styles.claim}>Dal Vivo è Meglio</Text>

          <Text style={styles.introText}>
            Trova o crea esperienze dal vivo con persone vicino a te.
          </Text>
        </View>

        <View style={styles.mainCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>Cosa vuoi fare oggi?</Text>
            <Text style={styles.sectionTitle}>Trova o crea esperienze dal vivo</Text>
          </View>

          <View style={styles.primaryActions}>
            <Pressable
              style={[styles.homeCard, styles.primaryCard]}
              onPress={() => router.push('/experiences')}
            >
              <Text style={styles.homeIcon}>🔎</Text>
              <Text style={styles.primaryLabel}>Voglio partecipare</Text>
              <Text style={styles.primaryTitle}>Trova</Text>
              <Text style={styles.homeText}>
                Scopri esperienze, uscite e attività dal vivo nella tua zona.
              </Text>
            </Pressable>

            <Pressable
              style={[styles.homeCard, styles.primaryCard]}
              onPress={() => router.push('/create-experience')}
            >
              <Text style={styles.homeIcon}>➕</Text>
              <Text style={styles.primaryLabel}>Voglio proporre</Text>
              <Text style={styles.primaryTitle}>Crea</Text>
              <Text style={styles.homeText}>
                Proponi qualcosa da fare e lascia che altre persone si uniscano.
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.homeCard, styles.flashMainCard]}
            onPress={() => router.push('/flash')}
          >
            <View style={styles.flashTopRow}>
              <Text style={styles.homeIcon}>⚡</Text>
              <Text style={styles.flashBadge}>Extra</Text>
            </View>

            <Text style={styles.flashMainTitle}>Flash</Text>
            <Text style={styles.homeText}>
              Per organizzare qualcosa subito, in modo veloce.
            </Text>
          </Pressable>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Bajuju ti fa fare esperienze dal vivo</Text>
            <Text style={styles.infoText}>
              Bajuju serve per creare e trovare cose da fare dal vivo: una passeggiata, una pizza, sport, musei, eventi e nuove persone da conoscere in modo semplice.
            </Text>
          </View>

          <View style={styles.pillsBox}>
            <Text style={styles.infoTitle}>Idee per iniziare</Text>

            <View style={styles.pillsRow}>
              <Text style={styles.pill}>Passeggiate</Text>
              <Text style={styles.pill}>Pizza</Text>
              <Text style={styles.pill}>Aperitivo</Text>
              <Text style={styles.pill}>Sport</Text>
              <Text style={styles.pill}>Eventi</Text>
              <Text style={styles.pill}>Musei</Text>
            </View>
          </View>

          <View style={styles.footerBox}>
            <View style={styles.legalLinksRow}>
              <Pressable
                style={styles.legalButton}
                onPress={() => router.push('/community-rules' as any)}
              >
                <Text style={styles.legalButtonText}>Regole community</Text>
              </Pressable>

              <Pressable
                style={styles.legalButton}
                onPress={() => router.push('/privacy' as any)}
              >
                <Text style={styles.legalButtonText}>Privacy Policy</Text>
              </Pressable>
            </View>

            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutText}>Esci dall’account</Text>
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
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 18,
    paddingBottom: 32,
    backgroundColor: '#fff8fb',
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
    paddingTop: 4,
  },
  topProfileButton: {
    position: 'absolute',
    top: 4,
    right: 2,
    zIndex: 10,
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e43f98',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  topProfileIcon: {
    fontSize: 21,
  },

  logoCard: {
    width: '100%',
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#e43f98',
    shadowColor: '#e43f98',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  logoImage: {
    width: 280,
    height: 140,
  },
  claim: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '900',
    color: '#e43f98',
    textAlign: 'center',
  },
  introText: {
    marginTop: 10,
    paddingHorizontal: 10,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#6b3652',
    textAlign: 'center',
  },
  mainCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionHeader: {
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  sectionEyebrow: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#e43f98',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },

  primaryActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  primaryCard: {
    flex: 1,
    minHeight: 150,
    backgroundColor: '#ffffff',
    borderColor: '#ef2d82',
    borderWidth: 2,
    padding: 16,
    justifyContent: 'flex-start',
  },
  primaryLabel: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginTop: 8,
    overflow: 'hidden',
  },

  primaryTitle: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 25,
    fontWeight: '900',
    color: '#e43f98',
    letterSpacing: -0.4,
  },

  flashMainCard: {
    backgroundColor: '#fff0f7',
    borderColor: '#ef2d82',
    borderWidth: 2,
    marginBottom: 12,
    padding: 18,
  },
  flashTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  flashBadge: {
    backgroundColor: '#e43f98',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  flashMainTitle: {
    color: '#ef2d82',
    fontSize: 25,
    fontWeight: '900',
    marginBottom: 7,
  },
  grid: {
    gap: 10,
  },
  homeCard: {
    borderRadius: 22,
    padding: 15,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  homeIcon: {
    fontSize: 25,
  },
  homeTitle: {
    marginTop: 5,
    marginBottom: 4,
    fontSize: 16,
    fontWeight: '900',
    color: '#e43f98',
  },
  homeText: {
    fontSize: 13,
    color: '#6b3652',
    lineHeight: 18,
    fontWeight: '600',
  },
  infoBox: {
    marginTop: 14,
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 7,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: '#6b3652',
  },
  pillsBox: {
    marginTop: 14,
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  pill: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f7b8d6',
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '800',
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 999,
    overflow: 'hidden',
  },
  footerBox: {
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#ffe2ef',
  },

  legalLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 22,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  legalButton: {
    borderWidth: 1,
    borderColor: '#ffd3e7',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: '#ffffff',
  },
  legalButtonText: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '700',
  },
  logoutButton: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutText: {
    color: '#b36a91',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
