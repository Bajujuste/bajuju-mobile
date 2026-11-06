import { Ionicons } from '@expo/vector-icons';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { countSupportUnreadForAdmins, isActiveAdmin } from '../../lib/bajujuSupport';
import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../theme/bajujuTheme';

async function loadProfileChatSummary(userId: string) {
  // Ogni admin attivo vede "Messaggi Bajuju" con i messaggi di tutti gli utenti.
  if (await isActiveAdmin(userId)) {
    return { isAdmin: true, unread: await countSupportUnreadForAdmins() };
  }

  const threadResult = await supabase
    .from('admin_private_threads')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (threadResult.error || !threadResult.data?.id) return { isAdmin: false, unread: 0 };

  const countResult = await supabase
    .from('admin_private_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', String(threadResult.data.id))
    .neq('sender_id', userId)
    .is('read_at', null);

  return { isAdmin: false, unread: countResult.error ? 0 : countResult.count || 0 };
}

// Riga "Chiedi a Bajuju" dentro l'elenco del profilo (al posto del pulsante flottante).
export function ProfileAdminChatRow({ rowStyle, iconColor, labelStyle, chevronColor }: {
  rowStyle: StyleProp<ViewStyle>;
  iconColor: string;
  labelStyle: StyleProp<TextStyle>;
  chevronColor: string;
}) {
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const authResult = await supabase.auth.getUser();
        const userId = authResult.data.user?.id || '';
        if (!userId) return;
        const summary = await loadProfileChatSummary(userId);
        if (active) {
          setIsAdmin(summary.isAdmin);
          setUnread(summary.unread);
        }
      } catch {
        if (active) setUnread(0);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Apri Messaggi Bajuju"
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
      onPress={() => router.push((isAdmin ? '/admin-support-inbox' : '/admin-private-chat') as any)}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={22} color={iconColor} />
      <Text style={labelStyle}>{isAdmin ? 'Messaggi Bajuju' : 'Chiedi a Bajuju'}</Text>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={chevronColor} />
    </Pressable>
  );
}

export function AdminPrivateChatEntry() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ id?: string }>();
  const targetUserId = String(params.id || '').trim();
  const [canAdminMessage, setCanAdminMessage] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (pathname !== '/admin-user-detail') {
        if (active) setCanAdminMessage(false);
        return;
      }

      try {
        const authResult = await supabase.auth.getUser();
        const userId = authResult.data.user?.id || '';
        if (!userId || !active) return;

        const admin = await isActiveAdmin(userId);
        if (!active) return;
        setCanAdminMessage(admin && Boolean(targetUserId) && targetUserId !== userId);
      } catch {
        if (active) setCanAdminMessage(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [pathname, targetUserId]);

  if (pathname === '/admin-user-detail' && canAdminMessage) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Invia messaggio privato all'utente"
        style={({ pressed }) => [styles.adminButton, pressed && styles.pressed]}
        onPress={() =>
          router.push({
            pathname: '/admin-private-chat' as any,
            params: { userId: targetUserId },
          })
        }
      >
        <Text style={styles.adminText}>💬 Messaggio privato</Text>
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  badgeText: {
    color: '#fff',
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 10,
  },
  adminButton: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    zIndex: 50,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.plum,
    ...BAJUJU_SHADOW,
  },
  adminText: {
    color: '#fff',
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 14,
  },
  pressed: { opacity: 0.72 },
});
