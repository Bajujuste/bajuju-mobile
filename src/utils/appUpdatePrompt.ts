import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';

import { supabase } from '../lib/supabase';

// Versione minima consigliata, gestita da remoto in app_settings (una riga per piattaforma):
//   min_app_version_android = 1.0.4
//   min_app_version_ios     = 1.0.4
// Senza la riga l'avviso non compare mai. L'avviso non blocca l'app: "Più tardi" lo rimanda.
const MIN_VERSION_KEYS = {
  android: 'min_app_version_android',
  ios: 'min_app_version_ios',
} as const;

const ANDROID_PACKAGE = 'it.bajuju.mobile';
const IOS_APP_STORE_ID = '6790152821';
const SNOOZE_STORAGE_KEY = 'bajuju-update-prompt-snoozed-until-v1';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let promptVisible = false;
let lastCheckAt = 0;

function parseVersion(value: string) {
  return value
    .trim()
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function isVersionLower(current: string, minimum: string) {
  const a = parseVersion(current);
  const b = parseVersion(minimum);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left < right;
  }
  return false;
}

// runtimeVersion usa la policy appVersion: coincide con la versione della build installata
// dallo store, anche quando il codice JS arriva da un aggiornamento OTA.
function installedVersion() {
  const runtime = String(Updates.runtimeVersion || '').trim();
  return /^\d+(\.\d+)*$/.test(runtime) ? runtime : '';
}

async function openStore() {
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`);
    } catch {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`).catch(() => {});
    }
    return;
  }

  try {
    await Linking.openURL(`itms-apps://apps.apple.com/app/id${IOS_APP_STORE_ID}`);
  } catch {
    await Linking.openURL(`https://apps.apple.com/app/id${IOS_APP_STORE_ID}`).catch(() => {});
  }
}

async function isSnoozed() {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_STORAGE_KEY);
    return Number(raw || 0) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  void AsyncStorage.setItem(SNOOZE_STORAGE_KEY, String(Date.now() + SNOOZE_MS)).catch(() => {});
}

async function checkForRequiredUpdate() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  if (promptVisible) return;
  if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
  lastCheckAt = Date.now();

  const current = installedVersion();
  if (!current) return;
  if (await isSnoozed()) return;

  const result = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', MIN_VERSION_KEYS[Platform.OS])
    .maybeSingle();

  const minimum = String(result.data?.setting_value || '').trim();
  if (result.error || !minimum || !isVersionLower(current, minimum)) return;

  promptVisible = true;
  const storeName = Platform.OS === 'ios' ? "l'App Store" : 'il Play Store';

  Alert.alert(
    'Nuova versione di Bajuju',
    `È disponibile un aggiornamento con novità e correzioni. Aggiorna l'app da ${storeName}.`,
    [
      {
        text: 'Più tardi',
        style: 'cancel',
        onPress: () => {
          promptVisible = false;
          snooze();
        },
      },
      {
        text: 'Aggiorna',
        onPress: () => {
          promptVisible = false;
          void openStore();
        },
      },
    ],
    {
      cancelable: true,
      onDismiss: () => {
        promptVisible = false;
        snooze();
      },
    }
  );
}

// Controlla all'avvio e quando l'app torna in primo piano.
export function useAppUpdatePrompt() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const run = () => {
      checkForRequiredUpdate().catch(() => {
        console.log('Controllo aggiornamento app non disponibile.');
      });
    };

    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });

    return () => subscription.remove();
  }, []);
}
