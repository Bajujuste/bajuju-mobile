import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { establishRecoverySession } from '../../src/lib/authRecovery';

export default function AuthCallbackScreen() {
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function completeAuthCallback() {
      try {
        const url = await Linking.getInitialURL();
        const result = await establishRecoverySession(url);

        if (!active) return;

        if (!result.success) {
          setErrorMessage(
            result.error ||
              'Non è stato possibile completare la verifica del link.'
          );
          return;
        }

        const parsedUrl = url ? new URL(url) : null;
        const searchParameters = new URLSearchParams(parsedUrl?.search || '');
        const hashParameters = new URLSearchParams(
          parsedUrl?.hash?.startsWith('#')
            ? parsedUrl.hash.slice(1)
            : parsedUrl?.hash || ''
        );
        const linkType =
          searchParameters.get('type') || hashParameters.get('type');

        router.replace(linkType === 'recovery' ? '/reset-password' : '/profile');
      } catch (error: unknown) {
        if (!active) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Non è stato possibile completare la verifica del link.'
        );
      }
    }

    completeAuthCallback();

    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        {errorMessage ? (
          <>
            <Text style={styles.title}>Link non valido</Text>
            <Text style={styles.message}>{errorMessage}</Text>

            <Pressable
              style={styles.button}
              onPress={() => router.replace('/forgot-password')}
            >
              <Text style={styles.buttonText}>
                Richiedi un nuovo link
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#e43f98" />
            <Text style={styles.title}>Verifica del link</Text>
            <Text style={styles.message}>
              Stiamo completando la verifica del tuo account.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: '#fff8fb',
  },
  card: {
    padding: 24,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    alignItems: 'center',
  },
  title: {
    marginTop: 16,
    color: '#e43f98',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    color: '#6b3652',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#e43f98',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
