import { supabase } from './supabase';

// Devono restare uguali ai vincoli della tabella bajuju_locations.
export const LOCATION_NAME_MAX_LENGTH = 60;
export const LOCATION_DESCRIPTION_MAX_LENGTH = 200;
export const LOCATION_MAX_PHOTOS = 5;

// Colore dei locali, diverso dal rosa degli eventi (anche sulla mappa).
export const LOCATION_COLOR = '#7B2FBE';
export const LOCATION_COLOR_SOFT = '#F3EAFC';

export const LOCATION_CATEGORIES = [
  'Bar',
  'Ristorante',
  'Pizzeria',
  'Pub',
  'Palestra',
  'Centro sportivo',
  'Sala eventi',
  'Circolo',
  'Associazione',
  'Agriturismo',
  'Negozio',
  'Altro',
] as const;

// pending = richiesta inviata da "Diventa Location", in attesa dell'Admin.
export type LocationRequestStatus = 'pending' | 'approved' | 'rejected';

export type BajujuLocation = {
  ownerId: string;
  name: string;
  category: string;
  description: string;
  street: string;
  streetNumber: string;
  city: string;
  province: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  photos: string[];
  instagramUrl: string;
  facebookUrl: string;
  websiteUrl: string;
  phone: string;
  whatsapp: string;
  requestStatus: LocationRequestStatus;
};

type LocationRow = Record<string, any>;

const LOCATION_COLUMNS =
  'owner_id,name,category,description,street,street_number,city,province,formatted_address,latitude,longitude,photos,instagram_url,facebook_url,website_url,phone,whatsapp,request_status';

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function mapLocation(row: LocationRow | null | undefined): BajujuLocation | null {
  if (!row) return null;

  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const ownerId = clean(row.owner_id);

  if (!ownerId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    ownerId,
    name: clean(row.name),
    category: clean(row.category),
    description: clean(row.description),
    street: clean(row.street),
    streetNumber: clean(row.street_number),
    city: clean(row.city),
    province: clean(row.province),
    formattedAddress: clean(row.formatted_address),
    latitude,
    longitude,
    photos: Array.isArray(row.photos) ? row.photos.map(clean).filter(Boolean) : [],
    instagramUrl: clean(row.instagram_url),
    facebookUrl: clean(row.facebook_url),
    websiteUrl: clean(row.website_url),
    phone: clean(row.phone),
    whatsapp: clean(row.whatsapp),
    requestStatus: row.request_status === 'pending' || row.request_status === 'rejected' ? row.request_status : 'approved',
  };
}

export function locationAddressLine(location: BajujuLocation) {
  const streetLine = `${location.street} ${location.streetNumber}`.trim();
  return [streetLine, location.city].filter(Boolean).join(', ');
}

// La tabella non esiste finché la migrazione non è pubblicata: in quel caso
// l'app si comporta come prima, senza locali.
function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /bajuju_locations/.test(error.message || '');
}

// Restituisce il locale solo se è visibile a chi guarda (Location attiva o proprio locale).
export async function loadBajujuLocation(ownerId: string): Promise<BajujuLocation | null> {
  const id = ownerId.trim();
  if (!id) return null;

  const result = await supabase
    .from('bajuju_locations' as any)
    .select(LOCATION_COLUMNS)
    .eq('owner_id', id)
    .maybeSingle();

  if (result.error) {
    if (isMissingTableError(result.error)) return null;
    throw result.error;
  }

  return mapLocation(result.data as LocationRow | null);
}

