import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RulesScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title}>Regole community</Text>

        <Text style={styles.rule}>1. Usa Bajuju solo se hai almeno 18 anni.</Text>
        <Text style={styles.rule}>2. Rispetta sempre gli altri utenti.</Text>
        <Text style={styles.rule}>3. Non pubblicare contenuti offensivi, falsi o pericolosi.</Text>
        <Text style={styles.rule}>4. Partecipa solo a esperienze reali e lecite.</Text>
        <Text style={styles.rule}>5. Segnala comportamenti scorretti o profili sospetti.</Text>

        <TouchableOpacity style={styles.button} onPress={() => router.push('/profile')}>
          <Text style={styles.buttonText}>Torna al profilo</Text>
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
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
  },
  rule: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
