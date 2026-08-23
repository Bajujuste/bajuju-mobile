import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = 'https://xwcbmsfsirggozpcskcz.supabase.co';
const supabaseAnonKey = 'sb_publishable_Kg74KvC--sJpim0_tY7K0Q_YJcMqf9g';
const NETWORK_ERROR_QUEUE_KEY = 'bajuju-network-errors-v1';
const MAX_QUEUED_NETWORK_ERRORS = 20;

const nativeFetch = globalThis.fetch.bind(globalThis);
let queueWriteChain: Promise<void> = Promise.resolve();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

type NetworkErrorRecord = {
  occurred_at: string;
  endpoint: string;
  method: string;
  status: number;
  select?: string;
  error_code?: string;
  error_message?: string;
};

function safeText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') return input;
  const possibleUrl = (input as { url?: unknown })?.url;
  return possibleUrl ? String(possibleUrl) : String(input);
}

function describeSupabaseRequest(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts[0] === 'auth') return { skip: true, endpoint: 'auth' };

    if (parts[0] === 'rest' && parts[1] === 'v1') {
      if (parts[2] === 'app_analytics_events') {
        return { skip: true, endpoint: 'analytics' };
      }
      if (parts[2] === 'rpc') {
        return {
          skip: false,
          endpoint: `rpc/${parts[3] || 'unknown'}`,
          select: safeText(parsed.searchParams.get('select'), 500),
        };
      }
      return {
        skip: false,
        endpoint: `table/${parts[2] || 'unknown'}`,
        select: safeText(parsed.searchParams.get('select'), 500),
      };
    }

    if (parts[0] === 'functions' && parts[1] === 'v1') {
      return { skip: false, endpoint: `function/${parts[2] || 'unknown'}` };
    }

    if (parts[0] === 'storage' && parts[1] === 'v1') {
      return { skip: false, endpoint: `storage/${parts[2] || 'unknown'}` };
    }

    return { skip: false, endpoint: safeText(parsed.pathname, 120) || 'supabase' };
  } catch {
    return { skip: false, endpoint: 'supabase' };
  }
}

function enqueueNetworkError(record: NetworkErrorRecord) {
  queueWriteChain = queueWriteChain
    .then(async () => {
      try {
        const raw = await AsyncStorage.getItem(NETWORK_ERROR_QUEUE_KEY);
        const existing = raw ? JSON.parse(raw) : [];
        const rows = Array.isArray(existing) ? existing : [];
        rows.push(record);
        await AsyncStorage.setItem(
          NETWORK_ERROR_QUEUE_KEY,
          JSON.stringify(rows.slice(-MAX_QUEUED_NETWORK_ERRORS))
        );
      } catch {
        // Il monitoraggio non deve mai interferire con l'app.
      }
    })
    .catch(() => undefined);

  scheduleNetworkErrorFlush();
}

async function flushQueuedNetworkErrors() {
  try {
    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult.data.session;
    if (!session?.user?.id || !session.access_token) return;

    await queueWriteChain;
    const raw = await AsyncStorage.getItem(NETWORK_ERROR_QUEUE_KEY);
    const queued = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(queued) || queued.length === 0) return;

    const payload = queued.slice(-MAX_QUEUED_NETWORK_ERRORS).map((record) => ({
      user_id: session.user.id,
      event_name: 'network_error',
      properties: record,
    }));

    const response = await nativeFetch(`${supabaseUrl}/rest/v1/app_analytics_events`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await AsyncStorage.removeItem(NETWORK_ERROR_QUEUE_KEY);
    }
  } catch {
    // Gli errori restano in coda e verranno ritentati in seguito.
  }
}

function scheduleNetworkErrorFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueuedNetworkErrors();
  }, 1500);
}

async function monitoredFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) {
  const rawUrl = requestUrl(input);
  const requestInfo = describeSupabaseRequest(rawUrl);
  const method = String(init?.method || 'GET').toUpperCase();

  try {
    const response = await nativeFetch(input, init);

    if (!response.ok && !requestInfo.skip) {
      void (async () => {
        let errorCode = '';
        let errorMessage = '';

        try {
          const body = await response.clone().json() as Record<string, unknown>;
          errorCode = safeText(body?.code, 80);
          errorMessage = safeText(body?.message || body?.error_description || body?.error, 300);
        } catch {
          // Una risposta non JSON viene comunque registrata con endpoint e status.
        }

        enqueueNetworkError({
          occurred_at: new Date().toISOString(),
          endpoint: requestInfo.endpoint,
          method,
          status: response.status,
          ...(requestInfo.select ? { select: requestInfo.select } : {}),
          ...(errorCode ? { error_code: errorCode } : {}),
          ...(errorMessage ? { error_message: errorMessage } : {}),
        });
      })();
    }

    return response;
  } catch (error: unknown) {
    if (!requestInfo.skip) {
      enqueueNetworkError({
        occurred_at: new Date().toISOString(),
        endpoint: requestInfo.endpoint,
        method,
        status: 0,
        ...(requestInfo.select ? { select: requestInfo.select } : {}),
        error_message: safeText(error instanceof Error ? error.message : error, 300) || 'Errore di rete',
      });
    }
    throw error;
  }
}

const webStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: monitoredFetch,
  },
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id) scheduleNetworkErrorFlush();
});
