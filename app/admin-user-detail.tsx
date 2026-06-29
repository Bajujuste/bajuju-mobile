import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';

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
  return firstText(row, ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome', 'email'], 'Utente Bajuju');
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
      if (!result.error) return { ok: true, message: '' };
    } catch {
      // Prova successiva.
    }
  }

  return { ok: false, message: 'Aggiornamento non riuscito. Probabile policy Supabase o colonne mancanti.' };
}


async function trySoftDeleteProfile(profileId: string, profile: LooseRow | null) {
  const realProfileId = String(firstValue(profile, ['id']) || profileId).trim();

  if (!realProfileId) {
    return {
      ok: false,
      message: 'ID profilo non disponibile.',
    };
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
  const [gradeValue, setGradeValue] = useState('');
  const [locationText, setLocationText] = useState('');
  const [savingRole, setSavingRole] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const byId = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (!byId.error && byId.data) {
      setProfile(byId.data as LooseRow);
      setGradeValue(firstText(byId.data as LooseRow, ['user_grade', 'grade', 'grado', 'organizer_grade'], ''));
      setLocationText(firstText(byId.data as LooseRow, ['location_description', 'location_text', 'descrizione_location'], ''));
      return;
    }

    const byUserId = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();

    if (!byUserId.error && byUserId.data) {
      setProfile(byUserId.data as LooseRow);
      setGradeValue(firstText(byUserId.data as LooseRow, ['user_grade', 'grade', 'grado', 'organizer_grade'], ''));
      setLocationText(firstText(byUserId.data as LooseRow, ['location_description', 'location_text', 'descrizione_location'], ''));
      return;
    }

    setProfile(null);
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadProfile();
      if (mounted) setLoading(false);
    }

    start();

  return () => {
      mounted = false;
    };
  }, [loadProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  const currentProfileId = String(firstValue(profile, ['id', 'user_id']) || userId);


  const reactivateUser = useCallback(async () => {
    if (!profile) return;

    Alert.alert('Riattivare utente', `Vuoi riattivare ${profileName(profile)}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Riattiva',
        onPress: async () => {
          const result = await tryUpdateProfile(currentProfileId, [
            {
              deleted_at: null,
              removed_at: null,
              archived_at: null,
              blocked_until: null,
              suspended_until: null,
              is_deleted: false,
              deleted: false,
              is_removed: false,
              removed: false,
              archived: false,
              blocked: false,
              suspended: false,
              status: 'active',
              stato: 'active',
              account_status: 'active',
              updated_at: new Date().toISOString(),
            },
            {
              deleted_at: null,
              is_deleted: false,
              status: 'active',
              updated_at: new Date().toISOString(),
            },
            {
              status: 'active',
              updated_at: new Date().toISOString(),
            },
          ]);

          if (!result.ok) {
            Alert.alert('Errore riattivazione', result.message || 'Non sono riuscito a riattivare questo utente.');
            return;
          }

          Alert.alert('Utente riattivato', 'Il profilo è di nuovo attivo.');
          await loadProfile();
        },
      },
    ]);
  }, [currentProfileId, loadProfile, profile]);

  const updateAdminRoleFields = useCallback(async (payload: LooseRow, successMessage: string) => {
    if (!profile) return;

    setSavingRole(true);

    try {
      const result = await tryUpdateProfile(currentProfileId, [
        payload,
        {
          ...payload,
          updated_at: new Date().toISOString(),
        },
      ]);

      if (!result.ok) {
        Alert.alert('Errore aggiornamento', result.message || 'Non sono riuscito ad aggiornare il profilo.');
        return;
      }

      Alert.alert('Aggiornato', successMessage);
      await loadProfile();
    } catch (error: any) {
      Alert.alert('Errore aggiornamento', error?.message || 'Non sono riuscito ad aggiornare il profilo.');
    } finally {
      setSavingRole(false);
    }
  }, [currentProfileId, loadProfile, profile]);

  const togglePremium = useCallback(() => {
    const active = booleanFromRow(profile, ['is_premium', 'premium', 'premium_user'], false);

    updateAdminRoleFields(
      {
        is_premium: !active,
        premium: !active,
      },
      !active ? 'Premium attivato.' : 'Premium disattivato.'
    );
  }, [profile, updateAdminRoleFields]);

  const toggleLocation = useCallback(() => {
    const active = booleanFromRow(profile, ['is_location', 'location', 'location_user'], false);

    updateAdminRoleFields(
      {
        is_location: !active,
        location: !active,
      },
      !active ? 'Location attivato.' : 'Location disattivato.'
    );
  }, [profile, updateAdminRoleFields]);

  const saveGrade = useCallback(() => {
    updateAdminRoleFields(
      {
        user_grade: gradeValue.trim(),
        grade: gradeValue.trim(),
        grado: gradeValue.trim(),
      },
      'Grado utente aggiornato.'
    );
  }, [gradeValue, updateAdminRoleFields]);

  const saveLocationText = useCallback(() => {
    updateAdminRoleFields(
      {
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
        },
      },
    ]);
  }, [currentProfileId, loadProfile, profile]);

  const deleteUser = useCallback(() => {
    if (!profile) return;

    Alert.alert('Disattivare utente', `Vuoi eliminare/disattivare ${profileName(profile)}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          const result = await trySoftDeleteProfile(currentProfileId, profile);

          if (!result.ok) {
            Alert.alert('Errore', result.message);
            return;
          }

          Alert.alert('Fatto', 'Utente disattivato.');
          router.replace('/admin-users');
        },
      },
    ]);
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
            <Text style={styles.name}>{profileName(profile)}</Text>
            <Text style={styles.email}>{firstText(profile, ['email'], 'Email non disponibile')}</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Stato</Text>
              <Text style={styles.detailValue}>{profileStatus(profile)}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Città / Età / Genere</Text>
              <Text style={styles.detailValue}>
                {firstText(profile, ['city', 'citta', 'comune'], 'Città non indicata')} ·{' '}
                {firstText(profile, ['age', 'eta', 'età'], 'età non indicata')} ·{' '}
                {firstText(profile, ['gender', 'genere', 'sex'], 'genere non indicato')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ID</Text>
              <Text style={styles.detailValue}>{currentProfileId}</Text>
            </View>

            <Pressable style={styles.reactivateButton} onPress={reactivateUser}>
              <Text style={styles.reactivateButtonText}>Riattiva utente</Text>
            </Pressable>

            <View style={styles.roleCard}>
              <Text style={styles.roleTitle}>Gestione Premium / Location / Grado</Text>

              <View style={styles.roleButtonsRow}>
                <Pressable
                  style={[
                    styles.roleButton,
                    booleanFromRow(profile, ['is_premium', 'premium', 'premium_user'], false) && styles.roleButtonActive,
                    savingRole && styles.roleButtonDisabled,
                  ]}
                  onPress={togglePremium}
                  disabled={savingRole}
                >
                  <Text style={styles.roleButtonText}>
                    {booleanFromRow(profile, ['is_premium', 'premium', 'premium_user'], false) ? 'Premium ON' : 'Premium OFF'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.roleButton,
                    booleanFromRow(profile, ['is_location', 'location', 'location_user'], false) && styles.roleButtonActive,
                    savingRole && styles.roleButtonDisabled,
                  ]}
                  onPress={toggleLocation}
                  disabled={savingRole}
                >
                  <Text style={styles.roleButtonText}>
                    {booleanFromRow(profile, ['is_location', 'location', 'location_user'], false) ? 'Location ON' : 'Location OFF'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.roleLabel}>Grado utente</Text>
              <TextInput
                value={gradeValue}
                onChangeText={setGradeValue}
                placeholder="Es. Organizzatore top, Partner, Staff"
                placeholderTextColor="#a95d86"
                style={styles.roleInput}
              />
              <Pressable style={[styles.roleSaveButton, savingRole && styles.roleButtonDisabled]} onPress={saveGrade} disabled={savingRole}>
                <Text style={styles.roleSaveButtonText}>Salva grado</Text>
              </Pressable>

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
              <Pressable style={[styles.roleSaveButton, savingRole && styles.roleButtonDisabled]} onPress={saveLocationText} disabled={savingRole}>
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
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  roleButtonActive: {
    backgroundColor: '#e43f98',
    borderColor: '#e43f98',
  },
  roleButtonDisabled: {
    opacity: 0.65,
  },
  roleButtonText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  roleLabel: {
    marginTop: 8,
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
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
  name: {
    color: '#4b1430',
    fontSize: 24,
    fontWeight: '900',
  },
  email: {
    color: '#7b4960',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
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
  warningButton: {
    backgroundColor: '#9b1f61',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
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
