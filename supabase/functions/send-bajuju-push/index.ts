import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Il client indica solo COSA è successo (tipo + id di riferimento).
// Titolo, testo, destinatari e dati della notifica vengono ricostruiti qui dal database,
// così nessun utente può inviare testi arbitrari o notificare persone con cui non ha un legame reale.
type PushRequest = {
  type: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  activityId?: string | null;
  requestId?: string | null;
  // Versioni precedenti dell'app inviano gli id dentro data.
  data?: Record<string, unknown>;
};

type Row = Record<string, unknown>;

const NEARBY_EXPERIENCE_RADIUS_KM = 25;
const MAX_BODY_LENGTH = 180;
const RESPONSE_MARKER = '\n\n--- RISPOSTA BAJUJU ---\n';

// experience_reminder non è ammesso dal client: lo genera process_experience_reminders() lato database.
const CLIENT_TYPES = new Set([
  'new_experience',
  'new_flash',
  'new_participant',
  'contact_request',
  'contact_accepted',
  'contact_rejected',
  'experience_cancelled',
]);

const BROADCAST_TYPES = new Set(['new_experience', 'new_flash']);

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
    default: return '';
  }
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncate(value: string, max = MAX_BODY_LENGTH) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
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

function firstText(row: Row | null, keys: string[], fallback: string) {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function creatorIdOf(activity: Row) {
  return String(activity.creator_id || activity.organizer_id || activity.created_by || activity.user_id || '').trim();
}

function activityTitleOf(activity: Row | null, fallback: string) {
  return truncate(firstText(activity, ['title', 'titolo', 'name', 'nome'], fallback), 80);
}

function activityIsCancelled(activity: Row) {
  const status = String(activity.status || activity.stato || '').trim().toLowerCase();
  return Boolean(activity.deleted_at) ||
    activity.is_deleted === true ||
    activity.hidden === true ||
    ['deleted', 'eliminato', 'eliminata', 'annullato', 'annullata', 'cancelled'].includes(status);
}

function participantStatusIsActive(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  return ![
    'rejected', 'rifiutato', 'declined', 'annullato', 'annullata',
    'deleted', 'eliminato', 'eliminata', 'removed', 'cancellato', 'cancellata',
  ].includes(status);
}

function contactLabel(contactType: string) {
  return contactType === 'telefono' ? 'Telefono / WhatsApp' : 'Telegram';
}

function splitResponse(message: unknown) {
  const value = String(message || '');
  const index = value.indexOf(RESPONSE_MARKER);
  if (index < 0) return { original: value.trim(), response: '' };
  return {
    original: value.slice(0, index).trim(),
    response: value.slice(index + RESPONSE_MARKER.length).trim(),
  };
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

  const type = String(payload?.type || '').trim();
  if (!CLIENT_TYPES.has(type)) return jsonResponse({ error: 'Tipo notifica non consentito.' }, 400);

  const actorUserId = userData.user.id;
  if (payload.actorUserId && payload.actorUserId !== actorUserId) return jsonResponse({ error: 'Actor non autorizzato' }, 403);

  const targetUserId = cleanId(payload.targetUserId);
  const activityId = cleanId(payload.activityId) || cleanId(payload.data?.activityId);
  const requestId = cleanId(payload.requestId) || cleanId(payload.data?.requestId);
  const isBroadcast = BROADCAST_TYPES.has(type);

  if (isBroadcast && targetUserId) return jsonResponse({ error: 'Questo tipo di notifica non ha un destinatario singolo.' }, 400);
  if (!isBroadcast && !targetUserId) return jsonResponse({ error: 'targetUserId obbligatorio.' }, 400);
  if (targetUserId && targetUserId === actorUserId) return jsonResponse({ ok: true, sent: 0, users: 0, reason: 'Nessuna notifica a se stessi.' });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const prefColumn = preferenceColumn(type);

  async function loadActorName(fallback: string) {
    const profileResult = await supabase.from('profiles').select('*').eq('id', actorUserId).maybeSingle();
    if (profileResult.error || !profileResult.data) return fallback;
    return truncate(firstText(
      profileResult.data as Row,
      ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'],
      fallback
    ), 40);
  }

  async function loadActivity(id: string) {
    const result = await supabase.from('activities').select('*').eq('id', id).maybeSingle();
    return { error: result.error, activity: (result.data || null) as Row | null };
  }

  let title = '';
  let body = '';
  // Chiavi usate sia dall'app al tap sia per evitare notifiche duplicate.
  let data: Record<string, string> = {};
  let dedupKey: Record<string, string> = {};
  let province = '';
  let experienceLatitude: number | null = null;
  let experienceLongitude: number | null = null;

  if (type === 'new_experience' || type === 'new_flash') {
    if (!activityId) return jsonResponse({ error: 'activityId obbligatorio.' }, 400);

    const { error, activity } = await loadActivity(activityId);
    if (error) return jsonResponse({ error: 'Errore lettura esperienza.' }, 500);
    if (!activity) return jsonResponse({ error: 'Esperienza non trovata.' }, 404);
    if (creatorIdOf(activity) !== actorUserId) return jsonResponse({ error: 'Esperienza non appartenente all’utente autenticato.' }, 403);
    if (activityIsCancelled(activity)) return jsonResponse({ error: 'Esperienza non più attiva.' }, 403);

    const isFlash = activity.is_flash === true;
    if ((type === 'new_flash') !== isFlash) return jsonResponse({ error: 'Tipo notifica non coerente con l’esperienza.' }, 400);

    if (type === 'new_experience') {
      experienceLatitude = asFiniteNumber(activity.latitude);
      experienceLongitude = asFiniteNumber(activity.longitude);
      if (experienceLatitude === null || experienceLongitude === null) {
        return jsonResponse({ ok: true, sent: 0, reason: 'Esperienza senza coordinate: notifica geografica non inviata.' });
      }

      const experienceTitle = activityTitleOf(activity, 'una nuova esperienza');
      const organizerName = await loadActorName('Un utente');
      title = 'Nuova esperienza vicino a te';
      body = `${organizerName} ha organizzato “${experienceTitle}” vicino a te.`;
      data = { screen: 'experience', activityId, title: experienceTitle };
    } else {
      const expiresAt = Date.parse(String(activity.expires_at || ''));
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return jsonResponse({ error: 'Flash scaduto.' }, 403);

      const flashTitle = activityTitleOf(activity, 'Bajuju Flash');
      const city = firstText(activity, ['city', 'citta'], '');
      province = firstText(activity, ['province', 'provincia'], '');
      title = `Nuovo Flash: ${flashTitle}`;
      body = city ? `${truncate(city, 40)}: qualcuno ha creato un Flash Bajuju.` : 'Qualcuno ha creato un Flash Bajuju.';
      data = { screen: 'flash', activityId, title: flashTitle };
    }

    dedupKey = { activityId };
  }

  if (type === 'new_participant') {
    if (!activityId) return jsonResponse({ error: 'activityId obbligatorio per nuovo partecipante.' }, 400);

    const [{ error, activity }, participantResult] = await Promise.all([
      loadActivity(activityId),
      supabase.from('activity_participants').select('user_id,status').eq('activity_id', activityId).eq('user_id', actorUserId).limit(10),
    ]);

    if (error || participantResult.error) return jsonResponse({ error: 'Errore lettura partecipazione.' }, 500);
    if (!activity) return jsonResponse({ error: 'Esperienza non trovata.' }, 404);
    if (creatorIdOf(activity) !== targetUserId) return jsonResponse({ error: 'Destinatario non corrisponde all’organizzatore.' }, 403);

    const hasActiveParticipation = ((participantResult.data || []) as Row[]).some((row) => participantStatusIsActive(row.status));
    if (!hasActiveParticipation) return jsonResponse({ error: 'Utente non risulta partecipante attivo.' }, 403);

    const participantName = await loadActorName('Un utente Bajuju');
    title = 'Nuovo partecipante';
    body = `${participantName} partecipa a “${activityTitleOf(activity, 'questa esperienza')}”.`;
    data = { screen: 'experience', activityId };
    dedupKey = { activityId, participantId: actorUserId };
  }

  if (type === 'contact_request' || type === 'contact_accepted' || type === 'contact_rejected') {
    const isRequest = type === 'contact_request';

    let query = supabase
      .from('direct_contact_requests')
      .select('id,requester_id,sender_id,receiver_id,activity_id,contact_type,status,message,created_at');

    if (requestId) {
      query = query.eq('id', requestId);
    } else if (activityId) {
      // Compatibilità con versioni dell'app che non passano requestId.
      query = isRequest
        ? query.eq('requester_id', actorUserId).eq('receiver_id', targetUserId)
        : query.eq('receiver_id', actorUserId).eq('requester_id', targetUserId);
      query = query.eq('activity_id', activityId);
    } else {
      return jsonResponse({ error: 'requestId obbligatorio.' }, 400);
    }

    const requestResult = await query.order('created_at', { ascending: false }).limit(1);
    if (requestResult.error) return jsonResponse({ error: 'Errore lettura richiesta.' }, 500);

    const row = ((requestResult.data || []) as Row[])[0];
    if (!row) return jsonResponse({ error: 'Richiesta non trovata.' }, 404);

    const requesterId = cleanId(row.requester_id) || cleanId(row.sender_id);
    const receiverId = cleanId(row.receiver_id);
    const status = String(row.status || '').trim().toLowerCase();
    const expectedStatus = isRequest ? 'pending' : type === 'contact_accepted' ? 'accepted' : 'rejected';
    const partiesMatch = isRequest
      ? requesterId === actorUserId && receiverId === targetUserId
      : receiverId === actorUserId && requesterId === targetUserId;

    if (!partiesMatch || status !== expectedStatus) return jsonResponse({ error: 'Richiesta non coerente con la notifica.' }, 403);

    const rowId = String(row.id);
    const rowActivityId = cleanId(row.activity_id);
    const contactType = String(row.contact_type || '').trim().toLowerCase();
    const actorName = await loadActorName('Un utente Bajuju');
    let variant = '';

    if (contactType === 'flash_invite') {
      const { activity } = rowActivityId ? await loadActivity(rowActivityId) : { activity: null };
      const flashTitle = activityTitleOf(activity, 'Bajuju Flash');

      if (isRequest) {
        title = 'Nuovo invito Bajuju Flash';
        body = `${actorName} ti invita al suo Flash: ${flashTitle}.`;
        data = { screen: 'profile', section: 'flash-invites', requestId: rowId, activityId: rowActivityId };
      } else if (type === 'contact_accepted') {
        title = 'Invito Flash accettato';
        body = `${actorName} ha accettato il tuo invito al Flash “${flashTitle}”.`;
        data = { screen: 'flash-detail', requestId: rowId, activityId: rowActivityId };
      } else {
        title = 'Invito Flash rifiutato';
        body = `${actorName} non parteciperà al Flash “${flashTitle}”.`;
        data = { screen: 'profile', section: 'flash-invites', requestId: rowId, activityId: rowActivityId };
      }
    } else if (contactType === 'experience_invite') {
      const { original, response } = splitResponse(row.message);
      data = { screen: 'date-invites', requestId: rowId, activityId: rowActivityId };

      if (isRequest) {
        title = `${actorName} ti ha invitato a uscire`;
        body = truncate(original) || 'Apri Bajuju per rispondere.';
      } else if (type === 'contact_accepted' && response) {
        // La risposta viene salvata come "Nome: testo" dopo il marcatore.
        variant = 'reply';
        const prefix = `${actorName}:`;
        const replyText = response.startsWith(prefix) ? response.slice(prefix.length) : response;
        title = `${actorName} ti ha risposto`;
        body = truncate(replyText) || 'Apri Bajuju per leggere la risposta.';
      } else if (type === 'contact_accepted') {
        title = `${actorName} ha accettato il tuo invito`;
        body = 'Puoi vedere la risposta nella sezione Inviti a uscire.';
      } else {
        title = `${actorName} ha rifiutato il tuo invito`;
        body = 'L’invito a uscire non è stato accettato.';
      }
    } else if (contactType === 'telefono' || contactType === 'telegram') {
      const label = contactLabel(contactType);
      data = { screen: 'direct-contacts', requestId: rowId, activityId: rowActivityId };

      if (isRequest) {
        title = `${actorName} vuole condividere un contatto`;
        body = `${label}: apri Bajuju per accettare o rifiutare.`;
      } else if (type === 'contact_accepted') {
        title = `${actorName} ha accettato il tuo contatto`;
        body = `La condivisione ${label} è stata accettata.`;
      } else {
        title = `${actorName} ha rifiutato il tuo contatto`;
        body = `La condivisione ${label} non è stata accettata.`;
      }
    } else {
      return jsonResponse({ error: 'Tipo di richiesta non supportato.' }, 400);
    }

    if (!data.activityId) delete data.activityId;
    if (variant) data.variant = variant;
    dedupKey = variant ? { requestId: rowId, variant } : { requestId: rowId };
  }

  if (type === 'experience_cancelled') {
    if (!activityId) return jsonResponse({ error: 'activityId obbligatorio.' }, 400);

    const [{ error, activity }, participantResult] = await Promise.all([
      loadActivity(activityId),
      supabase.from('activity_participants').select('user_id').eq('activity_id', activityId).eq('user_id', targetUserId).limit(1),
    ]);

    if (error || participantResult.error) return jsonResponse({ error: 'Errore lettura esperienza.' }, 500);
    if (!activity) return jsonResponse({ error: 'Esperienza non trovata.' }, 404);
    if (creatorIdOf(activity) !== actorUserId) return jsonResponse({ error: 'Esperienza non appartenente all’utente autenticato.' }, 403);
    if (!activityIsCancelled(activity)) return jsonResponse({ error: 'Esperienza non annullata.' }, 403);
    if ((participantResult.data || []).length === 0) return jsonResponse({ error: 'Destinatario non partecipante.' }, 403);

    title = 'Esperienza annullata';
    body = `L’esperienza “${activityTitleOf(activity, 'Bajuju')}” è stata annullata.`;
    data = { screen: 'experiences', activityId };
    dedupKey = { activityId };
  }

  if (!title || !body || !prefColumn || Object.keys(dedupKey).length === 0) {
    return jsonResponse({ error: 'Notifica non costruita.' }, 500);
  }

  let matchingUserIds: string[] = [];
  let pushEligibleUserIds: string[] = [];

  if (targetUserId) {
    matchingUserIds = [targetUserId];

    const targetPreferencesResult = await supabase
      .from('notification_preferences')
      .select(`user_id, enabled, ${prefColumn}`)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetPreferencesResult.error) return jsonResponse({ error: 'Errore lettura preferenze.' }, 500);

    const targetPreferences = targetPreferencesResult.data as Row | null;
    if (targetPreferences && targetPreferences.enabled === true && targetPreferences[prefColumn] === true) {
      pushEligibleUserIds = [targetUserId];
    }
  } else {
    const preferencesResult = await supabase
      .from('notification_preferences')
      .select(`user_id, enabled, preferred_province, latitude, longitude, location_updated_at, ${prefColumn}`)
      .eq('enabled', true)
      .eq(prefColumn, true);

    if (preferencesResult.error) return jsonResponse({ error: 'Errore lettura preferenze.' }, 500);

    matchingUserIds = (preferencesResult.data || [])
      .filter((pref: Row) => {
        const userId = String(pref.user_id || '').trim();
        if (!userId || userId === actorUserId) return false;

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
      .map((pref: Row) => String(pref.user_id));

    matchingUserIds = [...new Set(matchingUserIds)];
    pushEligibleUserIds = [...matchingUserIds];
  }

  if (matchingUserIds.length > 0) {
    const [blockedByActorResult, actorBlockedResult] = await Promise.all([
      supabase.from('user_blocks').select('blocked_id').eq('blocker_id', actorUserId).in('blocked_id', matchingUserIds),
      supabase.from('user_blocks').select('blocker_id').eq('blocked_id', actorUserId).in('blocker_id', matchingUserIds),
    ]);

    const blockedIds = new Set<string>();
    (blockedByActorResult.data || []).forEach((row: Row) => {
      if (row.blocked_id) blockedIds.add(String(row.blocked_id));
    });
    (actorBlockedResult.data || []).forEach((row: Row) => {
      if (row.blocker_id) blockedIds.add(String(row.blocker_id));
    });

    matchingUserIds = matchingUserIds.filter((userId) => !blockedIds.has(userId));
  }

  // Ogni evento/richiesta genera al massimo una notifica per destinatario, anche se il client riprova.
  if (matchingUserIds.length > 0) {
    const alreadyLoggedResult = await supabase
      .from('push_notification_logs')
      .select('user_id')
      .eq('notification_type', type)
      .contains('data', dedupKey)
      .in('user_id', matchingUserIds);

    if (alreadyLoggedResult.error) return jsonResponse({ error: 'Errore verifica notifiche precedenti.' }, 500);

    const alreadyLogged = new Set((alreadyLoggedResult.data || []).map((row: Row) => String(row.user_id || '')));
    matchingUserIds = matchingUserIds.filter((userId) => !alreadyLogged.has(userId));
  }

  pushEligibleUserIds = pushEligibleUserIds.filter((userId) => matchingUserIds.includes(userId));

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
        data,
        status: 'in_app',
        success: null,
        error: null,
        is_read: false,
      }))
    )
    .select('id,user_id');

  if (logInsertResult.error) {
    console.error('Registro notifiche:', logInsertResult.error.message);
    return jsonResponse({ error: 'Errore registro notifiche.' }, 500);
  }

  const logIdsByUser = new Map<string, string>();
  (logInsertResult.data || []).forEach((row: Row) => {
    const userId = String(row.user_id || '');
    const logId = String(row.id || '');
    if (userId && logId) logIdsByUser.set(userId, logId);
  });

  let tokens: Row[] = [];
  if (pushEligibleUserIds.length > 0) {
    const tokensResult = await supabase
      .from('push_tokens')
      .select('user_id, expo_push_token')
      .in('user_id', pushEligibleUserIds)
      .eq('is_active', true);

    if (tokensResult.error) {
      console.error('Lettura token push:', tokensResult.error.message);
      return jsonResponse({ error: 'Errore lettura token push.' }, 500);
    }
    tokens = (tokensResult.data || []) as Row[];
  }

  const messageRows = (tokens || [])
    .map((row: Row) => ({
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
        data: { type, ...data },
      },
    }));

  if (messageRows.length === 0) {
    const noPushReason = pushEligibleUserIds.length === 0
      ? 'Push non abilitata nelle preferenze; notifica interna registrata.'
      : 'Nessun push token valido.';

    await Promise.all(
      matchingUserIds.map((userId) => {
        const logId = logIdsByUser.get(userId);
        if (!logId) return Promise.resolve();
        return supabase
          .from('push_notification_logs')
          .update({ status: 'in_app_only', success: false, error: noPushReason })
          .eq('id', logId)
          .then(() => undefined);
      })
    );

    return jsonResponse({ ok: true, sent: 0, users: matchingUserIds.length, inAppRegistered: matchingUserIds.length, reason: noPushReason });
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
  });
});
