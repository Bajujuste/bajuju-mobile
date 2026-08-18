import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BajujuBottomNav } from '@/src/components/navigation/BajujuBottomNav';
import { EXPERIENCE_CATEGORIES, getExperienceCategoryIcon, normalizeExperienceCategory } from '@/src/constants/experienceCategories';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '@/src/theme/bajujuTheme';
import { supabase } from '../src/lib/supabase';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

const PROVINCE_OPTIONS = [
  'Tutte',
  'Bergamo',
  'Milano',
  'Lecco',
  'Monza e Brianza',
  'Verona',
] as const;

type ActivityRow = {
  id?: string;
  creator_id?: string | null;
  organizer_id?: string | null;
  created_by?: string | null;
  user_id?: string | null;
  profile_id?: string | null;
  title?: string | null;
  category?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  max_participants?: number | null;
  is_flash?: boolean | null;
  image_url?: string | null;
  photo_url?: string | null;
  cover_url?: string | null;
  activity_image_url?: string | null;
  thumbnail_url?: string | null;
  deleted_at?: string | null;
  status?: string | null;
};

type ParticipantRow = {
  activity_id?: string | null;
  user_id?: string | null;
  status?: string | null;
};

function participantIsActive(row: ParticipantRow) {
  const status = String(row.status || '').toLowerCase().trim();

  return ![
    'rejected',
    'rifiutato',
    'declined',
    'annullato',
    'annullata',
    'deleted',
    'eliminato',
    'eliminata',
    'removed',
    'cancellato',
    'cancellata',
  ].includes(status);
}

function getExperienceCreatorId(row: ActivityRow) {
  return String(
    row.creator_id ||
      row.organizer_id ||
      row.created_by ||
      row.user_id ||
      row.profile_id ||
      ''
  ).trim();
}

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

function activityImageUrl(row: ActivityRow) {
  return String(
    row.image_url ||
      row.photo_url ||
      row.cover_url ||
      row.activity_image_url ||
      row.thumbnail_url ||
      ''
  ).trim();
}

