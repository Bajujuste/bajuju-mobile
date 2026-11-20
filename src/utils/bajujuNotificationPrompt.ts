import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Linking } from 'react-native';

import { supabase } from '../lib/supabase';
import { refreshBajujuNotificationLocation } from './bajujuNotificationLocation';
import { getBajujuPushPermission, registerForBajujuPushNotifications } from './bajujuNotifications';

export function bajujuNotificationChoiceKey(userId: string) {
  return `bajuju-notification-choice-v2:${userId}`;
}

// Registra il telefono per le push e aggiorna la posizione per gli eventi vicini.
export async function activateBajujuNotificationServices(userId: string) {
  const registerResult = await registerForBajujuPushNotifications(userId);
  if (!registerResult.ok) console.log('Attivazione notifiche non completata.');

  const locationResult = await refreshBajujuNotificationLocation(userId);
  if (!locationResult.ok) console.log('Posizione per notifiche vicine non aggiornata.');
}

// L'utente ha premuto "Attiva notifiche" in uno dei nostri avvisi:
// salva la scelta e, se il telefono non chiede più il permesso, apre le impostazioni.
export async function enableBajujuNotificationsFromPrompt(userId: string) {
  await AsyncStorage.setItem(bajujuNotificationChoiceKey(userId), 'accepted');
  const saveResult = await supabase.from('notification_preferences').upsert(
    { user_id: userId, enabled: true, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (saveResult.error) console.log('Preferenza notifiche Sì non salvata su Supabase.');

  const permission = await getBajujuPushPermission();
  if (!permission || permission.granted || permission.canAskAgain) {
    await activateBajujuNotificationServices(userId);
    return;
  }

  // Al ritorno dalle impostazioni si registra il telefono.
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    subscription.remove();
    void activateBajujuNotificationServices(userId).catch(() => null);
  });
  await Linking.openSettings();
}

const JOIN_ASK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// Dopo "Partecipa": true solo se le notifiche NON sono attive (spente in Bajuju o
// permesso del telefono negato) e non gliel'abbiamo già chiesto negli ultimi 7 giorni.
export async function shouldAskBajujuNotificationsAfterJoin(userId: string) {
  try {
    const permission = await getBajujuPushPermission();
    if (!permission) return false;

    const preference = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', userId)
      .maybeSingle();
    const enabledInDb = !preference.error && preference.data?.enabled === true;
    if (permission.granted && enabledInDb) return false;

    const askedKey = `bajuju-notification-join-ask-v1:${userId}`;
    const lastAsked = Number(await AsyncStorage.getItem(askedKey));
    if (lastAsked && Date.now() - lastAsked < JOIN_ASK_INTERVAL_MS) return false;
    await AsyncStorage.setItem(askedKey, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}
