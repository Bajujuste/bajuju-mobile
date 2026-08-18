import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';

const LAST_KNOWN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 5000;

export async function refreshBajujuNotificationLocation(userId: string) {
  try {
    const currentPermission = await Location.getForegroundPermissionsAsync();
    let status = currentPermission.status;

    if (status !== Location.PermissionStatus.GRANTED && currentPermission.canAskAgain) {
      const requestedPermission = await Location.requestForegroundPermissionsAsync();
      status = requestedPermission.status;
    }

    if (status !== Location.PermissionStatus.GRANTED) {
      return {
        ok: false,
        reason: 'Permesso posizione non concesso.',
      };
    }

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
    });

    const position =
      lastKnown ||
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));

    const latitude = Number(position.coords.latitude);
    const longitude = Number(position.coords.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return {
        ok: false,
        reason: 'Coordinate non valide.',
      };
    }

    const result = await supabase.from('notification_preferences').upsert(
      {
        user_id: userId,
        latitude,
        longitude,
        location_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    );

    if (result.error) {
      return {
        ok: false,
        reason: result.error.message,
      };
    }

    return {
      ok: true,
      latitude,
      longitude,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
