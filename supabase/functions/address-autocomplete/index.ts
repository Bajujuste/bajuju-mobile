import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

function cleanString(value: unknown, maxLength = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validSessionToken(value: string) {
  return /^[A-Za-z0-9_-]{1,36}$/.test(value);
}

function addressComponent(
  components: Array<Record<string, unknown>>,
  type: string,
  field: 'longText' | 'shortText' = 'longText'
) {
  const component = components.find((item) => {
    const types = Array.isArray(item.types) ? item.types : [];
    return types.includes(type);
  });

  if (!component) return '';

  const value = component[field];
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  if (!GOOGLE_PLACES_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: 'SERVER_NOT_CONFIGURED' }, 500);
  }

  const authorization = req.headers.get('Authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  }

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
  }

  const action = cleanString(body.action, 30);

  if (action === 'resolve_text') {
    const query = cleanString(body.query, 300);

    if (query.length < 3) {
      return jsonResponse({ ok: false, error: 'INVALID_QUERY' }, 400);
    }

    const searchResponse = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.location,places.formattedAddress',
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'it',
          regionCode: 'it',
          maxResultCount: 1,
        }),
      }
    );

    if (!searchResponse.ok) {
      console.error('Google Places text search failed:', searchResponse.status);
      return jsonResponse(
        { ok: false, error: 'TEXT_SEARCH_FAILED', provider_status: searchResponse.status },
        502
      );
    }

    const searchData = await searchResponse.json();
    const place = Array.isArray(searchData.places) ? searchData.places[0] : null;
    const latitude = Number(place?.location?.latitude);
    const longitude = Number(place?.location?.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return jsonResponse({ ok: false, error: 'ADDRESS_NOT_FOUND' }, 404);
    }

    return jsonResponse({
      ok: true,
      latitude,
      longitude,
      formatted_address: cleanString(place?.formattedAddress, 400),
    });
  }

  const sessionToken = cleanString(body.sessionToken, 36);

  if (!validSessionToken(sessionToken)) {
    return jsonResponse({ ok: false, error: 'INVALID_SESSION_TOKEN' }, 400);
  }

  if (action === 'autocomplete') {
    const input = cleanString(body.input, 160);

    if (input.length < 3) {
      return jsonResponse({ ok: true, suggestions: [] });
    }

    const placesResponse = await fetch(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask':
            'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
        },
        body: JSON.stringify({
          input,
          languageCode: 'it',
          regionCode: 'it',
          includedRegionCodes: ['it'],
          sessionToken,
        }),
      }
    );

    if (!placesResponse.ok) {
      console.error('Google Places autocomplete failed:', placesResponse.status);

      return jsonResponse(
        {
          ok: false,
          error: 'AUTOCOMPLETE_FAILED',
          provider_status: placesResponse.status,
        },
        502
      );
    }

    const placesData = await placesResponse.json();

    const suggestions = Array.isArray(placesData.suggestions)
      ? placesData.suggestions
          .map((item: Record<string, unknown>) => {
            const prediction = item.placePrediction as
              | Record<string, any>
              | undefined;

            if (!prediction) return null;

            const placeId = cleanString(prediction.placeId, 300);
            const description = cleanString(prediction.text?.text, 300);

            if (!placeId || !description) return null;

            return {
              place_id: placeId,
              description,
              main_text: cleanString(
                prediction.structuredFormat?.mainText?.text,
                200
              ),
              secondary_text: cleanString(
                prediction.structuredFormat?.secondaryText?.text,
                300
              ),
            };
          })
          .filter(Boolean)
          .slice(0, 5)
      : [];

    return jsonResponse({
      ok: true,
      suggestions,
    });
  }

  if (action === 'details') {
    const placeId = cleanString(body.placeId, 300);

    if (!placeId) {
      return jsonResponse({ ok: false, error: 'INVALID_PLACE_ID' }, 400);
    }

    const detailsUrl =
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` +
      `?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=it&regionCode=it`;

    const detailsResponse = await fetch(detailsUrl, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask':
          'id,formattedAddress,shortFormattedAddress,location,addressComponents',
      },
    });

    if (!detailsResponse.ok) {
      console.error('Google Places details failed:', detailsResponse.status);

      return jsonResponse(
        {
          ok: false,
          error: 'PLACE_DETAILS_FAILED',
          provider_status: detailsResponse.status,
        },
        502
      );
    }

    const place = await detailsResponse.json();

    const latitude = Number(place.location?.latitude);
    const longitude = Number(place.location?.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return jsonResponse({ ok: false, error: 'INVALID_COORDINATES' }, 502);
    }

    const components = Array.isArray(place.addressComponents)
      ? place.addressComponents
      : [];

    const street = addressComponent(components, 'route');
    const streetNumber = addressComponent(components, 'street_number');
    const city =
      addressComponent(components, 'locality') ||
      addressComponent(components, 'postal_town') ||
      addressComponent(components, 'administrative_area_level_3');

    const province =
      addressComponent(components, 'administrative_area_level_2') ||
      addressComponent(components, 'administrative_area_level_1');

    const provinceCode =
      addressComponent(components, 'administrative_area_level_2', 'shortText') ||
      addressComponent(components, 'administrative_area_level_1', 'shortText');

    const countryCode = addressComponent(components, 'country', 'shortText');

    if (countryCode.toUpperCase() !== 'IT') {
      return jsonResponse({ ok: false, error: 'ADDRESS_OUTSIDE_ITALY' }, 400);
    }

    if (!street || !streetNumber || !city || !province) {
      return jsonResponse(
        {
          ok: false,
          error: 'INCOMPLETE_STREET_ADDRESS',
          missing: {
            street: !street,
            street_number: !streetNumber,
            city: !city,
            province: !province,
          },
        },
        400
      );
    }

    return jsonResponse({
      ok: true,
      place: {
        place_id: cleanString(place.id, 300),
        formatted_address: cleanString(place.formattedAddress, 400),
        short_formatted_address: cleanString(
          place.shortFormattedAddress,
          300
        ),
        street,
        street_number: streetNumber,
        city,
        province,
        province_code: provinceCode,
        latitude,
        longitude,
      },
    });
  }

  return jsonResponse({ ok: false, error: 'INVALID_ACTION' }, 400);
});
