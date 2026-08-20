import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';
import {
  ORGANIZER_GRADE_OPTIONS,
  effectiveOrganizerGrade,
  isOrganizerGradeLabel,
  organizerGradeFromCount,
  organizerGradeFromLabel,
  type OrganizerGradeLabel,
} from '../src/utils/organizerGrade';

type LooseRow = Record<string, any>;

function booleanFromRow(row: LooseRow | null | undefined, keys: string[], fallback = false) {
  const value = firstValue(row, keys);

  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();

    if (['true', '1', 'yes', 'si', 'sì', 'attivo', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'non attivo', 'inactive'].includes(normalized)) return false;
  }

  if (typeof value === 'number') return value === 1;

  return fallback;
}

function firstText(row: LooseRow | null | undefined, keys: string[], fallback = '') {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  }

  return fallback;
}

function firstValue(row: LooseRow | null | undefined, keys: string[]) {
  if (!row) return undefined;

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }

  return undefined;
}

function hasColumn(row: LooseRow | null | undefined, key: string) {
  return Boolean(row && Object.prototype.hasOwnProperty.call(row, key));
}

function pickExistingPayload(row: LooseRow | null | undefined, payload: LooseRow) {
  const safePayload: LooseRow = {};

  for (const key of Object.keys(payload)) {
    if (hasColumn(row, key)) {
      safePayload[key] = payload[key];
    }
  }

  return safePayload;
}

function firstExistingColumn(row: LooseRow | null | undefined, keys: string[]) {
  if (!row) return '';
  return keys.find((key) => hasColumn(row, key)) || '';
}

