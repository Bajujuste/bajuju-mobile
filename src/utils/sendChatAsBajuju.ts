import { supabase } from '../lib/supabase';

// Admin che scrive in una chat dove non partecipa (evento, Flash o gruppo):
// il messaggio viene salvato con l'account ufficiale "Bajuju", non col nome dell'admin.
export const ADMIN_AS_BAJUJU_HINT = 'Non partecipi: i tuoi messaggi qui escono come “Bajuju”.';

export async function sendChatAsBajuju(
  chat: 'activity' | 'group',
  scopeId: string,
  message: string,
  imageUrl?: string | null
): Promise<{ id: string | null; error: string | null }> {
  const result = await supabase.rpc('bajuju_admin_send_as_bajuju' as any, {
    p_chat: chat,
    p_scope_id: scopeId,
    p_message: message,
    p_image_url: imageUrl || null,
  });
  if (result.error) return { id: null, error: result.error.message };
  return { id: result.data ? String(result.data) : null, error: null };
}