// Per mostrare il nome del locale al posto del nome utente negli elenchi.
export async function loadBajujuLocationsByOwner(ownerIds: string[]): Promise<Record<string, BajujuLocation>> {
  const ids = Array.from(new Set(ownerIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return {};

  const result = await supabase
    .from('bajuju_locations' as any)
    .select(LOCATION_COLUMNS)
    .in('owner_id', ids);

  if (result.error) return {};

  return publicLocationsByOwner((result.data || []) as LocationRow[], ids);
}

// Il proprietario vede sempre il proprio locale anche con Location OFF:
// tra quelli caricati teniamo solo i locali di proprietari attivi.
async function publicLocationsByOwner(rows: LocationRow[], ids: string[]) {
  const profiles = await supabase
    .from('profiles')
    .select('id,is_location_organizer')
    .in('id', ids);
  const activeIds = new Set(
    ((profiles.data || []) as LocationRow[])
      .filter((row) => row.is_location_organizer === true)
      .map((row) => clean(row.id))
  );

  const map: Record<string, BajujuLocation> = {};
  rows.forEach((row) => {
    const location = mapLocation(row);
    if (location && activeIds.has(location.ownerId)) map[location.ownerId] = location;
  });
  return map;
}

export async function loadPublicBajujuLocations(): Promise<BajujuLocation[]> {
  const result = await supabase
    .from('bajuju_locations' as any)
    .select(LOCATION_COLUMNS)
    .limit(500);

  if (result.error) return [];

  const rows = (result.data || []) as LocationRow[];
  const map = await publicLocationsByOwner(rows, rows.map((row) => clean(row.owner_id)));
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export type SaveBajujuLocationInput = Omit<BajujuLocation, 'ownerId' | 'requestStatus'>;

export async function saveBajujuLocation(ownerId: string, input: SaveBajujuLocationInput) {
  const payload = {
    owner_id: ownerId,
    name: input.name.trim().slice(0, LOCATION_NAME_MAX_LENGTH),
    category: input.category.trim(),
    description: input.description.trim().slice(0, LOCATION_DESCRIPTION_MAX_LENGTH) || null,
    street: input.street.trim(),
    street_number: input.streetNumber.trim(),
    city: input.city.trim(),
    province: input.province.trim() || null,
    formatted_address: input.formattedAddress.trim().slice(0, 200),
    latitude: input.latitude,
    longitude: input.longitude,
    photos: input.photos.slice(0, LOCATION_MAX_PHOTOS),
    instagram_url: input.instagramUrl || null,
    facebook_url: input.facebookUrl || null,
    website_url: input.websiteUrl || null,
    phone: input.phone || null,
    whatsapp: input.whatsapp || null,
  };

  const result = await supabase
    .from('bajuju_locations' as any)
    .upsert(payload, { onConflict: 'owner_id' });

  if (result.error) throw result.error;
}

// Accetta "@nomelocale", "instagram.com/nomelocale" o il link completo.
// Richieste "Diventa Location" da controllare (solo admin: la policy SELECT le mostra a loro).
export async function loadPendingLocationRequests(): Promise<BajujuLocation[]> {
  const result = await supabase
    .from('bajuju_locations' as any)
    .select(LOCATION_COLUMNS)
    .eq('request_status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(200);

  if (result.error) throw result.error;
  return ((result.data || []) as LocationRow[])
    .map(mapLocation)
    .filter((location): location is BajujuLocation => Boolean(location));
}

export async function countPendingLocationRequests() {
  const result = await supabase
    .from('bajuju_locations' as any)
    .select('owner_id', { count: 'exact', head: true })
    .eq('request_status', 'pending');
  return result.error ? 0 : result.count || 0;
}

export async function reviewLocationRequest(ownerId: string, action: 'approve' | 'reject') {
  const result = await supabase.rpc('admin_review_location' as any, {
    p_owner_id: ownerId,
    p_action: action,
  });
  if (result.error) throw result.error;
}

export function normalizeInstagramUrl(value: string) {
  const text = value.trim();
  if (!text) return '';

  const handle = text
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();

  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return `https://www.instagram.com/${handle}`;
}

export function normalizeFacebookUrl(value: string) {
  const text = value.trim();
  if (!text) return '';

  const path = text
    .replace(/^https?:\/\/((www|m|it-it|it)\.)?(facebook|fb)\.com\//i, '')
    .replace(/^((www|m)\.)?(facebook|fb)\.com\//i, '')
    .replace(/^@/, '')
    .trim();

  if (!path || /\s/.test(path) || path.length > 200) return null;
  return `https://www.facebook.com/${path}`;
}

export function normalizeWebsiteUrl(value: string) {
  const text = value.trim();
  if (!text) return '';

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  if (/\s/.test(withProtocol) || withProtocol.length > 300) return null;
  if (!/^https?:\/\/[^/]+\.[^/]{2,}/i.test(withProtocol)) return null;
  return withProtocol;
}

export function normalizePhone(value: string) {
  const text = value.trim();
  if (!text) return '';

  const compact = text.replace(/[^\d+]/g, '');
  if (!/^\+?\d{6,15}$/.test(compact)) return null;
  return compact;
}

export function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '');
  // Numeri italiani scritti senza prefisso internazionale.
  const international = phone.startsWith('+') || (digits.startsWith('39') && digits.length > 10)
    ? digits
    : `39${digits}`;
  return `https://wa.me/${international}`;
}

// Per i profili attivi come Location sostituisce nome e foto con quelli del locale:
// negli elenchi (partecipanti, membri, richieste) si vede il locale, non la persona.
export async function withLocationIdentity<T extends Record<string, any>>(
  rows: T[],
  options: { idKey: string; nameKeys: string[]; avatarKey?: string }
): Promise<T[]> {
  const ids = rows.map((row) => clean(String(row[options.idKey] ?? '')));
  const locations = await loadBajujuLocationsByOwner(ids).catch(() => ({} as Record<string, BajujuLocation>));
  if (Object.keys(locations).length === 0) return rows;

  return rows.map((row) => {
    const location = locations[clean(String(row[options.idKey] ?? ''))];
    if (!location) return row;

    const next: Record<string, any> = { ...row };
    options.nameKeys.forEach((key) => { next[key] = location.name; });
    if (options.avatarKey && location.photos[0]) next[options.avatarKey] = location.photos[0];
    return next as T;
  });
}
