import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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

export default function CreateExperienceScreen() {
  const [title, setTitle] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Torna alla Home</Text>
        </Pressable>

        <View style={styles.logoBox}>
          <Text style={styles.logoText}>Crea esperienza</Text>
          <Text style={styles.subtitle}>Organizza qualcosa da vivere insieme</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Nuova esperienza</Text>
          <Text style={styles.description}>
            Questa è la prima base grafica. Nel prossimo step collegheremo il salvataggio reale a Supabase.
          </Text>

          <Text style={styles.label}>Titolo esperienza</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Es. Passeggiata serale, pizza, museo..."
            placeholderTextColor="#9b8b7b"
            style={styles.input}
          />

          <Text style={styles.label}>Provincia</Text>
          <TextInput
            value={province}
            onChangeText={setProvince}
            placeholder="Es. Bergamo"
            placeholderTextColor="#9b8b7b"
            style={styles.input}
          />

          <Text style={styles.label}>Comune</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Es. Caprino Bergamasco"
            placeholderTextColor="#9b8b7b"
            style={styles.input}
          />

          <Text style={styles.sectionTitle}>Categoria</Text>

          <View style={styles.categoryGrid}>
            {categories.map((item) => (
              <Pressable
                key={item}
                style={[
                  styles.categoryButton,
                  category === item && styles.categoryButtonActive,
                ]}
                onPress={() => setCategory(item)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === item && styles.categoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Anteprima</Text>
            <Text style={styles.previewText}>
              {title || 'Titolo esperienza non inserito'}
            </Text>
            <Text style={styles.previewSmall}>
              {category || 'Categoria'} · {city || 'Comune'} · {province || 'Provincia'}
            </Text>
          </View>

          <Pressable style={styles.mainButton}>
            <Text style={styles.mainButtonText}>Crea esperienza</Text>
          </Pressable>

          <Text style={styles.note}>
            Per ora il tasto non salva ancora. Prima creiamo struttura e grafica, poi colleghiamo Supabase.
          </Text>
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
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5a3821',
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dfcbb2',
    backgroundColor: '#fffaf3',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#2d1c11',
    marginBottom: 16,
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
  categoryButtonActive: {
    backgroundColor: '#8b5a2b',
    borderColor: '#8b5a2b',
  },
  categoryText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5a3821',
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  previewBox: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#fbf7ef',
    borderWidth: 1,
    borderColor: '#eadcc9',
    marginBottom: 18,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3a2415',
    marginBottom: 6,
  },
  previewText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#5a3821',
    marginBottom: 4,
  },
  previewSmall: {
    fontSize: 13,
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
  note: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: '#9b8b7b',
    textAlign: 'center',
  },
});