import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../theme/bajujuTheme';

// Unica schermata raggiungibile da un utente sospeso: la chat "Chiedi a Bajuju".
const SUSPENDED_ALLOWED_PATHS = new Set(['/admin-private-chat']);
// Ricontrollo al cambio di schermata al massimo ogni 30 s (al rientro in primo piano sempre).
const RECHECK_INTERVAL_MS = 30_000;

function isFutureDate(value: unknown) {
  if (typeof value !== 'string' || !value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
}

async function loadSuspendedState(userId: string | undefined) {
  if (!userId) return false;
  const result = await supabase
    .from('profiles')
    .select('suspended_until,is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (result.error || !result.data) return false;
  // Un admin non viene mai bloccato fuori dall'app.
  if (result.data.is_admin === true) return false;
  return isFutureDate(result.data.suspended_until);
}

// Copre tutta l'app quando l'account è sospeso (profiles.suspended_until nel futuro).
// La navigazione resta montata sotto, così il tasto può aprire la chat "Chiedi a Bajuju".
export function SuspendedAccountGate() {
  const pathname = usePathname();
  const [suspended, setSuspended] = useState(false);
  const lastCheckRef = useRef(0);
  const userIdRef = useRef<string | undefined>(undefined);

  const check = useCallback(async (userId?: string) => {
    lastCheckRef.current = Date.now();
    try {
      const id = userId ?? (await supabase.auth.getSession()).data.session?.user?.id;
      userIdRef.current = id;
      setSuspended(await loadSuspendedState(id));
    } catch {
      // In caso di errore di rete si lascia lo stato precedente.
    }
  }, []);

  useEffect(() => {
    void check();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        userIdRef.current = undefined;
        setSuspended(false);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        void check(session?.user?.id);
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    return () => {
      authListener.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [check]);

  useEffect(() => {
    if (Date.now() - lastCheckRef.current < RECHECK_INTERVAL_MS) return;
    void check();
  }, [check, pathname]);

  if (!suspended || SUSPENDED_ALLOWED_PATHS.has(pathname)) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.message}>
          Il tuo account è stato temporaneamente sospeso. Per spiegazioni scrivi a Bajuju
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scrivi a Bajuju"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => router.push('/admin-private-chat' as any)}
        >
          <Text style={styles.buttonText}>Scrivi a Bajuju</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: BAJUJU_COLORS.background,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    gap: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.white,
    ...BAJUJU_SHADOW,
  },
  message: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  pressed: { opacity: 0.8 },
  buttonText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 16,
  },
});
