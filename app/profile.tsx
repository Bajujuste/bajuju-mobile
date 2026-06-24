import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
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

type ContactItem = {
  id: string;
  table: string;
  raw: LooseRow;
  title: string;
  subtitle: string;
  status: string;
};

type InviteItem = {
  id: string;
  table: string;
  raw: LooseRow;
  title: string;
  subtitle: string;
  status: string;
};

type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  raw: LooseRow;
};

const AGE_OPTIONS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const GENDER_OPTIONS = [
  { value: 'M', label: 'Uomo' },
  { value: 'F', label: 'Donna' },
  { value: 'NS', label: 'Preferisco non specificarlo' },
];

const PROFILE_TABLE = 'profiles';

function firstText(row: LooseRow | null | undefined, keys: string[], fallback = '') {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number') return String(value);
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

function firstKey(row: LooseRow | null | undefined, keys: string[], fallback: string) {
  if (!row) return fallback;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return key;
  }
  return fallback;
}

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

function formatDate(value: any) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function activityTitle(row: LooseRow) {
  return firstText(row, ['title', 'titolo', 'name', 'nome', 'activity_title'], 'Esperienza Bajuju');
}

function activitySubtitle(row: LooseRow) {
  const city = firstText(row, ['city', 'citta', 'comune', 'location_city', 'province'], '');
  const date = firstText(row, ['start_at', 'starts_at', 'date_time', 'activity_date', 'data_ora', 'date', 'data'], '');
  const formattedDate = date ? formatDate(date) : '';
  return [city, formattedDate].filter(Boolean).join(' · ') || 'Dettagli non disponibili';
}

