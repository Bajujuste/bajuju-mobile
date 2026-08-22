import { supabase } from '../lib/supabase';

export async function trackBajujuEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
) {
  try {
    const authResult = await supabase.auth.getUser();
    const userId = authResult.data.user?.id;

    if (!userId || authResult.error) return false;

    const result = await supabase.from('app_analytics_events').insert({
      user_id: userId,
      event_name: eventName.trim().slice(0, 80),
      properties,
    });

    return !result.error;
  } catch {
    return false;
  }
}
