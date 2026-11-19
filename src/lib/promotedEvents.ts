import { supabase } from './supabase';

// Eventi promozionali Bajuju: id elencati (separati da virgola) in app_settings.promoted_event_ids.
// Solo il database li può cambiare: gli utenti possono solo leggerli.
// Questi eventi compaiono per primi a tutti, a prescindere dalla distanza, con cornice dorata.
export const PROMO_GOLD = '#D4A62A';
export const PROMO_LABEL = '⭐ Evento promozionale Bajuju';

export async function loadPromotedEventIds(): Promise<Set<string>> {
  try {
    const result = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'promoted_event_ids').maybeSingle();
    const raw = String(result.data?.setting_value || '');
    return new Set(raw.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}
