import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import * as SecureStore from 'expo-secure-store';

import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

const SAVED_EMAIL_KEY = 'bajuju_saved_email';
const SAVED_PASSWORD_KEY = 'bajuju_saved_password';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageText, setMessageText] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadSavedLogin() {
      try {
        const savedEmail = await SecureStore.getItemAsync(SAVED_EMAIL_KEY);
        const savedPassword = await SecureStore.getItemAsync(SAVED_PASSWORD_KEY);

        if (!mounted) return;

        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) {
          setPassword(savedPassword);
          setRememberPassword(true);
        }
      } catch {
        // Se SecureStore non è disponibile, il login resta manuale.
      }
    }

    loadSavedLogin();

    return () => {
      mounted = false;
    };
  }, []);

  async function updateSavedLogin(cleanEmail: string) {
    try {
      if (rememberPassword) {
        await SecureStore.setItemAsync(SAVED_EMAIL_KEY, cleanEmail);
        await SecureStore.setItemAsync(SAVED_PASSWORD_KEY, password);
      } else {
        await SecureStore.deleteItemAsync(SAVED_EMAIL_KEY);
        await SecureStore.deleteItemAsync(SAVED_PASSWORD_KEY);
      }
    } catch {
      // Non blocco il login se il salvataggio locale fallisce.
    }
  }

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();

    setMessageTitle('');
    setMessageText('');

    if (!cleanEmail || !password) {
      setMessageTitle('Dati mancanti');
      setMessageText('Inserisci email e password.');
      return;
    }

    if (!acceptedTerms) {
      setMessageTitle('Accettazione richiesta');
      setMessageText('Per accedere devi accettare Termini, Privacy e le regole di tolleranza zero contro abusi e contenuti offensivi.');
      return;
    }

    setLoading(true);

    try {
      const loginPromise = supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Tempo scaduto. Supabase non ha risposto entro 12 secondi.'));
        }, 12000);
      });

      const result = (await Promise.race([loginPromise, timeoutPromise])) as {
        error?: { message?: string } | null;
        data?: {
          session?: { user?: { id?: string } } | null;
          user?: { id?: string } | null;
        } | null;
      };

      if (result?.error) {
        setMessageTitle('Accesso non riuscito');
        setMessageText(
          result.error.message || "Accesso non riuscito."
        );
        return;
      }

      if (!result?.data?.session) {
        setMessageTitle('Login non completato');
        setMessageText('Supabase ha risposto al login, ma non ha restituito una sessione.');
        return;
      }

      await updateSavedLogin(cleanEmail);

      const loggedUserId = result.data.user?.id || result.data.session?.user?.id;
      let profile: Record<string, unknown> | null = null;

      if (!loggedUserId) {
        setMessageTitle('Login incompleto');
        setMessageText('Accesso riuscito, ma non riesco a leggere l’utente collegato.');
        return;
      }

      const byId = await supabase
        .from('profiles')
        .select('*')
        .eq('id', loggedUserId)
        .maybeSingle();

      if (byId.error) {
        await supabase.auth.signOut();
        setMessageTitle('Errore profilo');
        setMessageText('Login riuscito, ma errore leggendo il profilo. Riprova.');
        return;
      }

      if (byId.data) {
        profile = byId.data;
      }

      const profileCity = String(
        profile?.city ||
          profile?.citta ||
          profile?.comune ||
          profile?.location_city ||
          ''
      ).trim();

      const profileAge = String(
        profile?.age ||
          profile?.eta ||
          profile?.['età'] ||
          profile?.user_age ||
          profile?.age_range ||
          profile?.fascia_eta ||
          profile?.age_band ||
          profile?.eta_range ||
          ''
      ).trim();

      if (profile && profileCity && profileAge) {
        router.replace('/home');
        return;
      }

      router.replace('/profile');
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore sconosciuto durante il login.';

      setMessageTitle('Errore collegamento');
      setMessageText(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backButton} onPress={() => router.replace('/')}>
            <Text style={styles.backText}>← Indietro</Text>
          </Pressable>

          <View style={styles.logoBox}>
            <Image source={bajujuLogo} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.logoText}>Accedi</Text>
            <Text style={styles.subtitle}>Bentornato su Bajuju</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.description}>
              Entra con lo stesso account che usi su Bajuju.
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="La tua email"
              placeholderTextColor="#b26a91"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="La tua password"
                placeholderTextColor="#b26a91"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.passwordInput}
              />

              <Pressable
                style={styles.passwordToggle}
                onPress={() => setShowPassword((value) => !value)}
              >
                <Text style={styles.passwordToggleText}>
                  {showPassword ? 'Nascondi' : 'Mostra'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.rememberRow}
              onPress={() => setRememberPassword((value) => !value)}
            >
              <View style={[styles.rememberCheck, rememberPassword && styles.rememberCheckActive]}>
                <Text style={styles.rememberCheckText}>{rememberPassword ? '✓' : ''}</Text>
              </View>
              <Text style={styles.rememberText}>Memorizza password su questo telefono</Text>
            </Pressable>

            <Pressable
              style={styles.termsRow}
              onPress={() => setAcceptedTerms((value) => !value)}
            >
              <View style={[styles.checkbox, acceptedTerms && styles.checkboxSelected]}>
                <Text style={styles.checkboxText}>{acceptedTerms ? '✓' : ''}</Text>
              </View>
              <Text style={styles.termsText}>
                Accetto i Termini e la Privacy. Bajuju applica tolleranza zero verso contenuti offensivi, molestie e utenti abusivi.
              </Text>
            </Pressable>

            <View style={styles.termsLinks}>
              <Pressable onPress={() => router.push('/rules')}>
                <Text style={styles.termsLinkText}>Leggi Termini e Regole</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/privacy')}>
                <Text style={styles.termsLinkText}>Leggi Privacy</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.button, (loading || !acceptedTerms) && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading || !acceptedTerms}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Accedi</Text>
              )}
            </Pressable>

            <Pressable style={styles.forgotLink} onPress={() => router.push('/forgot-password')}>
              <Text style={styles.forgotLinkText}>Password dimenticata?</Text>
            </Pressable>

            {!!messageTitle && (
              <View style={styles.messageBox}>
                <Text style={styles.messageTitle}>{messageTitle}</Text>
                <Text style={styles.messageText}>{messageText}</Text>
              </View>
            )}

            <Pressable style={styles.switchLink} onPress={() => router.push('/register')}>
              <Text style={styles.switchLinkText}>Non hai ancora un account? Registrati</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff8fb' },
  keyboardView: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: '#fff8fb',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  backText: { fontSize: 14, fontWeight: '900', color: '#9b1f61' },
  logoBox: { alignItems: 'center', marginBottom: 20 },
  logoImage: { width: 128, height: 128, marginBottom: 8 },
  logoText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#e43f98',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: '#9b1f61',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    shadowColor: '#e43f98',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#6b3652',
    marginBottom: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9b1f61',
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#fff8fb',
    paddingHorizontal: 16,
    color: '#5f2445',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  passwordRow: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#fff8fb',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    height: 52,
    paddingHorizontal: 16,
    color: '#5f2445',
    fontSize: 16,
    fontWeight: '700',
  },
  passwordToggle: {
    height: 52,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#ffd3e7',
    backgroundColor: '#fff0f7',
  },
  passwordToggleText: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
  },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 16,
  },
  rememberCheck: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  rememberCheckActive: {
    backgroundColor: '#e43f98',
  },
  rememberCheckText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  rememberText: {
    flex: 1,
    color: '#6b3652',
    fontSize: 13,
    fontWeight: '800',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxSelected: {
    backgroundColor: '#e43f98',
  },
  checkboxText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  termsText: {
    flex: 1,
    color: '#6b3652',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  termsLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  termsLinkText: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },

  button: {
    height: 54,
    borderRadius: 20,
    backgroundColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  messageBox: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffc2df',
    padding: 14,
  },
  messageTitle: {
    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  messageText: {
    color: '#6b3652',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  forgotLink: {
    marginTop: 14,
    alignItems: 'center',
  },
  forgotLinkText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  switchLink: { marginTop: 18, alignItems: 'center' },
  switchLinkText: {
    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
});