function formatDate(value: any) {
  if (!value) return 'Non impostato';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function profileName(row: LooseRow | null) {
  return firstText(
    row,
    ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome', 'email'],
    'Utente Bajuju'
  );
}

function profilePhoto(row: LooseRow | null) {
  return firstText(
    row,
    ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto'],
    ''
  );
}

function profileStatus(row: LooseRow | null) {
  const suspendedUntil = firstText(row, ['suspended_until', 'sospeso_fino'], '');
  const blockedUntil = firstText(row, ['blocked_until', 'bloccato_fino'], '');
  const deletedAt = firstText(row, ['deleted_at', 'eliminato_il'], '');
  const rawStatus = firstText(row, ['status', 'stato', 'account_status'], '');

  if (deletedAt) return 'Eliminato / disattivato';
  if (suspendedUntil) return `Sospeso fino a ${formatDate(suspendedUntil)}`;
  if (blockedUntil) return `Bloccato fino a ${formatDate(blockedUntil)}`;
  if (rawStatus) return rawStatus;
  return 'Attivo';
}

async function tryUpdateProfile(id: string, payloads: LooseRow[]) {
  for (const payload of payloads) {
    try {
      const result = await supabase.from('profiles').update(payload).eq('id', id);

      if (!result.error) {
        return { ok: true, message: '' };
      }
    } catch {
      // Prova il payload successivo.
    }
  }

  return {
    ok: false,
    message: 'Aggiornamento non riuscito. Probabile policy Supabase o colonne mancanti.',
  };
}

async function trySoftDeleteProfile(profileId: string, profile: LooseRow | null) {
  const realProfileId = String(firstValue(profile, ['id']) || profileId).trim();

  if (!realProfileId) {
    return { ok: false, message: 'ID profilo non disponibile.' };
  }

  const result = await supabase
    .from('profiles')
    .update({ is_deleted: true })
    .eq('id', realProfileId)
    .select('id,is_deleted')
    .maybeSingle();

  if (result.error) {
    return {
      ok: false,
      message: result.error.message || 'Errore Supabase durante eliminazione utente.',
    };
  }

  if (result.data?.is_deleted === true) {
    return { ok: true, message: '' };
  }

  return {
    ok: false,
    message: 'La riga è stata trovata, ma is_deleted non è diventato TRUE.',
  };
}

export default function AdminUserDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const userId = String(params.id || '');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<LooseRow | null>(null);
  const [gradeOverride, setGradeOverride] = useState<OrganizerGradeLabel | ''>('');
  const [organizedCount, setOrganizedCount] = useState(0);
  const [locationText, setLocationText] = useState('');
  const [savingRole, setSavingRole] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setOrganizedCount(0);
      return;
    }

    try {
      const byId = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (byId.error) {
        throw byId.error;
      }

      if (!byId.data) {
        setProfile(null);
        setOrganizedCount(0);
        return;
      }

      const loadedProfile = byId.data as LooseRow;
      const profileId = String(firstValue(loadedProfile, ['id']) || userId).trim();
      const rawOverride = firstText(loadedProfile, ['organizer_grade_override'], '');

      setProfile(loadedProfile);
      setGradeOverride(isOrganizerGradeLabel(rawOverride) ? rawOverride : '');
      setLocationText(
        firstText(
          loadedProfile,
          [
            'location_profile_text',
            'location_description',
            'location_text',
            'descrizione_location',
          ],
          ''
        )
      );

      const activitiesResult = await supabase
        .from('activities')
        .select('id,deleted_at')
        .eq('creator_id', profileId)
        .is('deleted_at', null);

      if (!activitiesResult.error && Array.isArray(activitiesResult.data)) {
        setOrganizedCount(activitiesResult.data.length);
      } else {
        setOrganizedCount(0);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Non sono riuscito a caricare il profilo.';

      setProfile(null);
      setOrganizedCount(0);
      Alert.alert('Errore', message);
    }
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);

      try {
        await loadProfile();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void start();

    return () => {
      mounted = false;
    };
  }, [loadProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile]);

  const currentProfileId = String(firstValue(profile, ['id', 'user_id']) || userId);
  const photoUrl = profilePhoto(profile);
  const premiumColumn = firstExistingColumn(
    profile,
    ['is_premium_organizer', 'is_premium', 'premium', 'premium_user']
  );
  const locationColumn = firstExistingColumn(
    profile,
    ['is_location_organizer', 'is_location', 'location', 'location_user']
  );
  const canManagePremium = Boolean(premiumColumn);
  const canManageLocation = Boolean(locationColumn);
  const automaticGrade = organizerGradeFromCount(organizedCount);
  const visibleGrade = effectiveOrganizerGrade(organizedCount, gradeOverride);
  const canReactivateProfile = Boolean(
    profile &&
      (
        firstValue(profile, [
          'deleted_at',
          'removed_at',
          'archived_at',
          'blocked_until',
          'suspended_until',
          'suspended_at',
        ]) ||
        booleanFromRow(
          profile,
          ['is_deleted', 'deleted', 'is_removed', 'removed', 'archived', 'blocked', 'suspended', 'is_blocked'],
          false
        ) ||
        ['deleted', 'removed', 'archived', 'blocked', 'suspended', 'eliminato', 'rimosso', 'archiviato', 'bloccato', 'sospeso'].includes(
          firstText(profile, ['status', 'account_status', 'stato'], '').toLowerCase().trim()
        )
      )
  );

  const reactivateUser = useCallback(async () => {
    if (!profile) return;

    Alert.alert('Riattivare utente', `Vuoi riattivare ${profileName(profile)}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Riattiva',
        onPress: async () => {
          try {
            const basePayload = pickExistingPayload(profile, {
              deleted_at: null,
              removed_at: null,
              archived_at: null,
              blocked_until: null,
              suspended_until: null,
              suspended_at: null,
              is_deleted: false,
              deleted: false,
              is_removed: false,
              removed: false,
              archived: false,
              blocked: false,
              suspended: false,
              is_blocked: false,
              updated_at: new Date().toISOString(),
            });

            const statusPayload = pickExistingPayload(profile, {
              status: 'active',
              account_status: 'active',
              stato: 'attivo',
            });

            const payloads = [
              { ...basePayload, ...statusPayload },
              basePayload,
            ].filter((payload) => Object.keys(payload).length > 0);

            const result = await tryUpdateProfile(currentProfileId, payloads);

            if (!result.ok) {
              Alert.alert(
                'Errore riattivazione',
                result.message || 'Non sono riuscito a riattivare questo utente.'
              );
              return;
            }

            Alert.alert('Utente riattivato', 'Il profilo è di nuovo attivo.');
            await loadProfile();
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : 'Non sono riuscito a riattivare questo utente.';

            Alert.alert('Errore riattivazione', message);
          }
        },
      },
    ]);
  }, [currentProfileId, loadProfile, profile]);

  const updateAdminRoleFields = useCallback(
    async (payload: LooseRow, successMessage: string) => {
      if (!profile) return false;

      setSavingRole(true);

      try {
        const safePayload = pickExistingPayload(profile, payload);
        const safePayloadWithDate = pickExistingPayload(profile, {
          ...payload,
          updated_at: new Date().toISOString(),
        });

        const payloads = [safePayloadWithDate, safePayload].filter(
          (item) => Object.keys(item).length > 0
        );

        if (payloads.length === 0) {
          Alert.alert('Colonna mancante', 'Nessuna delle colonne richieste esiste nel profilo caricato.');
          return false;
        }

        const result = await tryUpdateProfile(currentProfileId, payloads);

        if (!result.ok) {
          Alert.alert(
            'Errore aggiornamento',
            result.message || 'Non sono riuscito ad aggiornare il profilo.'
          );
          return false;
        }

        Alert.alert('Aggiornato', successMessage);
        await loadProfile();
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : 'Non sono riuscito ad aggiornare il profilo.';

        Alert.alert('Errore aggiornamento', message);
        return false;
      } finally {
        setSavingRole(false);
      }
    },
    [currentProfileId, loadProfile, profile]
  );

  const togglePremium = useCallback(() => {
    const active = booleanFromRow(
      profile,
      ['is_premium_organizer', 'is_premium', 'premium', 'premium_user'],
      false
    );
    const column = firstExistingColumn(
      profile,
      ['is_premium_organizer', 'is_premium', 'premium', 'premium_user']
    );

    if (!column) {
      Alert.alert('Colonna mancante', 'Nel profilo caricato non trovo una colonna Premium esistente.');
      return;
    }

    void updateAdminRoleFields(
      { [column]: !active },
      !active ? 'Premium attivato.' : 'Premium disattivato.'
    );
  }, [profile, updateAdminRoleFields]);

  const toggleLocation = useCallback(() => {
    const active = booleanFromRow(
      profile,
      ['is_location_organizer', 'is_location', 'location', 'location_user'],
      false
    );
    const column = firstExistingColumn(
      profile,
      ['is_location_organizer', 'is_location', 'location', 'location_user']
    );

    if (!column) {
      Alert.alert('Colonna mancante', 'Nel profilo caricato non trovo una colonna Location esistente.');
      return;
    }

    void updateAdminRoleFields(
      { [column]: !active },
      !active ? 'Location attivato.' : 'Location disattivato.'
    );
  }, [profile, updateAdminRoleFields]);

  const promoteToGrade = useCallback(
    (grade: OrganizerGradeLabel) => {
      const requested = organizerGradeFromLabel(grade);

      if (!requested) return;

      void updateAdminRoleFields(
        { organizer_grade_override: grade },
        `${grade} impostato. Colore e dicitura si aggiornano insieme.`
      );
    },
    [updateAdminRoleFields]
  );

  const restoreAutomaticGrade = useCallback(() => {
    void updateAdminRoleFields(
      { organizer_grade_override: null },
      'Promozione manuale rimossa. Il grado torna completamente automatico.'
    );
  }, [updateAdminRoleFields]);

  const saveLocationText = useCallback(() => {
    void updateAdminRoleFields(
      {
        location_profile_text: locationText.trim().slice(0, 200),
        location_description: locationText.trim().slice(0, 200),
        location_text: locationText.trim().slice(0, 200),
      },
      'Testo Location aggiornato.'
    );
  }, [locationText, updateAdminRoleFields]);

  const suspendUser = useCallback(() => {
    if (!profile) return;

    Alert.alert('Sospendere utente', `Vuoi sospendere ${profileName(profile)}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Sospendi',
        style: 'destructive',
        onPress: async () => {
          try {
            const farFuture = '2099-12-31T23:59:59.000Z';

            const result = await tryUpdateProfile(currentProfileId, [
              { suspended_until: farFuture, status: 'suspended' },
              { suspended_until: farFuture },
              { blocked_until: farFuture, status: 'suspended' },
              { blocked_until: farFuture },
              { is_blocked: true, blocked_until: farFuture },
              { bloccato_fino: farFuture },
            ]);

            if (!result.ok) {
              Alert.alert('Errore', result.message);
              return;
            }

            Alert.alert('Fatto', 'Utente sospeso.');
            await loadProfile();
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : 'Non è stato possibile sospendere l’utente.';

            Alert.alert('Errore', message);
          }
        },
      },
    ]);
  }, [currentProfileId, loadProfile, profile]);

  const blockSevenDays = useCallback(() => {
    if (!profile) return;

    Alert.alert('Bloccare utente', `Vuoi bloccare ${profileName(profile)} per 7 giorni?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Blocca 7 giorni',
        style: 'destructive',
        onPress: async () => {
          try {
            const blockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

            const result = await tryUpdateProfile(currentProfileId, [
              { blocked_until: blockedUntil, status: 'blocked' },
              { blocked_until: blockedUntil },
              { is_blocked: true, blocked_until: blockedUntil },
              { bloccato_fino: blockedUntil },
            ]);

            if (!result.ok) {
              Alert.alert('Errore', result.message);
              return;
            }

            Alert.alert('Fatto', 'Utente bloccato per 7 giorni.');
            await loadProfile();
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : 'Non è stato possibile bloccare l’utente.';

            Alert.alert('Errore', message);
          }
        },
      },
    ]);
  }, [currentProfileId, loadProfile, profile]);

  const unblockUser = useCallback(() => {
    if (!profile) return;

    Alert.alert('Sbloccare utente', `Vuoi sbloccare ${profileName(profile)}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Sblocca',
        onPress: async () => {
          try {
            const result = await tryUpdateProfile(currentProfileId, [
              { blocked_until: null, suspended_until: null, status: 'active', is_blocked: false },
              { blocked_until: null, suspended_until: null, is_blocked: false },
              { blocked_until: null, status: 'active' },
              { blocked_until: null },
              { suspended_until: null },
              { is_blocked: false },
              { bloccato_fino: null },
            ]);

            if (!result.ok) {
              Alert.alert('Errore', result.message);
              return;
            }

            Alert.alert('Fatto', 'Utente sbloccato.');
            await loadProfile();
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : 'Non è stato possibile sbloccare l’utente.';

            Alert.alert('Errore', message);
          }
        },
      },
    ]);
  }, [currentProfileId, loadProfile, profile]);

  const deleteUser = useCallback(() => {
    if (!profile) return;

    Alert.alert(
      'Disattivare utente',
      `Vuoi disattivare ${profileName(profile)}? L’account resterà recuperabile.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Disattiva',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await trySoftDeleteProfile(currentProfileId, profile);

              if (!result.ok) {
                Alert.alert('Errore', result.message);
                return;
              }

              Alert.alert('Fatto', 'Utente disattivato.');
              router.replace('/admin-users');
            } catch (error: unknown) {
              const message =
                error instanceof Error
                  ? error.message
                  : 'Non è stato possibile disattivare l’utente.';

              Alert.alert('Errore', message);
            }
          },
        },
      ]
    );
  }, [currentProfileId, profile]);

  const hardDeleteUser = useCallback(() => {
    if (!profile) return;

    const name = profileName(profile);

    Alert.alert(
      'Eliminazione definitiva',
      `Stai per eliminare definitivamente ${name}. L’account e la sua email verranno rimossi e non potranno essere recuperati.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Continua',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Conferma definitiva',
              `Confermi l’eliminazione definitiva di ${name}?`,
              [
                { text: 'No', style: 'cancel' },
                {
                  text: 'Elimina definitivamente',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const result = await supabase.functions.invoke('delete-bajuju-account', {
                        body: { target_user_id: currentProfileId },
                      });

                      if (result.error) {
                        Alert.alert(
                          'Errore eliminazione',
                          result.error.message || 'Eliminazione non riuscita.'
                        );
                        return;
                      }

                      if (result.data?.ok !== true) {
                        Alert.alert(
                          'Errore eliminazione',
                          String(result.data?.error || result.data?.details || 'Eliminazione non riuscita.')
                        );
                        return;
                      }

                      Alert.alert(
                        'Utente eliminato',
                        'Account eliminato definitivamente e email liberata.'
                      );
                      router.replace('/admin-users');
                    } catch (error: unknown) {
                      const message =
                        error instanceof Error
                          ? error.message
                          : 'Non è stato possibile eliminare definitivamente l’utente.';

                      Alert.alert('Errore eliminazione', message);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [currentProfileId, profile]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Area Admin</Text>
        <Text style={styles.title}>Dettaglio utente</Text>

        <Pressable style={styles.backButton} onPress={() => router.push('/admin-users')}>
          <Text style={styles.backButtonText}>← Torna agli iscritti</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico utente...</Text>
        </View>
      ) : null}

      {!loading && !profile ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>Utente non trovato.</Text>
        </View>
      ) : null}

      {profile ? (
        <>
          <View style={styles.card}>
            <View style={styles.profileHeader}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.profilePhoto} resizeMode="cover" />
              ) : (
                <View style={styles.profilePhotoPlaceholder}>
                  <Text style={styles.profilePhotoPlaceholderText}>Nessuna foto</Text>
                </View>
              )}

              <View style={styles.profileHeaderText}>
                <Text style={styles.name}>{profileName(profile)}</Text>
                <Text style={styles.profileSubtitle}>Dati utente</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailValue}>
                {firstText(profile, ['email'], 'Email non disponibile')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Età</Text>
              <Text style={styles.detailValue}>
                {firstText(profile, ['age', 'eta', 'età'], 'Età non indicata')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Sesso</Text>
              <Text style={styles.detailValue}>
                {firstText(profile, ['gender', 'genere', 'sex'], 'Non indicato')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Città</Text>
              <Text style={styles.detailValue}>
                {firstText(profile, ['city', 'citta', 'comune'], 'Città non indicata')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Stato</Text>
              <Text style={styles.detailValue}>{profileStatus(profile)}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ID</Text>
              <Text style={styles.detailValue}>{currentProfileId}</Text>
            </View>

            {canReactivateProfile ? (
              <Pressable style={styles.reactivateButton} onPress={reactivateUser}>
                <Text style={styles.reactivateButtonText}>Riattiva utente</Text>
              </Pressable>
            ) : null}

            <View style={styles.roleCard}>
              <Text style={styles.roleTitle}>Premium / Location / Grado</Text>

              <View style={styles.roleButtonsRow}>
                {canManagePremium ? (
                  <Pressable
                    style={[
                      styles.roleButton,
                      booleanFromRow(
                        profile,
                        ['is_premium_organizer', 'is_premium', 'premium', 'premium_user'],
                        false
                      ) && styles.roleButtonActive,
                      savingRole && styles.roleButtonDisabled,
                    ]}
                    onPress={togglePremium}
                    disabled={savingRole}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        booleanFromRow(
                          profile,
                          ['is_premium_organizer', 'is_premium', 'premium', 'premium_user'],
                          false
                        ) && styles.roleButtonTextActive,
                      ]}
                    >
                      {booleanFromRow(
                        profile,
                        ['is_premium_organizer', 'is_premium', 'premium', 'premium_user'],
                        false
                      )
                        ? 'Premium ON'
                        : 'Premium OFF'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.roleNotice}>
                    <Text style={styles.roleNoticeText}>Premium non configurato nel database.</Text>
                  </View>
                )}

                {canManageLocation ? (
                  <Pressable
                    style={[
                      styles.roleButton,
                      booleanFromRow(
                        profile,
                        ['is_location_organizer', 'is_location', 'location', 'location_user'],
                        false
                      ) && styles.roleButtonActive,
                      savingRole && styles.roleButtonDisabled,
                    ]}
                    onPress={toggleLocation}
                    disabled={savingRole}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        booleanFromRow(
                          profile,
                          ['is_location_organizer', 'is_location', 'location', 'location_user'],
                          false
                        ) && styles.roleButtonTextActive,
                      ]}
                    >
                      {booleanFromRow(
                        profile,
                        ['is_location_organizer', 'is_location', 'location', 'location_user'],
                        false
                      )
                        ? 'Location ON'
                        : 'Location OFF'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.roleNotice}>
                    <Text style={styles.roleNoticeText}>Location non configurato nel database.</Text>
                  </View>
                )}
              </View>

              <View style={styles.gradeSection}>
                <Text style={styles.roleLabel}>Grado organizzatore</Text>

                <View style={styles.gradeSummaryBox}>
                  <Text style={styles.gradeSummaryLabel}>Automatico</Text>
                  <Text style={styles.gradeSummaryValue}>
                    {automaticGrade.label} · {organizedCount} eventi
                  </Text>

                  <Text style={[styles.gradeSummaryLabel, styles.gradeSummarySecondLabel]}>Visualizzato</Text>
                  <Text style={styles.gradeSummaryValue}>{visibleGrade.label}</Text>

                  {gradeOverride ? (
                    <Text style={styles.manualPromotionText}>
                      Promozione manuale: {gradeOverride}
                    </Text>
                  ) : (
                    <Text style={styles.automaticText}>Nessuna promozione manuale.</Text>
                  )}
                </View>

                <Text style={styles.gradeInstruction}>
                  Scegli un grado: la dicitura e il colore del profilo cambiano insieme.
                </Text>

                <View style={styles.gradeChoices}>
                  {ORGANIZER_GRADE_OPTIONS.map((grade) => {
                    const info = organizerGradeFromLabel(grade);
                    const isSelected = gradeOverride === grade;
                    const isEarnedOrLower = Boolean(info && info.index <= automaticGrade.index);

                    return (
                      <Pressable
                        key={grade}
                        style={[
                          styles.gradeChoice,
                          info?.level === 'base' && styles.gradeChoiceBase,
                          info?.level === 'active' && styles.gradeChoiceActive,
                          info?.level === 'expert' && styles.gradeChoiceExpert,
                          info?.level === 'top' && styles.gradeChoiceTop,
                          isSelected && styles.gradeChoiceSelected,
                          savingRole && styles.roleButtonDisabled,
                        ]}
                        onPress={() => promoteToGrade(grade)}
                        disabled={savingRole}
                      >
                        <Text style={styles.gradeChoiceTitle}>{grade}</Text>
                        <Text style={styles.gradeChoiceMeta}>
                          {info?.level === 'base'
                            ? 'Bianco'
                            : info?.level === 'active'
                              ? 'Verde'
                              : info?.level === 'expert'
                                ? 'Rosso'
                                : 'Oro'}
                          {isEarnedOrLower ? ' · già raggiunto' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  style={[styles.autoGradeButton, savingRole && styles.roleButtonDisabled]}
                  onPress={restoreAutomaticGrade}
                  disabled={savingRole || !gradeOverride}
                >
                  <Text style={styles.autoGradeButtonText}>Torna al grado automatico</Text>
                </Pressable>

                <Text style={styles.gradeRuleText}>
                  La promozione manuale può solo alzare il grado. Se l’utente raggiunge un livello superiore con gli eventi, avanzerà comunque automaticamente.
                </Text>
              </View>

              <Text style={styles.roleLabel}>Testo Location max 200 caratteri</Text>
              <TextInput
                value={locationText}
                onChangeText={(value) => setLocationText(value.slice(0, 200))}
                placeholder="Descrizione breve Location"
                placeholderTextColor="#a95d86"
                style={[styles.roleInput, styles.roleTextArea]}
                multiline
              />
              <Text style={styles.roleCounter}>{locationText.length}/200</Text>
              <Pressable
                style={[styles.roleSaveButton, savingRole && styles.roleButtonDisabled]}
                onPress={saveLocationText}
                disabled={savingRole}
              >
                <Text style={styles.roleSaveButtonText}>Salva testo Location</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Azioni utente</Text>

            <Pressable style={styles.warningButton} onPress={suspendUser}>
              <Text style={styles.actionButtonText}>Sospendi utente</Text>
            </Pressable>

            <Pressable style={styles.warningButton} onPress={blockSevenDays}>
              <Text style={styles.actionButtonText}>Blocca 7 giorni</Text>
            </Pressable>

            <Pressable style={styles.button} onPress={unblockUser}>
              <Text style={styles.buttonText}>Sblocca utente</Text>
            </Pressable>

            <Pressable style={styles.dangerButton} onPress={deleteUser}>
              <Text style={styles.actionButtonText}>Disattiva utente</Text>
            </Pressable>

            <Pressable style={styles.hardDeleteButton} onPress={hardDeleteUser}>
              <Text style={styles.actionButtonText}>Elimina definitivamente</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    padding: 18,
    paddingBottom: 40,
    gap: 14,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 10,
  },
  kicker: {
    color: '#ef2d82',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 29,
    fontWeight: '900',
    marginBottom: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  backButtonText: {
    color: '#9b1f61',
    fontSize: 14,
    fontWeight: '900',
  },
  loadingText: {
    color: '#7b4960',
    fontWeight: '800',
    marginTop: 8,
  },
  emptyText: {
    color: '#7b4960',
    fontSize: 15,
    fontWeight: '800',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  profileHeaderText: {
    flex: 1,
  },
  profilePhoto: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#fff0f7',
    borderWidth: 2,
    borderColor: '#ffd3e6',
  },
  profilePhotoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#fff0f7',
    borderWidth: 2,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  profilePhotoPlaceholderText: {
    color: '#a95d86',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  profileSubtitle: {
    marginTop: 4,
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '800',
  },
  name: {
    color: '#4b1430',
    fontSize: 24,
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 8,
  },
  detailRow: {
    backgroundColor: '#fff8fb',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  detailLabel: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  detailValue: {
    color: '#4b1430',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  reactivateButton: {
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#2fb36d',
    alignItems: 'center',
  },
  reactivateButtonText: {
    color: '#197a45',
    fontSize: 13,
    fontWeight: '900',
  },
  roleCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    gap: 10,
  },
  roleTitle: {
    color: '#9b1f61',
    fontSize: 16,
    fontWeight: '900',
  },
  roleButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  roleButton: {
    flexGrow: 1,
    minWidth: 130,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    alignItems: 'center',
  },
  roleNotice: {
    flexGrow: 1,
    minWidth: 130,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  roleNoticeText: {
    color: '#a95d86',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 17,
  },
  roleButtonActive: {
    backgroundColor: '#e43f98',
    borderColor: '#e43f98',
  },
  roleButtonDisabled: {
    opacity: 0.55,
  },
  roleButtonText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  roleButtonTextActive: {
    color: '#ffffff',
  },
  roleLabel: {
    marginTop: 8,
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
  },
  gradeSection: {
    marginTop: 4,
    gap: 10,
  },
  gradeSummaryBox: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    padding: 13,
  },
  gradeSummaryLabel: {
    color: '#a95d86',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  gradeSummarySecondLabel: {
    marginTop: 9,
  },
  gradeSummaryValue: {
    color: '#4b1430',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  manualPromotionText: {
    marginTop: 9,
    color: '#6e31a8',
    fontSize: 12,
    fontWeight: '900',
  },
  automaticText: {
    marginTop: 9,
    color: '#197a45',
    fontSize: 12,
    fontWeight: '900',
  },
  gradeInstruction: {
    color: '#6b3652',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  gradeChoices: {
    gap: 8,
  },
  gradeChoice: {
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: '#ffffff',
  },
  gradeChoiceBase: {
    borderColor: '#e9dfe4',
  },
  gradeChoiceActive: {
    borderColor: '#2fb36d',
    backgroundColor: '#f2fff7',
  },
  gradeChoiceExpert: {
    borderColor: '#e44848',
    backgroundColor: '#fff7f7',
  },
  gradeChoiceTop: {
    borderColor: '#d9a441',
    backgroundColor: '#fffaf0',
  },
  gradeChoiceSelected: {
    borderWidth: 3,
  },
  gradeChoiceTitle: {
    color: '#4b1430',
    fontSize: 14,
    fontWeight: '900',
  },
  gradeChoiceMeta: {
    color: '#7b4960',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  autoGradeButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9b1f61',
    backgroundColor: '#ffffff',
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  autoGradeButtonText: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
  },
  gradeRuleText: {
    color: '#7b4960',
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700',
  },
  roleInput: {
    borderWidth: 1,
    borderColor: '#ffd3e7',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: '#ffffff',
    color: '#4a1230',
    fontSize: 14,
    fontWeight: '800',
  },
  roleTextArea: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  roleCounter: {
    alignSelf: 'flex-end',
    color: '#a95d86',
    fontSize: 12,
    fontWeight: '800',
  },
  roleSaveButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: '#e43f98',
  },
  roleSaveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  warningButton: {
    backgroundColor: '#9b1f61',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  hardDeleteButton: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#7a001f',
    borderWidth: 2,
    borderColor: '#4d0014',
  },
  dangerButton: {
    backgroundColor: '#b00020',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 15,
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 15,
  },
});
