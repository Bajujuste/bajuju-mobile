import React, { useState } from 'react';
import {
  ActivityIndicator,
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

import { supabase } from '../../src/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isLogged, setIsLogged] = useState(false);

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();

    setMessageTitle('');
    setMessageText('');
    setIsLogged(false);

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
          reject(
            new Error(
              'Tempo scaduto. Supabase non ha risposto entro 12 secondi.'
            )
          );
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
        setMessageText(
          'Supabase ha risposto, ma non ha restituito una sessione.'
        );
        return;
      }

      setIsLogged(true);
      setMessageTitle('Login riuscito');
      setMessageText(
        `Utente collegato a Supabase: ${result.data.user?.email || cleanEmail}`
      );
    } catch (error: any) {
      setMessageTitle('Errore collegamento');
      setMessageText(
        error?.message || 'Errore sconosciuto durante il login.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);

    await supabase.auth.signOut();

    setLoading(false);
    setIsLogged(false);
    setPassword('');
    setMessageTitle('Logout effettuato');
    setMessageText('Sessione chiusa correttamente.');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>Bajuju</Text>
            <Text style={styles.subtitle}>Di persona è meglio</Text>
          </View>

          <View style={styles.card}>
            {isLogged ? (
              <>
                <Text style={styles.title}>Home Bajuju Mobile</Text>
                <Text style={styles.description}>
                  Login riuscito. Ora l’app mobile è collegata allo stesso
                  Supabase del sito bajuju.it.
                </Text>

                <View style={styles.homeGrid}>
                  <View style={styles.homeCard}>
                    <Text style={styles.homeIcon}>⚡</Text>
                    <Text style={styles.homeTitle}>Bajuju Flash</Text>
                    <Text style={styles.homeText}>
                      Tutto può iniziare in pochi minuti.
                    </Text>
                  </View>

                  <View style={styles.homeCard}>
                    <Text style={styles.homeIcon}>🔎</Text>
                    <Text style={styles.homeTitle}>Trova esperienza</Text>
                    <Text style={styles.homeText}>
                      Cerca attività dal vivo nella tua zona.
                    </Text>
                  </View>

                  <View style={styles.homeCard}>
                    <Text style={styles.homeIcon}>➕</Text>
                    <Text style={styles.homeTitle}>Crea esperienza</Text>
                    <Text style={styles.homeText}>
                      Organizza qualcosa da vivere insieme.
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[styles.button, styles.logoutButton]}
                  onPress={handleLogout}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>Esci</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>Accedi</Text>
                <Text style={styles.description}>
                  Entra con lo stesso account che usi su bajuju.it.
                </Text>

                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="La tua email"
                  placeholderTextColor="#9b8b7b"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="La tua password"
                  placeholderTextColor="#9b8b7b"
                  secureTextEntry
                  style={styles.input}
                />

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

                <Text style={styles.smallText}>
                  Test login Supabase Bajuju Mobile.
                </Text>
              </>
            )}

            {!!messageTitle && (
              <View
                style={[
                  styles.messageBox,
                  isLogged ? styles.successBox : styles.errorBox,
                ]}
              >
                <Text style={styles.messageTitle}>{messageTitle}</Text>
                <Text style={styles.messageText}>{messageText}</Text>
              </View>
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
    backgroundColor: '#fbf7ef',
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 46,
    fontWeight: '900',
    color: '#8b5a2b',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '700',
    color: '#b58a4a',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eadcc9',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7b6653',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5a3821',
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dfcbb2',
    backgroundColor: '#fffaf3',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#2d1c11',
    marginBottom: 16,
  },
  button: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#8b5a2b',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  logoutButton: {
    backgroundColor: '#5a3821',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  smallText: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 13,
    color: '#9b8b7b',
  },
  messageBox: {
    marginTop: 18,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  successBox: {
    backgroundColor: '#f3fff4',
    borderColor: '#b8e7be',
  },
  errorBox: {
    backgroundColor: '#fff4f1',
    borderColor: '#f0b8aa',
  },
  messageTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6d5847',
  },
  homeGrid: {
    gap: 12,
    marginBottom: 18,
  },
  homeCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#eadcc9',
  },
  homeIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  homeTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#5a3821',
    marginBottom: 4,
  },
  homeText: {
    fontSize: 13,
    color: '#7b6653',
    lineHeight: 18,
  },
});