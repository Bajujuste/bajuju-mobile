import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

  async function handleLogin() {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      Alert.alert('Dati mancanti', 'Inserisci email e password.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Accesso non riuscito', error.message);
      return;
    }

    Alert.alert('Login riuscito', 'Collegamento a Supabase funzionante.');
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
              Prima schermata test Bajuju Mobile.
            </Text>
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
});