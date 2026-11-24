import { Linking } from 'react-native';

import { supabase } from './supabase';

// Devono restare uguali ai vincoli della tabella bajuju_discounts.
export const DISCOUNT_NAME_MAX_LENGTH = 60;
export const DISCOUNT_TEXT_MAX_LENGTH = 120;

// Negozio che fa uno sconto a chi mostra l'app Bajuju. Li inseriscono solo gli admin.
export type BajujuDiscount = {
  id: string;
  name: string;
  discountText: string;
  photoUrl: string;
  formattedAddress: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

export type BajujuDiscountInput = Omit<BajujuDiscount, 'id'>;

const DISCOUNT_COLUMNS = 'id,name,discount_text,photo_url,formatted_address,city,latitude,longitude';

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
}

function mapDiscount(row: Record<string, any>): BajujuDiscount {
  return {
    id: clean(row.id),
    name: clean(row.name),
    discountText: clean(row.discount_text),
    photoUrl: clean(row.photo_url),
    formattedAddress: clean(row.formatted_address),
    city: clean(row.city),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
  };
}

function toRow(input: BajujuDiscountInput) {
  return {
    name: input.name.trim(),
    discount_text: input.discountText.trim(),
    photo_url: input.photoUrl.trim() || null,
    formatted_address: input.formattedAddress.trim(),
    city: input.city.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
  };
}

export async function loadBajujuDiscounts() {
  const result = await supabase.from('bajuju_discounts' as any).select(DISCOUNT_COLUMNS).order('name', { ascending: true });
  if (result.error) throw result.error;
  return ((result.data || []) as Record<string, any>[]).map(mapDiscount).filter((item) => item.id);
}

export async function loadBajujuDiscount(id: string) {
  const result = await supabase.from('bajuju_discounts' as any).select(DISCOUNT_COLUMNS).eq('id', id).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapDiscount(result.data as Record<string, any>) : null;
}

export async function createBajujuDiscount(input: BajujuDiscountInput) {
  const result = await supabase.from('bajuju_discounts' as any).insert(toRow(input)).select('id').single();
  if (result.error) throw result.error;
  return clean((result.data as Record<string, any>)?.id);
}

export async function updateBajujuDiscount(id: string, input: BajujuDiscountInput) {
  const result = await supabase
    .from('bajuju_discounts' as any)
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (result.error) throw result.error;
}

export async function deleteBajujuDiscount(id: string) {
  const result = await supabase.from('bajuju_discounts' as any).delete().eq('id', id);
  if (result.error) throw result.error;
}

// Carica la foto del negozio nella cartella dell'admin (regole dello Storage avatars).
export async function uploadBajujuDiscountPhoto(userId: string, localUri: string) {
  const response = await fetch(localUri);
  const buffer = await response.arrayBuffer();
  const filePath = `${userId}/discount-${Date.now()}.jpg`;

  const upload = await supabase.storage.from('avatars').upload(filePath, buffer, { contentType: 'image/jpeg', upsert: true });
  if (upload.error) throw upload.error;

  const publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
  if (!publicUrl) throw new Error('URL della foto non disponibile.');
  return publicUrl;
}

export function openDiscountInMaps(discount: BajujuDiscount) {
  const query = [discount.name, discount.formattedAddress || discount.city].filter(Boolean).join(', ');
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  void Linking.openURL(url).catch(() => console.log('Maps non disponibile.'));
}
