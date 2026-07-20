import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  if (!authorization) {
    return jsonResponse({ error: 'Authorization required' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Utente non autenticato' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let requestedUserId = user.id;

  try {
    const body = await request.json();
    const candidate = String(body?.target_user_id || '').trim();
    if (candidate) requestedUserId = candidate;
  } catch {
    // Body facoltativo: senza target l’utente elimina il proprio account.
  }

  if (requestedUserId !== user.id) {
    const isAdminFromMetadata =
      user.app_metadata?.is_admin === true ||
      user.app_metadata?.role === 'admin';

    const adminProfileResult = await adminClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = isAdminFromMetadata || adminProfileResult.data?.is_admin === true;

    if (!isAdmin) {
      return jsonResponse({ error: 'Permessi amministratore richiesti' }, 403);
    }
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(
    requestedUserId,
    false
  );

  if (deleteError) {
    console.error('Errore eliminazione account:', deleteError.message);

    return jsonResponse(
      {
        error: 'Non è stato possibile eliminare definitivamente l’account.',
        details: deleteError.message,
      },
      500
    );
  }

  return jsonResponse({
    ok: true,
    message: 'Account eliminato definitivamente.',
  });
});
