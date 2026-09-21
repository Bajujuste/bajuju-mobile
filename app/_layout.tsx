import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AdminPrivateChatEntry } from '../src/components/admin/AdminPrivateChatEntry';
import { supabase } from '../src/lib/supabase';
import { hasCompleteRequiredProfile } from '../src/utils/profileCompletion';

SplashScreen.preventAutoHideAsync().catch(() => {});

function openPushNotification(data: Record<string, unknown>) {
  const screen = typeof data.screen === 'string' ? data.screen : '';
  const activityId = typeof data.activityId === 'string' ? data.activityId : '';
  const section = typeof data.section === 'string' ? data.section : '';
  const threadId = typeof data.threadId === 'string' ? data.threadId : '';
  const type = typeof data.type === 'string' ? data.type : '';

  if (type === 'waitlist_spot_available' && activityId) {
    router.push({ pathname: '/experience-waitlist' as any, params: { id: activityId } });
    return;
  }

  switch (screen) {
    case 'experience':
      router.push(activityId ? ({ pathname: '/experience-detail', params: { id: activityId, section: section || undefined } } as any) : '/experiences');
      break;
    case 'experiences':
      router.push('/experiences');
      break;
    case 'flash':
      router.push('/flash');
      break;
    case 'flash-detail':
      router.push(activityId ? ({ pathname: '/flash-detail', params: { id: activityId } } as any) : '/flash');
      break;
    case 'date-invites':
      router.push('/date-invites' as any);
      break;
    case 'direct-contacts':
      router.push('/direct-contacts' as any);
      break;
    case 'profile':
      router.push(section ? ({ pathname: '/profile', params: { section } } as any) : '/profile');
      break;
    case 'admin-private-chat':
      router.push(
        threadId
          ? ({ pathname: '/admin-private-chat' as any, params: { threadId } } as any)
          : ('/admin-private-chat' as any)
      );
      break;
  }
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const rootNavigationReady = Boolean(rootNavigationState?.key);
  const pendingPushNotificationRef = useRef<Record<string, unknown> | null>(null);
  const handledPushResponseIdsRef = useRef<Set<string>>(new Set());
  // Utente il cui profilo è già risultato completo: non serve ricontrollarlo a ogni cambio di rotta.
  const completeProfileUserIdRef = useRef<string | null>(null);
  const homeAlreadyHandlesSafeArea = pathname === '/home';
  const [fontsLoaded, fontError] = useFonts({
    FredokaRegular: require('../assets/fonts/Fredoka-400.ttf'),
    FredokaMedium: require('../assets/fonts/Fredoka-500.ttf'),
    FredokaSemiBold: require('../assets/fonts/Fredoka-600.ttf'),
    FredokaBold: require('../assets/fonts/Fredoka-700.ttf'),
  });

  useEffect(() => {
    const allowedPaths = new Set([
      '/', '/login', '/register', '/forgot-password', '/reset-password',
      '/auth/callback', '/profile', '/privacy', '/rules',
    ]);

    if (allowedPaths.has(pathname)) return;

    let active = true;

    void (async () => {
      try {
        // getSession legge la sessione salvata: getUser chiamava il server auth a ogni cambio di rotta.
        const sessionResult = await supabase.auth.getSession();
        if (sessionResult.error) return;

        const userId = sessionResult.data.session?.user?.id;
        if (!active || !userId) return;
        if (completeProfileUserIdRef.current === userId) return;

        const profileResult = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (!active || profileResult.error) return;

        if (hasCompleteRequiredProfile(profileResult.data)) {
          completeProfileUserIdRef.current = userId;
        } else {
          router.replace('/profile');
        }
      } catch {
        console.log('Controllo completamento profilo non disponibile.');
      }
    })();

    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;
    let subscription: { remove: () => void } | null = null;

    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (!active) return;

        const handleResponse = (response: any) => {
          const responseId = String(response?.notification?.request?.identifier || '').trim();
          if (responseId && handledPushResponseIdsRef.current.has(responseId)) return;

          const data = response?.notification?.request?.content?.data;
          if (!data || typeof data !== 'object') return;

          if (responseId) handledPushResponseIdsRef.current.add(responseId);

          if (rootNavigationReady) {
            setTimeout(() => {
              openPushNotification(data as Record<string, unknown>);
            }, 0);
          } else {
            pendingPushNotificationRef.current = data as Record<string, unknown>;
          }

          void Notifications.clearLastNotificationResponseAsync().catch(() => {});
        };

        // Subito dopo un avvio a freddo dell'app tramite tap su una notifica, su alcuni
        // dispositivi Android il modulo nativo non ha ancora reso disponibile la risposta
        // nel primissimo istante: getLastNotificationResponseAsync() può restituire null
        // per una pura questione di timing, e l'app si apre allora sulla home come se non
        // fosse stata aperta da una notifica. Si riprova per un breve periodo prima di
        // rinunciare, senza bloccare il render (l'effetto è comunque asincrono).
        let lastResponse = await Notifications.getLastNotificationResponseAsync();
        for (let attempt = 0; attempt < 5 && active && !lastResponse; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!active) break;
          lastResponse = await Notifications.getLastNotificationResponseAsync();
        }
        if (lastResponse) handleResponse(lastResponse);

        subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
      } catch {
        console.log('Gestione apertura notifiche non disponibile.');
      }
    })();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [rootNavigationReady]);

  useEffect(() => {
    if (Platform.OS === 'web' || !rootNavigationReady) return;

    const pendingData = pendingPushNotificationRef.current;
    if (!pendingData) return;

    pendingPushNotificationRef.current = null;

    const timer = setTimeout(() => {
      openPushNotification(pendingData);
    }, 0);

    return () => clearTimeout(timer);
  }, [rootNavigationReady]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    // L'app è solo in tema chiaro (userInterfaceStyle "light" in app.base.json).
    <ThemeProvider value={DefaultTheme}>
      <SafeAreaView
        style={styles.appFrame}
        edges={homeAlreadyHandlesSafeArea ? [] : ['top', 'left', 'right']}
      >
        {/* headerShown: false vale per tutte le rotte tramite screenOptions: non servono Stack.Screen
            dedicate (quelle per login, register, ecc. usavano nomi senza il gruppo (auth) e venivano ignorate). */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        <AdminPrivateChatEntry />
      </SafeAreaView>
      <StatusBar style="dark" backgroundColor="#FFF9FC" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  appFrame: {
    flex: 1,
    backgroundColor: '#FFF9FC',
  },
});
