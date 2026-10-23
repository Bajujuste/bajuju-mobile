import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../../src/lib/supabase';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';

const bajujuLogo = require('../../assets/brand/bajuju-logo.png');

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageText, setMessageText] = useState('');

  async function handleResetPassword() {
    const cleanEmail = email.trim().toLowerCase();

    setMessageTitle('');
    setMessageText('');
    setResetSent(false);

    if (!cleanEmail) {
      setMessageTitle('Email mancante');
      setMessageText('Inserisci la tua email Bajuju.');
      return;
    }

    setLoading(true);

    try {
      const result = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: 'bajuju://reset-password',
      });

      if (result.error) {
        setMessageTitle('Recupero non riuscito');
        setMessageText(result.error.message);
        return;
      }

      setResetSent(true);
      setMessageTitle('Operazione riuscita');
      setMessageText('Ti abbiamo inviato il link per impostare una nuova password. Apri la mail dal telefono e il link ti porterà dentro l’app Bajuju.');
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore sconosciuto durante il recupero password.';

      setMessageTitle('Errore collegamento');
      setMessageText(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.keyboardView}>
        <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backButton} onPress={() => router.replace('/login')}>
            <Text style={styles.backText}>← Accedi</Text>
          </Pressable>

          <View style={styles.logoBox}>
            <Image source={bajujuLogo} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.logoText}>Recupera password</Text>
            <Text style={styles.subtitle}>Ti mandiamo il link via email</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.description}>
              Inserisci l’email del tuo account Bajuju. Riceverai un link per impostare una nuova password.
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

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Invia link recupero</Text>
              )}
            </Pressable>

            {!!messageTitle && (
              <View style={styles.messageBox}>
                <Text style={styles.messageTitle}>{messageTitle}</Text>
                <Text style={styles.messageText}>{messageText}</Text>
              </View>
            )}

            {resetSent ? (
              <Pressable style={styles.loginButton} onPress={() => router.replace('/login')}>
                <Text style={styles.loginButtonText}>Torna ad Accedi</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAwareScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF9FC' },
  keyboardView: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
    paddingTop: 64,
    backgroundColor: '#FFF9FC',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F3C6DC',
  },
  backText: { fontSize: 14, fontFamily: 'FredokaBold', color: '#4B0C2D' },
  logoBox: { alignItems: 'center', marginBottom: 20 },
  logoImage: { width: 128, height: 128, marginBottom: 8 },
  logoText: {
    fontSize: 34,
    fontFamily: 'FredokaBold',
    color: '#E43F98',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    fontFamily: 'FredokaBold',
    color: '#4B0C2D',
    textAlign: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#F3C6DC',
    shadowColor: '#E43F98',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'FredokaBold',
    color: '#8D5E77',
    marginBottom: 22,
  },
  label: {
    fontSize: 14,
    fontFamily: 'FredokaBold',
    color: '#4B0C2D',
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3C6DC',
    backgroundColor: '#FFF9FC',
    paddingHorizontal: 16,
    color: '#4B0C2D',
    fontSize: 16,
    fontFamily: 'FredokaBold',
    marginBottom: 16,
  },
  button: {
    height: 54,
    borderRadius: 20,
    backgroundColor: '#E43F98',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#ffffff', fontSize: 17, fontFamily: 'FredokaBold' },
  loginButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E43F98',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  loginButtonText: {
    color: '#E43F98',
    fontSize: 16,
    fontFamily: 'FredokaBold',
  },
  messageBox: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#FFF0F7',
    borderWidth: 1,
    borderColor: '#ffc2df',
    padding: 14,
  },
  messageTitle: {
    color: '#E43F98',
    fontSize: 14,
    fontFamily: 'FredokaBold',
    marginBottom: 4,
  },
  messageText: {
    color: '#8D5E77',
    fontSize: 13,
    fontFamily: 'FredokaBold',
    lineHeight: 19,
  },
});
