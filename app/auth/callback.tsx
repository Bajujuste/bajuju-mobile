import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../src/lib/supabase';

function getParamFromUrl(url: string, key: string) {
  const queryPart = url.split('?')[1]?.split('#')[0] || '';
  const hashPart = url.split('#')[1] || '';
  const params = new URLSearchParams(`${queryPart}&${hashPart}`);

  return params.get(key);
}

export default function AuthCallbackScreen() {
  const [message, setMessage] = useState('Sto completando l’accesso...');

  useEffect(() => {
    let mounted = true;

    async function completeAuth() {
      try {
        const url = await Linking.getInitialURL();

        if (!url) {
          if (mounted) setMessage('Link non valido. Torna al login e accedi con email e password.');
          setTimeout(() => router.replace('/login'), 1200);
          return;
        }

        const code = getParamFromUrl(url, 'code');
        const accessToken = getParamFromUrl(url, 'access_token');
        const refreshToken = getParamFromUrl(url, 'refresh_token');

        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code);

          if (result.error) {
            throw result.error;
          }
        } else if (accessToken && refreshToken) {
          const result = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (result.error) {
            throw result.error;
          }
        }

        if (mounted) setMessage('Accesso completato. Ti porto al profilo...');
        setTimeout(() => router.replace('/profile'), 700);
      } catch (error: any) {
        console.log('Errore callback auth:', error?.message || error);
        if (mounted) setMessage('Non sono riuscito a completare l’accesso. Torna al login.');
        setTimeout(() => router.replace('/login'), 1500);
      }
    }

    completeAuth();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <ActivityIndicator color="#e43f98" />
        <Text style={styles.title}>Bajuju</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8fb',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    padding: 24,
    alignItems: 'center',
  },
  title: {
    marginTop: 16,
    color: '#e43f98',
    fontSize: 34,
    fontWeight: '900',
  },
  message: {
    marginTop: 10,
    color: '#6b3652',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
});
