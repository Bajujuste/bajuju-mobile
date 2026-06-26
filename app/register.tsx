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

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageText, setMessageText] = useState('');

  async function handleRegister() {
    const cleanEmail = email.trim().toLowerCase();

    setMessageTitle('');
    setMessageText('');

    if (!cleanEmail || !password) {
      setMessageTitle('Dati mancanti');
      setMessageText('Inserisci email e password.');
      return;
    }

    if (password.length < 6) {
      setMessageTitle('Password troppo corta');
      setMessageText('Usa almeno 6 caratteri.');
      return;
    }

    setLoading(true);

    try {
      const result = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (result.error) {
        setMessageTitle('Registrazione non riuscita');
        setMessageText(result.error.message);
        return;
      }

      if (result.data.session) {
        router.replace('/home');
        return;
      }

      setMessageTitle('Controlla la tua email');
      setMessageText('Abbiamo inviato il link di conferma. Dopo la conferma potrai accedere.');
    } catch (error: any) {
      setMessageTitle('Errore collegamento');
      setMessageText(error?.message || 'Errore sconosciuto durante la registrazione.');
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
            <Text style={styles.logoText}>Registrati</Text>
            <Text style={styles.subtitle}>Entra nella community Bajuju</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.description}>
              Crea il tuo account per partecipare alle esperienze e usare Bajuju Mobile.
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
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Minimo 6 caratteri"
              placeholderTextColor="#b26a91"
              secureTextEntry
              style={styles.input}
            />

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Registrati</Text>
              )}
            </Pressable>

            {!!messageTitle && (
              <View style={styles.messageBox}>
                <Text style={styles.messageTitle}>{messageTitle}</Text>
                <Text style={styles.messageText}>{messageText}</Text>
              </View>
            )}

            <Pressable style={styles.switchLink} onPress={() => router.push('/login')}>
              <Text style={styles.switchLinkText}>Hai già un account? Accedi</Text>
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
  switchLink: { marginTop: 18, alignItems: 'center' },
  switchLinkText: {
    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
});
