import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type EventPayload = Record<string, unknown>;

type RequestBody = {
  idempotencyKey?: string;
  idempotency_key?: string;
  payload?: EventPayload;
  experience?: EventPayload;
};

const MAX_TEXT_LENGTH = 500;
const MAX_LONG_TEXT_LENGTH = 4000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanIdempotencyKey(req: Request, body: RequestBody) {
  const headerKey = req.headers.get('idempotency-key') || '';
  return cleanString(body.idempotencyKey || body.idempotency_key || headerKey);
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function validateEventPayload(payload: EventPayload) {
  const title = cleanString(payload.title || payload.activity_title || payload.name);
  const date = cleanString(payload.activity_date || payload.date);
  const time = cleanString(payload.activity_time || payload.time);
  const city = cleanString(payload.city || payload.citta);
  const province = cleanString(payload.province || payload.provincia);
  const description = cleanString(payload.description || payload.activity_description || '');
  const latitude = optionalNumber(payload.latitude);
  const longitude = optionalNumber(payload.longitude);
  const maxParticipants = optionalNumber(payload.max_participants);

  if (!title || title.length > MAX_TEXT_LENGTH) return 'INVALID_TITLE';
  if (description.length > MAX_LONG_TEXT_LENGTH) return 'INVALID_DESCRIPTION';
  if (!date || !isValidIsoDate(date)) return 'INVALID_ACTIVITY_DATE';
  if (!time || !isValidTime(time)) return 'INVALID_ACTIVITY_TIME';
  if (!city || city.length > MAX_TEXT_LENGTH) return 'INVALID_CITY';
  if (!province || province.length > 100) return 'INVALID_PROVINCE';
  if (latitude !== null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) return 'INVALID_LATITUDE';
  if (longitude !== null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) return 'INVALID_LONGITUDE';
  if (maxParticipants !== null && (Number.isNaN(maxParticipants) || !Number.isInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 10000)) {
    return 'INVALID_MAX_PARTICIPANTS';
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: 'SERVER_NOT_CONFIGURED' }, 500);
  }

  const authorization = req.headers.get('Authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  }

  let body: RequestBody;

  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
  }

  const idempotencyKey = cleanIdempotencyKey(req, body);
  const payload = body.payload || body.experience || {};

  if (!idempotencyKey || idempotencyKey.length > 120) {
    return jsonResponse({ ok: false, error: 'INVALID_IDEMPOTENCY_KEY' }, 400);
  }

  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    return jsonResponse({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
  }

  const validationError = validateEventPayload(payload);

  if (validationError) {
    return jsonResponse({ ok: false, error: validationError }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  }

  const { data, error } = await supabase.rpc('admin_create_experience_command', {
    p_idempotency_key: idempotencyKey,
    p_payload: payload,
  });

  if (error) {
    return jsonResponse({ ok: false, error: 'CREATE_EXPERIENCE_FAILED' }, 500);
  }

  const result = (data || {}) as Record<string, unknown>;
  const status = typeof result.status === 'number' ? result.status : result.ok === false ? 400 : 200;

  return jsonResponse(result, status);
});
