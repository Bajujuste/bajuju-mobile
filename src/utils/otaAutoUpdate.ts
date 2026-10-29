import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

// Di serie expo-updates scarica l'OTA in background e lo applica solo al successivo avvio a freddo:
// chi riapre l'app dal multitasking resta sulla versione vecchia finché non la chiude del tutto.
// Qui l'aggiornamento si scarica e si applica da solo:
// - all'avvio: se il download finisce nei primi secondi, l'app si ricarica subito (l'utente vede solo
//   un secondo caricamento);
// - altrimenti resta "in attesa" e si applica la prossima volta che l'app torna in primo piano,
//   così non si ricarica mai sotto le dita di chi la sta usando.
const RELOAD_RIGHT_AWAY_WINDOW_MS = 15 * 1000;
const MIN_CHECK_INTERVAL_MS = 10 * 60 * 1000;
// Il ricaricamento azzera la navigazione: se l'app è stata appena aperta toccando una notifica,
// l'utente finirebbe in Home invece che nella chat. In quel caso l'OTA aspetta il rientro successivo.
const NOTIFICATION_GRACE_MS = 60 * 1000;
// Su iOS/Android il tocco della notifica arriva poco dopo il ritorno in primo piano: si attende un attimo.
const APPLY_DELAY_MS = 2500;

// Il tempo minimo per far vedere la scritta "Bajuju si sta aggiornando…" prima del ricaricamento,
// e un limite oltre il quale la scritta sparisce comunque se il ricaricamento non è partito.
const NOTICE_BEFORE_RELOAD_MS = 700;
const NOTICE_MAX_VISIBLE_MS = 5 * 1000;

let updateReady = false;
let applying = false;
let noticeVisible = false;
const noticeListeners = new Set<(visible: boolean) => void>();

function setNoticeVisible(visible: boolean) {
  noticeVisible = visible;
  noticeListeners.forEach((listener) => listener(visible));
}

export function useOtaUpdatingNotice() {
  const [visible, setVisible] = useState(noticeVisible);
  useEffect(() => {
    noticeListeners.add(setVisible);
    return () => {
      noticeListeners.delete(setVisible);
    };
  }, []);
  return visible;
}

let checking = false;
let lastCheckAt = 0;
let lastNotificationOpenAt = 0;

export function noteNotificationOpened() {
  lastNotificationOpenAt = Date.now();
}

function isOtaAvailable() {
  return !__DEV__ && Updates.isEnabled && (Platform.OS === 'android' || Platform.OS === 'ios');
}

async function applyUpdate() {
  if (applying) return;
  applying = true;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise((resolve) => setTimeout(resolve, APPLY_DELAY_MS));
    if (Date.now() - lastNotificationOpenAt < NOTIFICATION_GRACE_MS) return;
    // Se per qualsiasi motivo il ricaricamento non parte, la scritta non resta mai sullo schermo.
    hideTimer = setTimeout(() => setNoticeVisible(false), NOTICE_MAX_VISIBLE_MS);
    setNoticeVisible(true);
    await new Promise((resolve) => setTimeout(resolve, NOTICE_BEFORE_RELOAD_MS));
    await Updates.reloadAsync();
  } catch {
    console.log('Impossibile applicare l’aggiornamento ora.');
    clearTimeout(hideTimer);
    setNoticeVisible(false);
  } finally {
    applying = false;
  }
}

async function downloadUpdate() {
  if (updateReady || checking) return updateReady;
  if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return false;

  checking = true;
  lastCheckAt = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;

    const result = await Updates.fetchUpdateAsync();
    updateReady = result.isNew;
    return updateReady;
  } catch {
    console.log('Controllo aggiornamento OTA non disponibile.');
    return false;
  } finally {
    checking = false;
  }
}

export function useOtaAutoUpdate() {
  useEffect(() => {
    if (!isOtaAvailable()) return;

    const startedAt = Date.now();
    void downloadUpdate().then((ready) => {
      if (ready && Date.now() - startedAt < RELOAD_RIGHT_AWAY_WINDOW_MS) void applyUpdate();
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (updateReady) {
        void applyUpdate();
        return;
      }
      const resumedAt = Date.now();
      void downloadUpdate().then((ready) => {
        if (ready && Date.now() - resumedAt < RELOAD_RIGHT_AWAY_WINDOW_MS) void applyUpdate();
      });
    });

    return () => subscription.remove();
  }, []);
}
