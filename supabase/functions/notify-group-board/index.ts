import { createClient } from 'npm:@supabase/supabase-js@2';

// Notifica agli iscritti di un gruppo un nuovo annuncio/foto o un nuovo sondaggio in Bacheca.
// Il client manda solo groupId, tipo e id: testo e destinatari si ricostruiscono qui dal database,
// e si notifica solo un contenuto appena creato da chi chiama.
const NOTIFICATION_TYPE = 'group_board_post';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function preview(value: string) {
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

  let payload: { groupId?: string; kind?: string; id?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const groupId = String(payload.groupId || '').trim();
  const itemId = String(payload.id || '').trim();
  const kind = payload.kind === 'poll' ? 'poll' : payload.kind === 'post' ? 'post' : '';
  if (!UUID_PATTERN.test(groupId) || !UUID_PATTERN.test(itemId) || !kind) {
    return jsonResponse({ error: 'Dati non validi' }, 400);
  }

  const senderId = userData.user.id;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const itemQuery = kind === 'post'
    ? supabase.from('group_posts').select('id,group_id,author_id,body,image_urls,created_at,deleted_at').eq('id', itemId).maybeSingle()
    : supabase.from('group_polls').select('id,group_id,created_by,question,created_at').eq('id', itemId).maybeSingle();

  const [groupResult, membersResult, itemResult] = await Promise.all([
    supabase.from('groups').select('id,owner_id,name,status').eq('id', groupId).maybeSingle(),
    supabase.from('group_members').select('user_id').eq('group_id', groupId),
    itemQuery,
  ]);

  if (groupResult.error) return jsonResponse({ error: groupResult.error.message }, 500);
  if (membersResult.error) return jsonResponse({ error: membersResult.error.message }, 500);
  if (itemResult.error) return jsonResponse({ error: itemResult.error.message }, 500);
  if (!groupResult.data) return jsonResponse({ error: 'Gruppo non trovato' }, 404);

  const group = groupResult.data;
  if (String(group.status || '') !== 'active') return jsonResponse({ ok: true, sent: 0, reason: 'Gruppo non attivo.' });

  // Il contenuto è già stato salvato con le regole della bacheca: deve essere di chi chiama e di questo gruppo.
  const item = itemResult.data as Record<string, unknown> | null;
  const authorId = String((kind === 'post' ? item?.author_id : item?.created_by) || '');
  if (!item || String(item.group_id || '') !== groupId || authorId !== senderId || (kind === 'post' && item.deleted_at)) {
    return jsonResponse({ error: 'Contenuto non trovato' }, 400);
  }

  const itemAge = Date.now() - new Date(String(item.created_at || '')).getTime();
  if (!Number.isFinite(itemAge) || itemAge < -5000 || itemAge > 5 * 60 * 1000) {
    return jsonResponse({ ok: true, sent: 0, reason: 'Nessun nuovo contenuto da notificare.' });
  }

  const ownerId = String(group.owner_id || '').trim();
  const memberIds = (membersResult.data || []).map((row) => String(row.user_id || '').trim()).filter(Boolean);
  const recipientCandidates = [...new Set([ownerId, ...memberIds])]
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

  // Chi ha spento tutte le notifiche non le riceve.
  const disabledResult = await supabase
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', unblockedRecipients)
    .eq('enabled', false);
  if (disabledResult.error) return jsonResponse({ error: disabledResult.error.message }, 500);
  const disabledIds = new Set((disabledResult.data || []).map((row) => String(row.user_id || '')));
  let eligibleRecipients = unblockedRecipients.filter((userId) => !disabledIds.has(userId));

  const duplicateResult = await supabase
    .from('push_notification_logs')
    .select('user_id')
    .eq('notification_type', NOTIFICATION_TYPE)
    .contains('data', { itemId })
    .in('user_id', eligibleRecipients);
  if (!duplicateResult.error) {
    const alreadySent = new Set((duplicateResult.data || []).map((row) => String(row.user_id || '')));
    eligibleRecipients = eligibleRecipients.filter((userId) => !alreadySent.has(userId));
  }
  if (eligibleRecipients.length === 0) {
    return jsonResponse({ ok: true, sent: 0, users: 0, reason: 'Già notificato o notifiche spente.' });
  }

  const groupName = String(group.name || '').trim() || 'il tuo gruppo';
  let title: string;
  let body: string;
  if (kind === 'poll') {
    title = `Nuovo sondaggio in «${groupName}»`;
    body = preview(String(item.question || '')) || 'Vota anche tu.';
  } else {
    const photoCount = Array.isArray(item.image_urls) ? item.image_urls.length : 0;
    const text = preview(String(item.body || ''));
    title = text ? `Nuovo annuncio in «${groupName}»` : `Nuove foto in «${groupName}»`;
    body = text || (photoCount === 1 ? 'È stata pubblicata una foto.' : `Sono state pubblicate ${photoCount} foto.`);
  }
  const data = {
    type: NOTIFICATION_TYPE,
    screen: 'group-detail',
    groupId,
    section: 'board',
    kind,
    itemId,
  };

  const logInsertResult = await supabase
    .from('push_notification_logs')
    .insert(eligibleRecipients.map((userId) => ({
      user_id: userId,
      notification_type: NOTIFICATION_TYPE,
      type: NOTIFICATION_TYPE,
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
    return jsonResponse({ ok: true, sent: 0, users: eligibleRecipients.length, reason: 'Nessun push token valido.' });
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

  return jsonResponse({ ok: true, sent: successfulUsers.size, users: eligibleRecipients.length });
});