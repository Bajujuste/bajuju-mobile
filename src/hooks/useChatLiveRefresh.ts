import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const DEFAULT_INTERVAL_MS = 10000;

// Rete di sicurezza per le chat: il realtime di Supabase su mobile può perdere la connessione
// (app in secondo piano, rete cambiata, token scaduto) senza riprendersi. Ricarica i messaggi
// quando arriva una notifica con l'app aperta, quando l'app torna in primo piano e a intervalli.
export function useChatLiveRefresh(refresh: (() => void) | null, intervalMs = DEFAULT_INTERVAL_MS) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const enabled = Boolean(refresh);

  useEffect(() => {
    if (!enabled) return;

    const run = () => refreshRef.current?.();

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') run();
    }, intervalMs);

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });

    // Piccolo ritardo: la notifica può arrivare un attimo prima che il messaggio sia leggibile.
    let notificationTimer: ReturnType<typeof setTimeout> | null = null;
    const notification = Notifications.addNotificationReceivedListener(() => {
      run();
      if (notificationTimer) clearTimeout(notificationTimer);
      notificationTimer = setTimeout(run, 1500);
    });

    return () => {
      clearInterval(interval);
      appState.remove();
      notification.remove();
      if (notificationTimer) clearTimeout(notificationTimer);
    };
  }, [enabled, intervalMs]);
}
