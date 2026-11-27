import { supabase } from './supabase';

// "Vediamoci in cammino": durante una camminata/trekking/gita/sport chi partecipa preme "Sono qui"
// e vede a che distanza sono gli altri. Tutto passa dalle funzioni bajuju_walk_* su Supabase,
// che controllano chi partecipa, il giorno dell'evento (ora italiana) e la "Fine gita".

export type WalkTogetherState = {
  allowed: boolean;
  enabled: boolean;
  ended: boolean;
  isToday: boolean;
  active: boolean;
  canManage: boolean;
  canJoin: boolean;
  sharing: boolean;
  activeCount: number;
};

export type WalkTogetherPosition = {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: string;
};

const EMPTY_STATE: WalkTogetherState = {
  allowed: false,
  enabled: false,
  ended: false,
  isToday: false,
  active: false,
  canManage: false,
  canJoin: false,
  sharing: false,
  activeCount: 0,
};

function errorText(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function loadWalkTogetherState(activityId: string): Promise<WalkTogetherState> {
  const { data, error } = await supabase.rpc('bajuju_walk_state', { p_activity_id: activityId });
  if (error || !data) return EMPTY_STATE;
  const row = data as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    enabled: row.enabled === true,
    ended: row.ended === true,
    isToday: row.is_today === true,
    active: row.active === true,
    canManage: row.can_manage === true,
    canJoin: row.can_join === true,
    sharing: row.sharing === true,
    activeCount: Number(row.active_count) || 0,
  };
}

export async function setWalkTogetherEnabled(activityId: string, enabled: boolean) {
  const { error } = await supabase.rpc('bajuju_walk_set_enabled', { p_activity_id: activityId, p_enabled: enabled });
  if (error) throw errorText(error, 'Non sono riuscito a salvare l’opzione.');
}

export async function shareWalkPosition(activityId: string, latitude: number, longitude: number, accuracy: number | null) {
  const { error } = await supabase.rpc('bajuju_walk_share', {
    p_activity_id: activityId,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy: accuracy,
  });
  if (error) throw errorText(error, 'Non sono riuscito a inviare la posizione.');
}

export async function stopWalkSharing(activityId: string) {
  const { error } = await supabase.rpc('bajuju_walk_stop', { p_activity_id: activityId });
  if (error) throw errorText(error, 'Non sono riuscito a spegnere la posizione.');
}

export async function endWalkTogether(activityId: string) {
  const { error } = await supabase.rpc('bajuju_walk_end', { p_activity_id: activityId });
  if (error) throw errorText(error, 'Non sono riuscito a chiudere la gita.');
}

export async function loadWalkPositions(activityId: string): Promise<WalkTogetherPosition[]> {
  const { data, error } = await supabase.rpc('bajuju_walk_list', { p_activity_id: activityId });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map((row) => ({
      userId: String(row.user_id || ''),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy: row.accuracy === null || row.accuracy === undefined ? null : Number(row.accuracy),
      updatedAt: String(row.updated_at || ''),
    }))
    .filter((row) => row.userId && Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
}

// Distanza in metri tra due punti (formula dell'emisenoverso).
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatWalkDistance(meters: number) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 30) return 'vicino a te';
  if (meters < 1000) return `a ${Math.round(meters / 10) * 10} m`;
  return `a ${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace('.', ',')} km`;
}
