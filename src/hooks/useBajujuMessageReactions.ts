import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { supabase } from '../lib/supabase';
import { useChatLiveRefresh } from './useChatLiveRefresh';

export type BajujuReactionChat = 'activity' | 'group' | 'support';

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string | null;
};

export type BajujuReactionSummary = {
  emoji: string;
  count: number;
  mine: boolean;
};

const SELECT = 'id,message_id,user_id,emoji,created_at';

/**
 * Reazioni emoji ai messaggi di una chat (come WhatsApp): una per persona per messaggio.
 * Restano anche se chi le ha messe esce dall'evento/gruppo (tabella chat_message_reactions).
 * Aggiornamento live con realtime + la stessa rete di sicurezza delle chat (useChatLiveRefresh).
 */
export function useBajujuMessageReactions(
  chat: BajujuReactionChat,
  scopeId: string | null | undefined,
  currentUserId: string | null | undefined,
  enabled = true
) {
  const [rows, setRows] = useState<ReactionRow[]>([]);
  const rowsRef = useRef<ReactionRow[]>([]);
  rowsRef.current = rows;
  const active = Boolean(enabled && scopeId && currentUserId);

  const reload = useCallback(async () => {
    if (!active || !scopeId) return;
    const result = await supabase
      .from('chat_message_reactions')
      .select(SELECT)
      .eq('chat', chat)
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (result.error) {
      console.log('Reazioni non caricate.');
      return;
    }
    setRows((result.data || []) as ReactionRow[]);
  }, [active, chat, scopeId]);

  useEffect(() => {
    setRows([]);
    if (!active || !scopeId) return;
    void reload();

    const channel = supabase
      .channel(`reactions-${chat}-${scopeId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reactions', filter: `scope_id=eq.${scopeId}` },
        () => void reload()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_message_reactions', filter: `scope_id=eq.${scopeId}` },
        () => void reload()
      )
      // Le cancellazioni arrivano senza filtro (solo l'id): ricarica se riguarda questa chat.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_message_reactions' }, (payload) => {
        const id = String((payload.old as any)?.id || '');
        if (id && rowsRef.current.some((row) => row.id === id)) void reload();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void reload();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, chat, reload, scopeId]);

  useChatLiveRefresh(active ? () => void reload() : null);

  const byMessage = useMemo(() => {
    const grouped: Record<string, BajujuReactionSummary[]> = {};
    const order: Record<string, string[]> = {};
    const counts: Record<string, Record<string, BajujuReactionSummary>> = {};

    rows.forEach((row) => {
      const messageId = String(row.message_id || '');
      const emoji = String(row.emoji || '');
      if (!messageId || !emoji) return;
      counts[messageId] = counts[messageId] || {};
      order[messageId] = order[messageId] || [];
      if (!counts[messageId][emoji]) {
        counts[messageId][emoji] = { emoji, count: 0, mine: false };
        order[messageId].push(emoji);
      }
      counts[messageId][emoji].count += 1;
      if (String(row.user_id) === String(currentUserId)) counts[messageId][emoji].mine = true;
    });

    Object.keys(counts).forEach((messageId) => {
      grouped[messageId] = order[messageId].map((emoji) => counts[messageId][emoji]);
    });
    return grouped;
  }, [currentUserId, rows]);

  const myReactionFor = useCallback(
    (messageId: string) =>
      rows.find((row) => row.message_id === messageId && String(row.user_id) === String(currentUserId))?.emoji || null,
    [currentUserId, rows]
  );

  /** Mette l'emoji; se è già la propria la toglie; se era un'altra la sostituisce. */
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!active || !scopeId || !currentUserId || !messageId || !emoji) return;
      const mineRow = rowsRef.current.find(
        (row) => row.message_id === messageId && String(row.user_id) === String(currentUserId)
      );
      const previous = rowsRef.current;

      try {
        if (mineRow && mineRow.emoji === emoji) {
          setRows((current) => current.filter((row) => row.id !== mineRow.id));
          const result = await supabase.from('chat_message_reactions').delete().eq('id', mineRow.id);
          if (result.error) throw result.error;
        } else if (mineRow) {
          setRows((current) => current.map((row) => (row.id === mineRow.id ? { ...row, emoji } : row)));
          const result = await supabase
            .from('chat_message_reactions')
            .update({ emoji, updated_at: new Date().toISOString() })
            .eq('id', mineRow.id);
          if (result.error) throw result.error;
        } else {
          const tempId = `temp-${Date.now()}`;
          setRows((current) => [...current, { id: tempId, message_id: messageId, user_id: currentUserId, emoji }]);
          const result = await supabase
            .from('chat_message_reactions')
            .insert({ chat, scope_id: scopeId, message_id: messageId, user_id: currentUserId, emoji })
            .select(SELECT)
            .single();
          if (result.error) throw result.error;
          setRows((current) => current.map((row) => (row.id === tempId ? (result.data as ReactionRow) : row)));
        }
      } catch (error) {
        console.log('Reazione non salvata:', error);
        setRows(previous);
        Alert.alert('Reazione non salvata', 'Riprova tra poco.');
        void reload();
      }
    },
    [active, chat, currentUserId, reload, scopeId]
  );

  return { byMessage, myReactionFor, toggleReaction };
}
