import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedCategories = new Set([
  'cena',
  'aperitivo',
  'passeggiata',
  'sport',
  'evento',
  'cinema',
  'gita',
  'altro',
]);

type EventInput = {
  title: string;
  category: string;
  description: string;
  province: string;
  city: string;
  meeting_place: string;
  activity_date: string;
  activity_time: string;
  min_participants?: number;
  max_participants: number;
  budget_amount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type RequestBody = {
  mode?: 'preview' | 'publish';
  event?: EventInput;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validateEvent(raw: EventInput | undefined) {
  if (!raw || typeof raw !== 'object') return { error: 'Evento mancante.' } as const;

  const event = {
    title: cleanText(raw.title, 120),
    category: cleanText(raw.category, 40).toLowerCase(),
    description: cleanText(raw.description, 2000),
    province: cleanText(raw.province, 80),
    city: cleanText(raw.city, 100),
    meeting_place: cleanText(raw.meeting_place, 240),
    activity_date: cleanText(raw.activity_date, 10),
    activity_time: cleanText(raw.activity_time, 5),
    min_participants: Number.isInteger(raw.min_participants) ? Number(raw.min_participants) : 1,
    max_participants: Number(raw.max_participants),
    budget_amount: raw.budget_amount === null || raw.budget_amount === undefined
      ? null
      : Number(raw.budget_amount),
    latitude: raw.latitude === null || raw.latitude === undefined ? null : Number(raw.latitude),
    longitude: raw.longitude === null || raw.longitude === undefined ? null : Number(raw.longitude),
  };

  if (event.title.length < 3) return { error: 'Il titolo deve contenere almeno 3 caratteri.' } as const;
  if (!allowedCategories.has(event.category)) return { error: 'Categoria non valida.' } as const;
  if (event.description.length < 10) return { error: 'La descrizione deve contenere almeno 10 caratteri.' } as const;
  if (!event.province || !event.city || !event.meeting_place) return { error: 'Provincia, comune e luogo sono obbligatori.' } as const;
  if (!isIsoDate(event.activity_date)) return { error: 'Data non valida. Usa YYYY-MM-DD.' } as const;
  if (!isTime(event.activity_time)) return { error: 'Ora non valida. Usa HH:MM.' } as const;
  if (!Number.isInteger(event.min_participants) || event.min_participants < 1) return { error: 'Partecipanti minimi non validi.' } as const;
  if (!Number.isInteger(event.max_participants) || event.max_participants < event.min_participants || event.max_participants > 99) {
    return { error: 'Partecipanti massimi non validi (massimo 99).' } as const;
  }
  if (event.budget_amount !== null && (!Number.isInteger(event.budget_amount) || event.budget_amount < 0 || event.budget_amount > 9999)) {
    return { error: 'Budget non valido.' } as const;
  }

  const hasLatitude = event.latitude !== null;
  const hasLongitude = event.longitude !== null;
  if (hasLatitude !== hasLongitude) return { error: 'Latitudine e longitudine devono essere fornite insieme.' } as const;
  if (hasLatitude && !finiteCoordinate(event.latitude, -90, 90)) return { error: 'Latitudine non valida.' } as const;
  if (hasLongitude && !finiteCoordinate(event.longitude, -180, 180)) return { error: 'Longitudine non valida.' } as const;

  return { event } as const;
}

function allowedAdminEmails() {
  return (Deno.env.get('BAJUJU_ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(
  serviceClient: ReturnType<typeof createClient>,
  user: { id: string; email?: string | null },
) {
  const email = user.email?.trim().toLowerCase() ?? '';
  if (email && allowedAdminEmails().includes(email)) return true;

  const { data, error } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('Impossibile verificare profiles.is_admin:', error.message);
    return false;
  }

  return data?.is_admin === true;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Metodo non consentito.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Variabili Supabase mancanti.');
    return json(500, { error: 'Configurazione server incompleta.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Autenticazione richiesta.' });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser();
  const user = authData.user;
  if (authError || !user) return json(401, { error: 'Sessione non valida.' });
  if (!(await isAdmin(serviceClient, user))) return json(403, { error: 'Permessi amministratore richiesti.' });

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'JSON non valido.' });
  }

  const mode = body.mode ?? 'preview';
  if (!['preview', 'publish'].includes(mode)) return json(400, { error: 'Modalità non valida.' });

  const validation = validateEvent(body.event);
  if ('error' in validation) return json(400, { error: validation.error });
  const event = validation.event;

  if (mode === 'preview') {
    return json(200, {
      mode: 'preview',
      requires_confirmation: true,
      event: {
        ...event,
        creator_id: user.id,
        is_flash: false,
        expires_at: null,
      },
    });
  }

  const idempotencyKey = cleanText(request.headers.get('Idempotency-Key'), 160);
  if (idempotencyKey.length < 12) {
    return json(400, { error: 'Idempotency-Key obbligatoria (almeno 12 caratteri).' });
  }

  const requestPayload = { mode, event };
  const reservation = await serviceClient
    .from('admin_event_requests')
    .insert({
      idempotency_key: idempotencyKey,
      admin_user_id: user.id,
      request_payload: requestPayload,
      status: 'processing',
    })
    .select('id')
    .single();

  if (reservation.error) {
    if (reservation.error.code === '23505') {
      const previous = await serviceClient
        .from('admin_event_requests')
        .select('status, activity_id, response_payload, error_message')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      return json(200, {
        duplicate: true,
        status: previous.data?.status ?? 'unknown',
        activity_id: previous.data?.activity_id ?? null,
        result: previous.data?.response_payload ?? null,
        error: previous.data?.error_message ?? null,
      });
    }

    console.error('Errore prenotazione idempotenza:', reservation.error.message);
    return json(500, { error: 'Impossibile iniziare la creazione evento.' });
  }

  const payload = {
    creator_id: user.id,
    title: event.title,
    category: event.category,
    description: event.description,
    province: event.province,
    city: event.city,
    meeting_place: event.meeting_place,
    activity_date: event.activity_date,
    activity_time: event.activity_time,
    min_participants: event.min_participants,
    max_participants: event.max_participants,
    budget_amount: event.budget_amount,
    is_flash: false,
    expires_at: null,
    latitude: event.latitude,
    longitude: event.longitude,
  };

  const insertion = await serviceClient.from('activities').insert(payload).select('*').single();

  if (insertion.error) {
    await serviceClient
      .from('admin_event_requests')
      .update({ status: 'failed', error_message: insertion.error.message, completed_at: new Date().toISOString() })
      .eq('id', reservation.data.id);

    await serviceClient.from('admin_action_logs').insert({
      admin_user_id: user.id,
      action: 'create_experience_failed',
      target_table: 'activities',
      metadata: { idempotency_key: idempotencyKey, error: insertion.error.message, event },
    });

    console.error('Errore inserimento activities:', insertion.error.message);
    return json(500, { error: 'Creazione evento non riuscita.' });
  }

  const responsePayload = {
    id: insertion.data.id,
    title: insertion.data.title,
    activity_date: insertion.data.activity_date,
    activity_time: insertion.data.activity_time,
    city: insertion.data.city,
    province: insertion.data.province,
  };

  await serviceClient
    .from('admin_event_requests')
    .update({
      status: 'completed',
      activity_id: insertion.data.id,
      response_payload: responsePayload,
      completed_at: new Date().toISOString(),
    })
    .eq('id', reservation.data.id);

  await serviceClient.from('admin_action_logs').insert({
    admin_user_id: user.id,
    action: 'create_experience',
    target_table: 'activities',
    target_id: String(insertion.data.id),
    metadata: { idempotency_key: idempotencyKey, event },
  });

  return json(201, { mode: 'publish', created: true, event: responsePayload });
});
