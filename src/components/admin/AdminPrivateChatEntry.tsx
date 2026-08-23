import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../theme/bajujuTheme';

export function AdminPrivateChatEntry() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ id?: string }>();
  const targetUserId = String(params.id || '').trim();
  const [unread, setUnread] = useState(0);
  const [canAdminMessage, setCanAdminMessage] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (pathname !== '/profile' && pathname !== '/admin-user-detail') {
        if (active) {
          setUnread(0);
          setCanAdminMessage(false);
        }
        return;
      }

      try {
        const authResult = await supabase.auth.getUser();
        const userId = authResult.data.user?.id || '';
        if (!userId || !active) return;

        if (pathname === '/admin-user-detail') {
          const profileResult = await supabase
            .from('profiles')
            .select('is_admin,is_deleted')
            .eq('id', userId)
            .maybeSingle();
          if (!active) return;
          setCanAdminMessage(
            profileResult.data?.is_admin === true &&
            profileResult.data?.is_deleted !== true &&
            Boolean(targetUserId) &&
            targetUserId !== userId
          );
          setUnread(0);
          return;
        }

        setCanAdminMessage(false);
        const threadResult = await supabase
          .from('admin_private_threads')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (threadResult.error || !threadResult.data?.id) {
          if (active) setUnread(0);
          return;
        }

        const countResult = await supabase
          .from('admin_private_messages')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', String(threadResult.data.id))
          .neq('sender_id', userId)
          .is('read_at', null);

        if (active) setUnread(countResult.error ? 0 : countResult.count || 0);
      } catch {
        if (active) {
          setUnread(0);
          setCanAdminMessage(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [pathname, targetUserId]);

  if (pathname === '/profile') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Apri Messaggi Bajuju"
        style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
        onPress={() => router.push('/admin-private-chat' as any)}
      >
        <Text style={styles.profileIcon}>💬</Text>
        <Text style={styles.profileText}>Messaggi Bajuju</Text>
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

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
  profileButton: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    zIndex: 50,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...BAJUJU_SHADOW,
  },
  profileIcon: { fontSize: 19 },
  profileText: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 14,
  },
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
