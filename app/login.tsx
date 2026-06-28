import { router } from 'expo-router';
import React, { useState } from 'react';
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

import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageText, setMessageText] = useState('');

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();

    setMessageTitle('');
    setMessageText('');

    if (!cleanEmail || !password) {
      setMessageTitle('Dati mancanti');
      setMessageText('Inserisci email e password.');
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

      const result: any = await Promise.race([loginPromise, timeoutPromise]);

      if (result?.error) {
        setMessageTitle('Accesso non riuscito');
        setMessageText(result.error.message);
        return;
      }

      if (!result?.data?.session) {
        setMessageTitle('Login non completato');
        setMessageText('Supabase ha risposto, ma non ha restituito una sessione.');
        return;
      }

      router.replace('/profile');
    } catch (error: any) {
      setMessageTitle('Errore collegamento');
      setMessageText(error?.message || 'Errore sconosciuto durante il login.');
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
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
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
