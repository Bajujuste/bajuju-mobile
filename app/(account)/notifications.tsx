import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { supabase } from '../../src/lib/supabase';
import { getBajujuNotificationCategory, BAJUJU_NOTIFICATION_CATEGORY_LABELS, BajujuNotificationCategory } from '../../src/utils/bajujuNotificationCategories';
import { BajujuProfileButton } from '../../src/components/navigation/BajujuProfileButton';
import { BajujuBackButton } from '../../src/components/navigation/BajujuBackButton';
import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';

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
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function notificationIcon(type: string) {
  switch (type) {
    case 'new_experience': return '🎉';
    case 'new_flash': return '⚡';
    case 'new_participant': return '🙋';
    case 'chat_message': return '💬';
    case 'group_chat_message': return '💬';
    case 'support_message': return '💬';
    case 'experience_join_accepted': return '✅';
    case 'group_join_request': return '🙋';
    case 'contact_request': return '💌';
    case 'contact_accepted': return '✅';
    case 'contact_rejected': return '❌';
    case 'experience_cancelled': return '❌';
    case 'experience_reminder': return '⏰';
    case 'waitlist_spot_available': return '🎟️';
    case 'location_activated': return '🏠';
    case 'location_new_event': return '🏠';
    case 'location_request': return '🏠';
    case 'location_rejected': return '🏠';
    default: return '🔔';
  }
}

