import { supabase } from '../lib/supabase';

const INACTIVE_PARTICIPANT_STATUSES = [
  'rejected', 'rifiutato', 'declined', 'annullato', 'annullata',
  'deleted', 'eliminato', 'eliminata', 'removed', 'cancellato', 'cancellata',
];

export const CANCEL_REASON_MAX_LENGTH = 150;

type CancelResult = { ok: true; notified: number } | { ok: false; message: string };

// Elimina (annullamento logico) un evento e avvisa tutti i partecipanti con il motivo.
// Usato sia dall'organizzatore sia dagli admin, da pagina evento e Area Admin.
export async function cancelExperienceWithReason(activityId: string, reason: string): Promise<CancelResult> {
  const cleanId = String(activityId || '').trim();
  const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, CANCEL_REASON_MAX_LENGTH);

  if (!cleanId) return { ok: false, message: 'ID evento non disponibile.' };
  if (!cleanReason) return { ok: false, message: 'Scrivi il motivo dell’eliminazione.' };

  const { data: sessionData } = await supabase.auth.getSession();
  const actorUserId = String(sessionData.session?.user?.id || '');

  // Partecipanti e organizzatore letti PRIMA di eliminare, così l'elenco è completo.
  const [participantsResult, activityResult] = await Promise.all([
    supabase.from('activity_participants').select('user_id,status').eq('activity_id', cleanId),
    supabase.from('activities').select('creator_id').eq('id', cleanId).maybeSingle(),
  ]);

  const targets = new Set<string>();
  (participantsResult.data || []).forEach((row: any) => {
    const status = String(row?.status || '').trim().toLowerCase();
    const userId = String(row?.user_id || '').trim();
    if (userId && !INACTIVE_PARTICIPANT_STATUSES.includes(status)) targets.add(userId);
  });
  const creatorId = String((activityResult.data as any)?.creator_id || '').trim();
  if (creatorId) targets.add(creatorId);
  if (actorUserId) targets.delete(actorUserId);

  const update = await supabase
    .from('activities')
    .update({ deleted_at: new Date().toISOString(), status: 'eliminata' } as any)
    .eq('id', cleanId)
    .select('id')
    .maybeSingle();

  if (update.error) return { ok: false, message: update.error.message || 'Eliminazione non riuscita.' };
  if (!update.data) return { ok: false, message: 'Non hai i permessi per eliminare questo evento.' };

  await Promise.all(
    [...targets].map((targetUserId) =>
      supabase.functions
        .invoke('send-bajuju-push', {
          body: { type: 'experience_cancelled', targetUserId, activityId: cleanId, reason: cleanReason },
        })
        .catch(() => {
          console.log('Errore notifica evento eliminato.');
        })
    )
  );

  return { ok: true, notified: targets.size };
}
