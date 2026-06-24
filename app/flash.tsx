import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function FlashScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju Flash</Text>
        <Text style={styles.title}>Tutto può iniziare in pochi minuti</Text>

        <Text style={styles.text}>
          Qui collegheremo i Flash disponibili per provincia e comune, i miei Flash e i Flash a cui partecipo.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Stato funzione</Text>
          <Text style={styles.infoText}>
            Pagina mobile Flash attiva. Il prossimo passaggio sarà collegarla a Supabase.
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={() => router.push('/home')}>
          <Text style={styles.buttonText}>Torna alla Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  kicker: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 15,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 14,
  },
  text: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
  },
  infoBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 18,
  },
  infoTitle: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  infoText: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 21,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
