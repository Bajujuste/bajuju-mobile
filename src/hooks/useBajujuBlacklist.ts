import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

// Blacklist personale: la vede solo chi la crea (RLS su user_blacklist).
// Teniamo gli id in memoria e avvisiamo tutte le schermate quando cambia.
let cachedIds = new Set<string>();
let cachedOwnerId = '';
let pendingLoad: Promise<Set<string>> | null = null;
const listeners = new Set<(ids: Set<string>) => void>();

function publish(next: Set<string>) {
  cachedIds = next;
  listeners.forEach((listener) => listener(next));
}

async function currentUserId() {
  const result = await supabase.auth.getSession();
  return String(result.data.session?.user?.id || '');
}

export function loadBajujuBlacklist(force = false) {
  if (!pendingLoad) {
    pendingLoad = (async () => {
      try {
        const userId = await currentUserId();
        if (!userId) {
          cachedOwnerId = '';
          publish(new Set());
          return cachedIds;
        }
        if (!force && userId === cachedOwnerId) return cachedIds;

        const result = await supabase
          .from('user_blacklist' as any)
          .select('target_id')
          .eq('owner_id', userId)
          .limit(1000);

        if (!result.error) {
          cachedOwnerId = userId;
          publish(new Set(((result.data || []) as { target_id: string }[]).map((row) => String(row.target_id))));
        }
      } catch {
        // Senza rete restano quelli già noti.
      } finally {
        pendingLoad = null;
      }
      return cachedIds;
    })();
  }
  return pendingLoad;
}

export async function addToBajujuBlacklist(targetId: string) {
  const userId = await currentUserId();
  if (!userId || !targetId || userId === targetId) throw new Error('Utente non valido.');

  const result = await supabase
    .from('user_blacklist' as any)
    .upsert({ owner_id: userId, target_id: targetId } as any, { onConflict: 'owner_id,target_id', ignoreDuplicates: true });
  if (result.error) throw result.error;

  cachedOwnerId = userId;
  publish(new Set([...cachedIds, targetId]));
}

export async function removeFromBajujuBlacklist(targetId: string) {
  const userId = await currentUserId();
  if (!userId || !targetId) return;

  const result = await supabase
    .from('user_blacklist' as any)
    .delete()
    .eq('owner_id', userId)
    .eq('target_id', targetId);
  if (result.error) throw result.error;

  const next = new Set(cachedIds);
  next.delete(targetId);
  publish(next);
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    cachedOwnerId = '';
    publish(new Set());
  } else if (event === 'SIGNED_IN') {
    // Ricarica solo se è entrato un altro utente.
    setTimeout(() => { void loadBajujuBlacklist(); }, 0);
  }
});

export function useBajujuBlacklist() {
  const [ids, setIds] = useState(cachedIds);

  useEffect(() => {
    let active = true;
    const listener = (next: Set<string>) => {
      if (active) setIds(next);
    };
    listeners.add(listener);
    void loadBajujuBlacklist().then((next) => {
      if (active) setIds(next);
    });
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  return ids;
}

export function useIsBajujuBlacklisted(userId?: string | null) {
  const ids = useBajujuBlacklist();
  return Boolean(userId) && ids.has(String(userId));
}
