import { supabase } from './supabase';

// "Chiedi a Bajuju": tutti gli admin attivi leggono e rispondono ai messaggi degli utenti.
export async function isActiveAdmin(userId: string) {
  if (!userId) return false;
  const result = await supabase
    .from('profiles')
    .select('is_admin,is_deleted')
    .eq('id', userId)
    .maybeSingle();
  return !result.error && result.data?.is_admin === true && result.data?.is_deleted !== true;
}

// Messaggi degli utenti non ancora letti da nessun admin (esclude le risposte degli admin).
export async function countSupportUnreadForAdmins() {
  const [threadsResult, messagesResult] = await Promise.all([
    supabase.from('admin_private_threads').select('id,user_id').limit(1000),
    supabase
      .from('admin_private_messages')
      .select('thread_id,sender_id')
      .is('read_at', null)
      .limit(5000),
  ]);
  if (threadsResult.error || messagesResult.error) return 0;

  const threadOwner: Record<string, string> = {};
  (threadsResult.data || []).forEach((row: any) => {
    threadOwner[String(row.id)] = String(row.user_id || '');
  });

  return (messagesResult.data || []).filter(
    (row: any) => threadOwner[String(row.thread_id)] === String(row.sender_id || '')
  ).length;
}
