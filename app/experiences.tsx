import { router } from 'expo-router';
import React from 'react';
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const categories = [
  'Passeggiata',
  'Pizza',
  'Sport',
  'Museo',
  'Aperitivo',
  'Cinema',
  'Caffè',
  'Altro',
];

export default function ExperiencesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Torna alla Home</Text>
        </Pressable>

        <View style={styles.logoBox}>
          <Text style={styles.logoText}>Trova esperienza</Text>
          <Text style={styles.subtitle}>Cerca qualcosa da vivere dal vivo</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Esperienze disponibili</Text>
          <Text style={styles.description}>
            Qui mostreremo le esperienze reali pubblicate dagli utenti su bajuju.it,
            usando lo stesso database Supabase.
          </Text>

          <Text style={styles.sectionTitle}>Categorie</Text>

          <View style={styles.categoryGrid}>
            {categories.map((category) => (
              <Pressable key={category} style={styles.categoryButton}>
                <Text style={styles.categoryText}>{category}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Prossimo collegamento</Text>
            <Text style={styles.infoText}>
              Nel prossimo step leggeremo da Supabase le esperienze vere:
              provincia, comune, categoria, titolo, data, ora e partecipanti.
            </Text>
          </View>

          <Pressable style={styles.mainButton}>
            <Text style={styles.mainButtonText}>Aggiorna esperienze</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fbf7ef',
  },
  container: {
    flexGrow: 1,
    padding: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#eadcc9',
  },
  backText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8b5a2b',
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#8b5a2b',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#b58a4a',
    textAlign: 'center',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5a3821',
    marginBottom: 12,
  },
  categoryGrid: {
    gap: 10,
    marginBottom: 22,
  },
  categoryButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#fffaf3',
    borderWidth: 1,
    borderColor: '#dfcbb2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  categoryText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5a3821',
  },
  infoBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fbf7ef',
    borderWidth: 1,
    borderColor: '#eadcc9',
    marginBottom: 18,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7b6653',
  },
  mainButton: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#8b5a2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
});