import { supabase } from './supabase';
import { loadBajujuLocationsByOwner } from './bajujuLocations';

const PUBLIC_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

// Le foto degli eventi sono caricate a piena risoluzione (in media 700 KB, fino a 2,5 MB).
// Nelle schede basta una versione piccola: Supabase la ridimensiona al volo.
export function eventThumbUrl(url: string | null | undefined, width = 800) {
  const clean = String(url || '').trim();
  if (!clean || !clean.includes('.supabase.co' + PUBLIC_PATH)) return clean;
  const [base] = clean.split('?');
  return `${base.replace(PUBLIC_PATH, RENDER_PATH)}?width=${width}&quality=70`;
}

type CreatorRow = { creator_id?: string | null; location_owner_id?: string | null };

// Nome da mostrare come "Organizzato da …": il locale per gli eventi ufficiali del locale, altrimenti il nome utente.
export async function loadEventOrganizerNames(rows: CreatorRow[]): Promise<Record<string, string>> {
  const creatorIds = Array.from(new Set(rows.map((row) => String(row.creator_id || '').trim()).filter(Boolean)));
  if (creatorIds.length === 0) return {};

  const names: Record<string, string> = {};
  for (let start = 0; start < creatorIds.length; start += 150) {
    const result = await supabase
      .from('profiles')
      .select('id,nickname')
      .in('id', creatorIds.slice(start, start + 150));
    if (result.error) continue;
    ((result.data || []) as { id: string; nickname?: string | null }[]).forEach((profile) => {
      const nickname = String(profile.nickname || '').trim();
      if (nickname) names[String(profile.id)] = nickname;
    });
  }

  const locationOwnerIds = rows
    .filter((row) => row.location_owner_id && String(row.creator_id || '') === String(row.location_owner_id))
    .map((row) => String(row.location_owner_id));
  if (locationOwnerIds.length > 0) {
    const locations = await loadBajujuLocationsByOwner(locationOwnerIds).catch(() => ({}));
    Object.values(locations).forEach((location) => {
      if (location.name) names[location.ownerId] = location.name;
    });
  }

  return names;
}
