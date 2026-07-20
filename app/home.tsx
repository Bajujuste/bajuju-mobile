import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { supabase } from '../src/lib/supabase';
import { shareBajujuHome } from '../src/utils/shareBajuju';
import { registerForBajujuPushNotifications } from '../src/utils/bajujuNotifications';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

type ProfileRow = Record<string, unknown>;

function firstText(row: ProfileRow | null, keys: string[], fallback = '') {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

export default function HomeScreen() {
  const notificationPromptRunningRef = useRef(false);

  React.useEffect(() => {
    let active = true;

    async function setupBajujuNotifications() {
      try {
        const authResult = await supabase.auth.getUser();

        if (authResult.error) throw authResult.error;

        const userId = authResult.data.user?.id;
        if (!active || !userId) return;

        const localChoiceKey = `bajuju-notification-choice:${userId}`;
        const localChoice = await AsyncStorage.getItem(localChoiceKey);

        if (!active || localChoice === 'accepted' || localChoice === 'declined') return;

        Alert.alert(
          'Notifiche Bajuju',
          'Vuoi ricevere notifiche per nuove esperienze, Flash, partecipazioni e richieste?',
          [
            {
              text: 'No',
              style: 'cancel',
              onPress: () => {
                void (async () => {
                  await AsyncStorage.setItem(localChoiceKey, 'declined');
                  const saveResult = await supabase.from('notification_preferences').upsert(
                    {
                      user_id: userId,
                      enabled: false,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id' }
                  );

                  if (saveResult.error) {
                    console.log('Preferenza notifiche No non salvata su Supabase.');
                  }
                })();
              },
            },
            {
              text: 'Sì',
              onPress: () => {
                void (async () => {
                  await AsyncStorage.setItem(localChoiceKey, 'accepted');
                  const registerResult = await registerForBajujuPushNotifications(userId);

                  if (!registerResult.ok) {
                    console.log('Attivazione notifiche non completata.');
                  }
                })();
              },
            },
          ]
        );
      } catch {
        console.log('Errore registrazione notifiche Bajuju.');
      }
    }

    void setupBajujuNotifications();

    return () => {
      active = false;
    };
  }, []);

  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      async function loadUnreadNotificationsCount() {
        try {
          const authResult = await supabase.auth.getUser();

          if (authResult.error) {
            throw authResult.error;
          }

          const userId = authResult.data.user?.id;

          if (userId === undefined || userId === null || active === false) {
            if (active) {
              setUnreadNotificationsCount(0);
            }
            return;
          }

          const { count, error } = await supabase
            .from('push_notification_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

          if (error) throw error;

          if (active) {
            setUnreadNotificationsCount(count || 0);
          }
        } catch (error) {
          console.log('Errore conteggio notifiche non lette:', error);

          if (active) {
            setUnreadNotificationsCount(0);
          }
        }
      }

      void loadUnreadNotificationsCount();

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    let isMounted = true;

    async function loadProfilePhoto() {
      try {
        const authResult = await supabase.auth.getUser();

        if (authResult.error) {
          throw authResult.error;
        }

        const userId = authResult.data.user?.id;

        if (!userId) return;

        const profileResult = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profileResult.error) {
          throw profileResult.error;
        }

        if (!isMounted) return;

        setProfilePhotoUrl(
          firstText(
            profileResult.data as ProfileRow | null,
          ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto'],
            ''
          )
        );
      } catch (error) {
        console.log('Errore caricamento foto profilo.');

        if (isMounted) {
          setProfilePhotoUrl('');
        }
      }
    }

    loadProfilePhoto();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogout() {
    try {
      const result = await supabase.auth.signOut();

      if (result.error) {
        throw result.error;
      }

      router.replace('/');
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a effettuare il logout.';

      Alert.alert('Errore logout', message);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.brandBlock}>
            <Image source={bajujuLogo} style={styles.brandLogo} resizeMode="contain" />

            <View>
              <Text style={styles.brandTitle}>Bajuju</Text>
            </View>
          </View>

          <Pressable
            style={styles.notificationButton}
            onPress={() => router.push('/notifications' as any)}
            accessibilityRole="button"
            accessibilityLabel="Apri notifiche"
          >
            <Text style={styles.notificationIcon}>🔔</Text>

            {unreadNotificationsCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotificationsCount > 99
                    ? '99+'
                    : unreadNotificationsCount}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable style={styles.profileButton} onPress={() => router.push('/profile')}>
            {profilePhotoUrl ? (
              <Image source={{ uri: profilePhotoUrl }} style={styles.profilePhoto} />
            ) : (
              <View style={styles.profileFallback}>
                <Text style={styles.profileFallbackText}>👤</Text>
              </View>
            )}

            <Text style={styles.profileLabel}>Profilo</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Image source={bajujuLogo} style={styles.heroLogo} resizeMode="contain" />

          <Text style={styles.heroTitle}>Dal Vivo è Meglio</Text>

          <Text style={styles.heroText}>
            Trova persone, crea esperienze e organizza qualcosa subito vicino a te.
          </Text>
        </View>

        <View style={styles.mainPanel}>
          <Text style={styles.panelEyebrow}>Cosa vuoi fare oggi?</Text>

          <View style={styles.actionsRow}>
            <Pressable
              style={styles.actionCard}
              onPress={() => router.push('/experiences')}
            >
              <View style={styles.actionIconCircle}>
                <Text style={styles.actionIcon}>🔎</Text>
              </View>

              <Text style={styles.actionSmall}>Partecipa</Text>
              <Text style={styles.actionTitle}>Trova</Text>
              <Text style={styles.actionText}>
                Guarda le esperienze disponibili e unisciti.
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionCard}
              onPress={() => router.push('/create-experience')}
            >
              <View style={styles.actionIconCircle}>
                <Text style={styles.actionIcon}>➕</Text>
              </View>

              <Text style={styles.actionSmall}>Organizza</Text>
              <Text style={styles.actionTitle}>Crea</Text>
              <Text style={styles.actionText}>
                Proponi qualcosa e invita altre persone.
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.flashCard} onPress={() => router.push('/flash')}>
            <View style={styles.flashIconBox}>
              <Text style={styles.flashIcon}>⚡</Text>
            </View>

            <View style={styles.flashContent}>
              <View style={styles.flashBadge}>
                <Text style={styles.flashBadgeText}>Subito</Text>
              </View>

              <Text style={styles.flashTitle}>Bajuju Flash</Text>
              <Text style={styles.flashDescription}>
                Fatti vedere ed esci subito.
              </Text>
            </View>
            <Text style={styles.flashArrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Con Bajuju puoi</Text>

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🤝</Text>
            <Text style={styles.infoText}>Conoscere persone facendo qualcosa dal vivo.</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoText}>Trovare esperienze vicino alla tua zona.</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={styles.infoText}>Organizzare subito con Bajuju Flash.</Text>
          </View>
        </View>

        <View style={styles.footerBox}>
          <Pressable style={styles.shareButton} onPress={shareBajujuHome}>
            <Text style={styles.shareIcon}>📲</Text>
            <Text style={styles.shareText}>Condividi Bajuju</Text>
          </Pressable>

          <View style={styles.legalLinksRow}>
            <Pressable
              style={styles.legalButton}
              onPress={() => router.push('/rules' as any)}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const PINK = '#e43f98';
const PINK_DARK = '#8f1658';
const TEXT = '#5a2842';
const MUTED = '#a95d86';
const BG = '#fff7fb';
const SOFT = '#fff2f8';
const BORDER = '#f6c6dc';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flexGrow: 1,
    padding: 15,
    paddingTop: 34,
    paddingBottom: 34,
    backgroundColor: BG,
  },
  topBar: {
    minHeight: 54,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  brandLogo: {
    width: 44,
    height: 44,
  },
  brandTitle: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
    color: PINK,
    letterSpacing: -0.5,
  },
  brandClaim: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: '900',
    color: PINK_DARK,
  },
  notificationButton: {
    width: 42,
    height: 42,
    marginRight: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: PINK,
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
    position: 'relative',
  },
  notificationIcon: {
    fontSize: 20,
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PINK,
    borderWidth: 2,
    borderColor: WHITE,
  },
  notificationBadgeText: {
    color: WHITE,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  profileButton: {
    height: 42,
    borderRadius: 999,
    paddingHorizontal: 9,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: PINK,
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  profilePhoto: {
    width: 27,
    height: 27,
    borderRadius: 999,
    backgroundColor: SOFT,
  },
  profileFallback: {
    width: 27,
    height: 27,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOFT,
  },
  profileFallbackText: {
    fontSize: 13,
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: PINK_DARK,
  },
  heroCard: {
    borderRadius: 34,
    backgroundColor: WHITE,
    padding: 15,
    marginBottom: 8,
    alignItems: 'center',
    shadowColor: PINK,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  heroBadge: {
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 4,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: PINK_DARK,
  },
  heroLogo: {
    width: 128,
    height: 92,
    marginTop: 2,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: PINK,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  heroText: {
    maxWidth: 320,
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
  },
  mainPanel: {
    borderRadius: 32,
    backgroundColor: WHITE,
    padding: 14,
    marginBottom: 8,
    shadowColor: PINK,
    shadowOpacity: 0.10,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 11 },
    elevation: 4,
  },
  panelEyebrow: {
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '900',
    color: PINK_DARK,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  actionCard: {
    flex: 1,
    minHeight: 176,
    borderRadius: 28,
    padding: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: PINK,
    shadowOpacity: 0.08,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  actionIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOFT,
    marginBottom: 8,
  },
  actionIcon: {
    fontSize: 25,
  },
  actionSmall: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: SOFT,
    color: PINK_DARK,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginBottom: 9,
  },
  actionTitle: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '900',
    color: PINK,
    letterSpacing: -0.7,
    marginBottom: 7,
  },
  actionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: TEXT,
  },
  flashCard: {
    minHeight: 116,
    borderRadius: 30,
    padding: 15,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
  },
  flashIconBox: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
    marginRight: 13,
  },
  flashIcon: {
    fontSize: 28,
  },
  flashContent: {
    flex: 1,
  },
  flashBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: PINK,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginBottom: 5,
  },
  flashBadgeText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
  },
  flashTitle: {
    fontSize: 26,
    lineHeight: 29,
    fontWeight: '900',
    color: PINK,
    letterSpacing: -0.5,
  },
  flashDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: TEXT,
  },
  flashArrow: {
    marginLeft: 8,
    fontSize: 36,
    fontWeight: '900',
    color: PINK,
  },
  infoCard: {
    borderRadius: 30,
    backgroundColor: WHITE,
    padding: 17,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  ideasCard: {
    borderRadius: 30,
    backgroundColor: WHITE,
    padding: 17,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoTitle: {
    marginBottom: 8,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    color: PINK,
    letterSpacing: -0.3,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  infoIcon: {
    width: 28,
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    color: TEXT,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    color: PINK_DARK,
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  footerBox: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 8,
  },
  shareButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: PINK,
    paddingHorizontal: 24,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    shadowColor: PINK,
    shadowOpacity: 0.22,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  shareIcon: {
    fontSize: 18,
  },
  shareText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '900',
  },
  legalLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  legalButton: {
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  legalButtonText: {
    color: PINK_DARK,
    fontSize: 13,
    fontWeight: '900',
  },
  logoutButton: {
    paddingVertical: 8,
  },
  logoutText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
