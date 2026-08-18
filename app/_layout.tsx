import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const router = useRouter();
  const lastOpenedNotificationRef = useRef('');
  const homeAlreadyHandlesSafeArea = pathname === '/home';
  const [fontsLoaded, fontError] = useFonts({
    FredokaRegular: require('../assets/fonts/Fredoka-400.ttf'),
    FredokaMedium: require('../assets/fonts/Fredoka-500.ttf'),
    FredokaSemiBold: require('../assets/fonts/Fredoka-600.ttf'),
    FredokaBold: require('../assets/fonts/Fredoka-700.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    function openNotificationResponse(response: Notifications.NotificationResponse | null) {
      if (!response) return;

      const notificationId = String(response.notification.request.identifier || '');
      if (notificationId && lastOpenedNotificationRef.current === notificationId) return;

      const data = response.notification.request.content.data || {};
      const type = String(data.type || '');
      const activityId = String(data.activityId || '').trim();

      if (type !== 'new_experience' || !activityId) return;

      lastOpenedNotificationRef.current = notificationId;
      router.push(`/experience-detail?id=${encodeURIComponent(activityId)}` as never);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(
      openNotificationResponse
    );

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        openNotificationResponse(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  }, [router]);

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
