import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '../src/lib/supabase';

SplashScreen.preventAutoHideAsync().catch(() => {});

function openPushNotification(data: Record<string, unknown>) {
  const screen = typeof data.screen === 'string' ? data.screen : '';
  const activityId = typeof data.activityId === 'string' ? data.activityId : '';
  const section = typeof data.section === 'string' ? data.section : '';

  switch (screen) {
    case 'experience':
      router.push(activityId ? ({ pathname: '/experience-detail', params: { id: activityId } } as any) : '/experiences');
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
  }
}

type RequiredProfileRow = Record<string, unknown>;

function requiredProfileText(row: RequiredProfileRow | null, keys: string[]) {
  if (!row) return '';

  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }

  return '';
}

function hasCompleteRequiredProfile(profile: RequiredProfileRow | null) {
  if (!profile) return false;

  const photo = requiredProfileText(
    profile,
    ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto']
  );

  const city = requiredProfileText(
    profile,
    ['city', 'citta', 'comune', 'location_city']
  );

  const rawAge = requiredProfileText(
    profile,
    ['age', 'eta', 'età', 'user_age', 'age_range', 'fascia_eta', 'age_band', 'eta_range']
  );

  const gender = requiredProfileText(
    profile,
    ['gender', 'genere', 'sex']
  ).toLowerCase();

  const age = Number(rawAge);

  const validGender = [
    'maschio',
    'uomo',
    'male',
    'femmina',
    'donna',
    'female',
    'non_binario',
    'non binario',
    'non-binary',
    'nonbinary',
  ].includes(gender);

  return Boolean(
    photo &&
    city &&
    Number.isInteger(age) &&
    age >= 18 &&
    age <= 99 &&
    validGender
  );
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const homeAlreadyHandlesSafeArea = pathname === '/home';
  const [fontsLoaded, fontError] = useFonts({
    FredokaRegular: require('../assets/fonts/Fredoka-400.ttf'),
    FredokaMedium: require('../assets/fonts/Fredoka-500.ttf'),
    FredokaSemiBold: require('../assets/fonts/Fredoka-600.ttf'),
    FredokaBold: require('../assets/fonts/Fredoka-700.ttf'),
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const allowedPaths = new Set([
      '/',
      '/login',
      '/register',
      '/forgot-password',
      '/reset-password',
      '/auth/callback',
      '/profile',
      '/privacy',
      '/rules',
    ]);

    if (allowedPaths.has(pathname)) return;

    let active = true;

    void (async () => {
      try {
        const authResult = await supabase.auth.getUser();
        if (authResult.error) return;

        const userId = authResult.data.user?.id;
        if (!active || !userId) return;

        const profileResult = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (!active || profileResult.error) return;

        if (!hasCompleteRequiredProfile(profileResult.data as RequiredProfileRow | null)) {
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
          const data = response?.notification?.request?.content?.data;
          if (data && typeof data === 'object') {
            openPushNotification(data as Record<string, unknown>);
          }
        };

        const lastResponse = Notifications.getLastNotificationResponse();
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
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SafeAreaView
        style={styles.appFrame}
        edges={
          homeAlreadyHandlesSafeArea
            ? []
            : ['top', 'left', 'right']
        }
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaView>
      <StatusBar style="dark" backgroundColor="#fff8fb" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  appFrame: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
});