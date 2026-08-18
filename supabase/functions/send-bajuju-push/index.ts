import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type NotificationType =
  | 'new_experience'
  | 'new_flash'
  | 'new_participant'
  | 'contact_request'
  | 'contact_accepted'
  | 'experience_cancelled'
  | 'experience_reminder';

type PushRequest = {
  type: NotificationType | string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  province?: string | null;
  city?: string | null;
};

const NEARBY_EXPERIENCE_RADIUS_KM = 25;

const ALLOWED_TYPES = new Set([
  'new_experience',
  'new_flash',
  'new_participant',
  'contact_request',
  'contact_accepted',
  'experience_cancelled',
  'experience_reminder',
]);

const BLOCKED_TYPES = new Set([
  'new_message',
  'chat_message',
  'activity_message',
  'activity_messages',
  'message',
  'chat',
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function preferenceColumn(type: string) {
  switch (type) {
    case 'new_experience':
      return 'notify_new_experience';
    case 'new_flash':
      return 'notify_new_flash';
    case 'new_participant':
      return 'notify_new_participant';
    case 'contact_request':
      return 'notify_contact_request';
    case 'contact_accepted':
      return 'notify_contact_accepted';
    case 'experience_cancelled':
      return 'notify_experience_cancelled';
    case 'experience_reminder':
      return 'notify_experience_reminder';
    default:
      return '';
  }
}

function asFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371.0088;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function firstText(row: Record<string, unknown> | null, keys: string[], fallback: string) {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return fallback;
}

async function sendExpoPush(messages: Array<Record<string, unknown>>) {
  if (messages.length === 0) return [];

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Expo push error ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  const authorization = request.headers.get('Authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  const authenticatedUserId = userData.user.id;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let payload: PushRequest;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const type = String(payload.type || '').trim();

  if (BLOCKED_TYPES.has(type)) {
    return jsonResponse({
      ok: false,
      blocked: true,
      reason: 'Le notifiche chat sono disattivate per scelta Bajuju.',
    });
  }

  if (!ALLOWED_TYPES.has(type)) {
    return jsonResponse({ error: `Tipo notifica non consentito: ${type}` }, 400);
  }

  if (payload.actorUserId && payload.actorUserId !== authenticatedUserId) {
    return jsonResponse({ error: 'Actor non autorizzato' }, 403);
  }

  const prefColumn = preferenceColumn(type);
  const actorUserId = authenticatedUserId;
  const targetUserId = payload.targetUserId || null;
  const province = payload.province ? String(payload.province).trim() : null;

  let title = String(payload.title || '').trim();
  let body = String(payload.body || '').trim();
  let experienceLatitude: number | null = null;
  let experienceLongitude: number | null = null;
  let activityId = '';

  if (type === 'new_experience' && !targetUserId) {
    activityId = String(payload.data?.activityId || '').trim();

    if (!activityId) {
      return jsonResponse({ error: 'activityId obbligatorio per una nuova esperienza.' }, 400);
    }

    const activityResult = await supabase
      .from('activities')
      .select('*')
      .eq('id', activityId)
      .maybeSingle();

    if (activityResult.error) {
      return jsonResponse({ error: activityResult.error.message }, 500);
    }

    if (!activityResult.data) {
      return jsonResponse({ error: 'Esperienza non trovata.' }, 404);
    }

    const activity = activityResult.data as Record<string, unknown>;
    const creatorId = String(activity.creator_id || '').trim();

    if (!creatorId || creatorId !== authenticatedUserId) {
      return jsonResponse({ error: 'Esperienza non appartenente all’utente autenticato.' }, 403);
    }

    experienceLatitude = asFiniteNumber(activity.latitude);
    experienceLongitude = asFiniteNumber(activity.longitude);

    if (experienceLatitude === null || experienceLongitude === null) {
      return jsonResponse({
        ok: true,
        sent: 0,
        reason: 'Esperienza senza coordinate: notifica geografica non inviata.',
      });
    }

    const experienceTitle = firstText(
      activity,
      ['title', 'titolo', 'name', 'nome'],
      'una nuova esperienza'
    );

    let organizerName = 'Un utente';
    const profileResult = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authenticatedUserId)
      .maybeSingle();

    if (!profileResult.error && profileResult.data) {
      organizerName = firstText(
        profileResult.data as Record<string, unknown>,
        ['username', 'nickname', 'display_name', 'full_name', 'name', 'nome'],
        organizerName
      );
    }

    title = 'Nuova esperienza vicino a te';
    body = `${organizerName} ha organizzato “${experienceTitle}” vicino a te.`;
  }

  if (!title || !body) {
    return jsonResponse({ error: 'Titolo e testo notifica obbligatori' }, 400);
  }

  let preferencesQuery = supabase
    .from('notification_preferences')
    .select('user_id, enabled, preferred_province, notify_chat_messages, latitude, longitude, location_updated_at, ' + prefColumn)
    .eq('enabled', true)
    .eq(prefColumn, true)
    .eq('notify_chat_messages', false);

  if (targetUserId) {
    preferencesQuery = preferencesQuery.eq('user_id', targetUserId);
  }

  const { data: preferences, error: preferencesError } = await preferencesQuery;

  if (preferencesError) {
    return jsonResponse({ error: preferencesError.message }, 500);
  }

  let matchingUserIds = (preferences || [])
    .filter((pref: Record<string, unknown>) => {
      const userId = String(pref.user_id || '');

      if (!userId) return false;
      if (userId === actorUserId) return false;
      if (targetUserId) return true;

      if (type === 'new_experience') {
        const userLatitude = asFiniteNumber(pref.latitude);
        const userLongitude = asFiniteNumber(pref.longitude);

        if (
          userLatitude === null ||
          userLongitude === null ||
          experienceLatitude === null ||
          experienceLongitude === null
        ) {
          return false;
        }

        return (
          distanceKm(
            experienceLatitude,
            experienceLongitude,
            userLatitude,
            userLongitude
          ) <= NEARBY_EXPERIENCE_RADIUS_KM
        );
      }

      const preferredProvince = pref.preferred_province
        ? String(pref.preferred_province).trim().toLowerCase()
        : '';

      if (preferredProvince && province && preferredProvince !== province.toLowerCase()) {
        return false;
      }

      return true;
    })
    .map((pref: Record<string, unknown>) => String(pref.user_id));

  if (type === 'new_experience' && activityId && matchingUserIds.length > 0) {
    const alreadySentResult = await supabase
      .from('push_notification_logs')
      .select('user_id')
      .eq('notification_type', 'new_experience')
      .eq('success', true)
      .contains('data', { activityId })
      .in('user_id', matchingUserIds);

    if (!alreadySentResult.error) {
      const alreadySent = new Set(
        (alreadySentResult.data || []).map((row: Record<string, unknown>) => String(row.user_id || ''))
      );
      matchingUserIds = matchingUserIds.filter((userId) => !alreadySent.has(userId));
    }
  }

  if (matchingUserIds.length === 0) {
    if (targetUserId) {
      await supabase.from('push_notification_logs').insert({
        user_id: targetUserId,
        notification_type: type,
        title,
        body,
        data: payload.data || {},
        success: false,
        error_message: 'Push non abilitata per questo utente.',
      });
    }

    return jsonResponse({
      ok: true,
      sent: 0,
      radiusKm: type === 'new_experience' ? NEARBY_EXPERIENCE_RADIUS_KM : undefined,
      reason: 'Nessun utente compatibile o notifica già inviata.',
    });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('user_id, expo_push_token')
    .in('user_id', matchingUserIds)
    .eq('is_active', true);

  if (tokensError) {
    return jsonResponse({ error: tokensError.message }, 500);
  }

  const messages = (tokens || [])
    .filter((row: Record<string, unknown>) => {
      const token = String(row.expo_push_token || '');
      return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
    })
    .map((row: Record<string, unknown>) => ({
      to: row.expo_push_token,
      sound: 'default',
      title,
      body,
      channelId: 'bajuju-important',
      priority: 'high',
      data: {
        type,
        ...(payload.data || {}),
      },
    }));

  if (messages.length === 0) {
    await supabase.from('push_notification_logs').insert(
      matchingUserIds.map((userId) => ({
        user_id: userId,
        notification_type: type,
        title,
        body,
        data: payload.data || {},
        success: false,
        error_message: 'Nessun push token valido.',
      }))
    );
    return jsonResponse({ ok: true, sent: 0, reason: 'Nessun push token valido.' });
  }

  let expoResult: unknown;

  try {
    expoResult = await sendExpoPush(messages);
  } catch (error) {
    await supabase.from('push_notification_logs').insert(
      matchingUserIds.map((userId) => ({
        user_id: userId,
        notification_type: type,
        title,
        body,
        data: payload.data || {},
        success: false,
        error_message: error instanceof Error ? error.message : String(error),
      }))
    );

    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }

  await supabase.from('push_notification_logs').insert(
    matchingUserIds.map((userId) => ({
      user_id: userId,
      notification_type: type,
      title,
      body,
      data: payload.data || {},
      success: true,
      error_message: null,
    }))
  );

  return jsonResponse({
    ok: true,
    sent: messages.length,
    users: matchingUserIds.length,
    radiusKm: type === 'new_experience' ? NEARBY_EXPERIENCE_RADIUS_KM : undefined,
    expoResult,
  });
});
