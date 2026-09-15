import { createClient } from 'npm:@supabase/supabase-js@2';

const CHAT_COOLDOWN_SECONDS = 60;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function participantStatusIsActive(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  return ![
    'rejected','rifiutato','declined','annullato','annullata',
    'deleted','eliminato','eliminata','removed','cancellato','cancellata',
  ].includes(status);
}

function messagePreview(value: string) {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= 100 ? clean : `${clean.slice(0, 97)}...`;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

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
  if (userError || !userData.user) return jsonResponse({ error: 'Authentication required' }, 401);

  let payload: { activityId?: string; message?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const activityId = String(payload.activityId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activityId)) {
    return jsonResponse({ error: 'activityId non valido' }, 400);
  }

  const senderId = userData.user.id;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [activityResult, participantsResult, latestMessageResult] = await Promise.all([
    supabase.from('activities').select('id,creator_id,title').eq('id', activityId).maybeSingle(),
    supabase.from('activity_participants').select('user_id,status').eq('activity_id', activityId),
    supabase.from('activity_messages').select('id,message,created_at').eq('activity_id', activityId).eq('sender_id', senderId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (activityResult.error) return jsonResponse({ error: activityResult.error.message }, 500);
  if (participantsResult.error) return jsonResponse({ error: participantsResult.error.message }, 500);
  if (latestMessageResult.error) return jsonResponse({ error: latestMessageResult.error.message }, 500);
  if (!activityResult.data) return jsonResponse({ error: 'Esperienza non trovata' }, 404);

  const activity = activityResult.data;
  const creatorId = String(activity.creator_id || '').trim();
  const activeParticipantIds = (participantsResult.data || [])
    .filter((row) => participantStatusIsActive(row.status))
    .map((row) => String(row.user_id || '').trim())
    .filter(Boolean);

  const senderCanUseChat = senderId === creatorId || activeParticipantIds.includes(senderId);
  if (!senderCanUseChat) return jsonResponse({ error: 'Utente non autorizzato alla chat' }, 403);

  const latestMessage = latestMessageResult.data;
  if (!latestMessage) return jsonResponse({ error: 'Messaggio chat non trovato' }, 400);

  const messageAge = Date.now() - new Date(latestMessage.created_at).getTime();
  if (!Number.isFinite(messageAge) || messageAge < -5000 || messageAge > 2 * 60 * 1000) {
    return jsonResponse({ ok: true, sent: 0, reason: 'Nessun nuovo messaggio da notificare.' });
  }

  const authoritativeMessage = String(latestMessage.message || '').trim();
  if (!authoritativeMessage) return jsonResponse({ ok: true, sent: 0 });

  const recipientCandidates = [...new Set([creatorId, ...activeParticipantIds])]
    .filter((userId) => userId && userId !== senderId);
  if (recipientCandidates.length === 0) return jsonResponse({ ok: true, sent: 0, users: 0 });

  const [blockedBySenderResult, senderBlockedResult] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', senderId).in('blocked_id', recipientCandidates),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', senderId).in('blocker_id', recipientCandidates),
  ]);
  if (blockedBySenderResult.error) return jsonResponse({ error: blockedBySenderResult.error.message }, 500);
  if (senderBlockedResult.error) return jsonResponse({ error: senderBlockedResult.error.message }, 500);

  const blockedIds = new Set<string>();
  (blockedBySenderResult.data || []).forEach((row) => blockedIds.add(String(row.blocked_id || '')));
  (senderBlockedResult.data || []).forEach((row) => blockedIds.add(String(row.blocker_id || '')));
  const unblockedRecipients = recipientCandidates.filter((userId) => !blockedIds.has(userId));
  if (unblockedRecipients.length === 0) return jsonResponse({ ok: true, sent: 0, users: 0 });

  const preferencesResult = await supabase
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', unblockedRecipients)
    .eq('enabled', true)
    .eq('notify_chat_messages', true);
  if (preferencesResult.error) return jsonResponse({ error: preferencesResult.error.message }, 500);

  let eligibleRecipients = (preferencesResult.data || []).map((row) => String(row.user_id || '')).filter(Boolean);
  if (eligibleRecipients.length === 0) {
    return jsonResponse({ ok: true, sent: 0, users: 0, reason: 'Notifiche chat disattivate dai destinatari.' });
  }

  const duplicateResult = await supabase
    .from('push_notification_logs')
    .select('user_id')
    .eq('notification_type', 'chat_message')
    .contains('data', { messageId: latestMessage.id })
    .in('user_id', eligibleRecipients);
  if (!duplicateResult.error) {
    const alreadySent = new Set((duplicateResult.data || []).map((row) => String(row.user_id || '')));
    eligibleRecipients = eligibleRecipients.filter((userId) => !alreadySent.has(userId));
  }
  if (eligibleRecipients.length === 0) {
    return jsonResponse({ ok: true, sent: 0, users: 0, reason: 'Messaggio già notificato.' });
  }

  const cutoff = new Date(Date.now() - CHAT_COOLDOWN_SECONDS * 1000).toISOString();
  const recentLogsResult = await supabase
    .from('push_notification_logs')
    .select('user_id')
    .eq('notification_type', 'chat_message')
    .contains('data', { activityId })
    .gte('created_at', cutoff)
    .in('user_id', eligibleRecipients);

  let throttled = 0;
  if (!recentLogsResult.error) {
    const recentlyNotified = new Set((recentLogsResult.data || []).map((row) => String(row.user_id || '')));
    const before = eligibleRecipients.length;
    eligibleRecipients = eligibleRecipients.filter((userId) => !recentlyNotified.has(userId));
    throttled = before - eligibleRecipients.length;
  }
  if (eligibleRecipients.length === 0) {
    return jsonResponse({ ok: true, sent: 0, users: 0, throttled, reason: 'Notifica chat raggruppata per evitare spam.' });
  }

  const profileResult = await supabase.from('profiles').select('nickname').eq('id', senderId).maybeSingle();
  const senderName = String(profileResult.data?.nickname || '').trim() || 'Un utente Bajuju';
  const eventTitle = String(activity.title || '').trim() || 'questa esperienza';
  const title = `${senderName} ha scritto su “${eventTitle}”`;
  const body = messagePreview(authoritativeMessage);
  const data = {
    type: 'chat_message',
    screen: 'experience',
    activityId,
    section: 'chat',
    messageId: latestMessage.id,
  };

  const logInsertResult = await supabase
    .from('push_notification_logs')
    .insert(eligibleRecipients.map((userId) => ({
      user_id: userId,
      notification_type: 'chat_message',
      type: 'chat_message',
      title,
      body,
      data,
      status: 'in_app',
      success: null,
      error: null,
      is_read: false,
    })))
    .select('id,user_id');
  if (logInsertResult.error) {
    return jsonResponse({ error: `Errore registro notifiche: ${logInsertResult.error.message}` }, 500);
  }

  const logIdsByUser = new Map<string, string>();
  (logInsertResult.data || []).forEach((row) => {
    if (row.user_id && row.id) logIdsByUser.set(String(row.user_id), String(row.id));
  });

  const tokensResult = await supabase
    .from('push_tokens')
    .select('user_id,expo_push_token')
    .in('user_id', eligibleRecipients)
    .eq('is_active', true);
  if (tokensResult.error) return jsonResponse({ error: tokensResult.error.message }, 500);

  const messageRows = (tokensResult.data || [])
    .map((row) => ({ userId: String(row.user_id || ''), token: String(row.expo_push_token || '') }))
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
        data,
      },
    }));

  if (messageRows.length === 0) {
    await Promise.all(eligibleRecipients.map((userId) => {
      const logId = logIdsByUser.get(userId);
      if (!logId) return Promise.resolve();
      return supabase.from('push_notification_logs').update({ status: 'in_app_only', success: false, error: 'Nessun push token valido.' }).eq('id', logId).then(() => undefined);
    }));
    return jsonResponse({ ok: true, sent: 0, users: eligibleRecipients.length, throttled, reason: 'Nessun push token valido.' });
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
    await Promise.all(eligibleRecipients.map((userId) => {
      const logId = logIdsByUser.get(userId);
      if (!logId) return Promise.resolve();
      return supabase.from('push_notification_logs').update({ status: 'push_error', success: false, error: `Expo push HTTP ${expoResponse.status}` }).eq('id', logId).then(() => undefined);
    }));
    return jsonResponse({ error: `Expo push error ${expoResponse.status}`, users: eligibleRecipients.length }, 502);
  }

  const tickets = Array.isArray(expoResult?.data) ? expoResult.data : [];
  const successfulUsers = new Set<string>();
  const failedUsers = new Map<string, string>();

  messageRows.forEach((row, index) => {
    const ticket = tickets[index];
    if (ticket?.status === 'ok') {
      successfulUsers.add(row.userId);
      return;
    }
    const detail = String(ticket?.details?.error || ticket?.message || 'Push rifiutata da Expo');
    if (!successfulUsers.has(row.userId)) failedUsers.set(row.userId, detail);
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      void supabase.from('push_tokens').update({ is_active: false }).eq('expo_push_token', row.token);
    }
  });

  await Promise.all(eligibleRecipients.map((userId) => {
    const logId = logIdsByUser.get(userId);
    if (!logId) return Promise.resolve();
    if (successfulUsers.has(userId)) {
      return supabase.from('push_notification_logs').update({ status: 'sent', success: true, error: null, sent_at: new Date().toISOString() }).eq('id', logId).then(() => undefined);
    }
    return supabase.from('push_notification_logs').update({ status: 'in_app_only', success: false, error: failedUsers.get(userId) || 'Nessun push token valido per questo utente.' }).eq('id', logId).then(() => undefined);
  }));

  return jsonResponse({ ok: true, sent: successfulUsers.size, users: eligibleRecipients.length, throttled });
});