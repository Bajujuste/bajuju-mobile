import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EXPERIENCE_CATEGORIES, getExperienceCategoryIcon, normalizeExperienceCategory } from '@/src/constants/experienceCategories';
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
  return normalizeExperienceCategory(value).toLowerCase();
}


function getExperienceCoordinates(row: ActivityRow) {
  const latitude = Number(
    (row as any).latitude ??
      (row as any).lat ??
      (row as any).location_latitude ??
      (row as any).meeting_latitude
  );

  const longitude = Number(
    (row as any).longitude ??
      (row as any).lng ??
      (row as any).lon ??
      (row as any).location_longitude ??
      (row as any).meeting_longitude
  );

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude, longitude };
  }

  return null;
}

function getExperienceAddress(row: ActivityRow) {
  return String(
    (row as any).meeting_place ||
      (row as any).place ||
      (row as any).luogo ||
      (row as any).address ||
      (row as any).indirizzo ||
      ''
  ).trim();
}

function openExperienceMap(row: ActivityRow) {
  const coordinates = getExperienceCoordinates(row);

  if (coordinates) {
    const { latitude, longitude } = coordinates;
    const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}&layers=N&marker=${latitude}/${longitude}`;

    Linking.openURL(url);
    return;
  }

  const address = getExperienceAddress(row);
  const city = String((row as any).city || (row as any).citta || (row as any).comune || '').trim();
  const province = String((row as any).province || (row as any).provincia || '').trim();
  const query = [address, city, province, 'Italia'].filter(Boolean).join(', ');

  if (!query.trim()) return;

  Linking.openURL(`https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`);
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
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
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
            Scopri esperienze vere vicino a te: cena, sport, camminate, musica e momenti dal vivo.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>Categorie</Text>
          <Text style={styles.title}>Cosa vuoi fare?</Text>

          <Pressable style={styles.mapOverviewButton} onPress={() => router.push('/experiences-map')}>
            <Text style={styles.mapOverviewIcon}>🗺️</Text>
            <View style={styles.mapOverviewTextBox}>
              <Text style={styles.mapOverviewTitle}>Apri mappa esperienze</Text>
              <Text style={styles.mapOverviewSubtitle}>Vedi gli eventi disponibili con i pin categoria</Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.categorySelectButton}
            onPress={() => setCategoryMenuOpen((value) => !value)}
          >
            <View style={styles.categorySelectTextBox}>
              <Text style={styles.categorySelectLabel}>Categoria selezionata</Text>
              <Text style={styles.categorySelectValue}>{selectedCategory}</Text>
            </View>
            <Text style={styles.categorySelectArrow}>{categoryMenuOpen ? '▲' : '▼'}</Text>
          </Pressable>

          {categoryMenuOpen ? (
            <View style={styles.categoryDropdown}>
              {EXPERIENCE_CATEGORIES.map((category) => {
                const isSelected = selectedCategory === category;

                return (
                  <Pressable
                    key={category}
                    style={[
                      styles.categoryDropdownItem,
                      isSelected && styles.categoryDropdownItemActive,
                    ]}
                    onPress={() => {
                      setSelectedCategory(category);
                      setCategoryMenuOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.categoryDropdownText,
                        isSelected && styles.categoryDropdownTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>
              {selectedCategory === 'Tutti' ? 'Esperienze disponibili' : selectedCategory}
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
                Qui non c’è ancora nulla. Crea tu la prima esperienza e fai partire qualcosa dal vivo.
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
                      {getExperienceCategoryIcon(item.category)} {normalizeExperienceCategory(item.category)}
                    </Text>

                    <Text style={styles.experienceTitle}>
                      {item.title || 'Esperienza senza titolo'}
                    </Text>

                    <Text style={styles.experienceMeta}>
                      📍 {item.city || 'Comune'} · {item.province || 'Provincia'}
                    </Text>

                    <Text style={styles.experienceMeta}>
                      🗓️ {formatDateItalian(item.activity_date)} · {item.activity_time ? String(item.activity_time).slice(0, 5) : 'Ora da definire'}
                    </Text>

                    <View style={styles.experienceActionsRow}>
                      <Pressable style={styles.mapButton} onPress={(event) => {
                          event.stopPropagation();
                          openExperienceMap(item);
                        }}>
                        <Text style={styles.mapButtonText}>🗺️ Mappa</Text>
                      </Pressable>

                      <Pressable
                        style={styles.experienceFooter}
                        onPress={(event) => {
                          event.stopPropagation();
                          router.push({
                            pathname: '/experience-detail' as any,
                            params: { id: item.id || '' },
                          });
                        }}
                      >
                        <Text style={styles.openDetailText}>Apri</Text>
                      </Pressable>
                    </View>
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
  mapOverviewSubtitle: {
    color: '#7b4960',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  mapOverviewTitle: {
    color: '#4b1430',
    fontSize: 15,
    fontWeight: '900',
  },
  mapOverviewTextBox: {
    flex: 1,
    minWidth: 0,
  },
  mapOverviewIcon: {
    fontSize: 22,
  },
  mapOverviewButton: {
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  categoryDropdownTextActive: {
    color: '#ffffff',
  },
  categoryDropdownText: {
    color: '#7b4960',
    fontSize: 14,
    fontWeight: '900',
  },
  categoryDropdownItemActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#ef2d82',
  },
  categoryDropdownItem: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#fff0f7',
  },
  categoryDropdown: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    borderRadius: 18,
    padding: 8,
    marginBottom: 14,
    gap: 6,
  },
  categorySelectArrow: {
    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
  },
  categorySelectValue: {
    color: '#4b1430',
    fontSize: 16,
    fontWeight: '900',
  },
  categorySelectLabel: {
    color: '#a95d86',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  categorySelectTextBox: {
    flex: 1,
    minWidth: 0,
  },
  categorySelectButton: {
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  mapButton: {
    alignSelf: 'flex-start',
    marginTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  mapButtonText: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 64,
    paddingBottom: 32,
    backgroundColor: '#fff8fb',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#fff2f8',
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
    borderColor: '#f6d7e4',
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
    color: '#331426',
    marginBottom: 14,
    letterSpacing: -0.4,
  },
  categoryGrid: {
    display: 'none',
  },
  categoryButton: {
    display: 'none',
  },
  categoryButtonActive: {
    backgroundColor: '#e43f98',
    borderColor: '#e43f98',
  },
  categoryText: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '900',
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
    shadowColor: '#e43f98',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
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
    borderRadius: 26,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f6d7e4',
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    shadowColor: '#e43f98',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  experienceImageBox: {
    width: 82,
    height: 82,
    borderRadius: 18,
    backgroundColor: '#fff2f8',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    overflow: 'hidden',
    alignItems: 'center',
    shadowColor: '#e43f98',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
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
    fontSize: 11,
    fontWeight: '900',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  experienceTitle: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    color: '#331426',
    marginBottom: 5,
    letterSpacing: -0.3,
  },
  experienceMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b3652',
    marginTop: 2,
    flexShrink: 1,
  },
  experienceActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
  },
  experienceFooter: {
    marginTop: 0,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#e43f98',
    paddingVertical: 7,
    paddingHorizontal: 16,
    shadowColor: '#e43f98',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  openDetailText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  refreshButton: {
    marginTop: 16,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#e43f98',
    alignItems: 'center',
    shadowColor: '#e43f98',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