function activityImageSource(row: ActivityRow) {
  const imageUrl = activityImageUrl(row);

  if (imageUrl) {
    return { uri: imageUrl };
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
  const [selectedProvince, setSelectedProvince] = useState('Tutte');
  const [provinceMenuOpen, setProvinceMenuOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [selectedPosterUrl, setSelectedPosterUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadExperiences = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const authResult = await supabase.auth.getUser();
      setCurrentUserId(authResult.data.user?.id || '');

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

      const activityIds = cleanRows
        .map((row) => String(row.id || '').trim())
        .filter(Boolean);

      const participantSets: Record<string, Set<string>> = {};

      cleanRows.forEach((row) => {
        const activityId = String(row.id || '').trim();
        if (!activityId) return;

        participantSets[activityId] = new Set<string>();

        const creatorId = getExperienceCreatorId(row);
        if (creatorId) {
          participantSets[activityId].add(creatorId);
        }
      });

      if (activityIds.length > 0) {
        const participantsResult = await supabase
          .from('activity_participants')
          .select('activity_id,user_id,status')
          .in('activity_id', activityIds)
          .limit(5000);

        if (!participantsResult.error) {
          ((participantsResult.data || []) as ParticipantRow[])
            .filter(participantIsActive)
            .forEach((participant) => {
              const activityId = String(participant.activity_id || '').trim();
              const userId = String(participant.user_id || '').trim();

              if (!activityId || !userId || !participantSets[activityId]) return;

              participantSets[activityId].add(userId);
            });
        }
      }

      const nextParticipantCounts: Record<string, number> = {};

      Object.entries(participantSets).forEach(([activityId, users]) => {
        nextParticipantCounts[activityId] = users.size;
      });

      setParticipantCounts(nextParticipantCounts);
      setActivities(cleanRows);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore imprevisto durante il caricamento delle esperienze.';

      setActivities([]);
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExperiences();
  }, [loadExperiences]);

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      const matchesCategory =
        selectedCategory === 'Tutti' ||
        normalizeCategory(item.category) === normalizeCategory(selectedCategory);

      const matchesProvince =
        selectedProvince === 'Tutte' ||
        String(item.province || '').trim() === selectedProvince;

      return matchesCategory && matchesProvince;
    });
  }, [activities, selectedCategory, selectedProvince]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>← Home</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={[styles.headerBlob, styles.headerBlobTop]} />
          <View style={[styles.headerBlob, styles.headerBlobBottom]} />
          <Text style={[styles.headerDoodle, styles.headerDoodleLeft]}>‹‹</Text>
          <Text style={[styles.headerDoodle, styles.headerDoodleRight]}>✦</Text>
          <Text style={styles.logoText}>
            <Text style={styles.headerTitlePlum}>Trova </Text>
            <Text style={styles.headerTitlePink}>esperienza</Text>
          </Text>
          <Text style={styles.subtitle}>Scopri esperienze vere vicino a te.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>Cosa vuoi fare?</Text>

          <Pressable style={styles.mapOverviewButton} onPress={() => router.push('/experiences-map')}>
            <Text style={styles.mapOverviewIcon}>🗺️</Text>
            <View style={styles.mapOverviewTextBox}>
              <Text style={styles.mapOverviewTitle}>Apri la mappa</Text>
              <Text style={styles.mapOverviewSubtitle}>Guarda gli eventi con i pin</Text>
            </View>
            <Text style={styles.mapOverviewArrow}>→</Text>
          </Pressable>

          <View style={styles.filtersRow}>
            <View style={styles.filterColumn}>
              <Text style={styles.filterLabel}>Categoria</Text>
              <Pressable
                style={styles.categorySelectButton}
                onPress={() => {
                  setProvinceMenuOpen(false);
                  setCategoryMenuOpen((value) => !value);
                }}
              >
                <View style={styles.categorySelectTextBox}>
                  <Text style={styles.categorySelectValue}>{selectedCategory}</Text>
                </View>
                <Text style={styles.categorySelectArrow}>{categoryMenuOpen ? '⌃' : '⌄'}</Text>
              </Pressable>
            </View>

            <View style={styles.filterColumn}>
              <Text style={styles.filterLabel}>Provincia</Text>
              <Pressable
                style={styles.categorySelectButton}
                onPress={() => {
                  setCategoryMenuOpen(false);
                  setProvinceMenuOpen((value) => !value);
                }}
              >
                <View style={styles.categorySelectTextBox}>
                  <Text style={styles.categorySelectValue}>{selectedProvince}</Text>
                </View>
                <Text style={styles.categorySelectArrow}>
                  {provinceMenuOpen ? '⌃' : '⌄'}
                </Text>
              </Pressable>
            </View>
          </View>

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

          {provinceMenuOpen ? (
            <View style={styles.categoryDropdown}>
              {PROVINCE_OPTIONS.map((province) => {
                const isSelected = selectedProvince === province;

                return (
                  <Pressable
                    key={province}
                    style={[
                      styles.categoryDropdownItem,
                      isSelected && styles.categoryDropdownItemActive,
                    ]}
                    onPress={() => {
                      setSelectedProvince(province);
                      setProvinceMenuOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.categoryDropdownText,
                        isSelected && styles.categoryDropdownTextActive,
                      ]}
                    >
                      {province}
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
                  <Pressable
                    style={styles.experienceImageBox}
                    onPress={(event) => {
                      event.stopPropagation();

                      const posterUrl = activityImageUrl(item);
                      if (posterUrl) {
                        setSelectedPosterUrl(posterUrl);
                      }
                    }}
                  >
                    <Image
                      source={activityImageSource(item)}
                      style={styles.experienceImage}
                      resizeMode="contain"
                    />
                  </Pressable>

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

                    <Text style={styles.participantMeta}>
                      👥 Partecipanti {participantCounts[String(item.id || '')] ?? (getExperienceCreatorId(item) ? 1 : 0)}
                      {Number(item.max_participants || 0) > 0
                        ? `/${Number(item.max_participants)}`
                        : ''}
                    </Text>

                    <View style={styles.experienceActionsRow}>
                      <Pressable style={styles.mapButton} onPress={(event) => {
                          event.stopPropagation();
                          router.push('/experiences-map');
                        }}>
                        <Text style={styles.mapButtonText}>🗺️ Mappa</Text>
                      </Pressable>

                      {currentUserId && item.creator_id === currentUserId ? (
                        <Pressable
                          style={styles.editButton}
                          onPress={(event) => {
                            event.stopPropagation();
                            router.push({
                              pathname: '/edit-experience' as any,
                              params: { id: item.id || '' },
                            });
                          }}
                        >
                          <Text style={styles.editButtonText}>✏️ Modifica</Text>
                        </Pressable>
                      ) : null}

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

      <Modal
        visible={Boolean(selectedPosterUrl)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedPosterUrl(null)}
      >
        <View style={styles.posterModalBackdrop}>
          <Pressable
            style={styles.posterCloseButton}
            onPress={() => setSelectedPosterUrl(null)}
          >
            <Text style={styles.posterCloseButtonText}>×</Text>
          </Pressable>

          {selectedPosterUrl ? (
            <Image
              source={{ uri: selectedPosterUrl }}
              style={styles.posterLargeImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      <BajujuBottomNav active="find" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BAJUJU_COLORS.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 132,
    backgroundColor: BAJUJU_COLORS.background,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 17,
    borderRadius: 999,
    backgroundColor: '#FFFFFFE8',
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    ...BAJUJU_SHADOW,
  },
  backText: {
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 15,
    color: BAJUJU_COLORS.plum,
  },
  header: {
    marginBottom: 18,
    minHeight: 176,
    paddingVertical: 28,
    paddingHorizontal: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#FFFFFFDC',
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    ...BAJUJU_SHADOW,
  },
  headerBlob: {
    position: 'absolute',
    width: 104,
    height: 76,
    borderRadius: 52,
    backgroundColor: BAJUJU_COLORS.palePink,
    opacity: 0.76,
  },
  headerBlobTop: {
    left: -27,
    top: -25,
    transform: [{ rotate: '-18deg' }],
  },
  headerBlobBottom: {
    right: -34,
    bottom: -28,
    transform: [{ rotate: '18deg' }],
  },
  headerDoodle: {
    position: 'absolute',
    zIndex: 2,
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
  },
  headerDoodleLeft: {
    left: 28,
    top: 78,
    fontSize: 24,
    transform: [{ rotate: '-8deg' }],
  },
  headerDoodleRight: {
    right: 27,
    top: 24,
    fontSize: 23,
    transform: [{ rotate: '8deg' }],
  },
  logoText: {
    zIndex: 1,
    fontSize: 34,
    lineHeight: 39,
    fontFamily: BAJUJU_FONTS.bold,
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  headerTitlePlum: {
    color: BAJUJU_COLORS.plum,
  },
  headerTitlePink: {
    color: BAJUJU_COLORS.brightPink,
  },
  subtitle: {
    zIndex: 1,
    marginTop: 7,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: BAJUJU_FONTS.medium,
    color: BAJUJU_COLORS.plum,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 29,
    padding: 22,
    backgroundColor: '#FFFCFE',
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sectionEyebrow: {
    color: BAJUJU_COLORS.brightPink,
    fontSize: 13,
    fontFamily: BAJUJU_FONTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 16,
  },
  title: {
    display: 'none',
  },
  mapOverviewButton: {
    minHeight: 80,
    marginBottom: 18,
    paddingHorizontal: 16,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.softPink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  mapOverviewIcon: {
    width: 42,
    height: 42,
    fontSize: 24,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: BAJUJU_COLORS.white,
  },
  mapOverviewTextBox: {
    flex: 1,
    minWidth: 0,
  },
  mapOverviewTitle: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 16,
  },
  mapOverviewSubtitle: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  mapOverviewArrow: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 25,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  filterColumn: {
    flex: 1,
    minWidth: 0,
  },
  filterLabel: {
    marginBottom: 7,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  categorySelectButton: {
    minHeight: 56,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: BAJUJU_COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categorySelectTextBox: {
    flex: 1,
    minWidth: 0,
  },
  categorySelectValue: {
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
  },
  categorySelectLabel: {
    display: 'none',
  },
  categorySelectArrow: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 16,
  },
  categoryDropdown: {
    marginTop: 8,
    marginBottom: 14,
    padding: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.white,
    gap: 6,
  },
  categoryDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.softPink,
    backgroundColor: BAJUJU_COLORS.background,
  },
  categoryDropdownItemActive: {
    borderColor: BAJUJU_COLORS.brightPink,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  categoryDropdownText: {
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 14,
  },
  categoryDropdownTextActive: {
    color: BAJUJU_COLORS.white,
  },
  resultHeader: {
    marginTop: 20,
    marginBottom: 12,
  },
  resultTitle: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  resultCount: {
    marginTop: 3,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  emptyBox: {
    paddingVertical: 18,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.softPink,
    alignItems: 'center',
  },
  emptyText: {
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  experienceList: {
    gap: 14,
  },
  experienceCard: {
    minHeight: 194,
    padding: 14,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#FFFCFE',
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    shadowColor: '#9B1A5B',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
  experienceImageBox: {
    width: 104,
    height: 104,
    borderRadius: 20,
    backgroundColor: BAJUJU_COLORS.softPink,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
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
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: BAJUJU_COLORS.softPink,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  experienceTitle: {
    marginBottom: 6,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  experienceMeta: {
    marginTop: 2,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 13,
    flexShrink: 1,
  },
  participantMeta: {
    marginTop: 7,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 13,
  },
  experienceActionsRow: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  mapButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#F7A7CD',
    backgroundColor: BAJUJU_COLORS.palePink,
  },
  mapButtonText: {
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  editButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EAD18A',
    backgroundColor: '#FFF7DB',
  },
  editButtonText: {
    color: '#7A5A00',
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  experienceFooter: {
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  openDetailText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  posterModalBackdrop: {
    flex: 1,
    backgroundColor: '#000000EE',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  posterLargeImage: {
    width: '100%',
    height: '88%',
  },
  posterCloseButton: {
    position: 'absolute',
    zIndex: 10,
    top: 48,
    right: 20,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterCloseButtonText: {
    color: '#222222',
    fontSize: 32,
    lineHeight: 34,
    fontFamily: BAJUJU_FONTS.bold,
  },
  refreshButton: {
    marginTop: 18,
    height: 48,
    borderRadius: 24,
    backgroundColor: BAJUJU_COLORS.brightPink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BAJUJU_COLORS.brightPink,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  refreshButtonText: {
    color: BAJUJU_COLORS.white,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 15,
  },
});
