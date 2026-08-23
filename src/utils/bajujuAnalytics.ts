import { supabase } from '../lib/supabase';

type AnalyticsProperties = Record<string, unknown>;

function textValue(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function errorProperties(error: unknown) {
  if (!error || typeof error !== 'object') {
    return {
      error_type: typeof error,
      error_message: textValue(error, 300) || 'Errore sconosciuto',
    };
  }

  const row = error as Record<string, unknown>;
  return {
    error_type: textValue(row.name, 80) || 'Error',
    error_code: textValue(row.code, 80),
    error_status: textValue(row.status, 40),
    error_message: textValue(row.message, 300) || 'Errore sconosciuto',
  };
}

export async function trackBajujuEvent(
  eventName: string,
  properties: AnalyticsProperties = {}
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

export async function trackBajujuError(
  screen: string,
  operation: string,
  error: unknown,
  properties: AnalyticsProperties = {}
) {
  return trackBajujuEvent('app_error', {
    screen: screen.trim().slice(0, 80),
    operation: operation.trim().slice(0, 120),
    ...errorProperties(error),
    ...properties,
  });
}
