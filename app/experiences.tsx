import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EXPERIENCE_CATEGORIES } from '../src/constants/experienceCategories';
import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

type ActivityRow = {
  id?: string;
  title?: string | null;
  category?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  is_flash?: boolean | null;
  image_url?: string | null;
  photo_url?: string | null;
  cover_url?: string | null;
  activity_image_url?: string | null;
  thumbnail_url?: string | null;
  deleted_at?: string | null;
  status?: string | null;
};

function normalizeCategory(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

function activityImageSource(row: ActivityRow) {
  const imageUrl =
    row.image_url ||
    row.photo_url ||
    row.cover_url ||
    row.activity_image_url ||
    row.thumbnail_url ||
    '';

  if (imageUrl && imageUrl.trim().length > 0) {
    return { uri: imageUrl.trim() };
  }

  return bajujuLogo;
}

function formatDateItalian(value: string | null | undefined) {
  if (!value) return 'Data da definire';

  const parts = value.split('-');
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function isFutureOrToday(row: ActivityRow) {
  if (!row.activity_date) return true;

  const activityTime = row.activity_time || '23:59';
  const date = new Date(`${row.activity_date}T${activityTime}`);

  if (Number.isNaN(date.getTime())) return true;

  return date.getTime() >= new Date().getTime();
}

function isDeleted(row: ActivityRow) {
  if (row.deleted_at) return true;

  const status = String(row.status || '').toLowerCase().trim();

  return [
    'deleted',
    'eliminato',
    'eliminata',
    'removed',
    'cancelled',
    'canceled',
    'annullato',
    'annullata',
    'archived',
    'closed',
  ].includes(status);
}

export default function ExperiencesScreen() {
  const [selectedCategory, setSelectedCategory] = useState('Tutti');
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadExperiences = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await supabase
        .from('activities')
        .select('*')
        .limit(150);

      if (result.error) {
        setActivities([]);
        setErrorMessage(result.error.message || 'Non sono riuscito a caricare le esperienze.');
        return;
      }

      const cleanRows = ((result.data || []) as ActivityRow[])
        .filter((row) => row.is_flash !== true)
        .filter((row) => !isDeleted(row))
        .filter(isFutureOrToday)
        .sort((a, b) => {
          const dateA = `${a.activity_date || '9999-12-31'}T${a.activity_time || '23:59'}`;
          const dateB = `${b.activity_date || '9999-12-31'}T${b.activity_time || '23:59'}`;
          return dateA.localeCompare(dateB);
        });

      setActivities(cleanRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExperiences();
  }, [loadExperiences]);

  const filteredActivities = useMemo(() => {
    if (selectedCategory === 'Tutti') return activities;

    return activities.filter(
      (item) => normalizeCategory(item.category) === normalizeCategory(selectedCategory)
    );
  }, [activities, selectedCategory]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Home</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.logoText}>Trova esperienza</Text>
          <Text style={styles.subtitle}>
            Scegli una categoria e scopri cosa puoi fare dal vivo.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>Categorie</Text>
          <Text style={styles.title}>Cosa vuoi fare?</Text>

          <View style={styles.categoryGrid}>
            {EXPERIENCE_CATEGORIES.map((category) => {
              const isSelected = selectedCategory === category;

              return (
                <Pressable
                  key={category}
                  style={[
                    styles.categoryButton,
                    isSelected && styles.categoryButtonActive,
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      isSelected && styles.categoryTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>
              {selectedCategory === 'Tutti' ? 'Tutte le esperienze' : selectedCategory}
            </Text>
            <Text style={styles.resultCount}>
              {filteredActivities.length} risultati
            </Text>
          </View>

          {loading ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Caricamento esperienze...</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{errorMessage}</Text>
            </View>
          ) : filteredActivities.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Nessuna esperienza disponibile per questa categoria.
              </Text>
            </View>
          ) : (
            <View style={styles.experienceList}>
              {filteredActivities.map((item) => (
                <Pressable
                  key={item.id || `${item.title}-${item.activity_date}`}
                  style={styles.experienceCard}
                  onPress={() => router.push({
                    pathname: '/experience-detail' as any,
                    params: { id: item.id || '' },
                  })}
                >
                  <View style={styles.experienceImageBox}>
                    <Image
                      source={activityImageSource(item)}
                      style={styles.experienceImage}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={styles.experienceContent}>
                    <Text style={styles.experienceCategory}>
                      {item.category || 'Esperienza'}
                    </Text>

                    <Text style={styles.experienceTitle}>
                      {item.title || 'Esperienza senza titolo'}
                    </Text>

                    <Text style={styles.experienceMeta}>
                      {item.city || 'Comune'} · {item.province || 'Provincia'}
                    </Text>

                    <Text style={styles.experienceMeta}>
                      {formatDateItalian(item.activity_date)} · {item.activity_time || 'Ora da definire'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={styles.refreshButton} onPress={loadExperiences}>
            <Text style={styles.refreshButtonText}>Aggiorna</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 18,
    paddingBottom: 32,
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
  backText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9b1f61',
  },
  header: {
    marginBottom: 18,
  },
  logoText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#e43f98',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#6b3652',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionEyebrow: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 14,
    letterSpacing: -0.4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 18,
  },
  categoryButton: {
    borderRadius: 999,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  categoryButtonActive: {
    backgroundColor: '#e43f98',
    borderColor: '#e43f98',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9b1f61',
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  resultHeader: {
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#e43f98',
  },
  resultCount: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#9b1f61',
  },
  emptyBox: {
    borderRadius: 18,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffe2ef',
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  experienceList: {
    gap: 12,
  },
  experienceCard: {
    borderRadius: 22,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  experienceImageBox: {
    width: 82,
    height: 82,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  experienceImage: {
    width: '100%',
    height: '100%',
  },

  experienceContent: {
    flex: 1,
  },

  experienceCategory: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  experienceTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#e43f98',
    marginBottom: 5,
  },
  experienceMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b3652',
    marginTop: 2,
  },
  refreshButton: {
    marginTop: 16,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#e43f98',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
