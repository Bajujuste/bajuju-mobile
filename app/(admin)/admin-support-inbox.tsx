import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';

type ThreadRow = {
  id: string;
  user_id: string;
  created_at: string;
  last_message_at?: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  read_at?: string | null;
};

type ProfileRow = {
  id: string;
  nickname?: string | null;
  avatar_url?: string | null;
  city?: string | null;
};

function formatWhen(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminSupportInboxScreen() {
  const [currentUserId, setCurrentUserId] = useState('');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const authResult = await supabase.auth.getUser();
    if (authResult.error) throw authResult.error;
    const userId = authResult.data.user?.id || '';
    if (!userId) return;
    setCurrentUserId(userId);

    const threadResult = await supabase
      .from('admin_private_threads')
      .select('id,user_id,created_at,last_message_at')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (threadResult.error) throw threadResult.error;
    const loadedThreads = (threadResult.data || []) as ThreadRow[];
    setThreads(loadedThreads);

    const threadIds = loadedThreads.map((row) => row.id);
    const userIds = [...new Set(loadedThreads.map((row) => row.user_id).filter(Boolean))];

    const [messagesResult, profilesResult] = await Promise.all([
      threadIds.length
        ? supabase
            .from('admin_private_messages')
            .select('id,thread_id,sender_id,message,created_at,read_at')
            .in('thread_id', threadIds)
            .order('created_at', { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [], error: null } as any),
      userIds.length
        ? supabase
            .from('profiles')
            .select('id,nickname,avatar_url,city')
            .in('id', userIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (messagesResult.error) throw messagesResult.error;
    if (profilesResult.error) throw profilesResult.error;

    setMessages((messagesResult.data || []) as MessageRow[]);

    const profileMap: Record<string, ProfileRow> = {};
    (profilesResult.data || []).forEach((row: ProfileRow) => {
      profileMap[row.id] = row;
    });
    setProfiles(profileMap);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        setLoading(true);
        try {
          await load();
        } catch (error) {
          console.log('Errore caricamento inbox Bajuju:', error);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (error) {
      console.log('Errore aggiornamento inbox Bajuju:', error);
    } finally {
      setRefreshing(false);
    }
  }

  const summaryByThread = useMemo(() => {
    const summaries: Record<string, { latest?: MessageRow; unread: number }> = {};

    messages.forEach((message) => {
      if (!summaries[message.thread_id]) {
        summaries[message.thread_id] = { latest: message, unread: 0 };
      }
      if (
        message.sender_id !== currentUserId &&
        !message.read_at
      ) {
        summaries[message.thread_id].unread += 1;
      }
    });

    return summaries;
  }, [currentUserId, messages]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={BAJUJU_COLORS.brightPink} />}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>← Admin</Text>
          </Pressable>
          <Text style={styles.kicker}>ASSISTENZA</Text>
          <Text style={styles.title}>Messaggi Bajuju</Text>
          <Text style={styles.subtitle}>
            Qui arrivano le conversazioni private degli utenti con Bajuju.
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={BAJUJU_COLORS.brightPink} />
            <Text style={styles.stateText}>Carico le conversazioni…</Text>
          </View>
        ) : threads.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Nessun messaggio</Text>
            <Text style={styles.stateText}>Quando un utente scriverà a Bajuju comparirà qui.</Text>
          </View>
        ) : (
          threads.map((thread) => {
            const profile = profiles[thread.user_id];
            const summary = summaryByThread[thread.id] || { unread: 0 };
            const latest = summary.latest;
            const name = String(profile?.nickname || 'Utente Bajuju');

            return (
              <Pressable
                key={thread.id}
                style={({ pressed }) => [styles.threadCard, summary.unread > 0 && styles.threadCardUnread, pressed && styles.pressed]}
                onPress={() => router.push({
                  pathname: '/admin-private-chat' as any,
                  params: { threadId: thread.id },
                })}
              >
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>💬</Text>
                  </View>
                )}

                <View style={styles.threadCopy}>
                  <View style={styles.threadTopRow}>
                    <Text style={styles.threadName} numberOfLines={1}>{name}</Text>
                    {summary.unread > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{summary.unread > 99 ? '99+' : summary.unread}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.threadMeta} numberOfLines={1}>
                    {[profile?.city, formatWhen(latest?.created_at || thread.last_message_at)].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.preview} numberOfLines={2}>
                    {latest?.message || 'Conversazione aperta.'}
                  </Text>
                </View>

                <Text style={styles.arrow}>›</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  page: { padding: 18, paddingBottom: 50 },
  header: { padding: 20, marginBottom: 14, borderRadius: 26, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: BAJUJU_COLORS.softPink, marginBottom: 12 },
  backText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  kicker: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 11, letterSpacing: 1 },
  title: { marginTop: 3, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 30 },
  subtitle: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  stateCard: { padding: 26, borderRadius: 24, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', alignItems: 'center', gap: 8 },
  stateTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  stateText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, textAlign: 'center' },
  threadCard: { minHeight: 92, marginBottom: 11, padding: 13, borderRadius: 23, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12, ...BAJUJU_SHADOW },
  threadCardUnread: { borderColor: BAJUJU_COLORS.brightPink, backgroundColor: '#FFF7FB' },
  avatar: { width: 56, height: 56, borderRadius: 19, backgroundColor: BAJUJU_COLORS.softPink },
  avatarFallback: { width: 56, height: 56, borderRadius: 19, backgroundColor: BAJUJU_COLORS.softPink, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 24 },
  threadCopy: { flex: 1, minWidth: 0 },
  threadTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  threadName: { flex: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  threadMeta: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 11 },
  preview: { marginTop: 5, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 13, lineHeight: 17 },
  badge: { minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 12, backgroundColor: BAJUJU_COLORS.brightPink, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 10 },
  arrow: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 28 },
  pressed: { opacity: 0.72 },
});
