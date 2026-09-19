import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../theme/bajujuTheme';

type GroupChatMember = {
  user_id?: string | null;
  nickname?: string | null;
};

type GroupMessageRow = {
  id?: string | null;
  group_id?: string | null;
  user_id?: string | null;
  message?: string | null;
  created_at?: string | null;
};

type Props = {
  groupId: string;
  currentUserId: string;
  canUseChat: boolean;
  members: GroupChatMember[];
};

const PAGE_SIZE = 50;

function messageId(row: GroupMessageRow) {
  return String(row.id || '').trim();
}

function messageTimestamp(row: GroupMessageRow) {
  return String(row.created_at || '');
}

function sortMessages(rows: GroupMessageRow[]) {
  return [...rows].sort((a, b) => {
    const byTime = messageTimestamp(a).localeCompare(messageTimestamp(b));
    if (byTime !== 0) return byTime;
    return messageId(a).localeCompare(messageId(b));
  });
}

function mergeMessages(current: GroupMessageRow[], incoming: GroupMessageRow[]) {
  const map = new Map<string, GroupMessageRow>();

  [...current, ...incoming].forEach((row) => {
    const id = messageId(row);
    if (id) map.set(id, row);
  });

  return sortMessages([...map.values()]);
}

function formatMessageTime(value: string | null | undefined) {
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

export function BajujuGroupChat({ groupId, currentUserId, canUseChat, members }: Props) {
  const scrollRef = useRef<ScrollView | null>(null);
  const initialScrollDoneRef = useRef(false);

  const [messages, setMessages] = useState<GroupMessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const nicknameById = useMemo(() => {
    const map: Record<string, string> = {};

    members.forEach((member) => {
      const id = String(member.user_id || '').trim();
      if (!id) return;
      map[id] = String(member.nickname || '').trim() || 'Utente Bajuju';
    });

    return map;
  }, [members]);

  const loadLatest = useCallback(async () => {
    if (!groupId || !canUseChat) return;

    setLoading(true);
    try {
      const result = await supabase
        .from('group_messages')
        .select('id,group_id,user_id,message,created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (result.error) throw result.error;

      const rows = ((result.data || []) as GroupMessageRow[]).reverse();
      setMessages(rows);
      setHasOlder(rows.length === PAGE_SIZE);
    } catch (error) {
      console.log('Errore caricamento chat gruppo:', error);
      setMessages([]);
      setHasOlder(false);
    } finally {
      setLoading(false);
    }
  }, [canUseChat, groupId]);

  const loadOlder = useCallback(async () => {
    if (!groupId || !canUseChat || loadingOlder || !hasOlder || messages.length === 0) return;

    const oldestCreatedAt = String(messages[0]?.created_at || '').trim();
    if (!oldestCreatedAt) {
      setHasOlder(false);
      return;
    }

    setLoadingOlder(true);
    try {
      const result = await supabase
        .from('group_messages')
        .select('id,group_id,user_id,message,created_at')
        .eq('group_id', groupId)
        .lt('created_at', oldestCreatedAt)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (result.error) throw result.error;

      const olderRows = ((result.data || []) as GroupMessageRow[]).reverse();
      setMessages((current) => mergeMessages(olderRows, current));
      setHasOlder(olderRows.length === PAGE_SIZE);
    } catch (error) {
      console.log('Errore caricamento messaggi precedenti:', error);
    } finally {
      setLoadingOlder(false);
    }
  }, [canUseChat, groupId, hasOlder, loadingOlder, messages]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    setMessages([]);
    setDraft('');
    setHasOlder(true);
    setAtBottom(true);

    if (canUseChat) void loadLatest();
  }, [canUseChat, groupId, loadLatest]);

  useEffect(() => {
    if (!groupId || !canUseChat) return;

    const channel = supabase
      .channel(`group-messages-${groupId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as GroupMessageRow;
          setMessages((current) => mergeMessages(current, [row]));

          if (atBottom || String(row.user_id || '') === currentUserId) {
            requestAnimationFrame(() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [atBottom, canUseChat, currentUserId, groupId]);

  async function sendMessage() {
    const cleanMessage = draft.trim();
    if (!groupId || !currentUserId || !canUseChat || !cleanMessage || sending) return;

    setSending(true);
    try {
      const result = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          user_id: currentUserId,
          message: cleanMessage,
        })
        .select('id,group_id,user_id,message,created_at')
        .single();

      if (result.error) throw result.error;

      setDraft('');
      setAtBottom(true);
      setMessages((current) => mergeMessages(current, [result.data as GroupMessageRow]));
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    } catch (error: any) {
      Alert.alert('Messaggio non inviato', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setSending(false);
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const nextAtBottom = distanceFromBottom < 48;

    setAtBottom(nextAtBottom);

    if (contentOffset.y <= 24 && hasOlder && !loadingOlder) {
      void loadOlder();
    }
  }

  function scrollToLatest() {
    setAtBottom(true);
    scrollRef.current?.scrollToEnd({ animated: true });
  }

  if (!canUseChat) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Chat del gruppo</Text>
        <View style={styles.lockedCard}>
          <Text style={styles.lockedText}>Iscriviti al gruppo per leggere e scrivere nella chat.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.sectionTitle}>Chat del gruppo</Text>
          <Text style={styles.sectionHint}>La chat resta compatta: scorri qui dentro per vedere i messaggi.</Text>
        </View>
        {!atBottom && messages.length > 0 ? (
          <Pressable style={styles.jumpButton} onPress={scrollToLatest} accessibilityLabel="Vai agli ultimi messaggi">
            <Text style={styles.jumpButtonText}>↓ Ultimi</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chatCard}>
        <ScrollView
          ref={scrollRef}
          style={styles.messageViewport}
          contentContainerStyle={styles.messagesContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={50}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={handleScroll}
          onContentSizeChange={() => {
            if (!initialScrollDoneRef.current && !loading) {
              initialScrollDoneRef.current = true;
              requestAnimationFrame(() => {
                scrollRef.current?.scrollToEnd({ animated: false });
              });
            }
          }}
        >
          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={BAJUJU_COLORS.brightPink} />
              <Text style={styles.stateText}>Carico la chat...</Text>
            </View>
          ) : (
            <>
              {loadingOlder ? (
                <View style={styles.olderLoader}>
                  <ActivityIndicator size="small" color={BAJUJU_COLORS.brightPink} />
                  <Text style={styles.olderLoaderText}>Carico i messaggi precedenti...</Text>
                </View>
              ) : hasOlder && messages.length > 0 ? (
                <Text style={styles.olderHint}>Scorri in alto per caricare i messaggi precedenti</Text>
              ) : null}

              {messages.length === 0 ? (
                <View style={styles.stateBox}>
                  <Text style={styles.emptyTitle}>Ancora nessun messaggio</Text>
                  <Text style={styles.stateText}>Puoi iniziare tu la conversazione.</Text>
                </View>
              ) : (
                messages.map((row) => {
                  const senderId = String(row.user_id || '');
                  const mine = senderId === currentUserId;
                  const senderName = mine ? 'Tu' : nicknameById[senderId] || 'Utente Bajuju';

                  return (
                    <View
                      key={messageId(row)}
                      style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}
                    >
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                        <Text style={[styles.senderName, mine && styles.senderNameMine]}>{senderName}</Text>
                        <Text style={[styles.messageText, mine && styles.messageTextMine]}>
                          {String(row.message || '')}
                        </Text>
                        <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
                          {formatMessageTime(row.created_at)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Scrivi nel gruppo..."
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.composerInput}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || sending) && styles.disabled]}
            disabled={!draft.trim() || sending}
            onPress={() => { void sendMessage(); }}
          >
            <Text style={styles.sendButtonText}>{sending ? '...' : 'Invia'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 22 },
  sectionHint: { marginTop: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  jumpButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  jumpButtonText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 11 },
  lockedCard: { marginTop: 11, padding: 18, borderRadius: 22, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff' },
  lockedText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  chatCard: { marginTop: 11, overflow: 'hidden', borderRadius: 24, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  messageViewport: { height: 330, backgroundColor: '#FFF9FC' },
  messagesContent: { flexGrow: 1, paddingHorizontal: 12, paddingVertical: 12 },
  stateBox: { flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8 },
  stateText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13, textAlign: 'center' },
  emptyTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  olderLoader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  olderLoaderText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 11 },
  olderHint: { marginBottom: 9, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 10, textAlign: 'center' },
  messageRow: { width: '100%', marginBottom: 8 },
  messageRowMine: { alignItems: 'flex-end' },
  messageRowOther: { alignItems: 'flex-start' },
  bubble: { maxWidth: '84%', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 7, borderRadius: 17 },
  bubbleMine: { backgroundColor: BAJUJU_COLORS.brightPink, borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: BAJUJU_COLORS.palePink, borderBottomLeftRadius: 5 },
  senderName: { marginBottom: 3, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 10 },
  senderNameMine: { color: '#fff' },
  messageText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 19 },
  messageTextMine: { color: '#fff' },
  messageTime: { marginTop: 5, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 9, textAlign: 'right' },
  messageTimeMine: { color: '#FFFFFFCC' },
  composer: { padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 96, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10, borderRadius: 18, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, color: BAJUJU_COLORS.plum, backgroundColor: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  sendButton: { minWidth: 68, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  sendButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  disabled: { opacity: 0.45 },
});
