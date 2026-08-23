import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RequestBody = {
  activityId?: string;
  groupIds?: string[];
};

type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function text(row: Row | null, keys: string[], fallback: string) {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Missing Supabase env vars' }, 500);
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Authentication required' }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Authentication required' }, 401);
  const actorUserId = userData.user.id;

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const activityId = String(body.activityId || '').trim();
  const requestedGroupIds = Array.isArray(body.groupIds)
    ? [...new Set(body.groupIds.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];

  if (!activityId) return json({ error: 'activityId obbligatorio.' }, 400);
  if (requestedGroupIds.length === 0) {
    return json({ ok: true, sent: 0, groups: 0, reason: 'Nessun gruppo selezionato.' });
  }
  if (requestedGroupIds.length > 20) {
    return json({ error: 'Puoi informare al massimo 20 gruppi per esperienza.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [activityResult, groupsResult, actorProfileResult] = await Promise.all([
    supabase.from('activities').select('id,creator_id,title,is_flash,deleted_at').eq('id', activityId).maybeSingle(),
    supabase.from('groups').select('id,name,owner_id,status').in('id', requestedGroupIds),
    supabase.from('profiles').select('nickname').eq('id', actorUserId).maybeSingle(),
  ]);

  if (activityResult.error) return json({ error: activityResult.error.message }, 500);
  if (groupsResult.error) return json({ error: groupsResult.error.message }, 500);
  if (!activityResult.data) return json({ error: 'Esperienza non trovata.' }, 404);

  const activity = activityResult.data as Row;
  if (String(activity.creator_id || '') !== actorUserId) {
    return json({ error: 'Puoi informare i gruppi solo per una tua esperienza.' }, 403);
  }
  if (activity.is_flash === true || activity.deleted_at) {
    return json({ error: 'Questa esperienza non può essere associata ai gruppi.' }, 400);
  }

  const selectedGroups = (groupsResult.data || []) as Row[];
  if (selectedGroups.length !== requestedGroupIds.length) {
    return json({ error: 'Uno o più gruppi non esistono.' }, 404);
  }

  const unauthorizedGroup = selectedGroups.find(
    (group) => String(group.owner_id || '') !== actorUserId || String(group.status || '') !== 'active'
  );
  if (unauthorizedGroup) {
    return json({ error: 'Puoi informare solo gruppi attivi di cui sei proprietario.' }, 403);
  }

  const associationRows = selectedGroups.map((group) => ({
    group_id: String(group.id),
    activity_id: activityId,
    linked_by: actorUserId,
  }));

  const associationResult = await supabase
    .from('group_activities')
    .upsert(associationRows, { onConflict: 'group_id,activity_id', ignoreDuplicates: true });

  if (associationResult.error) {
    return json({ error: `Errore associazione gruppi: ${associationResult.error.message}` }, 500);
  }

  const groupIds = selectedGroups.map((group) => String(group.id));
  const membersResult = await supabase.from('group_members').select('user_id').in('group_id', groupIds);
  if (membersResult.error) return json({ error: membersResult.error.message }, 500);

  let candidateUserIds = [
    ...new Set(
      (membersResult.data || [])
        .map((row: Row) => String(row.user_id || ''))
        .filter((id) => id && id !== actorUserId)
    ),
  ];

  if (candidateUserIds.length === 0) {
    return json({ ok: true, sent: 0, groups: groupIds.length, users: 0, reason: 'I gruppi non hanno altri iscritti.' });
  }

  const [blockedByActorResult, actorBlockedResult, preferencesResult] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', actorUserId).in('blocked_id', candidateUserIds),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', actorUserId).in('blocker_id', candidateUserIds),
    supabase.from('notification_preferences').select('user_id,enabled,notify_new_experience').in('user_id', candidateUserIds),
  ]);

  const blockedIds = new Set<string>();
  (blockedByActorResult.data || []).forEach((row: Row) => {
    if (row.blocked_id) blockedIds.add(String(row.blocked_id));
  });
  (actorBlockedResult.data || []).forEach((row: Row) => {
    if (row.blocker_id) blockedIds.add(String(row.blocker_id));
  });
  candidateUserIds = candidateUserIds.filter((id) => !blockedIds.has(id));

  const allowedByPreferences = new Set(
    (preferencesResult.data || [])
      .filter((row: Row) => row.enabled === true && row.notify_new_experience === true)
      .map((row: Row) => String(row.user_id || ''))
  );
  candidateUserIds = candidateUserIds.filter((id) => allowedByPreferences.has(id));

  if (candidateUserIds.length === 0) {
    return json({ ok: true, sent: 0, groups: groupIds.length, users: 0, reason: 'Nessun iscritto con notifiche attive.' });
  }

  const alreadyLoggedResult = await supabase
    .from('push_notification_logs')
    .select('user_id')
    .eq('notification_type', 'new_experience')
    .contains('data', { activityId })
    .in('user_id', candidateUserIds);

  if (!alreadyLoggedResult.error) {
    const alreadyLogged = new Set(
      (alreadyLoggedResult.data || []).map((row: Row) => String(row.user_id || ''))
    );
    candidateUserIds = candidateUserIds.filter((id) => !alreadyLogged.has(id));
  }

  if (candidateUserIds.length === 0) {
    return json({
      ok: true,
      sent: 0,
      groups: groupIds.length,
      users: 0,
      reason: 'Notifica già registrata per tutti gli iscritti compatibili.',
    });
  }

  const experienceTitle = text(activity, ['title'], 'una nuova esperienza');
  const organizerName = text(
    (actorProfileResult.data || null) as Row | null,
    ['nickname'],
    'Un organizzatore'
  );
  const groupNames = selectedGroups.map((group) => text(group, ['name'], 'Gruppo Bajuju'));
  const title = groupNames.length === 1
    ? `Nuova esperienza in ${groupNames[0]}`
    : 'Nuova esperienza nei tuoi gruppi';
  const notificationBody = `${organizerName} ha organizzato “${experienceTitle}”.`;
  const data = {
    screen: 'experience',
    activityId,
    title: experienceTitle,
    groupIds,
  };

  const logResult = await supabase
    .from('push_notification_logs')
    .insert(
      candidateUserIds.map((userId) => ({
        user_id: userId,
        notification_type: 'new_experience',
        type: 'new_experience',
        title,
        body: notificationBody,
        data,
        status: 'in_app',
        success: null,
        error: null,
        is_read: false,
      }))
    )
    .select('id,user_id');

  if (logResult.error) {
    return json({ error: `Errore registro notifiche: ${logResult.error.message}` }, 500);
  }

  const logByUser = new Map<string, string>();
  (logResult.data || []).forEach((row: Row) => {
    const userId = String(row.user_id || '');
    const id = String(row.id || '');
    if (userId && id) logByUser.set(userId, id);
  });

  const tokensResult = await supabase
    .from('push_tokens')
    .select('user_id,expo_push_token')
    .in('user_id', candidateUserIds)
    .eq('is_active', true);

  if (tokensResult.error) return json({ error: tokensResult.error.message }, 500);

  const rows = (tokensResult.data || [])
    .map((row: Row) => ({
      userId: String(row.user_id || ''),
      token: String(row.expo_push_token || ''),
    }))
    .filter(
      ({ userId, token }) =>
        userId && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
    );

  const usersWithValidToken = new Set(rows.map((row) => row.userId));
  const successfulUsers = new Set<string>();
  const failedUsers = new Map<string, string>();

  for (const batch of chunks(rows, 100)) {
    const messages = batch.map((row) => ({
      to: row.token,
      sound: 'default',
      title,
      body: notificationBody,
      channelId: 'bajuju-important',
      priority: 'high',
      data: { type: 'new_experience', ...data },
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
    const tickets = Array.isArray(expoResult?.data) ? expoResult.data : [];

    batch.forEach((row, index) => {
      const ticket = tickets[index];
      if (expoResponse.ok && (!ticket || ticket.status === 'ok')) {
        successfulUsers.add(row.userId);
        return;
      }

      const reason = String(
        ticket?.details?.error || ticket?.message || `Expo push HTTP ${expoResponse.status}`
      );
      if (!successfulUsers.has(row.userId)) failedUsers.set(row.userId, reason);

      if (ticket?.details?.error === 'DeviceNotRegistered') {
        void supabase
          .from('push_tokens')
          .update({ is_active: false })
          .eq('expo_push_token', row.token);
      }
    });
  }

  await Promise.all(
    candidateUserIds.map((userId) => {
      const logId = logByUser.get(userId);
      if (!logId) return Promise.resolve();

      if (successfulUsers.has(userId)) {
        return supabase
          .from('push_notification_logs')
          .update({ status: 'sent', success: true, error: null })
          .eq('id', logId)
          .then(() => undefined);
      }

      const error = usersWithValidToken.has(userId)
        ? failedUsers.get(userId) || 'Push non consegnata; notifica interna registrata.'
        : 'Nessun push token valido; notifica interna registrata.';

      return supabase
        .from('push_notification_logs')
        .update({ status: 'in_app_only', success: false, error })
        .eq('id', logId)
        .then(() => undefined);
    })
  );

  return json({
    ok: true,
    groups: groupIds.length,
    users: candidateUserIds.length,
    sentUsers: successfulUsers.size,
    inAppRegistered: candidateUserIds.length,
  });
});