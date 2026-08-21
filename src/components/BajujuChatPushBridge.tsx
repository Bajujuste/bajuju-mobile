import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';

export function BajujuChatPushBridge() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;
    let currentUserId = '';
    let chatChannel: ReturnType<typeof supabase.channel> | null = null;

    async function stopChannel() {
      if (chatChannel) {
        const channelToRemove = chatChannel;
        chatChannel = null;
        await supabase.removeChannel(channelToRemove);
      }
    }

    async function listenForUser(userId?: string | null) {
      const cleanUserId = String(userId || '').trim();

      if (!active || cleanUserId === currentUserId) return;

      await stopChannel();
      currentUserId = cleanUserId;

      if (!cleanUserId || !active) return;

      chatChannel = supabase
        .channel(`bajuju-chat-push-${cleanUserId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'activity_messages',
            filter: `sender_id=eq.${cleanUserId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const activityId = String(row.activity_id || '').trim();
            const senderId = String(row.sender_id || '').trim();

            if (!activityId || senderId !== cleanUserId) return;

            void supabase.functions
              .invoke('send-bajuju-chat-push', {
                body: { activityId },
              })
              .then(({ error }) => {
                if (error) {
                  console.log('Push chat non inviata.');
                }
              })
              .catch(() => {
                console.log('Push chat non inviata.');
              });
          }
        )
        .subscribe();
    }

    void supabase.auth.getSession().then(({ data }) => {
      void listenForUser(data.session?.user?.id);
    });

    const authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
      void listenForUser(session?.user?.id);
    });

    return () => {
      active = false;
      authSubscription.data.subscription.unsubscribe();
      void stopChannel();
    };
  }, []);

  return null;
}
