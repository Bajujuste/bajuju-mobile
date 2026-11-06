import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { getUsableDevicePosition, isUsableCoordinates } from './bajujuDeviceLocation';

const LAST_KNOWN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 5000;

export async function refreshBajujuNotificationLocation(
  userId: string,
  options?: { requestPermission?: boolean }
) {
  try {
    const requestPermission = options?.requestPermission ?? true;
    const existingPermission = await Location.getForegroundPermissionsAsync();
    let status = existingPermission.status;

    if (status !== 'granted' && requestPermission && existingPermission.canAskAgain) {
      const requestedPermission = await Location.requestForegroundPermissionsAsync();
      status = requestedPermission.status;
    }

    if (status !== 'granted') {
      return { ok: false, reason: 'Permesso posizione non concesso.' };
    }

    // Scarta la posizione finta 0,0 che alcuni Android restituiscono.
    const position = await getUsableDevicePosition({
      maxAgeMs: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
    });

    if (!position) {
      return { ok: false, reason: 'Coordinate non valide.' };
    }

    const { latitude, longitude } = position;

    const result = await supabase.from('notification_preferences').upsert(
      {
        user_id: userId,
        latitude,
        longitude,
        location_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (result.error) {
      return { ok: false, reason: result.error.message };
    }

    return { ok: true, latitude, longitude };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function saveBajujuNotificationCoordinatesIfEnabled(
  userId: string,
  coordinates: { latitude: number; longitude: number }
) {
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (!userId || !isUsableCoordinates(latitude, longitude)) {
    return { ok: false, reason: 'Coordinate non valide.' };
  }

  const preferenceResult = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (preferenceResult.error) {
    return { ok: false, reason: preferenceResult.error.message };
  }

  // Se l'utente le ha disattivate esplicitamente non riattiviamo nulla.
  // Se invece la riga non esiste ancora, la creiamo: i default DB mantengono
  // le preferenze standard e consentono il targeting geografico entro 25 km.
  if (preferenceResult.data?.enabled === false) {
    return { ok: false, reason: 'Notifiche Bajuju disattivate.' };
  }

  const result = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userId,
        latitude,
        longitude,
        location_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (result.error) return { ok: false, reason: result.error.message };
  return { ok: true, latitude, longitude };
}
