import { supabase } from './supabase';

export type AddressSuggestion = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type ResolvedAddress = {
  placeId: string;
  formattedAddress: string;
  shortFormattedAddress: string;
  street: string;
  streetNumber: string;
  city: string;
  province: string;
  provinceCode: string;
  latitude: number;
  longitude: number;
};

type FunctionResponse = Record<string, any>;

const PROVINCE_BY_CODE: Record<string, string> = {
  BG: 'Bergamo',
  MI: 'Milano',
  LC: 'Lecco',
  MB: 'Monza e Brianza',
  BS: 'Brescia',
  TO: 'Torino',
  VR: 'Verona',
};

function normalizeProvince(province: string, provinceCode: string) {
  const code = provinceCode.trim().toUpperCase();

  if (PROVINCE_BY_CODE[code]) {
    return PROVINCE_BY_CODE[code];
  }

  return province
    .trim()
    .replace(/^Provincia di\s+/i, '')
    .replace(/^Città metropolitana di\s+/i, '')
    .replace(/^Citta metropolitana di\s+/i, '')
    .replace(/^Metropolitan City of\s+/i, '')
    .trim();
}

export function createAddressSessionToken() {
  return `addr_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`.slice(0, 36);
}

export async function searchAddressSuggestions(
  input: string,
  sessionToken: string
): Promise<AddressSuggestion[]> {
  const cleanInput = input.trim();

  if (cleanInput.length < 3) {
    return [];
  }

  const result = await supabase.functions.invoke('address-autocomplete', {
    body: {
      action: 'autocomplete',
      input: cleanInput,
      sessionToken,
    },
  });

  if (result.error) {
    throw result.error;
  }

  const response = (result.data || {}) as FunctionResponse;

  if (response.ok !== true) {
    throw new Error(String(response.error || 'AUTOCOMPLETE_FAILED'));
  }

  const suggestions = Array.isArray(response.suggestions)
    ? response.suggestions
    : [];

  return suggestions
    .map((item: Record<string, unknown>) => ({
      placeId: String(item.place_id || '').trim(),
      description: String(item.description || '').trim(),
      mainText: String(item.main_text || '').trim(),
      secondaryText: String(item.secondary_text || '').trim(),
    }))
    .filter(
      (item: AddressSuggestion) => item.placeId && item.description
    )
    .slice(0, 5);
}

export async function resolveAddressSuggestion(
  placeId: string,
  sessionToken: string
): Promise<ResolvedAddress> {
  const cleanPlaceId = placeId.trim();

  if (!cleanPlaceId) {
    throw new Error('INVALID_PLACE_ID');
  }

  const result = await supabase.functions.invoke('address-autocomplete', {
    body: {
      action: 'details',
      placeId: cleanPlaceId,
      sessionToken,
    },
  });

  if (result.error) {
    throw result.error;
  }

  const response = (result.data || {}) as FunctionResponse;

  if (response.ok !== true || !response.place) {
    throw new Error(String(response.error || 'PLACE_DETAILS_FAILED'));
  }

  const place = response.place as Record<string, unknown>;
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('INVALID_COORDINATES');
  }

  const street = String(place.street || '').trim();
  const streetNumber = String(place.street_number || '').trim();
  const city = String(place.city || '').trim();
  const rawProvince = String(place.province || '').trim();
  const provinceCode = String(place.province_code || '').trim().toUpperCase();
  const province = normalizeProvince(rawProvince, provinceCode);

  if (!street || !streetNumber || !city || !province) {
    throw new Error('INCOMPLETE_STREET_ADDRESS');
  }

  return {
    placeId: String(place.place_id || cleanPlaceId).trim(),
    formattedAddress: String(place.formatted_address || '').trim(),
    shortFormattedAddress: String(
      place.short_formatted_address || ''
    ).trim(),
    street,
    streetNumber,
    city,
    province,
    provinceCode,
    latitude,
    longitude,
  };
}

export type ResolvedCoordinates = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
};

export async function resolveAddressText(query: string): Promise<ResolvedCoordinates> {
  const cleanQuery = query.trim();

  if (cleanQuery.length < 3) {
    throw new Error('INVALID_QUERY');
  }

  const result = await supabase.functions.invoke('address-autocomplete', {
    body: {
      action: 'resolve_text',
      query: cleanQuery,
    },
  });

  if (result.error) {
    throw result.error;
  }

  const response = (result.data || {}) as FunctionResponse;
  const latitude = Number(response.latitude);
  const longitude = Number(response.longitude);

  if (
    response.ok !== true ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(String(response.error || 'ADDRESS_NOT_FOUND'));
  }

  return {
    latitude,
    longitude,
    formattedAddress: String(response.formatted_address || '').trim(),
  };
}
