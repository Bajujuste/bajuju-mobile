import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
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

import { establishRecoverySession } from '../src/lib/authRecovery';
import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

const SAVED_PASSWORD_KEY = 'bajuju_saved_password';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageText, setMessageText] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepareRecovery() {
      try {
        const initialUrl = await Linking.getInitialURL();
        const result = await establishRecoverySession(initialUrl);

        if (!active) return;

        if (!result.success) {
          setMessageTitle('Link non valido');
          setMessageText(
            result.error ||
              'Il link di recupero non è valido o è scaduto. Richiedine uno nuovo.'
          );
          setRecoveryReady(false);
          return;
        }

        setRecoveryReady(true);
      } catch (error: unknown) {
        if (!active) return;

        const message =
          error instanceof Error
            ? error.message
            : "Errore durante la verifica del link di recupero.";

        setMessageTitle("Link non valido");
        setMessageText(message);
        setRecoveryReady(false);
      } finally {
        if (active) {
          setCheckingRecovery(false);
        }
      }
    }

    prepareRecovery();

    return () => {
      active = false;
    };
  }, []);

  async function handleUpdatePassword() {
    const cleanPassword = password.trim();
    const cleanConfirmPassword = confirmPassword.trim();

    setMessageTitle('');
    setMessageText('');

    if (!recoveryReady) {
      setMessageTitle('Recupero non disponibile');
      setMessageText(
        'Il link di recupero non è valido o non è stato completato correttamente.'
      );
      return;
    }

    if (!cleanPassword || !cleanConfirmPassword) {
      setMessageTitle('Password mancante');
      setMessageText('Inserisci e conferma la nuova password.');
      return;
    }

    if (cleanPassword.length < 6) {
      setMessageTitle('Password troppo corta');
      setMessageText('La password deve avere almeno 6 caratteri.');
      return;
    }

    if (cleanPassword !== cleanConfirmPassword) {
      setMessageTitle('Password diverse');
      setMessageText('Le due password non coincidono.');
      return;
    }

    setLoading(true);

    try {
      const result = await supabase.auth.updateUser({
        password: cleanPassword,
      });

      if (result.error) {
        setMessageTitle('Cambio password non riuscito');
        setMessageText(result.error.message);
        return;
      }

      try {
        await SecureStore.deleteItemAsync(SAVED_PASSWORD_KEY);
      } catch {
        // La cancellazione locale non deve bloccare il cambio password.
      }

      const signOutResult = await supabase.auth.signOut();

      if (signOutResult.error) {
        throw signOutResult.error;
      }

      setDone(true);
      setRecoveryReady(false);
      setPassword('');
      setConfirmPassword('');
      setMessageTitle('Password aggiornata');
      setMessageText(
        'La nuova password è stata salvata. La vecchia password non è più valida. Ora puoi accedere di nuovo.'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore sconosciuto durante il cambio password.';

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
          <View style={styles.logoBox}>
            <Image source={bajujuLogo} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.logoText}>Nuova password</Text>
            <Text style={styles.subtitle}>Imposta la nuova password Bajuju</Text>
          </View>

          <View style={styles.card}>
            {checkingRecovery ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color="#e43f98" />
                <Text style={styles.description}>
                  Verifica del link di recupero in corso...
                </Text>
              </View>
            ) : (
              <Text style={styles.description}>
                Inserisci la nuova password. Dopo il salvataggio la vecchia password non sarà più valida.
              </Text>
            )}

            <Text style={styles.label}>Nuova password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Nuova password"
                placeholderTextColor="#b98aa3"
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                autoCapitalize="none"
              />
              <Pressable style={styles.passwordToggle} onPress={() => setShowPassword((value) => !value)}>
                <Text style={styles.passwordToggleText}>{showPassword ? 'Nascondi' : 'Mostra'}</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Conferma password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Ripeti la nuova password"
              placeholderTextColor="#b98aa3"
              secureTextEntry={!showPassword}
              style={styles.input}
              autoCapitalize="none"
            />

            {messageTitle || messageText ? (
              <View style={[styles.messageBox, done && styles.messageBoxSuccess]}>
                {messageTitle ? <Text style={styles.messageTitle}>{messageTitle}</Text> : null}
                {messageText ? <Text style={styles.messageText}>{messageText}</Text> : null}
              </View>
            ) : null}

            <Pressable
              style={[
                styles.button,
                (loading || done || checkingRecovery || !recoveryReady) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleUpdatePassword}
              disabled={loading || done || checkingRecovery || !recoveryReady}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>{done ? 'Password salvata' : 'Salva nuova password'}</Text>
              )}
            </Pressable>

            {!checkingRecovery && !recoveryReady && !done ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.replace('/forgot-password')}
              >
                <Text style={styles.secondaryButtonText}>
                  Richiedi un nuovo link
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.replace('/login')}
              >
                <Text style={styles.secondaryButtonText}>Torna ad Accedi</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 22,
    justifyContent: 'center',
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 22,
  },
  logoImage: {
    width: 116,
    height: 116,
  },
  logoText: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: '900',
    color: '#e43f98',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '800',
    color: '#7a214e',
    textAlign: 'center',
  },
  card: {
    borderRadius: 30,
    backgroundColor: '#ffffff',
    padding: 20,
    borderWidth: 1,
    borderColor: '#ffd3e8',
    shadowColor: '#e43f98',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  loadingBox: {
    alignItems: 'center',
    gap: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7a214e',
    fontWeight: '700',
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4b1030',
    marginBottom: 7,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#f5bfd9',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '700',
    color: '#4b1030',
    backgroundColor: '#fff8fb',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f5bfd9',
    borderRadius: 18,
    backgroundColor: '#fff8fb',
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '700',
    color: '#4b1030',
  },
  passwordToggle: {
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  passwordToggleText: {
    color: '#e43f98',
    fontWeight: '900',
    fontSize: 13,
  },
  messageBox: {
    marginTop: 16,
    borderRadius: 18,
    padding: 13,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e8',
  },
  messageBoxSuccess: {
    backgroundColor: '#f2fff6',
    borderColor: '#bdebc8',
  },
  messageTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#4b1030',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7a214e',
    lineHeight: 19,
  },
  button: {
    marginTop: 18,
    borderRadius: 20,
    backgroundColor: '#e43f98',
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: '#fff0f7',
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd3e8',
  },
  secondaryButtonText: {
    color: '#e43f98',
    fontSize: 15,
    fontWeight: '900',
  },
});
