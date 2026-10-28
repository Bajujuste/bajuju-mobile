import * as Updates from 'expo-updates';
import { useEffect } from 'react';
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

let updateReady = false;
let checking = false;
let lastCheckAt = 0;

function isOtaAvailable() {
  return !__DEV__ && Updates.isEnabled && (Platform.OS === 'android' || Platform.OS === 'ios');
}

async function applyUpdate() {
  try {
    await Updates.reloadAsync();
  } catch {
    console.log('Impossibile applicare l’aggiornamento ora.');
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
