import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

export type BajujuNotificationKind =
  | 'new_experience'
  | 'new_flash'
  | 'new_participant'
  | 'contact_request'
  | 'contact_accepted'
  | 'experience_cancelled'
  | 'experience_reminder';

const BAJUJU_PINK = '#e43f98';

let notificationsModule: any = null;
let notificationHandlerReady = false;

function isRunningInExpoGo() {
  return Constants.appOwnership === 'expo';
}

async function getNotificationsModule() {
  if (Platform.OS === 'web') return null;

  if (isRunningInExpoGo()) {
    return null;
  }

  try {
    if (!notificationsModule) {
      notificationsModule = await import('expo-notifications');
    }

    if (!notificationHandlerReady) {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      notificationHandlerReady = true;
    }

    return notificationsModule;
  } catch (error) {
    console.log('expo-notifications non disponibile in questo ambiente:', error);
    return null;
  }
}

function getProjectId() {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.manifest2?.extra?.eas?.projectId
  );
}

async function savePushToken(userId: string, token: string) {
  const upsertResult = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      onConflict: 'expo_push_token',
    }
  );

  if (!upsertResult.error) {
    await supabase.from('notification_preferences').upsert(
      {
        user_id: userId,
        enabled: true,
        notify_new_experience: true,
        notify_new_flash: true,
        notify_new_participant: true,
        notify_contact_request: true,
        notify_contact_accepted: true,
        notify_experience_cancelled: true,
        notify_experience_reminder: true,
        notify_chat_messages: false,
      },
      {
        onConflict: 'user_id',
      }
    );

    return { ok: true, table: 'push_tokens' };
  }

  // Fallback provvisorio: se la tabella non è ancora stata creata in Supabase,
  // proviamo a salvare su profiles solo se esiste una colonna compatibile.
  const attempts = [
    { expo_push_token: token },
    { push_token: token },
    { notification_token: token },
  ];

  for (const update of attempts) {
    const result = await supabase.from('profiles').update(update).eq('id', userId);

    if (!result.error) {
      return { ok: true, table: 'profiles', column: Object.keys(update)[0] };
    }
  }

  console.log('Token notifiche non salvato. Crea prima la tabella push_tokens in Supabase.');
  return {
    ok: false,
    table: '',
  };
}

export async function registerForBajujuPushNotifications(userId?: string | null) {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      reason: 'Le notifiche push sono pensate per app installata, non per web.',
    };
  }

  if (isRunningInExpoGo()) {
    return {
      ok: false,
      reason: 'Expo Go non supporta le notifiche push Android. Funzioneranno in APK/development build.',
    };
  }

  if (!Device.isDevice) {
    return {
      ok: false,
      reason: 'Serve un telefono fisico per testare le notifiche push.',
    };
  }

  const Notifications = await getNotificationsModule();

  if (!Notifications) {
    return {
      ok: false,
      reason: 'Modulo notifiche non disponibile in questo ambiente.',
    };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bajuju-important', {
      name: 'Bajuju',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: BAJUJU_PINK,
      sound: 'default',
    });
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (existingPermission.status !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== 'granted') {
    return {
      ok: false,
      reason: 'Permesso notifiche non concesso.',
    };
  }

  const projectId = getProjectId();

  if (!projectId) {
    return {
      ok: false,
      reason: 'Project ID Expo/EAS non trovato.',
    };
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResult.data;

  if (userId) {
    await savePushToken(userId, token);
  }

  return {
    ok: true,
    token,
  };
}

export function isChatNotificationAllowed() {
  return false;
}

export function isBajujuNotificationAllowed(kind: BajujuNotificationKind | string) {
  return kind !== 'new_message' && kind !== 'chat_message' && kind !== 'activity_message';
}


export type SendBajujuPushInput = {
  type: BajujuNotificationKind | string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  province?: string | null;
  city?: string | null;
};

export async function sendBajujuPushNotification(input: SendBajujuPushInput) {
  if (!isBajujuNotificationAllowed(input.type)) {
    console.log('Notifica Bajuju bloccata:', input.type);
    return {
      ok: false,
      blocked: true,
      reason: 'Tipo notifica non consentito.',
    };
  }

  const result = await supabase.functions.invoke('send-bajuju-push', {
    body: input,
  });

  if (result.error) {
    console.log('Errore invio notifica Bajuju:', result.error);
    return {
      ok: false,
      error: result.error,
    };
  }

  return {
    ok: true,
    data: result.data,
  };
}

export function buildExperienceNotificationTitle(title?: string | null) {
  const cleanTitle = String(title || '').trim();
  return cleanTitle ? `Nuova esperienza: ${cleanTitle}` : 'Nuova esperienza Bajuju';
}

export function buildFlashNotificationTitle(title?: string | null) {
  const cleanTitle = String(title || '').trim();
  return cleanTitle ? `Nuovo Flash: ${cleanTitle}` : 'Nuovo Flash Bajuju';
}
