import * as Location from 'expo-location';

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

  const current = await Location.getCurrentPositionAsync({
    accuracy: options?.accuracy ?? Location.Accuracy.Balanced,
  });
  return toUsableCoordinates(current.coords.latitude, current.coords.longitude);
}

// Coordinate della città del profilo, usate quando il telefono non dà una posizione valida.
export async function geocodeProfilePlace(city: unknown, province: unknown): Promise<BajujuCoordinates | null> {
  const place = [city, province].map((value) => String(value || '').trim()).filter(Boolean).join(', ');
  if (!place) return null;
  try {
    const [match] = await Location.geocodeAsync(`${place}, Italia`);
    return match ? toUsableCoordinates(match.latitude, match.longitude) : null;
  } catch {
    return null;
  }
}
