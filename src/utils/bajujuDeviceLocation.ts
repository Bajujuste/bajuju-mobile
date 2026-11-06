import * as Location from 'expo-location';

import { resolveAddressText } from '../lib/addressAutocomplete';

export type BajujuCoordinates = { latitude: number; longitude: number };

// Alcuni Android restituiscono una "ultima posizione" finta a 0,0 (in mezzo all'oceano):
// con quella ogni evento risulta a migliaia di km. La scartiamo come se non ci fosse.
export function isUsableCoordinates(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) return false;
  return true;
}

export function toUsableCoordinates(latitude: unknown, longitude: unknown): BajujuCoordinates | null {
  return isUsableCoordinates(latitude, longitude)
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;
}

// Ultima posizione valida (se recente), altrimenti una lettura nuova del GPS. Null se nessuna è valida.
export async function getUsableDevicePosition(options?: {
  maxAgeMs?: number;
  requiredAccuracy?: number;
  accuracy?: Location.Accuracy;
}): Promise<BajujuCoordinates | null> {
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: options?.maxAgeMs ?? 6 * 60 * 60 * 1000,
    ...(options?.requiredAccuracy ? { requiredAccuracy: options.requiredAccuracy } : {}),
  }).catch(() => null);
  const fromLastKnown = lastKnown ? toUsableCoordinates(lastKnown.coords.latitude, lastKnown.coords.longitude) : null;
  if (fromLastKnown) return fromLastKnown;

  // Su alcuni telefoni il GPS non risponde mai: dopo 10 secondi si passa al ripiego (città del profilo).
  const current = await Promise.race([
    Location.getCurrentPositionAsync({
      accuracy: options?.accuracy ?? Location.Accuracy.Balanced,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  return current ? toUsableCoordinates(current.coords.latitude, current.coords.longitude) : null;
}

// Coordinate della città del profilo, usate quando il telefono non dà una posizione valida.
export async function geocodeProfilePlace(city: unknown, province: unknown): Promise<BajujuCoordinates | null> {
  const place = [city, province].map((value) => String(value || '').trim()).filter(Boolean).join(', ');
  if (!place) return null;
  try {
    const [match] = await Location.geocodeAsync(`${place}, Italia`);
    const fromPhone = match ? toUsableCoordinates(match.latitude, match.longitude) : null;
    if (fromPhone) return fromPhone;
  } catch {
    // Alcuni telefoni non hanno il geocoder di sistema: proviamo con il nostro server.
  }
  try {
    const resolved = await resolveAddressText(`${place}, Italia`);
    return toUsableCoordinates(resolved.latitude, resolved.longitude);
  } catch {
    return null;
  }
}
