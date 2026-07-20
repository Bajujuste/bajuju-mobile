import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RulesScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <TouchableOpacity style={styles.topBackButton} onPress={() => router.back()}>
        <Text style={styles.topBackButtonText}>← Indietro</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju</Text>
        <Text style={styles.title}>Regole community</Text>

        <Text style={styles.rule}>1. Usa Bajuju solo se hai almeno 18 anni.</Text>
        <Text style={styles.rule}>2. Rispetta sempre gli altri utenti.</Text>
        <Text style={styles.rule}>3. Non pubblicare contenuti offensivi, falsi o pericolosi.</Text>
        <Text style={styles.rule}>4. Partecipa solo a esperienze reali e lecite.</Text>
        <Text style={styles.rule}>5. Bajuju applica tolleranza zero verso contenuti offensivi, molestie, minacce, discriminazioni, spam, truffe e utenti abusivi.</Text>
        <Text style={styles.rule}>6. Segnala subito contenuti, messaggi o profili sospetti usando i pulsanti Segnala presenti nell’app.</Text>
        <Text style={styles.rule}>7. Blocca gli utenti con cui non vuoi più interagire usando il pulsante Blocca utente nel loro profilo.</Text>
        <Text style={styles.rule}>8. Le segnalazioni vengono esaminate e possono portare alla rimozione dei contenuti, alla sospensione o al blocco dell’account.</Text>
        <Text style={styles.rule}>9. Partecipando a un’esperienza Bajuju accetti che durante l’evento possano essere scattate fotografie dai partecipanti.</Text>
        <Text style={styles.rule}>10. Le foto possono essere caricate nella galleria dell’esperienza e sono visibili solo ai partecipanti della stessa esperienza.</Text>
        <Text style={styles.rule}>11. È vietato usare o diffondere le foto fuori da Bajuju senza il consenso delle persone ritratte.</Text>

        <TouchableOpacity style={styles.button} onPress={() => router.push('/profile')}>
          <Text style={styles.buttonText}>Torna al profilo</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBackButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
  },
  topBackButtonText: {
    color: '#e43f98',
    fontSize: 15,
    fontWeight: '800',
  },
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
