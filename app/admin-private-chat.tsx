import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../src/theme/bajujuTheme';

type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  read_at?: string | null;
};

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminPrivateChatScreen() {
  const params = useLocalSearchParams<{ userId?: string; threadId?: string }>();
  const requestedUserId = String(params.userId || '').trim();
  const requestedThreadId = String(params.threadId || '').trim();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [targetName, setTargetName] = useState('Utente Bajuju');
  const [threadId, setThreadId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const loadMessages = useCallback(async (id: string) => {
    if (!id) {
      setMessages([]);
      return;
    }

    const result = await supabase
      .from('admin_private_messages')
      .select('id,thread_id,sender_id,message,created_at,read_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
      .limit(300);

    if (result.error) throw result.error;
    setMessages((result.data || []) as ChatMessage[]);

    const readResult = await supabase.rpc('mark_admin_private_thread_read' as any, {
      p_thread_id: id,
    });
    if (readResult.error) {
      console.log('Messaggi admin non marcati come letti:', readResult.error.message);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;
      const userId = authResult.data.user?.id || '';
      if (!userId) {
        router.replace('/');
        return;
      }
      setCurrentUserId(userId);

      const myProfileResult = await supabase
        .from('profiles')
        .select('id,nickname,is_admin,is_deleted')
        .eq('id', userId)
        .maybeSingle();
      if (myProfileResult.error) throw myProfileResult.error;

      const admin = myProfileResult.data?.is_admin === true && myProfileResult.data?.is_deleted !== true;
      setIsAdmin(admin);

      let resolvedTargetUserId = admin && requestedUserId ? requestedUserId : userId;
      let resolvedThreadId = requestedThreadId;

      if (resolvedThreadId) {
        const byIdResult = await supabase
          .from('admin_private_threads')
          .select('id,user_id')
          .eq('id', resolvedThreadId)
          .maybeSingle();
        if (byIdResult.error) throw byIdResult.error;
        if (byIdResult.data?.user_id) {
          resolvedTargetUserId = String(byIdResult.data.user_id);
        } else {
          resolvedThreadId = '';
        }
      }

      setTargetUserId(resolvedTargetUserId);

      if (admin && resolvedTargetUserId !== userId) {
        const targetProfileResult = await supabase
          .from('profiles')
          .select('nickname')
          .eq('id', resolvedTargetUserId)
          .maybeSingle();
        if (!targetProfileResult.error) {
          setTargetName(String(targetProfileResult.data?.nickname || 'Utente Bajuju'));
        }
      } else {
        setTargetName('Bajuju');
      }

      if (!resolvedThreadId) {
        const threadResult = await supabase
          .from('admin_private_threads')
          .select('id,user_id')
          .eq('user_id', resolvedTargetUserId)
          .maybeSingle();
        if (threadResult.error) throw threadResult.error;
        resolvedThreadId = String(threadResult.data?.id || '');
      }

      setThreadId(resolvedThreadId);
      await loadMessages(resolvedThreadId);
    } catch (error: any) {
      console.log('Errore chat amministratore:', error);
      Alert.alert('Errore', String(error?.message || 'Non sono riuscito a caricare la chat.'));
    } finally {
      setLoading(false);
    }
  }, [loadMessages, requestedThreadId, requestedUserId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`admin-private-chat-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_private_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          void loadMessages(threadId).catch(() => undefined);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadMessages, threadId]);

  const canSend = useMemo(() => {
    const clean = draft.trim();
    if (!clean || clean.length > 2000 || sending) return false;
    if (threadId) return true;
    return isAdmin && Boolean(targetUserId) && targetUserId !== currentUserId;
  }, [currentUserId, draft, isAdmin, sending, targetUserId, threadId]);

  async function ensureThread() {
    if (threadId) return threadId;
    if (!isAdmin || !currentUserId || !targetUserId || targetUserId === currentUserId) {
      throw new Error('Solo un amministratore può aprire una nuova conversazione.');
    }

    const insertResult = await supabase
      .from('admin_private_threads')
      .insert({
        user_id: targetUserId,
        created_by_admin: currentUserId,
      })
      .select('id')
      .maybeSingle();

    if (!insertResult.error && insertResult.data?.id) {
      const createdId = String(insertResult.data.id);
      setThreadId(createdId);
      return createdId;
    }

    const existingResult = await supabase
      .from('admin_private_threads')
      .select('id')
      .eq('user_id', targetUserId)
      .maybeSingle();
    if (existingResult.error || !existingResult.data?.id) {
      throw insertResult.error || existingResult.error || new Error('Thread non creato.');
    }

    const existingId = String(existingResult.data.id);
    setThreadId(existingId);
    return existingId;
  }

  async function sendMessage() {
    if (!canSend || !currentUserId) return;
    const clean = draft.trim();
    setSending(true);

    try {
      const activeThreadId = await ensureThread();
      const insertResult = await supabase
        .from('admin_private_messages')
        .insert({
          thread_id: activeThreadId,
          sender_id: currentUserId,
          message: clean,
        })
        .select('id,thread_id,sender_id,message,created_at,read_at')
        .maybeSingle();

      if (insertResult.error || !insertResult.data?.id) {
        throw insertResult.error || new Error('Messaggio non inviato.');
      }

      setDraft('');
      await loadMessages(activeThreadId);

      if (isAdmin && targetUserId && targetUserId !== currentUserId) {
        const notifyResult = await supabase.functions.invoke('notify-admin-private-message', {
          body: {
            messageId: String(insertResult.data.id),
            threadId: activeThreadId,
            targetUserId,
          },
        });
        if (notifyResult.error) {
          console.log('Push messaggio amministratore non inviata:', notifyResult.error.message);
        }
      }
    } catch (error: any) {
      Alert.alert('Invio non riuscito', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BAJUJU_COLORS.brightPink} />
        <Text style={styles.loadingText}>Carico i messaggi...</Text>
      </View>
    );
  }

  const adminViewingUser = isAdmin && targetUserId && targetUserId !== currentUserId;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Indietro</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{adminViewingUser ? targetName : 'Bajuju'}</Text>
          <Text style={styles.subtitle}>
            {adminViewingUser ? 'Conversazione amministratore' : 'Canale ufficiale · Amministratore'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
      >
        {!threadId || messages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {adminViewingUser ? 'Scrivi il primo messaggio' : 'Nessun messaggio da Bajuju'}
            </Text>
            <Text style={styles.emptyText}>
              {adminViewingUser
                ? 'La conversazione verrà creata quando invii il primo messaggio.'
                : 'Quando l’amministratore ti scriverà, troverai qui tutta la conversazione.'}
            </Text>
          </View>
        ) : (
          messages.map((item) => {
            const mine = item.sender_id === currentUserId;
            return (
              <View key={item.id} style={[styles.messageRow, mine ? styles.mineRow : styles.otherRow]}>
                <View style={[styles.bubble, mine ? styles.mineBubble : styles.otherBubble]}>
                  <Text style={[styles.senderLabel, mine && styles.mineSenderLabel]}>
                    {mine
                      ? adminViewingUser
                        ? 'Bajuju · Amministratore'
                        : 'Tu'
                      : adminViewingUser
                        ? targetName
                        : 'Bajuju · Amministratore'}
                  </Text>
                  <Text style={[styles.messageText, mine && styles.mineMessageText]}>{item.message}</Text>
                  <Text style={[styles.messageTime, mine && styles.mineMessageTime]}>
                    {formatMessageTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={adminViewingUser ? 'Scrivi un messaggio ufficiale...' : 'Rispondi a Bajuju...'}
          placeholderTextColor={BAJUJU_COLORS.muted}
          multiline
          maxLength={2000}
          style={styles.input}
        />
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendDisabled]}
          disabled={!canSend}
          onPress={() => { void sendMessage(); }}
        >
          <Text style={styles.sendText}>{sending ? 'Invio...' : 'Invia'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.background, gap: 10 },
  loadingText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium },
  header: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: BAJUJU_COLORS.line, backgroundColor: '#fff' },
  backButton: { minHeight: 42, paddingHorizontal: 13, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  backText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 21 },
  subtitle: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  messages: { flex: 1 },
  messagesContent: { padding: 18, paddingBottom: 26 },
  emptyCard: { marginTop: 24, padding: 20, borderRadius: 22, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  emptyTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  emptyText: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  messageRow: { marginBottom: 11, flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '84%', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20 },
  mineBubble: { backgroundColor: BAJUJU_COLORS.brightPink, borderBottomRightRadius: 7 },
  otherBubble: { backgroundColor: '#fff', borderWidth: 1, borderColor: BAJUJU_COLORS.palePink, borderBottomLeftRadius: 7 },
  senderLabel: { marginBottom: 4, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 11 },
  mineSenderLabel: { color: '#fff' },
  messageText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 20 },
  mineMessageText: { color: '#fff' },
  messageTime: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 10 },
  mineMessageTime: { color: '#ffe2f1' },
  composer: { padding: 12, borderTopWidth: 1, borderTopColor: BAJUJU_COLORS.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  input: { flex: 1, minHeight: 48, maxHeight: 130, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, color: BAJUJU_COLORS.plum, backgroundColor: BAJUJU_COLORS.background, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  sendButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
});
