import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ChatPushRequest = {
  activityId?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

  let payload: ChatPushRequest;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const activityId = String(payload.activityId || '').trim();
  if (!activityId) {
    return jsonResponse({ error: 'activityId obbligatorio' }, 400);
  }

  const actorUserId = userData.user.id;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const activityResult = await supabase
    .from('activities')
    .select('id,title,creator_id,is_flash,deleted_at')
    .eq('id', activityId)
    .maybeSingle();

  if (activityResult.error) {
    return jsonResponse({ error: activityResult.error.message }, 500);
  }

  if (!activityResult.data || activityResult.data.deleted_at) {
    return jsonResponse({ error: 'Esperienza non trovata' }, 404);
  }

  const activity = activityResult.data as {
    id: string;
    title: string | null;
    creator_id: string;
    is_flash: boolean;
    deleted_at: string | null;
  };

  const participantsResult = await supabase
    .from('activity_participants')
    .select('user_id,status')
    .eq('activity_id', activityId);

  if (participantsResult.error) {
    return jsonResponse({ error: participantsResult.error.message }, 500);
  }

  const activeParticipantIds = (participantsResult.data || [])
    .filter((row: { user_id: string; status: string }) => String(row.status || '').toLowerCase() !== 'annullato')
    .map((row: { user_id: string }) => String(row.user_id));

  const actorIsAllowed =
    actorUserId === String(activity.creator_id) || activeParticipantIds.includes(actorUserId);

  if (!actorIsAllowed) {
    return jsonResponse({ error: 'Utente non autorizzato alla chat' }, 403);
  }

  const recipientSet = new Set<string>([
    String(activity.creator_id),
    ...activeParticipantIds,
  ]);
  recipientSet.delete(actorUserId);

  if (recipientSet.size === 0) {
    return jsonResponse({ ok: true, sent: 0, reason: 'Nessun destinatario' });
  }

  const recipientIds = Array.from(recipientSet);

  const [blockedByActorResult, actorBlockedResult] = await Promise.all([
    supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', actorUserId)
      .in('blocked_id', recipientIds),
    supabase
      .from('user_blocks')
      .select('blocker_id')
      .eq('blocked_id', actorUserId)
      .in('blocker_id', recipientIds),
  ]);

  const blockedIds = new Set<string>();
  (blockedByActorResult.data || []).forEach((row: { blocked_id: string }) => blockedIds.add(String(row.blocked_id)));
  (actorBlockedResult.data || []).forEach((row: { blocker_id: string }) => blockedIds.add(String(row.blocker_id)));

  const allowedRecipientIds = recipientIds.filter((userId) => !blockedIds.has(userId));
  if (allowedRecipientIds.length === 0) {
    return jsonResponse({ ok: true, sent: 0, reason: 'Nessun destinatario abilitato' });
  }

  const preferencesResult = await supabase
    .from('notification_preferences')
    .select('user_id,enabled')
    .in('user_id', allowedRecipientIds)
    .eq('enabled', true);

  if (preferencesResult.error) {
    return jsonResponse({ error: preferencesResult.error.message }, 500);
  }

  const enabledUserIds = (preferencesResult.data || []).map((row: { user_id: string }) => String(row.user_id));
  if (enabledUserIds.length === 0) {
    return jsonResponse({ ok: true, sent: 0, reason: 'Notifiche disattivate dai destinatari' });
  }

  const tokensResult = await supabase
    .from('push_tokens')
    .select('user_id,expo_push_token')
    .in('user_id', enabledUserIds)
    .eq('is_active', true);

  if (tokensResult.error) {
    return jsonResponse({ error: tokensResult.error.message }, 500);
  }

  const profileResult = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', actorUserId)
    .maybeSingle();

  const senderName = String(profileResult.data?.nickname || 'Un partecipante').trim() || 'Un partecipante';
  const activityTitle = String(activity.title || 'Bajuju').trim() || 'Bajuju';
  const title = activity.is_flash ? 'Nuovo messaggio Flash' : 'Nuovo messaggio Bajuju';
  const body = `${senderName} ha scritto nella chat di “${activityTitle}”.`;
  const screen = activity.is_flash ? 'flash-detail' : 'experience';

  const validTokens = (tokensResult.data || []).filter((row: { expo_push_token: string }) => {
    const token = String(row.expo_push_token || '');
    return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
  });

  if (validTokens.length === 0) {
    return jsonResponse({ ok: true, sent: 0, reason: 'Nessun push token valido' });
  }

  const messages = validTokens.map((row: { expo_push_token: string }) => ({
    to: row.expo_push_token,
    sound: 'default',
    title,
    body,
    channelId: 'bajuju-important',
    priority: 'high',
    data: {
      type: 'chat_message',
      screen,
      activityId,
    },
  }));

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const expoResult = await expoResponse.json().catch(() => null);

  if (!expoResponse.ok) {
    return jsonResponse({ error: `Expo push error ${expoResponse.status}`, expoResult }, 502);
  }

  const loggedUserIds = Array.from(
    new Set(validTokens.map((row: { user_id: string }) => String(row.user_id)))
  );

  await supabase.from('push_notification_logs').insert(
    loggedUserIds.map((userId) => ({
      user_id: userId,
      notification_type: 'chat_message',
      type: 'chat_message',
      title,
      body,
      data: { type: 'chat_message', screen, activityId },
      status: 'sent',
      success: true,
      error: null,
    }))
  );

  return jsonResponse({
    ok: true,
    sent: messages.length,
    users: loggedUserIds.length,
  });
});
