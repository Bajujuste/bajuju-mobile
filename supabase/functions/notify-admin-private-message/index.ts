import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function cleanText(value: unknown, maxLength = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ ok: false, error: 'SERVER_NOT_CONFIGURED' }, 500);
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userResult = await authClient.auth.getUser();
  const actorUserId = userResult.data.user?.id || '';
  if (userResult.error || !actorUserId) {
    return jsonResponse({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
  }

  const messageId = cleanText(body.messageId, 100);
  const threadId = cleanText(body.threadId, 100);
  const targetUserId = cleanText(body.targetUserId, 100);

  if (!messageId || !threadId || !targetUserId) {
    return jsonResponse({ ok: false, error: 'MISSING_FIELDS' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [mainAdminResult, threadResult, messageResult] = await Promise.all([
    supabase.rpc('bajuju_main_admin_id'),
    supabase
      .from('admin_private_threads')
      .select('id,user_id')
      .eq('id', threadId)
      .maybeSingle(),
    supabase
      .from('admin_private_messages')
      .select('id,thread_id,sender_id,message')
      .eq('id', messageId)
      .maybeSingle(),
  ]);

  if (mainAdminResult.error || threadResult.error || messageResult.error) {
    return jsonResponse({ ok: false, error: 'DATABASE_READ_FAILED' }, 500);
  }

  if (!mainAdminResult.data || String(mainAdminResult.data) !== actorUserId) {
    return jsonResponse({ ok: false, error: 'MAIN_BAJUJU_ADMIN_REQUIRED' }, 403);
  }

  if (!threadResult.data || String(threadResult.data.user_id || '') !== targetUserId) {
    return jsonResponse({ ok: false, error: 'INVALID_TARGET_THREAD' }, 403);
  }

  if (
    !messageResult.data ||
    String(messageResult.data.thread_id || '') !== threadId ||
    String(messageResult.data.sender_id || '') !== actorUserId
  ) {
    return jsonResponse({ ok: false, error: 'INVALID_ADMIN_MESSAGE' }, 403);
  }

  const existingLogResult = await supabase
    .from('push_notification_logs')
    .select('id')
    .eq('user_id', targetUserId)
    .eq('notification_type', 'admin_message')
    .contains('data', { messageId })
    .limit(1);

  if (!existingLogResult.error && (existingLogResult.data || []).length > 0) {
    return jsonResponse({ ok: true, sent: 0, duplicate: true });
  }

  const fullMessage = cleanText(messageResult.data.message, 2000);
  const preview = fullMessage.length > 150 ? `${fullMessage.slice(0, 147)}...` : fullMessage;
  const title = 'Messaggio dall’amministratore';
  const data = {
    type: 'admin_message',
    screen: 'admin-private-chat',
    threadId,
    messageId,
  };

  const logInsertResult = await supabase
    .from('push_notification_logs')
    .insert({
      user_id: targetUserId,
      notification_type: 'admin_message',
      type: 'admin_message',
      title,
      body: preview,
      data,
      status: 'in_app',
      success: null,
      error: null,
      is_read: false,
    })
    .select('id')
    .maybeSingle();

  if (logInsertResult.error || !logInsertResult.data?.id) {
    return jsonResponse({ ok: false, error: 'NOTIFICATION_LOG_FAILED' }, 500);
  }

  const logId = String(logInsertResult.data.id);

  const preferenceResult = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', targetUserId)
    .maybeSingle();

  const pushEnabled = !preferenceResult.error && preferenceResult.data?.enabled === true;

  if (!pushEnabled) {
    await supabase
      .from('push_notification_logs')
      .update({
        status: 'in_app_only',
        success: false,
        error: 'Push disattivata nelle preferenze utente.',
      })
      .eq('id', logId);

    return jsonResponse({ ok: true, sent: 0, inAppRegistered: 1, reason: 'PUSH_DISABLED' });
  }

  const tokensResult = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', targetUserId)
    .eq('is_active', true);

  if (tokensResult.error) {
    return jsonResponse({ ok: false, error: tokensResult.error.message }, 500);
  }

  const tokens = [...new Set(
    (tokensResult.data || [])
      .map((row: Record<string, unknown>) => String(row.expo_push_token || '').trim())
      .filter((token: string) => token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  )];

  if (tokens.length === 0) {
    await supabase
      .from('push_notification_logs')
      .update({
        status: 'in_app_only',
        success: false,
        error: 'Nessun push token valido.',
      })
      .eq('id', logId);

    return jsonResponse({ ok: true, sent: 0, inAppRegistered: 1, reason: 'NO_PUSH_TOKEN' });
  }

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body: preview,
    channelId: 'bajuju-important',
    priority: 'high',
    data,
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
    await supabase
      .from('push_notification_logs')
      .update({
        status: 'push_error',
        success: false,
        error: `Expo push HTTP ${expoResponse.status}`,
      })
      .eq('id', logId);

    return jsonResponse({ ok: false, error: 'EXPO_PUSH_FAILED', inAppRegistered: 1 }, 502);
  }

  const tickets = Array.isArray(expoResult?.data) ? expoResult.data : [];
  let sent = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const ticket = tickets[index];
    if (!ticket || ticket.status === 'ok') {
      sent += 1;
      continue;
    }

    if (ticket?.details?.error === 'DeviceNotRegistered') {
      await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('expo_push_token', tokens[index]);
    }
  }

  await supabase
    .from('push_notification_logs')
    .update({
      status: sent > 0 ? 'sent' : 'in_app_only',
      success: sent > 0,
      error: sent > 0 ? null : 'Push non consegnata da Expo.',
    })
    .eq('id', logId);

  return jsonResponse({ ok: true, sent, inAppRegistered: 1, expoResult });
});
