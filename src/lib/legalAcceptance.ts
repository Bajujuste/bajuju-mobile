import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { LEGAL_VERSION } from '../legal/legalContent';
import { supabase } from './supabase';

export type LegalStatus = {
  authenticated: boolean;
  currentVersion: string;
  accepted: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

type Listener = () => void;
const listeners = new Set<Listener>();

// Avvisa LegalAcceptanceGate quando un'accettazione è stata salvata altrove (es. login).
export function onLegalAcceptanceChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyLegalAcceptanceChanged() {
  for (const listener of listeners) listener();
}

function parseStatus(data: unknown): LegalStatus | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    authenticated: row.authenticated === true,
    currentVersion: typeof row.current_version === 'string' ? row.current_version : LEGAL_VERSION,
    accepted: row.accepted === true,
    acceptedVersion: typeof row.accepted_version === 'string' ? row.accepted_version : null,
    acceptedAt: typeof row.accepted_at === 'string' ? row.accepted_at : null,
  };
}

// null = stato non disponibile (rete assente o funzione non ancora pubblicata): non si blocca l'app.
export async function loadLegalStatus(): Promise<LegalStatus | null> {
  const { data, error } = await supabase.rpc('bajuju_legal_status');
  if (error) return null;
  return parseStatus(data);
}

// Salva l'accettazione dei Termini e la presa visione dell'informativa nella versione inclusa nell'app.
export async function acceptCurrentLegalTexts(): Promise<LegalStatus> {
  const { data, error } = await supabase.rpc('bajuju_accept_legal', {
    p_version: LEGAL_VERSION,
    p_platform: Platform.OS,
    p_app_version: Constants.expoConfig?.version ?? '',
  });

  if (error) {
    if (String(error.message || '').includes('BAJUJU_LEGAL_VERSION_MISMATCH')) {
      throw new Error('I testi sono stati aggiornati di nuovo. Chiudi e riapri l’app per leggere la versione più recente.');
    }
    throw new Error('Non sono riuscito a salvare l’accettazione. Controlla la connessione e riprova.');
  }

  const status = parseStatus(data);
  notifyLegalAcceptanceChanged();
  if (!status) throw new Error('Risposta non valida dal server.');
  return status;
}
