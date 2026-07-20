import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { supabase } from '../src/lib/supabase';

type NotificationData = Record<string, unknown>;

type NotificationRow = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  data: NotificationData | null;
  sent_at: string;
  success: boolean | null;
  is_read: boolean;
};

function formatNotificationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function notificationIcon(type: string) {
  switch (type) {
    case 'new_experience':
      return '🎉';
    case 'new_flash':
      return '⚡';
    case 'new_participant':
      return '🙋';
    case 'contact_request':
      return '💌';
    case 'contact_accepted':
      return '✅';
    case 'experience_cancelled':
      return '❌';
    case 'experience_reminder':
      return '⏰';
    default:
      return '🔔';
  }
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadNotifications = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage('');

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      const userId = userData.user?.id;

      if (!userId) {
        setNotifications([]);
        setErrorMessage('Utente non autenticato.');
        return;
      }

      const { data, error } = await supabase
        .from('push_notification_logs')
        .select(
          'id, notification_type, title, body, data, sent_at, success, is_read'
        )
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setNotifications((data || []) as NotificationRow[]);
    } catch (error) {
      console.log('Errore caricamento notifiche:', error);
      setErrorMessage('Non è stato possibile caricare le notifiche.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications])
  );

  const handleNotificationPress = useCallback(
    async (notification: NotificationRow) => {
      if (!notification.is_read) {
        try {
          const { error } = await supabase
            .from('push_notification_logs')
            .update({ is_read: true })
            .eq('id', notification.id);

          if (error) {
            throw error;
          }

          setNotifications((currentNotifications) =>
            currentNotifications.map((item) =>
              item.id === notification.id
                ? { ...item, is_read: true }
                : item
            )
          );
        } catch (error) {
          console.log('Errore aggiornamento notifica letta.');
        }
      }

      const notificationData = notification.data || {};
      const screen =
        typeof notificationData.screen === 'string'
          ? notificationData.screen
          : '';
      const activityId =
        typeof notificationData.activityId === 'string'
          ? notificationData.activityId
          : '';

      switch (screen) {
        case 'experience':
          if (activityId) {
            router.push({
              pathname: '/experience-detail' as any,
              params: { id: activityId },
            });
          } else {
            router.push('/experiences' as any);
          }
          return;

        case 'experiences':
          router.push('/experiences' as any);
          return;

        case 'flash':
          router.push('/flash' as any);
          return;

        case 'flash-detail':
          if (activityId) {
            router.push({
              pathname: '/flash-detail' as any,
              params: { id: activityId },
            });
          } else {
            router.push('/flash' as any);
          }
          return;

        case 'profile':
          router.push('/profile' as any);
          return;

        default:
          return;
      }
    },
    []
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>

        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Notifiche</Text>
          <Text style={styles.headerSubtitle}>
            Le novità importanti di Bajuju
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={PINK} />
          <Text style={styles.loadingText}>Caricamento notifiche…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadNotifications(true)}
              tintColor={PINK}
            />
          }
        >
          {errorMessage ? (
            <View style={styles.messageCard}>
              <Text style={styles.messageTitle}>Qualcosa non ha funzionato</Text>
              <Text style={styles.messageText}>{errorMessage}</Text>

              <Pressable
                style={styles.retryButton}
                onPress={() => void loadNotifications()}
              >
                <Text style={styles.retryButtonText}>Riprova</Text>
              </Pressable>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>Nessuna notifica</Text>
              <Text style={styles.emptyText}>
                Qui compariranno esperienze, Flash, partecipazioni e inviti.
              </Text>
            </View>
          ) : (
            notifications.map((notification) => (
              <Pressable
                key={notification.id}
                style={[
                  styles.notificationCard,
                  !notification.is_read && styles.unreadCard,
                ]}
                onPress={() => void handleNotificationPress(notification)}
                accessibilityRole="button"
                accessibilityLabel={`Apri notifica: ${notification.title}`}
              >
                <View style={styles.iconBox}>
                  <Text style={styles.iconText}>
                    {notificationIcon(notification.notification_type)}
                  </Text>
                </View>

                <View style={styles.notificationContent}>
                  <View style={styles.notificationTopRow}>
                    <Text style={styles.notificationTitle}>
                      {notification.title}
                    </Text>

                    {!notification.is_read ? (
                      <View style={styles.unreadDot} />
                    ) : null}
                  </View>

                  <Text style={styles.notificationBody}>
                    {notification.body}
                  </Text>

                  <Text style={styles.notificationDate}>
                    {formatNotificationDate(notification.sent_at)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const PINK = '#e43f98';
const PINK_DARK = '#8f1658';
const TEXT = '#5a2842';
const MUTED = '#a95d86';
const BG = '#fff7fb';
const SOFT = '#fff2f8';
const BORDER = '#f6c6dc';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    minHeight: 74,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  backButtonText: {
    marginTop: -4,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '500',
    color: PINK_DARK,
  },
  headerTextBlock: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: PINK,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: MUTED,
  },
  headerSpacer: {
    width: 44,
  },
  container: {
    flexGrow: 1,
    padding: 15,
    paddingTop: 6,
    paddingBottom: 34,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '800',
    color: TEXT,
  },
  messageCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: PINK_DARK,
    textAlign: 'center',
  },
  messageText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
    backgroundColor: PINK,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: WHITE,
  },
  emptyCard: {
    minHeight: 260,
    borderRadius: 30,
    padding: 28,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: '900',
    color: PINK,
  },
  emptyText: {
    maxWidth: 290,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
  },
  notificationCard: {
    marginBottom: 10,
    borderRadius: 24,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  unreadCard: {
    backgroundColor: SOFT,
    borderColor: PINK,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  iconText: {
    fontSize: 23,
  },
  notificationContent: {
    flex: 1,
    marginLeft: 12,
  },
  notificationTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: PINK_DARK,
  },
  unreadDot: {
    width: 9,
    height: 9,
    marginTop: 5,
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: PINK,
  },
  notificationBody: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: TEXT,
  },
  notificationDate: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '800',
    color: MUTED,
  },
});
