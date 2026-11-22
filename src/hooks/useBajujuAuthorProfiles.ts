import { useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';

type AuthorProfile = Record<string, any>;

/**
 * Carica i profili degli autori dei messaggi che non sono già noti
 * (es. chi ha lasciato l'evento/gruppo/Flash ma ha scritto in chat),
 * così in chat compare sempre il nome vero invece di "Partecipante N".
 */
export function useBajujuAuthorProfiles(authorIds: string[], knownIds: string[] = []) {
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>({});

  const missingKey = useMemo(() => {
    const known = new Set(knownIds.filter(Boolean));
    const missing = [...new Set(authorIds.filter(Boolean))].filter(
      (id) => !known.has(id) && !(id in authorProfiles)
    );
    return missing.sort().join(',');
    // authorProfiles volutamente incluso: evita di ricaricare chi è già stato cercato.
  }, [authorIds, knownIds, authorProfiles]);

  useEffect(() => {
    if (!missingKey) return;
    const ids = missingKey.split(',');
    let cancelled = false;

    (async () => {
      const result = await supabase.from('profiles').select('*').in('id', ids);
      if (cancelled || result.error) return;

      setAuthorProfiles((previous) => {
        const next = { ...previous };
        ids.forEach((id) => {
          // Segna anche chi non è stato trovato, per non ripetere la query.
          if (!(id in next)) next[id] = {};
        });
        ((result.data || []) as AuthorProfile[]).forEach((profile) => {
          const id = String(profile.id || '');
          if (id) next[id] = profile;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  return authorProfiles;
}
