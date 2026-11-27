import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LEGAL_ACCEPTANCE_LABEL, LEGAL_CONTENT, LEGAL_VERSION, LEGAL_VERSION_LABEL } from '../../legal/legalContent';
import { acceptCurrentLegalTexts, loadLegalStatus, onLegalAcceptanceChanged } from '../../lib/legalAcceptance';
import { supabase } from '../../lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../theme/bajujuTheme';

// Schermate da cui si leggono i testi o in cui non c'è ancora una sessione.
const GATE_HIDDEN_PATHS = new Set([
  '/privacy',
  '/rules',
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
]);
const RECHECK_INTERVAL_MS = 60_000;

// Chiede agli utenti già iscritti (e a chi si è registrato senza accettazione registrata)
// di accettare i Termini e di dichiarare di aver letto l'informativa nella versione in vigore.
export function LegalAcceptanceGate() {
  const pathname = usePathname();
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const lastCheckRef = useRef(0);

  const check = useCallback(async () => {
    lastCheckRef.current = Date.now();
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.user?.id) {
        setNeedsAcceptance(false);
        return;
      }
      const status = await loadLegalStatus();
      // Se il server non risponde, o pubblica una versione diversa da quella inclusa in
      // questa app (testi non ancora scaricati), non si blocca l'utente.
      if (!status || !status.authenticated || status.currentVersion !== LEGAL_VERSION) {
        setNeedsAcceptance(false);
        return;
      }
      setNeedsAcceptance(!status.accepted);
    } catch {
      // In caso di errore si lascia lo stato precedente.
    }
  }, []);

  useEffect(() => {
    void check();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setNeedsAcceptance(false);
        setChecked(false);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        void check();
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    const removeLegalListener = onLegalAcceptanceChanged(() => {
      void check();
    });

    return () => {
      authListener.subscription.unsubscribe();
      appStateSubscription.remove();
      removeLegalListener();
    };
  }, [check]);

  useEffect(() => {
    if (Date.now() - lastCheckRef.current < RECHECK_INTERVAL_MS) return;
    void check();
  }, [check, pathname]);

  const accept = useCallback(async () => {
    if (!checked || saving) return;
    setSaving(true);
    setErrorText('');
    try {
      const status = await acceptCurrentLegalTexts();
      setNeedsAcceptance(!status.accepted);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Riprova tra poco.');
    } finally {
      setSaving(false);
    }
  }, [checked, saving]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setNeedsAcceptance(false);
      router.replace('/');
    }
  }, []);

  if (!needsAcceptance || GATE_HIDDEN_PATHS.has(pathname)) return null;

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">
            Abbiamo aggiornato Termini e informativa privacy
          </Text>
          <Text style={styles.text}>
            Dal {LEGAL_VERSION_LABEL} sono in vigore nuove versioni dei Termini e dell’informativa privacy di Bajuju.
            Per continuare a usare l’app ti chiediamo di leggerle e di accettare i Termini.
          </Text>

          <Text style={styles.subtitle}>Le novità principali</Text>
          <View style={styles.list}>
            {LEGAL_CONTENT.updateSummary.map((item) => (
              <View key={item} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={[styles.text, styles.listText]}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/rules')}>
              <Text style={styles.link}>Leggi i Termini</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')}>
              <Text style={styles.link}>Leggi l’informativa privacy</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.checkRow}
            onPress={() => setChecked((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={LEGAL_ACCEPTANCE_LABEL}
          >
            <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
              <Text style={styles.checkboxText}>{checked ? '✓' : ''}</Text>
            </View>
            <Text style={[styles.text, styles.checkText]}>{LEGAL_ACCEPTANCE_LABEL}</Text>
          </Pressable>

          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !checked || saving }}
            style={({ pressed }) => [styles.button, (!checked || saving) && styles.buttonDisabled, pressed && styles.pressed]}
            onPress={() => { void accept(); }}
            disabled={!checked || saving}
          >
            {saving ? <ActivityIndicator color={BAJUJU_COLORS.white} /> : <Text style={styles.buttonText}>Continua</Text>}
          </Pressable>

          <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => { void signOut(); }}>
            <Text style={styles.secondaryText}>Esci dall’account</Text>
          </Pressable>
          <Text style={styles.note}>
            Se non vuoi accettare puoi uscire dall’account e chiederne l’eliminazione scrivendo a {LEGAL_CONTENT.controller.privacyEmail}.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1100,
    elevation: 1100,
    backgroundColor: BAJUJU_COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: 22,
    gap: 14,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.white,
    ...BAJUJU_SHADOW,
  },
  title: {
    color: BAJUJU_COLORS.pink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 16,
  },
  text: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  list: { gap: 6 },
  listItem: { flexDirection: 'row', gap: 8 },
  bullet: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.bold, fontSize: 15, lineHeight: 22 },
  listText: { flex: 1 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  link: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.bold, fontSize: 15, textDecorationLine: 'underline' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.pink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.white,
  },
  checkboxSelected: { backgroundColor: BAJUJU_COLORS.pink },
  checkboxText: { color: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  checkText: { flex: 1, fontFamily: BAJUJU_FONTS.semiBold },
  error: { color: '#B00020', fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  button: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  buttonText: { color: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  secondaryButton: { alignItems: 'center', paddingVertical: 6 },
  secondaryText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  note: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
