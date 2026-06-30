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

async function sendExpoPush(messages: Array<Record<string, unknown>>) {
  if (messages.length === 0) {
    return [];
  }

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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

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

  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();

  if (!title || !body) {
    return jsonResponse({ error: 'Titolo e testo notifica obbligatori' }, 400);
  }

  const prefColumn = preferenceColumn(type);
  const actorUserId = payload.actorUserId || null;
  const targetUserId = payload.targetUserId || null;
  const province = payload.province ? String(payload.province).trim() : null;

  let preferencesQuery = supabase
    .from('notification_preferences')
    .select('user_id, enabled, preferred_province, notify_chat_messages, ' + prefColumn)
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

  const matchingUserIds = (preferences || [])
    .filter((pref: Record<string, unknown>) => {
      const userId = String(pref.user_id || '');

      if (!userId) return false;
      if (actorUserId && userId === actorUserId) return false;

      // Per notifiche personali basta il target.
      if (targetUserId) return true;

      // Per nuove esperienze/Flash filtriamo per provincia se l'utente ha preferenze.
      const preferredProvince = pref.preferred_province ? String(pref.preferred_province).trim().toLowerCase() : '';

      if (preferredProvince && province && preferredProvince !== province.toLowerCase()) return false;

      return true;
    })
    .map((pref: Record<string, unknown>) => String(pref.user_id));

  if (matchingUserIds.length === 0) {
    return jsonResponse({ ok: true, sent: 0, reason: 'Nessun utente compatibile.' });
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
    expoResult,
  });
});