export default function NotificationsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab: BajujuNotificationCategory = params.tab === 'chat' || params.tab === 'requests' || params.tab === 'other' ? params.tab : 'requests';
  const [activeTab, setActiveTab] = useState<BajujuNotificationCategory>(initialTab);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const counts = useMemo(() => notifications.reduce<Record<BajujuNotificationCategory, number>>((acc, notification) => {
    if (!notification.is_read) acc[getBajujuNotificationCategory(notification.notification_type, notification.data)] += 1;
    return acc;
  }, { requests: 0, chat: 0, other: 0 }), [notifications]);
  const visibleNotifications = useMemo(() => notifications.filter((notification) =>
    getBajujuNotificationCategory(notification.notification_type, notification.data) === activeTab
  ), [notifications, activeTab]);

  const loadNotifications = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const userId = userData.user?.id;
      if (!userId) {
        setNotifications([]);
        setErrorMessage('Utente non autenticato.');
        return;
      }

      const { data, error } = await supabase
        .from('push_notification_logs')
        .select('id, notification_type, title, body, data, sent_at, success, is_read')
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

  useFocusEffect(useCallback(() => { void loadNotifications(); }, [loadNotifications]));

  const handleNotificationPress = useCallback(async (notification: NotificationRow) => {
    if (!notification.is_read) {
      try {
        const { data: updatedRow, error } = await supabase
          .from('push_notification_logs')
          .update({ is_read: true })
          .eq('id', notification.id)
          .select('id')
          .maybeSingle();

        if (error || !updatedRow) throw error || new Error('NOTIFICATION_NOT_UPDATED');

        setNotifications((current) =>
          current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item)
        );
      } catch {
        console.log('Errore aggiornamento notifica letta.');
      }
    }

    const notificationData = notification.data || {};
    const screen = typeof notificationData.screen === 'string' ? notificationData.screen : '';
    const activityId = typeof notificationData.activityId === 'string' ? notificationData.activityId : '';
    const groupId = typeof notificationData.groupId === 'string' ? notificationData.groupId : '';
    const section = typeof notificationData.section === 'string' ? notificationData.section : '';
    const threadId = typeof notificationData.threadId === 'string' ? notificationData.threadId : '';

    if (notification.notification_type === 'waitlist_spot_available' && activityId) {
      router.push({ pathname: '/experience-waitlist' as any, params: { id: activityId } });
      return;
    }

    switch (screen) {
      case 'group-detail':
        if (groupId) router.push({ pathname: '/group-detail' as any, params: { id: groupId, section: section || 'requests' } });
        else router.push('/groups' as any);
        return;
      case 'experience':
        if (activityId) router.push({ pathname: '/experience-detail' as any, params: { id: activityId, section: section || undefined } });
        else router.push('/experiences' as any);
        return;
      case 'experiences':
        router.push('/experiences' as any);
        return;
      case 'flash':
        router.push('/flash' as any);
        return;
      case 'flash-detail':
        if (activityId) router.push({ pathname: '/flash-detail' as any, params: { id: activityId } });
        else router.push('/flash' as any);
        return;
      case 'date-invites':
        router.push('/date-invites' as any);
        return;
      case 'direct-contacts':
        router.push('/direct-contacts' as any);
        return;
      case 'my-location':
        router.push('/my-location' as any);
        return;
      case 'admin-locations':
        router.push('/admin-locations' as any);
        return;
      case 'profile':
        if (section) router.push({ pathname: '/profile' as any, params: { section } });
        else router.push('/profile' as any);
        return;
      case 'admin-private-chat':
        router.push(
          threadId
            ? ({ pathname: '/admin-private-chat' as any, params: { threadId } } as any)
            : ('/admin-private-chat' as any)
        );
        return;
      default:
        return;
    }
  }, []);

  const deleteNotification = useCallback((notificationId: string) => {
    Alert.alert('Elimina notifica', 'Vuoi eliminare questa notifica?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina', style: 'destructive', onPress: () => {
          void (async () => {
            const { data: deletedRow, error } = await supabase
              .from('push_notification_logs')
              .delete()
              .eq('id', notificationId)
              .select('id')
              .maybeSingle();

            if (error || !deletedRow) {
              Alert.alert('Errore', 'Non sono riuscito a eliminare la notifica.');
              return;
            }
            setNotifications((current) => current.filter((item) => item.id !== notificationId));
          })();
        },
      },
    ]);
  }, []);

  useEffect(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, [activeTab]);

  const toggleSelected = useCallback((notificationId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(notificationId)) next.delete(notificationId);
      else next.add(notificationId);
      return next;
    });
  }, []);

  const deleteSelectedNotifications = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    Alert.alert('Elimina', ids.length === 1 ? 'Vuoi eliminare la notifica selezionata?' : `Vuoi eliminare le ${ids.length} notifiche selezionate?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina', style: 'destructive', onPress: () => {
          void (async () => {
            const { data: deletedRows, error } = await supabase
              .from('push_notification_logs')
              .delete()
              .in('id', ids)
              .select('id');

            if (error) {
              Alert.alert('Errore', 'Non sono riuscito a eliminare le notifiche.');
              return;
            }

            const deletedIds = new Set((deletedRows || []).map((row) => String(row.id)));
            setNotifications((current) => current.filter((item) => !deletedIds.has(item.id)));
            setSelectedIds(new Set());
            setSelecting(false);
          })();
        },
      },
    ]);
  }, [selectedIds]);

  const deleteAllNotifications = useCallback(() => {
    const label = BAJUJU_NOTIFICATION_CATEGORY_LABELS[activeTab];
    Alert.alert('Cancella tutte', `Vuoi cancellare tutte le notifiche di "${label}"?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Cancella tutte', style: 'destructive', onPress: () => {
          void (async () => {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            const userId = userData.user?.id;

            if (userError || !userId) {
              Alert.alert('Errore', 'Utente non autenticato.');
              return;
            }

            // Prende tutte le notifiche dell'utente (non solo le 100 mostrate),
            // così si azzerano anche i contatori della Home per questa sezione.
            const { data: allRows, error: listError } = await supabase
              .from('push_notification_logs')
              .select('id, notification_type, data')
              .eq('user_id', userId);

            if (listError) {
              Alert.alert('Errore', 'Non sono riuscito a cancellare le notifiche.');
              return;
            }

            const idsToDelete = (allRows || [])
              .filter((row) => getBajujuNotificationCategory(row.notification_type, row.data as NotificationData | null) === activeTab)
              .map((row) => String(row.id));

            const deletedIds = new Set<string>();
            for (let index = 0; index < idsToDelete.length; index += 100) {
              const { data: deletedRows, error } = await supabase
                .from('push_notification_logs')
                .delete()
                .eq('user_id', userId)
                .in('id', idsToDelete.slice(index, index + 100))
                .select('id');

              if (error) {
                Alert.alert('Errore', 'Non sono riuscito a cancellare tutte le notifiche.');
                break;
              }
              (deletedRows || []).forEach((row) => deletedIds.add(String(row.id)));
            }

            setNotifications((current) => current.filter((item) => !deletedIds.has(item.id)));
          })();
        },
      },
    ]);
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BajujuBackButton onPress={() => router.back()} accessibilityLabel="Torna indietro" />
        <Text style={styles.headerTitle} numberOfLines={1}>Notifiche</Text>
        <BajujuProfileButton size={38} />
      </View>
      <Text style={styles.headerSubtitle}>Richieste, conversazioni e altre novità</Text>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={PINK} />
          <Text style={styles.loadingText}>Caricamento notifiche…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadNotifications(true)} tintColor={PINK} />}
        >
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['requests', 'chat', 'other'] as const).map((tab) => (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab }}
                accessibilityLabel={`${BAJUJU_NOTIFICATION_CATEGORY_LABELS[tab]}, ${counts[tab]} notifiche`}
                onPress={() => setActiveTab(tab)}
                style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                  {BAJUJU_NOTIFICATION_CATEGORY_LABELS[tab]} ({counts[tab]})
                </Text>
              </Pressable>
            ))}
          </View>
          {errorMessage ? (
            <View style={styles.messageCard}>
              <Text style={styles.messageTitle}>Qualcosa non ha funzionato</Text>
              <Text style={styles.messageText}>{errorMessage}</Text>
              <Pressable style={styles.retryButton} onPress={() => void loadNotifications()}>
                <Text style={styles.retryButtonText}>Riprova</Text>
              </Pressable>
            </View>
          ) : visibleNotifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>Nessuna notifica</Text>
              <Text style={styles.emptyText}>Non ci sono notifiche in questa sezione.</Text>
            </View>
          ) : (
            <>
              {selecting ? (
                <View style={styles.actionsRow}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => setSelectedIds(
                      selectedIds.size === visibleNotifications.length
                        ? new Set()
                        : new Set(visibleNotifications.map((item) => item.id))
                    )}
                    accessibilityRole="button"
                  >
                    <Text style={styles.actionButtonText}>
                      {selectedIds.size === visibleNotifications.length ? 'Deseleziona' : 'Seleziona tutte'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => { setSelecting(false); setSelectedIds(new Set()); }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.actionButtonText}>Annulla</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.deleteSelectedButton, selectedIds.size === 0 && styles.disabledButton]}
                    onPress={deleteSelectedNotifications}
                    disabled={selectedIds.size === 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina ${selectedIds.size} notifiche selezionate`}
                  >
                    <Text style={[styles.actionButtonText, styles.deleteSelectedButtonText]}>🗑️ Elimina ({selectedIds.size})</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actionsRow}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => setSelecting(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Seleziona le notifiche da eliminare"
                  >
                    <Text style={styles.actionButtonText}>☑️ Seleziona</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionButton}
                    onPress={deleteAllNotifications}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancella tutte le notifiche di ${BAJUJU_NOTIFICATION_CATEGORY_LABELS[activeTab]}`}
                  >
                    <Text style={styles.actionButtonText}>🗑️ Cancella tutte</Text>
                  </Pressable>
                </View>
              )}
              {visibleNotifications.map((notification) => (
                <Pressable
                  key={notification.id}
                  style={[
                    styles.notificationCard,
                    !notification.is_read && styles.unreadCard,
                    selecting && selectedIds.has(notification.id) && styles.selectedCard,
                  ]}
                  onPress={() => selecting ? toggleSelected(notification.id) : void handleNotificationPress(notification)}
                  accessibilityRole={selecting ? 'checkbox' : 'button'}
                  accessibilityState={selecting ? { checked: selectedIds.has(notification.id) } : undefined}
                  accessibilityLabel={selecting ? `Seleziona notifica: ${notification.title}` : `Apri notifica: ${notification.title}`}
                >
                  {selecting ? (
                    <View style={[styles.checkCircle, selectedIds.has(notification.id) && styles.checkCircleOn]}>
                      {selectedIds.has(notification.id) ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                  ) : null}
                  <View style={styles.iconBox}>
                    <Text style={styles.iconText}>{notificationIcon(notification.notification_type)}</Text>
                  </View>

                  <View style={styles.notificationContent}>
                    <View style={styles.notificationTopRow}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      {!notification.is_read ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <Text style={styles.notificationBody}>{notification.body}</Text>
                    <Text style={styles.notificationDate}>{formatNotificationDate(notification.sent_at)}</Text>
                  </View>

                  {selecting ? null : (
                  <Pressable
                    style={styles.deleteNotificationButton}
                    onPress={(event) => { event.stopPropagation(); deleteNotification(notification.id); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina notifica: ${notification.title}`}
                  >
                    <Text style={styles.deleteNotificationButtonText}>Elimina</Text>
                  </Pressable>
                  )}
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      )}
      <BajujuBottomNav active="profile" />
    </SafeAreaView>
  );
}

const PINK = '#E43F98';
const PINK_DARK = '#4B0C2D';
const TEXT = '#4B0C2D';
const MUTED = '#8D5E77';
const BG = '#FFF9FC';
const SOFT = '#FFF0F7';
const BORDER = '#F3C6DC';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tabButton: { flex: 1, minWidth: 0, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER },
  activeTabButton: { backgroundColor: PINK, borderColor: PINK },
  tabText: { color: PINK_DARK, fontFamily: 'FredokaBold', fontSize: 12 },
  activeTabText: { color: WHITE },
  header: { minHeight: 64, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG },
  backButton: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER },
  backButtonText: { marginTop: -4, fontSize: 38, lineHeight: 40, fontFamily: 'FredokaMedium', color: PINK_DARK },
  headerTextBlock: { flex: 1, alignItems: 'center' },
  headerTitle: { flex: 1, marginLeft: 4, fontSize: 24, lineHeight: 28, fontFamily: 'FredokaBold', color: TEXT },
  headerSubtitle: { paddingHorizontal: 15, marginBottom: 8, fontSize: 13, fontFamily: 'FredokaRegular', color: MUTED },
  container: { flexGrow: 1, padding: 15, paddingTop: 6, paddingBottom: 130 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingText: { marginTop: 12, fontSize: 14, fontFamily: 'FredokaBold', color: TEXT },
  messageCard: { borderRadius: 28, padding: 22, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  messageTitle: { fontSize: 18, fontFamily: 'FredokaBold', color: PINK_DARK, textAlign: 'center' },
  messageText: { marginTop: 8, fontSize: 14, lineHeight: 20, fontFamily: 'FredokaBold', color: TEXT, textAlign: 'center' },
  retryButton: { marginTop: 16, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: PINK },
  retryButtonText: { fontSize: 14, fontFamily: 'FredokaBold', color: WHITE },
  emptyCard: { minHeight: 260, borderRadius: 30, padding: 28, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontFamily: 'FredokaRegular', fontSize: 48 },
  emptyTitle: { marginTop: 12, fontSize: 22, fontFamily: 'FredokaBold', color: PINK },
  emptyText: { maxWidth: 290, marginTop: 8, fontSize: 14, lineHeight: 21, fontFamily: 'FredokaBold', color: TEXT, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginBottom: 10 },
  actionButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER },
  actionButtonText: { fontSize: 12, fontFamily: 'FredokaBold', color: PINK_DARK },
  deleteSelectedButton: { backgroundColor: PINK, borderColor: PINK },
  deleteSelectedButtonText: { color: WHITE },
  disabledButton: { opacity: 0.45 },
  selectedCard: { borderColor: PINK, borderWidth: 2 },
  checkCircle: { width: 26, height: 26, marginTop: 10, marginRight: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE, borderWidth: 2, borderColor: BORDER },
  checkCircleOn: { backgroundColor: PINK, borderColor: PINK },
  checkMark: { fontSize: 15, lineHeight: 18, fontFamily: 'FredokaBold', color: WHITE },
  notificationCard: { marginBottom: 10, borderRadius: 24, padding: 14, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER },
  unreadCard: { backgroundColor: SOFT, borderColor: PINK },
  iconBox: { width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER },
  iconText: { fontFamily: 'FredokaRegular', fontSize: 23 },
  notificationContent: { flex: 1, marginLeft: 12 },
  notificationTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  notificationTitle: { flex: 1, fontSize: 16, lineHeight: 21, fontFamily: 'FredokaBold', color: PINK_DARK },
  unreadDot: { width: 9, height: 9, marginTop: 5, marginLeft: 8, borderRadius: 999, backgroundColor: PINK },
  notificationBody: { marginTop: 5, fontSize: 14, lineHeight: 20, fontFamily: 'FredokaBold', color: TEXT },
  notificationDate: { marginTop: 8, fontSize: 11, fontFamily: 'FredokaBold', color: MUTED },
  deleteNotificationButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4, paddingHorizontal: 8 },
  deleteNotificationButtonText: { fontSize: 11, fontFamily: 'FredokaBold', color: PINK_DARK, textDecorationLine: 'underline' },
});