function normalizeMobileProfileDate(value: any) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const direct = new Date(trimmed);
    if (!Number.isNaN(direct.getTime())) return direct;

    const italianDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
    if (italianDate) {
      const [, day, month, year, hour = '0', minute = '0'] = italianDate;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function getMobileProfileActivityDate(row: LooseRow) {
  const value = firstValue(row, [
    'start_at',
    'starts_at',
    'start_time',
    'event_start_at',
    'activity_start_at',
    'scheduled_at',
    'date_time',
    'activity_date',
    'event_date',
    'data_ora',
    'date',
    'data',
    'day',
    'giorno',
  ]);

  return normalizeMobileProfileDate(value);
}

function isMobileProfileActivityDeleted(row: LooseRow) {
  const deletedValue = firstValue(row, [
    'deleted_at',
    'removed_at',
    'cancelled_at',
    'canceled_at',
    'archived_at',
  ]);

  if (deletedValue) return true;

  if (
    booleanFromRow(
      row,
      [
        'is_deleted',
        'deleted',
        'is_removed',
        'removed',
        'is_cancelled',
        'is_canceled',
        'cancelled',
        'canceled',
        'archived',
        'hidden',
      ],
      false
    )
  ) {
    return true;
  }

  const status = firstText(row, ['status', 'stato', 'state', 'activity_status', 'event_status'], '').toLowerCase().trim();

  return [
    'deleted',
    'eliminato',
    'eliminata',
    'removed',
    'cancellato',
    'cancellata',
    'cancelled',
    'canceled',
    'annullato',
    'annullata',
    'archived',
    'archiviato',
    'archiviata',
    'closed',
    'chiuso',
    'chiusa',
  ].includes(status);
}

function isActivityOrganizedByUser(row: LooseRow, userId: string) {
  const organizerId = firstValue(row, ['creator_id', 'organizer_id', 'created_by', 'user_id', 'profile_id']);
  return organizerId ? String(organizerId) === String(userId) : false;
}

function isActivityVisibleInMobileProfile(row: LooseRow) {
  if (isMobileProfileActivityDeleted(row)) return false;

  const activityDate = getMobileProfileActivityDate(row);
  if (!activityDate) return false;

  const now = new Date();

  return activityDate.getTime() >= now.getTime();
}

function sortMobileProfileActivities(rows: LooseRow[]) {
  return rows
    .filter(isActivityVisibleInMobileProfile)
    .sort((a, b) => {
      const dateA = getMobileProfileActivityDate(a)?.getTime() || 0;
      const dateB = getMobileProfileActivityDate(b)?.getTime() || 0;
      return dateA - dateB;
    })
    .slice(0, 20);
}


function contactTitle(row: LooseRow) {
  return firstText(
    row,
    ['from_nickname', 'sender_nickname', 'requester_nickname', 'nickname', 'from_name', 'sender_name'],
    'Richiesta contatto'
  );
}

function inviteTitle(row: LooseRow) {
  return firstText(row, ['activity_title', 'title', 'titolo', 'name', 'nome'], 'Invito a una esperienza');
}

function getRowId(row: LooseRow) {
  const id = firstValue(row, ['id', 'request_id', 'invite_id']);
  return id ? String(id) : `${Date.now()}-${Math.random()}`;
}

async function tryReadOneProfile(userId: string) {
  const byId = await supabase.from(PROFILE_TABLE).select('*').eq('id', userId).maybeSingle();
  if (!byId.error && byId.data) return byId.data as LooseRow;

  const byUserId = await supabase.from(PROFILE_TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (!byUserId.error && byUserId.data) return byUserId.data as LooseRow;

  return null;
}

async function safeSelectRows(table: string, userColumns: string[], userId: string, maxRows = 10) {
  for (const column of userColumns) {
    try {
      let result = await supabase
        .from(table)
        .select('*')
        .eq(column, userId)
        .order('created_at', { ascending: false })
        .limit(maxRows);

      if (result.error) {
        result = await supabase
          .from(table)
          .select('*')
          .eq(column, userId)
          .limit(maxRows);
      }

      if (!result.error && Array.isArray(result.data)) {
        return { table, rows: result.data as LooseRow[] };
      }
    } catch {
      // Prova la combinazione successiva senza bloccare il profilo.
    }
  }

  return { table, rows: [] as LooseRow[] };
}

async function safeUpdateStatus(table: string, id: string, status: string) {
  const attempts = [
    { status },
    { stato: status },
    { request_status: status },
  ];

  for (const payload of attempts) {
    try {
      const result = await supabase.from(table).update(payload).eq('id', id);
      if (!result.error) return true;
    } catch {
      // Prova il prossimo nome campo.
    }
  }

  return false;
}

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<LooseRow | null>(null);
  const [profile, setProfile] = useState<LooseRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [city, setCity] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [gender, setGender] = useState('');
  const [directContactsEnabled, setDirectContactsEnabled] = useState(true);

  const [contactRequests, setContactRequests] = useState<ContactItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [organizedActivities, setOrganizedActivities] = useState<ActivityItem[]>([]);
  const [participatedActivities, setParticipatedActivities] = useState<ActivityItem[]>([]);

  const name = useMemo(() => {
    return firstText(profile, ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'], user?.email || 'Profilo Bajuju');
  }, [profile, user]);

  const photoUrl = useMemo(() => {
    return firstText(profile, ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto'], '');
  }, [profile]);

  const profileIdField = useMemo(() => {
    if (profile?.id && user?.id && String(profile.id) === String(user.id)) return 'id';
    if (profile?.user_id && user?.id && String(profile.user_id) === String(user.id)) return 'user_id';
    return 'id';
  }, [profile, user]);

  const profileIdValue = useMemo(() => {
    if (profileIdField === 'user_id') return user?.id;
    return profile?.id || user?.id;
  }, [profileIdField, profile, user]);

  const checkAdmin = useCallback(async (currentUser: LooseRow, currentProfile: LooseRow | null) => {
    const directAdmin =
      booleanFromRow(currentProfile, ['is_admin', 'admin', 'is_master', 'master'], false) ||
      ['admin', 'master', 'superadmin'].includes(firstText(currentProfile, ['role', 'ruolo', 'user_role']).toLowerCase()) ||
      booleanFromRow(currentUser?.user_metadata, ['is_admin', 'admin'], false) ||
      ['admin', 'master', 'superadmin'].includes(firstText(currentUser?.user_metadata, ['role', 'ruolo']).toLowerCase());

    if (directAdmin) return true;

    const rpcNames = ['master_is_admin', 'is_current_user_admin', 'is_admin'];
    for (const rpcName of rpcNames) {
      try {
        const result = await supabase.rpc(rpcName as any);
        if (!result.error && result.data === true) return true;
      } catch {
        // Prova la RPC successiva.
      }
    }

    try {
      const result = await supabase.rpc('master_get_users_overview' as any);
      if (!result.error && result.data) return true;
    } catch {
      // Se la RPC non esiste o non hai permessi, non mostro Area Admin.
    }

    return false;
  }, []);

  const loadContactRequests = useCallback(async (userId: string) => {
    const tables = ['contact_requests', 'direct_contact_requests', 'user_contact_requests'];
    const columns = ['receiver_id', 'recipient_id', 'to_user_id', 'target_user_id', 'profile_id', 'user_id'];
    const collected: ContactItem[] = [];

    for (const table of tables) {
      const result = await safeSelectRows(table, columns, userId, 20);
      const mapped = result.rows
        .filter((row) => {
          const status = firstText(row, ['status', 'stato', 'request_status'], 'pending').toLowerCase();
          return ['pending', 'in_attesa', 'attesa', 'new', 'nuova'].includes(status);
        })
        .map((row) => ({
          id: getRowId(row),
          table: result.table,
          raw: row,
          title: contactTitle(row),
          subtitle: firstText(row, ['message', 'messaggio', 'note'], 'Vuole condividere un contatto diretto.'),
          status: firstText(row, ['status', 'stato', 'request_status'], 'pending'),
        }));
      collected.push(...mapped);
    }

    const unique = new Map<string, ContactItem>();
    for (const item of collected) unique.set(`${item.table}-${item.id}`, item);
    setContactRequests(Array.from(unique.values()));
  }, []);

  const loadInvites = useCallback(async (userId: string) => {
    const tables = ['activity_invitations', 'activity_invites', 'event_invites', 'invitations'];
    const columns = ['receiver_id', 'recipient_id', 'to_user_id', 'invited_user_id', 'user_id', 'profile_id'];
    const collected: InviteItem[] = [];

    for (const table of tables) {
      const result = await safeSelectRows(table, columns, userId, 20);
      const mapped = result.rows
        .filter((row) => {
          const status = firstText(row, ['status', 'stato', 'invite_status'], 'pending').toLowerCase();
          return ['pending', 'in_attesa', 'attesa', 'invited', 'new', 'nuova'].includes(status);
        })
        .map((row) => ({
          id: getRowId(row),
          table: result.table,
          raw: row,
          title: inviteTitle(row),
          subtitle: firstText(row, ['message', 'messaggio', 'note'], 'Hai ricevuto un invito.'),
          status: firstText(row, ['status', 'stato', 'invite_status'], 'pending'),
        }));
      collected.push(...mapped);
    }

    const unique = new Map<string, InviteItem>();
    for (const item of collected) unique.set(`${item.table}-${item.id}`, item);
    setInvites(Array.from(unique.values()));
  }, []);

  const loadActivities = useCallback(async (userId: string) => {
    const organizerColumns = ['creator_id', 'organizer_id', 'created_by', 'user_id', 'profile_id'];
    let organizedRows: LooseRow[] = [];

    for (const column of organizerColumns) {
      try {
        const result = await supabase
          .from('activities')
          .select('*')
          .eq(column, userId)
          .limit(80);

        if (!result.error && Array.isArray(result.data)) {
          organizedRows = result.data as LooseRow[];
          break;
        }
      } catch {
        // Prova il prossimo campo.
      }
    }

    const visibleOrganizedRows = sortMobileProfileActivities(organizedRows);

    setOrganizedActivities(
      visibleOrganizedRows.map((row) => ({
        id: String(firstValue(row, ['id', 'activity_id']) || `${Date.now()}-${Math.random()}`),
        title: activityTitle(row),
        subtitle: activitySubtitle(row),
        raw: row,
      }))
    );

    const participantTables = ['activity_participants', 'event_participants', 'participants'];
    const participantColumns = ['user_id', 'profile_id', 'participant_id'];
    let participationRows: LooseRow[] = [];

    for (const table of participantTables) {
      const result = await safeSelectRows(table, participantColumns, userId, 80);
      if (result.rows.length > 0) {
        participationRows = result.rows;
        break;
      }
    }

    const activityIds = Array.from(
      new Set(
        participationRows
          .filter((row) => {
            const status = firstText(row, ['status', 'stato', 'participant_status'], '').toLowerCase().trim();
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
          })
          .map((row) => firstValue(row, ['activity_id', 'event_id', 'experience_id']))
          .filter(Boolean)
          .map(String)
      )
    );

    if (activityIds.length === 0) {
      setParticipatedActivities([]);
      return;
    }

    try {
      const result = await supabase.from('activities').select('*').in('id', activityIds).limit(80);

      if (!result.error && Array.isArray(result.data)) {
        const visibleParticipatedRows = sortMobileProfileActivities(result.data as LooseRow[]).filter(
          (row) => !isActivityOrganizedByUser(row, userId)
        );

        setParticipatedActivities(
          visibleParticipatedRows.map((row) => ({
            id: String(firstValue(row, ['id', 'activity_id']) || `${Date.now()}-${Math.random()}`),
            title: activityTitle(row),
            subtitle: activitySubtitle(row),
            raw: row,
          }))
        );
        return;
      }
    } catch {
      // Se activities non risponde, non mostro partecipazioni grezze.
    }

    setParticipatedActivities([]);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);

    const authResult = await supabase.auth.getUser();
    const currentUser = authResult.data.user as LooseRow | null;

    if (!currentUser) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      Alert.alert('Accesso richiesto', 'Devi fare login per vedere il profilo.');
      router.replace('/');
      return;
    }

    setUser(currentUser);

    const currentProfile = await tryReadOneProfile(String(currentUser.id));
    setProfile(currentProfile);

    setCity(firstText(currentProfile, ['city', 'citta', 'comune', 'location_city'], ''));
    setAgeRange(firstText(currentProfile, ['age_range', 'fascia_eta', 'age_band', 'eta_range'], ''));
    setGender(firstText(currentProfile, ['gender', 'genere', 'sex'], ''));
    setDirectContactsEnabled(
      booleanFromRow(
        currentProfile,
        ['allow_direct_contacts', 'direct_contacts_enabled', 'receive_direct_contacts', 'ricevi_contatti_diretti'],
        true
      )
    );

    const admin = await checkAdmin(currentUser, currentProfile);
    setIsAdmin(admin);

    await Promise.all([
      loadContactRequests(String(currentUser.id)),
      loadInvites(String(currentUser.id)),
      loadActivities(String(currentUser.id)),
    ]);

    setLoading(false);
  }, [checkAdmin, loadActivities, loadContactRequests, loadInvites, router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const saveProfile = useCallback(async () => {
    if (!user) return;

    setSaving(true);

    const cityField = firstKey(profile, ['city', 'citta', 'comune', 'location_city'], 'city');
    const ageField = firstKey(profile, ['age_range', 'fascia_eta', 'age_band', 'eta_range'], 'age_range');
    const genderField = firstKey(profile, ['gender', 'genere', 'sex'], 'gender');
    const directContactsField = firstKey(
      profile,
      ['allow_direct_contacts', 'direct_contacts_enabled', 'receive_direct_contacts', 'ricevi_contatti_diretti'],
      'allow_direct_contacts'
    );

    const payload: LooseRow = {
      [cityField]: city.trim(),
      [ageField]: ageRange,
      [genderField]: gender,
      allow_direct_contacts: directContactsEnabled,
    };

    if (profile && Object.prototype.hasOwnProperty.call(profile, directContactsField)) {
      payload[directContactsField] = directContactsEnabled;
    }

    if (profile && Object.prototype.hasOwnProperty.call(profile, 'updated_at')) {
      payload.updated_at = new Date().toISOString();
    }

    try {
      if (profile) {
        const updateResult = await supabase.from(PROFILE_TABLE).update(payload).eq(profileIdField, profileIdValue);
        if (updateResult.error) throw updateResult.error;
      } else {
        const insertPayload: LooseRow = {
          id: user.id,
          email: user.email,
          ...payload,
        };
        const upsertResult = await supabase.from(PROFILE_TABLE).upsert(insertPayload);
        if (upsertResult.error) throw upsertResult.error;
      }

      Alert.alert('Profilo salvato', 'Le modifiche sono state registrate.');
      await loadAll();
    } catch (error: any) {
      Alert.alert('Errore salvataggio', error?.message || 'Non sono riuscito a salvare il profilo.');
    } finally {
      setSaving(false);
    }
  }, [ageRange, city, directContactsEnabled, gender, loadAll, profile, profileIdField, profileIdValue, user]);

  const answerItem = useCallback(
    async (item: ContactItem | InviteItem, status: 'accepted' | 'rejected') => {
      const ok = await safeUpdateStatus(item.table, item.id, status);
      if (!ok) {
        Alert.alert('Errore', 'Non sono riuscito ad aggiornare questa richiesta.');
        return;
      }
      await loadAll();
    },
    [loadAll]
  );

  const requestProfileDeletion = useCallback(async () => {
    if (!user) return;

    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm('Vuoi inviare una richiesta di eliminazione del profilo?')
        : true;

    if (!confirmed) return;

    const payload = {
      user_id: user.id,
      email: user.email,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const attempts = [
      () => supabase.from('profile_deletion_requests').insert(payload),
      () => supabase.from('deletion_requests').insert(payload),
      () => supabase.from(PROFILE_TABLE).update({ deletion_requested_at: new Date().toISOString() }).eq(profileIdField, profileIdValue),
    ];

    for (const attempt of attempts) {
      try {
        const result = await attempt();

        if (!result.error) {
          if (typeof window !== 'undefined') {
            window.alert('Richiesta di eliminazione profilo registrata.');
          } else {
            Alert.alert('Richiesta inviata', 'La richiesta di eliminazione profilo è stata registrata.');
          }

          return;
        }

        console.log('Errore richiesta eliminazione:', result.error.message);
      } catch (error) {
        console.log('Errore richiesta eliminazione:', error);
      }
    }

    if (typeof window !== 'undefined') {
      window.alert('Non sono riuscito a registrare la richiesta di eliminazione.');
    } else {
      Alert.alert('Errore', 'Non sono riuscito a registrare la richiesta di eliminazione.');
    }
  }, [profileIdField, profileIdValue, user]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/');
  }, [router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Carico il profilo...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerCard}>
        <View style={styles.photoBox}>
          {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} /> : <Text style={styles.photoFallback}>🐼</Text>}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {isAdmin ? <Text style={styles.adminBadge}>Admin</Text> : null}
        </View>
      </View>

      {isAdmin ? (
        <Pressable style={styles.adminButton} onPress={() => router.push('/admin')}>
          <Text style={styles.adminButtonText}>Apri Area Admin</Text>
        </Pressable>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Dati profilo</Text>

        <Text style={styles.label}>Città</Text>
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder="Scrivi la tua città"
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Fascia d’età</Text>
        <View style={styles.optionsGrid}>
          {AGE_OPTIONS.map((option) => (
            <Pressable
              key={option}
              style={[styles.option, ageRange === option && styles.optionActive]}
              onPress={() => setAgeRange(option)}
            >
              <Text style={[styles.optionText, ageRange === option && styles.optionTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Genere</Text>
        <View style={styles.optionsColumn}>
          {GENDER_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.optionWide, gender === option.value && styles.optionActive]}
              onPress={() => setGender(option.value)}
            >
              <Text style={[styles.optionText, gender === option.value && styles.optionTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.toggleRow, directContactsEnabled && styles.toggleRowActive]}
          onPress={() => setDirectContactsEnabled((current) => !current)}
        >
          <View>
            <Text style={styles.toggleTitle}>Contatti diretti</Text>
            <Text style={styles.toggleSubtitle}>{directContactsEnabled ? 'Attivi' : 'Disattivati'}</Text>
          </View>
          <Text style={styles.toggleValue}>{directContactsEnabled ? 'ON' : 'OFF'}</Text>
        </Pressable>

        <Pressable style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Salvataggio...' : 'Salva modifiche'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Richieste contatto</Text>
        {contactRequests.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna richiesta contatto.</Text>
        ) : (
          contactRequests.map((item) => (
            <View key={`${item.table}-${item.id}`} style={styles.itemBox}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
              <View style={styles.rowButtons}>
                <Pressable style={styles.smallButton} onPress={() => answerItem(item, 'accepted')}>
                  <Text style={styles.smallButtonText}>Accetta</Text>
                </Pressable>
                <Pressable style={styles.smallButtonGhost} onPress={() => answerItem(item, 'rejected')}>
                  <Text style={styles.smallButtonGhostText}>Rifiuta</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Inviti</Text>
        {invites.length === 0 ? (
          <Text style={styles.emptyText}>Nessun invito ricevuto.</Text>
        ) : (
          invites.map((item) => (
            <View key={`${item.table}-${item.id}`} style={styles.itemBox}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
              <View style={styles.rowButtons}>
                <Pressable style={styles.smallButton} onPress={() => answerItem(item, 'accepted')}>
                  <Text style={styles.smallButtonText}>Accetta</Text>
                </Pressable>
                <Pressable style={styles.smallButtonGhost} onPress={() => answerItem(item, 'rejected')}>
                  <Text style={styles.smallButtonGhostText}>Rifiuta</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Attività organizzate</Text>
        {organizedActivities.length === 0 ? (
          <Text style={styles.emptyText}>Non hai ancora organizzato attività.</Text>
        ) : (
          organizedActivities.map((activity) => (
            <View key={activity.id} style={styles.activityRow}>
              <Text style={styles.itemTitle}>{activity.title}</Text>
              <Text style={styles.itemSubtitle}>{activity.subtitle}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Attività a cui partecipi</Text>
        {participatedActivities.length === 0 ? (
          <Text style={styles.emptyText}>Non stai partecipando ad attività.</Text>
        ) : (
          participatedActivities.map((activity) => (
            <View key={activity.id} style={styles.activityRow}>
              <Text style={styles.itemTitle}>{activity.title}</Text>
              <Text style={styles.itemSubtitle}>{activity.subtitle}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Privacy e regole</Text>
        <Pressable style={styles.linkButton} onPress={() => router.push('/privacy')}>
          <Text style={styles.linkButtonText}>Apri Privacy Policy</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => router.push('/rules')}>
          <Text style={styles.linkButtonText}>Apri Regole community</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={requestProfileDeletion}>
          <Text style={styles.deleteButtonText}>Richiedi eliminazione profilo</Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Esci</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#fff7fb',
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7fb',
  },
  loadingText: {
    marginTop: 12,
    color: '#5f2148',
    fontWeight: '700',
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffd6ea',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  photoBox: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#ffe3f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ff7ab8',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    fontSize: 34,
  },
  headerText: {
    flex: 1,
    marginLeft: 14,
  },
  name: {
    fontSize: 24,
    fontWeight: '900',
    color: '#311028',
  },
  email: {
    marginTop: 4,
    fontSize: 13,
    color: '#7a4267',
  },
  adminBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#ff2f92',
    color: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '900',
    overflow: 'hidden',
  },
  adminButton: {
    marginTop: 14,
    backgroundColor: '#311028',
    borderRadius: 18,
    padding: 15,
    alignItems: 'center',
  },
  adminButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
  },
  card: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd6ea',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#311028',
    marginBottom: 12,
  },
  label: {
    marginTop: 10,
    marginBottom: 7,
    color: '#5f2148',
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderColor: '#f4bdd8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#311028',
    backgroundColor: '#fffaff',
    fontWeight: '700',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionsColumn: {
    gap: 8,
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f4bdd8',
    backgroundColor: '#fffaff',
  },
  optionWide: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f4bdd8',
    backgroundColor: '#fffaff',
  },
  optionActive: {
    backgroundColor: '#ff2f92',
    borderColor: '#ff2f92',
  },
  optionText: {
    color: '#5f2148',
    fontWeight: '800',
  },
  optionTextActive: {
    color: '#ffffff',
  },
  toggleRow: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#f4bdd8',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fffaff',
  },
  toggleRowActive: {
    borderColor: '#ff2f92',
  },
  toggleTitle: {
    color: '#311028',
    fontWeight: '900',
  },
  toggleSubtitle: {
    color: '#7a4267',
    marginTop: 2,
  },
  toggleValue: {
    color: '#ff2f92',
    fontWeight: '900',
    fontSize: 16,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#ff2f92',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
  },
  emptyText: {
    color: '#7a4267',
    fontWeight: '600',
  },
  itemBox: {
    borderWidth: 1,
    borderColor: '#f4bdd8',
    borderRadius: 16,
    padding: 13,
    marginBottom: 10,
    backgroundColor: '#fffaff',
  },
  itemTitle: {
    color: '#311028',
    fontWeight: '900',
    fontSize: 16,
  },
  itemSubtitle: {
    color: '#7a4267',
    marginTop: 4,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  smallButton: {
    flex: 1,
    backgroundColor: '#ff2f92',
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: 'center',
  },
  smallButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  smallButtonGhost: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff2f92',
  },
  smallButtonGhostText: {
    color: '#ff2f92',
    fontWeight: '900',
  },
  activityRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#f8d8e8',
    paddingVertical: 12,
  },
  linkButton: {
    borderWidth: 1,
    borderColor: '#ff2f92',
    borderRadius: 15,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#fffaff',
  },
  linkButtonText: {
    color: '#ff2f92',
    fontWeight: '900',
  },
  deleteButton: {
    borderRadius: 15,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#fff0f3',
    borderWidth: 1,
    borderColor: '#ff6b8a',
  },
  deleteButtonText: {
    color: '#b00020',
    fontWeight: '900',
  },
  logoutButton: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 14,
  },
  logoutButtonText: {
    color: '#7a4267',
    fontWeight: '900',
  },
});
