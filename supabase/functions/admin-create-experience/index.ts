import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RequestBody = {
  idempotencyKey?: string;
  idempotency_key?: string;
  payload?: Record<string, unknown>;
  experience?: Record<string, unknown>;
};

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

function cleanIdempotencyKey(req: Request, body: RequestBody) {
  const headerKey = req.headers.get('idempotency-key') || req.headers.get('Idempotency-Key') || '';
  return String(body.idempotencyKey || body.idempotency_key || headerKey).trim();
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
    return jsonResponse({ ok: false, error: 'MISSING_SUPABASE_ENV' }, 500);
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
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
    return jsonResponse({ ok: false, error: 'ADMIN_CREATE_EXPERIENCE_RPC_FAILED', message: error.message }, 500);
  }

  const result = (data || {}) as Record<string, unknown>;
  const status = typeof result.status === 'number' ? result.status : result.ok === false ? 400 : 200;

  return jsonResponse(result, status);
});
