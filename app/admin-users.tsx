import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';

type LooseRow = Record<string, any>;

type UserItem = {
  id: string;
  email: string;
  name: string;
  city: string;
  age: number | null;
  gender: string;
  status: string;
  raw: LooseRow;
};

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
  if (!value) return 'Data non disponibile';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function userName(row: LooseRow) {
  return firstText(
    row,
    ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome', 'first_name', 'email'],
    'Utente Bajuju'
  );
}

function userEmail(row: LooseRow) {
  return firstText(row, ['email'], 'Email non disponibile');
}

function userId(row: LooseRow) {
  return String(firstValue(row, ['id', 'user_id', 'profile_id']) || '');
}

function userAge(row: LooseRow) {
  const value = firstValue(row, ['age', 'eta', 'età', 'user_age', 'age_range']);
  const number = Number(value);

  if (Number.isFinite(number)) return number;

  return null;
}

function userGender(row: LooseRow) {
  return firstText(row, ['gender', 'genere', 'sex'], 'non indicato').toLowerCase();
}

function userStatus(row: LooseRow) {
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

async function tryUpdateById(table: string, id: string, payloads: LooseRow[]) {
  for (const payload of payloads) {
    try {
      const result = await supabase.from(table).update(payload).eq('id', id);

      if (!result.error) return { ok: true, message: '' };
    } catch {
      // Prova payload successivo.
    }
  }

  return { ok: false, message: 'Aggiornamento non riuscito. Probabile policy Supabase o colonne mancanti.' };
}

export default function AdminUsersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [genderFilter, setGenderFilter] = useState('tutti');
  const [ageFilter, setAgeFilter] = useState('tutte');

  const filteredUsers = useMemo(() => {
    return users.filter((item) => {
      const genderOk =
        genderFilter === 'tutti' ||
        item.gender === genderFilter ||
        (genderFilter === 'non indicato' && (!item.gender || item.gender === 'non indicato'));

      const age = item.age || 0;

      const ageOk =
        ageFilter === 'tutte' ||
        (ageFilter === '18-25' && age >= 18 && age <= 25) ||
        (ageFilter === '26-35' && age >= 26 && age <= 35) ||
        (ageFilter === '36-50' && age >= 36 && age <= 50) ||
        (ageFilter === '51+' && age >= 51);

      return genderOk && ageOk;
    });
  }, [ageFilter, genderFilter, users]);

  const loadUsers = useCallback(async () => {
    const result = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250);

    if (result.error) {
      setUsers([]);
      Alert.alert('Errore', result.error.message || 'Non sono riuscito a caricare gli utenti.');
      return;
    }

    const mapped = ((result.data || []) as LooseRow[])
      .map((row) => ({
        id: userId(row),
        email: userEmail(row),
        name: userName(row),
        city: firstText(row, ['city', 'citta', 'comune', 'location_city'], 'Città non indicata'),
        age: userAge(row),
        gender: userGender(row),
        status: userStatus(row),
        raw: row,
      }))
      .filter((item) => Boolean(item.id));

    setUsers(mapped);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadUsers();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  }, [loadUsers]);

  const suspendUser = useCallback(
    async (item: UserItem) => {
      Alert.alert('Sospendere utente', `Vuoi sospendere ${item.name}?`, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sospendi',
          style: 'destructive',
          onPress: async () => {
            const now = new Date().toISOString();
            const result = await tryUpdateById('profiles', item.id, [
              { status: 'suspended', suspended_at: now },
              { account_status: 'suspended', suspended_at: now },
              { stato: 'sospeso' },
            ]);

            if (!result.ok) {
              Alert.alert('Errore', result.message);
              return;
            }

            Alert.alert('Fatto', 'Utente sospeso.');
            await loadUsers();
          },
        },
      ]);
    },
    [loadUsers]
  );

  const blockUserSevenDays = useCallback(
    async (item: UserItem) => {
      const blockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      Alert.alert('Bloccare utente', `Vuoi bloccare ${item.name} per una settimana?`, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Blocca 7 giorni',
          style: 'destructive',
          onPress: async () => {
            const result = await tryUpdateById('profiles', item.id, [
              { blocked_until: blockedUntil, status: 'blocked' },
              { blocked_until: blockedUntil, account_status: 'blocked' },
              { is_blocked: true, blocked_until: blockedUntil },
              { bloccato_fino: blockedUntil, stato: 'bloccato' },
            ]);

            if (!result.ok) {
              Alert.alert('Errore', result.message);
              return;
            }

            Alert.alert('Fatto', 'Utente bloccato per 7 giorni.');
            await loadUsers();
          },
        },
      ]);
    },
    [loadUsers]
  );

  const deleteUser = useCallback(
    async (item: UserItem) => {
      Alert.alert(
        'Eliminare utente',
        `Vuoi eliminare/disattivare ${item.name}?`,
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Elimina',
            style: 'destructive',
            onPress: async () => {
              const now = new Date().toISOString();
              const result = await tryUpdateById('profiles', item.id, [
                { deleted_at: now, status: 'deleted' },
                { deleted_at: now, account_status: 'deleted' },
                { is_deleted: true, status: 'deleted' },
                { stato: 'eliminato' },
              ]);

              if (!result.ok) {
                Alert.alert('Errore', result.message);
                return;
              }

              Alert.alert('Fatto', 'Utente eliminato/disattivato.');
              setSelectedUser(null);
              await loadUsers();
            },
          },
        ]
      );
    },
    [loadUsers]
  );

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Area Admin</Text>
        <Text style={styles.title}>Iscritti totali</Text>
        <Text style={styles.text}>Utenti visibili: {filteredUsers.length} / {users.length}</Text>

        <Pressable style={styles.backButton} onPress={() => router.push('/admin')}>
          <Text style={styles.backButtonText}>← Torna ad Admin</Text>
        </Pressable>
      </View>

      <View style={styles.filtersCard}>
        <Text style={styles.sectionTitle}>Filtri</Text>

        <Text style={styles.filterLabel}>Genere</Text>
        <View style={styles.filterRow}>
          {['tutti', 'maschio', 'femmina', 'preferisco_non_specificarlo', 'non indicato'].map((item) => (
            <Pressable
              key={item}
              style={[styles.filterChip, genderFilter === item && styles.filterChipActive]}
              onPress={() => setGenderFilter(item)}
            >
              <Text style={[styles.filterChipText, genderFilter === item && styles.filterChipTextActive]}>
                {item === 'preferisco_non_specificarlo' ? 'non specificato' : item}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.filterLabel}>Età</Text>
        <View style={styles.filterRow}>
          {['tutte', '18-25', '26-35', '36-50', '51+'].map((item) => (
            <Pressable
              key={item}
              style={[styles.filterChip, ageFilter === item && styles.filterChipActive]}
              onPress={() => setAgeFilter(item)}
            >
              <Text style={[styles.filterChipText, ageFilter === item && styles.filterChipTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carico utenti...</Text>
        </View>
      ) : null}

      {selectedUser ? (
        <View style={[styles.card, styles.detailCard]}>
          <Text style={styles.sectionTitle}>Dettaglio utente</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Nome</Text>
            <Text style={styles.detailValue}>{selectedUser.name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{selectedUser.email}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Città / Età / Genere</Text>
            <Text style={styles.detailValue}>
              {selectedUser.city} · {selectedUser.age || 'età non indicata'} · {selectedUser.gender}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Stato</Text>
            <Text style={styles.detailValue}>{selectedUser.status}</Text>
          </View>

          <View style={styles.actionGrid}>
            <Pressable style={styles.warningButton} onPress={() => suspendUser(selectedUser)}>
              <Text style={styles.actionButtonText}>Sospendi utente</Text>
            </Pressable>

            <Pressable style={styles.warningButton} onPress={() => blockUserSevenDays(selectedUser)}>
              <Text style={styles.actionButtonText}>Blocca 7 giorni</Text>
            </Pressable>

            <Pressable style={styles.dangerButton} onPress={() => deleteUser(selectedUser)}>
              <Text style={styles.actionButtonText}>Elimina utente</Text>
            </Pressable>

            <Pressable style={styles.ghostButton} onPress={() => setSelectedUser(null)}>
              <Text style={styles.ghostButtonText}>Chiudi dettaglio</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Elenco iscritti</Text>

        {filteredUsers.length === 0 ? (
          <Text style={styles.emptyText}>Nessun utente trovato con questi filtri.</Text>
        ) : (
          filteredUsers.map((item) => (
            <Pressable key={item.id} style={styles.listRow} onPress={() => setSelectedUser(item)}>
              <View style={styles.listTextBox}>
                <Text style={styles.listTitle}>{item.name}</Text>
                <Text style={styles.listSubtitle}>{item.email}</Text>
                <Text style={styles.listSubtitle}>
                  {item.city} · {item.age || 'età n.d.'} · {item.gender} · {item.status}
                </Text>
              </View>
              <Text style={styles.openText}>Apri →</Text>
            </Pressable>
          ))
        )}
      </View>
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
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  detailCard: {
    backgroundColor: '#fff3f9',
    borderColor: '#ef2d82',
  },
  filtersCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
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
    marginBottom: 8,
  },
  text: {
    color: '#4b1430',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    marginBottom: 14,
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
  sectionTitle: {
    color: '#4b1430',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 12,
  },
  filterLabel: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#ef2d82',
  },
  filterChipText: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  loadingText: {
    color: '#7b4960',
    fontWeight: '800',
    marginTop: 8,
  },
  emptyText: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    backgroundColor: '#fff8fb',
    padding: 14,
    borderRadius: 16,
  },
  listRow: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listTextBox: {
    flex: 1,
  },
  listTitle: {
    color: '#4b1430',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  listSubtitle: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  openText: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 13,
  },
  detailRow: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 8,
  },
  detailLabel: {
    color: '#9b1f61',
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    color: '#4b1430',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 20,
  },
  actionGrid: {
    gap: 10,
    marginTop: 10,
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
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 15,
  },
  ghostButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef2d82',
  },
  ghostButtonText: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 15,
  },
});
