import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
// In-memory identifier: no email, device identifier or persistent tracking storage.
const sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
});
// source: per register_error contiene il motivo (es. email_gia_usata), mai dati personali.
export function trackAcquisition(event: string, source = '') {
  void supabase.rpc('record_acquisition_event' as any, {
    p_session: sessionId, p_event: event, p_platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    p_domain: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : '', p_source: source,
  }).then(() => {}, () => {});
}
