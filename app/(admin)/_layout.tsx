import { Redirect, Stack, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS } from '../../src/theme/bajujuTheme';

// La chat privata con Bajuju è usata anche dagli utenti normali ("Messaggi Bajuju").
const PUBLIC_ADMIN_GROUP_PATHS = new Set(['/admin-private-chat']);

type AdminStatus = 'loading' | 'admin' | 'denied';

// Guard lato app per l'area Admin: evita che un utente non admin apra le schermate via deep link.
// Non sostituisce i controlli lato server (RLS e RPC), che restano la vera protezione dei dati.
export default function AdminLayout() {
  const pathname = usePathname();
  const [status, setStatus] = useState<AdminStatus>('loading');

  useEffect(() => {
    let active = true;

    const checkAdmin = async (userId: string | undefined) => {
      if (!userId) {
        if (active) setStatus('denied');
        return;
      }

      // Solo profiles.is_admin è affidabile: è protetto dal trigger protect_admin_managed_profile_fields.
      const profileResult = await supabase
        .from('profiles')
        .select('is_admin,is_deleted')
        .eq('id', userId)
        .maybeSingle();

      if (!active) return;
      const isAdmin = !profileResult.error && profileResult.data?.is_admin === true && profileResult.data?.is_deleted !== true;
      setStatus(isAdmin ? 'admin' : 'denied');
    };

    void supabase.auth.getSession()
      .then(({ data }) => checkAdmin(data.session?.user.id))
      .catch(() => {
        if (active) setStatus('denied');
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void checkAdmin(session?.user.id).catch(() => {
          if (active) setStatus('denied');
        });
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (!PUBLIC_ADMIN_GROUP_PATHS.has(pathname)) {
    if (status === 'loading') {
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={BAJUJU_COLORS.brightPink} />
        </View>
      );
    }

    if (status === 'denied') {
      return <Redirect href="/profile" />;
    }
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9FC',
  },
});
