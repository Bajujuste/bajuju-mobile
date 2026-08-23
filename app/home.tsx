import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { BajujuHomeView, HomeGroupPreview } from '../src/components/home/BajujuHomeView';
import { loadBajujuGroups } from '../src/lib/bajujuGroups';
import { supabase } from '../src/lib/supabase';
import { trackBajujuEvent } from '../src/utils/bajujuAnalytics';
import { refreshBajujuNotificationLocation } from '../src/utils/bajujuNotificationLocation';
import { shareBajujuHome } from '../src/utils/shareBajuju';
import {
  refreshBajujuPushRegistrationIfAuthorized,
  registerForBajujuPushNotifications,
} from '../src/utils/bajujuNotifications';

type ProfileRow = Record<string, unknown>;
type HomeActivityRow = {
  id?: string;
  creator_id?: string | null;
  title?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
};

type NextExperience = {
  id: string;
  title: string;
  meta: string;
  organizedByMe: boolean;
};

function firstText(row: ProfileRow | null, keys: string[], fallback = '') {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function activityMoment(row: HomeActivityRow) {
  if (!row.activity_date) return null;
  const date = new Date(`${row.activity_date}T${row.activity_time || '23:59'}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextExperienceMeta(row: HomeActivityRow) {
  const date = activityMoment(row);
  const dateLabel = date
    ? date.toLocaleString('it-IT', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Data da definire';

  return [row.city || row.province || '', dateLabel].filter(Boolean).join(' · ');
}

export default function HomeScreen() {
  const notificationPromptRunningRef = useRef(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [nextExperience, setNextExperience] = useState<NextExperience | null>(null);
  const [groups, setGroups] = useState<HomeGroupPreview[]>([]);

  useEffect(() => {
    let active = true;

    async function activateNotificationServices(userId: string) {
      const registerResult = await registerForBajujuPushNotifications(userId);
      if (!registerResult.ok) console.log('Attivazione notifiche non completata.');

      const locationResult = await refreshBajujuNotificationLocation(userId);
      if (!locationResult.ok) console.log('Posizione per notifiche vicine non aggiornata.');
    }

    async function setupBajujuNotifications() {
      try {
        const authResult = await supabase.auth.getUser();
        if (authResult.error) throw authResult.error;

        const userId = authResult.data.user?.id;
        if (!active || !userId) return;

        const localChoiceKey = `bajuju-notification-choice-v2:${userId}`;
        const localChoice = await AsyncStorage.getItem(localChoiceKey);

        if (localChoice !== 'declined') {
          const authorizedRegistration = await refreshBajujuPushRegistrationIfAuthorized(userId);
          const authorizedLocation = await refreshBajujuNotificationLocation(userId, { requestPermission: false });

          if (authorizedRegistration.ok) await AsyncStorage.setItem(localChoiceKey, 'accepted');
          if (!authorizedLocation.ok) console.log('Posizione notifiche non aggiornata durante bootstrap Home.');
        }

        const preferenceResult = await supabase
          .from('notification_preferences')
          .select('enabled')
          .eq('user_id', userId)
          .maybeSingle();

        const notificationsEnabledInDb = !preferenceResult.error && preferenceResult.data?.enabled === true;
        if (!active) return;

        if (localChoice === 'accepted' || notificationsEnabledInDb) {
          await AsyncStorage.setItem(localChoiceKey, 'accepted');
          await activateNotificationServices(userId);
          return;
        }

        if (localChoice === 'declined' || notificationPromptRunningRef.current) return;

        notificationPromptRunningRef.current = true;
        Alert.alert(
          'Notifiche Bajuju',
          'Vuoi ricevere notifiche per nuove esperienze vicine a te, gruppi, partecipazioni e richieste?',
          [
            {
              text: 'No',
              style: 'cancel',
              onPress: () => {
                notificationPromptRunningRef.current = false;
                void (async () => {
                  await AsyncStorage.setItem(localChoiceKey, 'declined');
                  const saveResult = await supabase.from('notification_preferences').upsert(
                    { user_id: userId, enabled: false, updated_at: new Date().toISOString() },
                    { onConflict: 'user_id' }
                  );
                  if (saveResult.error) console.log('Preferenza notifiche No non salvata su Supabase.');
                })();
              },
            },
            {
              text: 'Sì',
              onPress: () => {
                notificationPromptRunningRef.current = false;
                void (async () => {
                  await AsyncStorage.setItem(localChoiceKey, 'accepted');
                  await activateNotificationServices(userId);
                })();
              },
            },
          ]
        );
      } catch {
        notificationPromptRunningRef.current = false;
        console.log('Errore registrazione notifiche Bajuju.');
      }
    }

    void setupBajujuNotifications();
    return () => { active = false; };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;

      async function refreshUnreadCount(userId: string) {
        const { count, error } = await supabase
          .from('push_notification_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false);

        if (error) throw error;
        if (active) setUnreadNotificationsCount(count || 0);
      }

      async function refreshGroups(userId: string) {
        try {
          const loadedGroups = await loadBajujuGroups(userId, { limit: 9 });
          if (!active) return;
          setGroups(
            loadedGroups.map((group) => ({
              id: group.id,
              name: group.name,
              city: group.city,
              province: group.province,
              coverUrl: group.coverUrl,
              memberCount: group.memberCount,
              joinedByMe: group.joinedByMe,
            }))
          );
        } catch (error) {
          console.log('Gruppi Home non aggiornati:', error);
          if (active) setGroups([]);
        }
      }

      async function refreshNextExperience(userId: string) {
        const today = new Date().toISOString().slice(0, 10);

        const [organizedResult, participationResult] = await Promise.all([
          supabase
            .from('activities')
            .select('id,creator_id,title,city,province,activity_date,activity_time')
            .eq('creator_id', userId)
            .eq('is_flash', false)
            .is('deleted_at', null)
            .gte('activity_date', today)
            .order('activity_date', { ascending: true })
            .order('activity_time', { ascending: true })
            .limit(20),
          supabase
            .from('activity_participants')
            .select('activity_id,status')
            .eq('user_id', userId)
            .neq('status', 'annullato')
            .limit(100),
        ]);

        const rows: HomeActivityRow[] = organizedResult.error
          ? []
          : ((organizedResult.data || []) as HomeActivityRow[]);

        const participantIds = participationResult.error
          ? []
          : Array.from(new Set((participationResult.data || []).map((row: any) => String(row.activity_id || '')).filter(Boolean)));

        if (participantIds.length > 0) {
          const joinedResult = await supabase
            .from('activities')
            .select('id,creator_id,title,city,province,activity_date,activity_time')
            .in('id', participantIds)
            .eq('is_flash', false)
            .is('deleted_at', null)
            .gte('activity_date', today)
            .limit(100);

          if (!joinedResult.error) rows.push(...((joinedResult.data || []) as HomeActivityRow[]));
        }

        const unique = new Map<string, HomeActivityRow>();
        rows.forEach((row) => {
          const id = String(row.id || '');
          if (id) unique.set(id, row);
        });

        const now = Date.now();
        const next = Array.from(unique.values())
          .filter((row) => {
            const moment = activityMoment(row);
            return Boolean(moment && moment.getTime() >= now);
          })
          .sort((a, b) => (activityMoment(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (activityMoment(b)?.getTime() || Number.MAX_SAFE_INTEGER))[0];

        if (!active) return;

        if (!next?.id) {
          setNextExperience(null);
          return;
        }

        setNextExperience({
          id: String(next.id),
          title: String(next.title || 'Esperienza Bajuju'),
          meta: nextExperienceMeta(next),
          organizedByMe: String(next.creator_id || '') === userId,
        });
      }

      void (async () => {
        try {
          const authResult = await supabase.auth.getUser();
          if (authResult.error) throw authResult.error;

          const userId = authResult.data.user?.id;
          if (!userId || !active) {
            if (active) {
              setUnreadNotificationsCount(0);
              setNextExperience(null);
              setGroups([]);
            }
            return;
          }

          void trackBajujuEvent('home_open');

          const registrationResult = await refreshBajujuPushRegistrationIfAuthorized(userId);
          if (!registrationResult.ok) console.log('Token push non aggiornato al focus Home.');

          const locationResult = await refreshBajujuNotificationLocation(userId, { requestPermission: false });
          if (!locationResult.ok) console.log('Posizione notifiche non aggiornata al focus Home.');

          await Promise.all([
            refreshUnreadCount(userId),
            refreshNextExperience(userId),
            refreshGroups(userId),
          ]);
          if (!active) return;

          channel = supabase
            .channel(`bajuju-home-notifications-${userId}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'push_notification_logs', filter: `user_id=eq.${userId}` },
              () => {
                void refreshUnreadCount(userId).catch(() => console.log('Badge notifiche non aggiornato.'));
              }
            )
            .subscribe();
        } catch (error) {
          console.log('Errore aggiornamento Home:', error);
          if (active) {
            setUnreadNotificationsCount(0);
            setGroups([]);
          }
        }
      })();

      return () => {
        active = false;
        if (channel) void supabase.removeChannel(channel);
      };
    }, [])
  );

  useEffect(() => {
    let isMounted = true;

    async function loadProfilePhoto() {
      try {
        const authResult = await supabase.auth.getUser();
        if (authResult.error) throw authResult.error;

        const userId = authResult.data.user?.id;
        if (!userId) return;

        const profileResult = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profileResult.error) throw profileResult.error;
        if (!isMounted) return;

        setProfilePhotoUrl(
          firstText(
            profileResult.data as ProfileRow | null,
            ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto'],
            ''
          )
        );
      } catch {
        console.log('Errore caricamento foto profilo.');
        if (isMounted) setProfilePhotoUrl('');
      }
    }

    void loadProfilePhoto();
    return () => { isMounted = false; };
  }, []);

  async function handleLogout() {
    try {
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      router.replace('/');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Non sono riuscito a effettuare il logout.';
      Alert.alert('Errore logout', message);
    }
  }

  return (
    <BajujuHomeView
      profilePhotoUrl={profilePhotoUrl}
      unreadNotificationsCount={unreadNotificationsCount}
      nextExperience={nextExperience}
      groups={groups}
      onOpenNextExperience={() => {
        if (!nextExperience?.id) return;
        void trackBajujuEvent('next_experience_open', { activityId: nextExperience.id });
        router.push({ pathname: '/experience-detail' as any, params: { id: nextExperience.id } });
      }}
      onOpenNotifications={() => {
        void trackBajujuEvent('notification_open', { source: 'home' });
        router.push('/notifications' as any);
      }}
      onOpenProfile={() => router.push('/profile')}
      onFind={() => {
        void trackBajujuEvent('find_open', { source: 'home' });
        router.push('/experiences');
      }}
      onCreate={() => router.push('/create-experience')}
      onOpenGroups={() => router.push('/groups' as any)}
      onOpenGroup={(groupId) => {
        router.push({ pathname: '/group-detail' as any, params: { id: groupId } });
      }}
      onShare={() => { void shareBajujuHome(); }}
      onOpenRules={() => router.push('/rules' as any)}
      onOpenPrivacy={() => router.push('/privacy' as any)}
      onLogout={() => { void handleLogout(); }}
    />
  );
}