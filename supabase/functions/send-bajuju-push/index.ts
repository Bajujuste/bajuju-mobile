import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type NotificationType =
  | 'new_experience'
  | 'new_flash'
  | 'new_participant'
  | 'contact_request'
  | 'contact_accepted'
  | 'contact_rejected'
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
  'contact_rejected',
  'experience_cancelled',
  'experience_reminder',
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function preferenceColumn(type: string) {
  switch (type) {
    case 'new_experience': return 'notify_new_experience';
    case 'new_flash': return 'notify_new_flash';
    case 'new_participant': return 'notify_new_participant';
    case 'contact_request': return 'notify_contact_request';
    case 'contact_accepted':
    case 'contact_rejected': return 'notify_contact_accepted';
    case 'experience_cancelled': return 'notify_experience_cancelled';
    case 'experience_reminder': return 'notify_experience_reminder';
    default: return '';
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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
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

function participantStatusIsActive(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  return ![
    'rejected', 'rifiutato', 'declined', 'annullato', 'annullata',
    'deleted', 'eliminato', 'eliminata', 'removed', 'cancellato', 'cancellata',
  ].includes(status);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return jsonResponse({ error: 'Missing Supabase env vars' }, 500);

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return jsonResponse({ error: 'Authentication required' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Authentication required' }, 401);

  let payload: PushRequest;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const type = String(payload.type || '').trim();
  if (!ALLOWED_TYPES.has(type)) return jsonResponse({ error: `Tipo notifica non consentito: ${type}` }, 400);

  const authenticatedUserId = userData.user.id;
  if (payload.actorUserId && payload.actorUserId !== authenticatedUserId) return jsonResponse({ error: 'Actor non autorizzato' }, 403);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const prefColumn = preferenceColumn(type);
  if (!prefColumn) return jsonResponse({ error: `Preferenza non configurata per: ${type}` }, 400);

  const actorUserId = authenticatedUserId;
  const targetUserId = payload.targetUserId ? String(payload.targetUserId).trim() : '';
  const province = payload.province ? String(payload.province).trim() : '';
  const activityId = String(payload.data?.activityId || '').trim();

  let title = String(payload.title || '').trim();
  let body = String(payload.body || '').trim();
  let experienceLatitude: number | null = null;
  let experienceLongitude: number | null = null;

  if (type === 'new_experience' && !targetUserId) {
    if (!activityId) return jsonResponse({ error: 'activityId obbligatorio per una nuova esperienza.' }, 400);

    const activityResult = await supabase.from('activities').select('*').eq('id', activityId).maybeSingle();
    if (activityResult.error) return jsonResponse({ error: activityResult.error.message }, 500);
    if (!activityResult.data) return jsonResponse({ error: 'Esperienza non trovata.' }, 404);

    const activity = activityResult.data as Record<string, unknown>;
    const creatorId = String(activity.creator_id || activity.organizer_id || activity.created_by || activity.user_id || '').trim();
    if (!creatorId || creatorId !== actorUserId) return jsonResponse({ error: 'Esperienza non appartenente all’utente autenticato.' }, 403);

    experienceLatitude = asFiniteNumber(activity.latitude);
    experienceLongitude = asFiniteNumber(activity.longitude);
    if (experienceLatitude === null || experienceLongitude === null) {
      return jsonResponse({ ok: true, sent: 0, reason: 'Esperienza senza coordinate: notifica geografica non inviata.' });
    }

    const experienceTitle = firstText(activity, ['title', 'titolo', 'name', 'nome'], 'una nuova esperienza');
    let organizerName = 'Un utente';
    const profileResult = await supabase.from('profiles').select('*').eq('id', actorUserId).maybeSingle();
    if (!profileResult.error && profileResult.data) {
      organizerName = firstText(
        profileResult.data as Record<string, unknown>,
        ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'],
        organizerName
      );
    }

    title = 'Nuova esperienza vicino a te';
    body = `${organizerName} ha organizzato “${experienceTitle}” vicino a te.`;
  }

  if (type === 'new_participant') {
    if (!targetUserId || !activityId) {
      return jsonResponse({ error: 'targetUserId e activityId obbligatori per nuovo partecipante.' }, 400);
    }

    const [activityResult, participantResult, profileResult] = await Promise.all([
      supabase.from('activities').select('*').eq('id', activityId).maybeSingle(),
      supabase.from('activity_participants').select('user_id,status').eq('activity_id', activityId).eq('user_id', actorUserId).limit(10),
      supabase.from('profiles').select('*').eq('id', actorUserId).maybeSingle(),
    ]);

    if (activityResult.error) return jsonResponse({ error: activityResult.error.message }, 500);
    if (participantResult.error) return jsonResponse({ error: participantResult.error.message }, 500);
    if (!activityResult.data) return jsonResponse({ error: 'Esperienza non trovata.' }, 404);

    const activity = activityResult.data as Record<string, unknown>;
    const creatorId = String(activity.creator_id || activity.organizer_id || activity.created_by || activity.user_id || '').trim();
    if (!creatorId || creatorId !== targetUserId) {
      return jsonResponse({ error: 'Destinatario non corrisponde all’organizzatore.' }, 403);
    }

    const actorParticipationRows = (participantResult.data || []) as Record<string, unknown>[];
    const hasActiveParticipation = actorParticipationRows.some((row) => participantStatusIsActive(row.status));
    if (!hasActiveParticipation) {
      return jsonResponse({ error: 'Utente non risulta partecipante attivo.' }, 403);
    }

    const experienceTitle = firstText(activity, ['title', 'titolo', 'name', 'nome'], 'questa esperienza');
    const participantName = !profileResult.error && profileResult.data
      ? firstText(
          profileResult.data as Record<string, unknown>,
          ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'],
          'Un utente Bajuju'
        )
      : 'Un utente Bajuju';

    title = 'Nuovo partecipante';
    body = `${participantName} partecipa a “${experienceTitle}”.`;
  }

  if (!title || !body) return jsonResponse({ error: 'Titolo e testo notifica obbligatori' }, 400);

  let preferencesQuery = supabase
    .from('notification_preferences')
    .select(`user_id, enabled, preferred_province, latitude, longitude, location_updated_at, ${prefColumn}`)
    .eq('enabled', true)
    .eq(prefColumn, true);

  if (targetUserId) preferencesQuery = preferencesQuery.eq('user_id', targetUserId);

  const { data: preferences, error: preferencesError } = await preferencesQuery;
  if (preferencesError) return jsonResponse({ error: preferencesError.message }, 500);

  let matchingUserIds = (preferences || [])
    .filter((pref: Record<string, unknown>) => {
      const userId = String(pref.user_id || '').trim();
      if (!userId || userId === actorUserId) return false;
      if (targetUserId) return true;

      if (type === 'new_experience') {
        const userLatitude = asFiniteNumber(pref.latitude);
        const userLongitude = asFiniteNumber(pref.longitude);
        if (userLatitude === null || userLongitude === null || experienceLatitude === null || experienceLongitude === null) return false;
        return distanceKm(experienceLatitude, experienceLongitude, userLatitude, userLongitude) <= NEARBY_EXPERIENCE_RADIUS_KM;
      }

      const preferredProvince = pref.preferred_province ? String(pref.preferred_province).trim().toLowerCase() : '';
      if (preferredProvince && province && preferredProvince !== province.toLowerCase()) return false;
      return true;
    })
    .map((pref: Record<string, unknown>) => String(pref.user_id));

  matchingUserIds = [...new Set(matchingUserIds)];

  if (matchingUserIds.length > 0) {
    const [blockedByActorResult, actorBlockedResult] = await Promise.all([
      supabase.from('user_blocks').select('blocked_id').eq('blocker_id', actorUserId).in('blocked_id', matchingUserIds),
      supabase.from('user_blocks').select('blocker_id').eq('blocked_id', actorUserId).in('blocker_id', matchingUserIds),
    ]);

    const blockedIds = new Set<string>();
    (blockedByActorResult.data || []).forEach((row: Record<string, unknown>) => {
      if (row.blocked_id) blockedIds.add(String(row.blocked_id));
    });
    (actorBlockedResult.data || []).forEach((row: Record<string, unknown>) => {
      if (row.blocker_id) blockedIds.add(String(row.blocker_id));
    });

    matchingUserIds = matchingUserIds.filter((userId) => !blockedIds.has(userId));
  }

  if (type === 'new_experience' && activityId && matchingUserIds.length > 0) {
    const alreadyLoggedResult = await supabase
      .from('push_notification_logs')
      .select('user_id')
      .eq('notification_type', 'new_experience')
      .contains('data', { activityId })
      .in('user_id', matchingUserIds);

    if (!alreadyLoggedResult.error) {
      const alreadyLogged = new Set(
        (alreadyLoggedResult.data || []).map((row: Record<string, unknown>) => String(row.user_id || ''))
      );
      matchingUserIds = matchingUserIds.filter((userId) => !alreadyLogged.has(userId));
    }
  }

  if (matchingUserIds.length === 0) {
    return jsonResponse({
      ok: true,
      sent: 0,
      users: 0,
      radiusKm: type === 'new_experience' ? NEARBY_EXPERIENCE_RADIUS_KM : undefined,
      reason: 'Nessun utente compatibile o notifica già registrata.',
    });
  }

  const logInsertResult = await supabase
    .from('push_notification_logs')
    .insert(
      matchingUserIds.map((userId) => ({
        user_id: userId,
        notification_type: type,
        type,
        title,
        body,
        data: payload.data || {},
        status: 'in_app',
        success: null,
        error: null,
        is_read: false,
      }))
    )
    .select('id,user_id');

  if (logInsertResult.error) {
    return jsonResponse({ error: `Errore registro notifiche: ${logInsertResult.error.message}` }, 500);
  }

  const logIdsByUser = new Map<string, string>();
  (logInsertResult.data || []).forEach((row: Record<string, unknown>) => {
    const userId = String(row.user_id || '');
    const logId = String(row.id || '');
    if (userId && logId) logIdsByUser.set(userId, logId);
  });

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('user_id, expo_push_token')
    .in('user_id', matchingUserIds)
    .eq('is_active', true);

  if (tokensError) return jsonResponse({ error: tokensError.message }, 500);

  const messageRows = (tokens || [])
    .map((row: Record<string, unknown>) => ({
      userId: String(row.user_id || ''),
      token: String(row.expo_push_token || ''),
    }))
    .filter(({ userId, token }) => Boolean(userId) && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')))
    .map(({ userId, token }) => ({
      userId,
      token,
      message: {
        to: token,
        sound: 'default',
        title,
        body,
        channelId: 'bajuju-important',
        priority: 'high',
        data: { type, ...(payload.data || {}) },
      },
    }));

  if (messageRows.length === 0) {
    await Promise.all(
      matchingUserIds.map((userId) => {
        const logId = logIdsByUser.get(userId);
        if (!logId) return Promise.resolve();
        return supabase
          .from('push_notification_logs')
          .update({ status: 'in_app_only', success: false, error: 'Nessun push token valido.' })
          .eq('id', logId)
          .then(() => undefined);
      })
    );

    return jsonResponse({ ok: true, sent: 0, users: matchingUserIds.length, reason: 'Notifica interna registrata; nessun push token valido.' });
  }

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messageRows.map((row) => row.message)),
  });

  const expoResult = await expoResponse.json().catch(() => null);

  if (!expoResponse.ok) {
    await Promise.all(
      matchingUserIds.map((userId) => {
        const logId = logIdsByUser.get(userId);
        if (!logId) return Promise.resolve();
        return supabase
          .from('push_notification_logs')
          .update({ status: 'push_error', success: false, error: `Expo push HTTP ${expoResponse.status}` })
          .eq('id', logId)
          .then(() => undefined);
      })
    );

    return jsonResponse({ error: `Expo push error ${expoResponse.status}`, inAppRegistered: matchingUserIds.length }, 502);
  }

  const tickets = Array.isArray(expoResult?.data) ? expoResult.data : [];
  const successfulUsers = new Set<string>();
  const failedUsers = new Map<string, string>();

  messageRows.forEach((row, index) => {
    const ticket = tickets[index];
    if (!ticket || ticket.status === 'ok') {
      successfulUsers.add(row.userId);
      return;
    }

    const detail = String(ticket?.details?.error || ticket?.message || 'Push rifiutata da Expo');
    failedUsers.set(row.userId, detail);

    if (ticket?.details?.error === 'DeviceNotRegistered') {
      void supabase.from('push_tokens').update({ is_active: false }).eq('expo_push_token', row.token);
    }
  });

  await Promise.all(
    matchingUserIds.map((userId) => {
      const logId = logIdsByUser.get(userId);
      if (!logId) return Promise.resolve();

      if (successfulUsers.has(userId)) {
        return supabase
          .from('push_notification_logs')
          .update({ status: 'sent', success: true, error: null })
          .eq('id', logId)
          .then(() => undefined);
      }

      const error = failedUsers.get(userId) || 'Nessun push token valido per questo utente.';
      return supabase
        .from('push_notification_logs')
        .update({ status: 'in_app_only', success: false, error })
        .eq('id', logId)
        .then(() => undefined);
    })
  );

  return jsonResponse({
    ok: true,
    sent: messageRows.length,
    users: matchingUserIds.length,
    inAppRegistered: matchingUserIds.length,
    radiusKm: type === 'new_experience' ? NEARBY_EXPERIENCE_RADIUS_KM : undefined,
    expoResult,
  });
});