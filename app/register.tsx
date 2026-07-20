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

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

const SUPABASE_URL = 'https://xwcbmsfsirggozpcskcz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kg74KvC--sJpim0_tY7K0Q_YJcMqf9g';
const SIGNUP_REDIRECT = 'bajuju://auth/callback?next=profile';

type SignupResponse = {
  id?: string;
  identities?: unknown[];
  msg?: string;
  message?: string;
  error?: string;
  error_description?: string;
};

function signupErrorMessage(payload: SignupResponse, fallback: string) {
  return String(
    payload.message ||
      payload.msg ||
      payload.error_description ||
      payload.error ||
      fallback
  );
}

function unknownErrorMessage(error: unknown) {
  if (typeof error === 'string' && error.trim()) return error;

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return serialized;
  } catch {
    // Nessuna informazione aggiuntiva disponibile.
  }

  return 'Errore di collegamento durante la registrazione.';
}

export default function RegisterScreen() {
  const [profileName, setProfileName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageText, setMessageText] = useState('');

  async function handleRegister() {
    const cleanProfileName = profileName.trim();
    const cleanEmail = email.trim().toLowerCase();

    setMessageTitle('');
    setMessageText('');

    if (!cleanProfileName || !cleanEmail || !password) {
      setMessageTitle('Dati mancanti');
      setMessageText('Inserisci nome utente, email e password.');
      return;
    }

    if (cleanProfileName.length < 3) {
      setMessageTitle('Nome troppo corto');
      setMessageText('Il nome utente deve avere almeno 3 caratteri.');
      return;
    }

    if (!acceptedTerms) {
      setMessageTitle('Accettazione richiesta');
      setMessageText('Per registrarti devi accettare Termini, Privacy e le regole di tolleranza zero contro abusi e contenuti offensivi.');
      return;
    }

    if (password.length < 6) {
      setMessageTitle('Password troppo corta');
      setMessageText('Usa almeno 6 caratteri.');
      return;
    }

    setLoading(true);

    try {
      const redirect = encodeURIComponent(SIGNUP_REDIRECT);
      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup?redirect_to=${redirect}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          data: {
            username: cleanProfileName,
            nickname: cleanProfileName,
            display_name: cleanProfileName,
            full_name: cleanProfileName,
            name: cleanProfileName,
          },
        }),
      });

      const rawBody = await response.text();
      let payload: SignupResponse = {};

      if (rawBody) {
        try {
          payload = JSON.parse(rawBody) as SignupResponse;
        } catch {
          payload = { message: rawBody };
        }
      }

      if (!response.ok) {
        const errorMessage = signupErrorMessage(payload, `Errore registrazione (${response.status}).`);
        const normalized = errorMessage.toLowerCase();

        setMessageTitle('Registrazione non riuscita');
        setMessageText(
          normalized.includes('already') ||
          normalized.includes('registered') ||
          normalized.includes('exists')
            ? 'Questa email è già registrata. Accedi oppure usa un’altra email.'
            : errorMessage
        );
        return;
      }

      if (!payload.id) {
        setMessageTitle('Registrazione non riuscita');
        setMessageText('Supabase non ha restituito il nuovo account. Riprova tra poco.');
        return;
      }

      if (Array.isArray(payload.identities) && payload.identities.length === 0) {
        setMessageTitle('Email già utilizzata');
        setMessageText('Questa email è già registrata. Accedi oppure usa un’altra email.');
        return;
      }

      setMessageTitle('Controlla la tua email');
      setMessageText('Abbiamo inviato il link di conferma. Dopo la conferma accedi e completa subito il profilo.');
    } catch (error: unknown) {
      setMessageTitle('Errore collegamento');
      setMessageText(unknownErrorMessage(error));
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

            <Text style={styles.label}>Nome utente</Text>
            <TextInput
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Scegli il tuo nome utente"
              placeholderTextColor="#b26a91"
              autoCapitalize="words"
              autoCorrect={false}
              style={styles.input}
            />

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
                placeholder="Minimo 6 caratteri"
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
              onPress={handleRegister}
              disabled={loading || !acceptedTerms}
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
    minHeight: 52,
    paddingHorizontal: 16,
    color: '#5f2445',
    fontSize: 16,
    fontWeight: '700',
  },
  passwordToggle: {
    minHeight: 52,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#ffd3e7',
    backgroundColor: '#fff0f7',
  },
  passwordToggleText: {
    color: '#e43f98',
    fontSize: 13,
    fontWeight: '900',
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
    fontWeight: '700',
    lineHeight: 19,
  },
  termsLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
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
  switchLink: { marginTop: 18, alignItems: 'center' },
  switchLinkText: {
    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
});