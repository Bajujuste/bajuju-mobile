import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

// Gli admin sono pochi e cambiano di rado: li carichiamo una volta e li teniamo in memoria.
let cachedAdminIds = new Set<string>();
let pendingLoad: Promise<Set<string>> | null = null;

export function loadBajujuAdminIds() {
  if (!pendingLoad) {
    pendingLoad = (async () => {
      try {
        const result = await supabase.from('profiles').select('id').eq('is_admin', true).limit(50);
        if (!result.error) {
          cachedAdminIds = new Set((result.data || []).map((row: { id: string }) => String(row.id)));
        }
      } catch {
        // Senza rete restano quelli già noti.
      } finally {
        pendingLoad = null;
      }
      return cachedAdminIds;
    })();
  }
  return pendingLoad;
}

export function useBajujuAdminIds() {
  const [adminIds, setAdminIds] = useState(cachedAdminIds);

  useEffect(() => {
    let active = true;
    void loadBajujuAdminIds().then((ids) => {
      if (active) setAdminIds(ids);
    });
    return () => {
      active = false;
    };
  }, []);

  return adminIds;
}
