import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
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
import { sendBajujuPushNotification } from '../src/utils/bajujuNotifications';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

const LOCATION_OPTIONS = [
  'Bergamo',
  'Lecco',
  'Milano',
  'Monza e Brianza',
  'Verona',
];

const BAJUJU_CREATOR_EMAIL = 'royaleventi@gmail.com';
const BAJUJU_PINK = '#e43f98';

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

const GENDER_OPTIONS = [
  { value: 'maschio', label: 'Uomo' },
  { value: 'femmina', label: 'Donna' },
];

const PROFILE_TABLE = 'profiles';
const MOBILE_PROFILE_PAST_ACTIVITY_VISIBILITY_MS = 10 * 24 * 60 * 60 * 1000;

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

  const nowTime = Date.now();
  const activityTime = activityDate.getTime();

  if (activityTime >= nowTime) return true;

  return nowTime - activityTime <= MOBILE_PROFILE_PAST_ACTIVITY_VISIBILITY_MS;
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

async function blockedUserIdsForCurrentUser(currentUserId: string) {
  const [blockedByMeResult, blockedMeResult] = await Promise.all([
    supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId),
    supabase
      .from('user_blocks')
      .select('blocker_id')
      .eq('blocked_id', currentUserId),
  ]);

  const blockedIds = new Set<string>();

  (blockedByMeResult.data || []).forEach((row: any) => {
    if (row.blocked_id) blockedIds.add(String(row.blocked_id));
  });

  (blockedMeResult.data || []).forEach((row: any) => {
    if (row.blocker_id) blockedIds.add(String(row.blocker_id));
  });

  return blockedIds;
}

function contactOtherUserId(row: LooseRow) {
  return String(
    firstValue(row, ['requester_id', 'from_user_id', 'sender_id', 'created_by', 'creator_id', 'user_id']) || ''
  ).trim();
}

function inviteOtherUserId(row: LooseRow) {
  return String(
    firstValue(row, ['requester_id', 'from_user_id', 'sender_id', 'created_by', 'creator_id', 'user_id', 'inviter_id']) || ''
  ).trim();
}

function inviteTitle(row: LooseRow) {
  return firstText(row, ['activity_title', 'title', 'titolo', 'name', 'nome'], 'Invito a uscire');
}

function getRowId(row: LooseRow) {
  const id = firstValue(row, ['id', 'request_id', 'invite_id']);
  return id ? String(id) : `${Date.now()}-${Math.random()}`;
}

async function tryReadOneProfile(userId: string) {
  const byId = await supabase.from(PROFILE_TABLE).select('*').eq('id', userId).maybeSingle();
  if (!byId.error && byId.data) return byId.data as LooseRow;

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

  const cleanUserEmail = (user?.email || '').trim().toLowerCase();
  const isCreatorApp = cleanUserEmail === BAJUJU_CREATOR_EMAIL;
  const isAdminOrCreator = isAdmin || isCreatorApp;

  const [profileName, setProfileName] = useState('');
  const [province, setProvince] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [gender, setGender] = useState('');
  const [directContactsEnabled, setDirectContactsEnabled] = useState(true);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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

  const shouldShowProfilePhoto = Boolean(photoUrl) && !photoLoadError;

  const profileIdField = useMemo(() => {
    return 'id';
  }, []);

  const profileIdValue = useMemo(() => {
    return profile?.id || user?.id;
  }, [profile, user]);

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
    const blockedIds = await blockedUserIdsForCurrentUser(userId);
    const tables = ['contact_requests', 'direct_contact_requests', 'user_contact_requests'];
    const columns = ['receiver_id', 'recipient_id', 'to_user_id', 'target_user_id', 'profile_id', 'user_id'];
    const collected: ContactItem[] = [];

    for (const table of tables) {
      const result = await safeSelectRows(table, columns, userId, 20);
      const mapped = result.rows
        .filter((row) => {
          const status = firstText(row, ['status', 'stato', 'request_status'], 'pending').toLowerCase();
          const otherUserId = contactOtherUserId(row);
          return ['pending', 'in_attesa', 'attesa', 'new', 'nuova'].includes(status) && !blockedIds.has(otherUserId);
        })
        .map((row) => ({
          id: getRowId(row),
          table: result.table,
          raw: row,
          title: result.table === 'direct_contact_requests' ? 'Invito a uscire' : contactTitle(row),
          subtitle: firstText(
            row,
            ['message', 'messaggio', 'note'],
            result.table === 'direct_contact_requests'
              ? 'Una persona conosciuta in una esperienza Bajuju vorrebbe invitarti a vedervi fuori dall’evento.'
              : 'Una persona conosciuta in una esperienza Bajuju vuole restare in contatto con te.'
          ),
          status: firstText(row, ['status', 'stato', 'request_status'], 'pending'),
        }));
      collected.push(...mapped);
    }

    const unique = new Map<string, ContactItem>();
    for (const item of collected) unique.set(`${item.table}-${item.id}`, item);
    setContactRequests(Array.from(unique.values()));
  }, []);

  const loadInvites = useCallback(async (userId: string) => {
    const blockedIds = await blockedUserIdsForCurrentUser(userId);
    const tables = ['activity_invitations', 'activity_invites', 'event_invites', 'invitations'];
    const columns = ['receiver_id', 'recipient_id', 'to_user_id', 'invited_user_id', 'user_id', 'profile_id'];
    const collected: InviteItem[] = [];

    for (const table of tables) {
      const result = await safeSelectRows(table, columns, userId, 20);
      const mapped = result.rows
        .filter((row) => {
          const status = firstText(row, ['status', 'stato', 'invite_status'], 'pending').toLowerCase();
          const otherUserId = inviteOtherUserId(row);
          return ['pending', 'in_attesa', 'attesa', 'invited', 'new', 'nuova'].includes(status) && !blockedIds.has(otherUserId);
        })
        .map((row) => ({
          id: getRowId(row),
          table: result.table,
          raw: row,
          title: inviteTitle(row),
          subtitle: firstText(row, ['message', 'messaggio', 'note'], 'Vorrebbe invitarti a uscire fuori dall’esperienza.'),
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
          .neq('is_flash', true)
          .is('deleted_at', null)
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
      const result = await supabase
        .from('activities')
        .select('*')
        .in('id', activityIds)
        .neq('is_flash', true)
        .is('deleted_at', null)
        .limit(80);

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
    setPhotoLoadError(false);

    setProfileName(firstText(currentProfile, ['nickname', 'username', 'display_name', 'full_name', 'name', 'nome'], ''));
    const loadedProvince = firstText(currentProfile, ['province', 'provincia', 'location_province', 'preferred_province'], '');

    setProvince(loadedProvince);
    setAgeRange(firstText(currentProfile, ['age', 'eta', 'età', 'user_age', 'age_range', 'fascia_eta', 'age_band', 'eta_range'], ''));
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

  const uploadProfilePhoto = useCallback(async () => {
    if (!user) {
      Alert.alert('Accesso richiesto', 'Devi fare login per caricare la foto profilo.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permesso necessario', 'Per scegliere la foto profilo devi autorizzare l’accesso alle immagini.');
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.78,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      setUploadingPhoto(true);

      const asset = picked.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const extensionFromUri = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase();
      const extension = extensionFromUri && extensionFromUri.length <= 5 ? extensionFromUri : 'jpg';
      const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
      const filePath = `${user.id}/profile-${Date.now()}.${extension}`;

      const uploadResult = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      const publicUrlResult = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = publicUrlResult.data.publicUrl;

      if (!publicUrl) {
        throw new Error('URL foto non disponibile.');
      }

      const photoField = firstKey(
        profile,
        ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto'],
        'avatar_url'
      );

      const payload: LooseRow = {
        [photoField]: publicUrl,
        avatar_url: publicUrl,
      };

      if (profile && Object.prototype.hasOwnProperty.call(profile, 'updated_at')) {
        payload.updated_at = new Date().toISOString();
      }

      if (profile) {
        const updateResult = await supabase
          .from(PROFILE_TABLE)
          .update(payload)
          .eq(profileIdField, profileIdValue);

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

      setPhotoLoadError(false);
      Alert.alert('Foto aggiornata', 'La foto profilo è stata caricata correttamente.');
      await loadAll();
    } catch (error: any) {
      Alert.alert(
        'Errore foto profilo',
        error?.message ||
          'Non sono riuscito a caricare la foto. Controlla che in Supabase esista il bucket Storage chiamato avatars.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  }, [loadAll, profile, profileIdField, profileIdValue, user]);

  const saveProfile = useCallback(async () => {
    if (!user) return;

    const cleanProvince = province.trim();
    const cleanAge = ageRange.trim();

    if (!photoUrl) {
      Alert.alert('Foto obbligatoria', 'Per usare Bajuju devi caricare una foto profilo reale.');
      return;
    }

    if (!cleanProvince || !cleanAge) {
      Alert.alert('Dati mancanti', 'Scegli provincia ed età.');
      return;
    }

    if (!LOCATION_OPTIONS.includes(cleanProvince)) {
      Alert.alert('Provincia non valida', 'Scegli una provincia dall’elenco.');
      return;
    }

    const numericAge = Number(cleanAge);

    if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 99) {
      Alert.alert('Età non valida', 'Inserisci un’età reale. Bajuju è riservato a utenti maggiorenni.');
      return;
    }

    setSaving(true);

    const provinceField = firstKey(profile, ['province', 'provincia', 'location_province'], 'province');
    const ageField = firstKey(profile, ['age', 'eta', 'età', 'user_age', 'age_range', 'fascia_eta', 'age_band', 'eta_range'], 'age');
    const genderField = firstKey(profile, ['gender', 'genere', 'sex'], 'gender');
    const directContactsField = firstKey(
      profile,
      ['allow_direct_contacts', 'direct_contacts_enabled', 'receive_direct_contacts', 'ricevi_contatti_diretti'],
      'allow_direct_contacts'
    );

    const payload: LooseRow = {
      [ageField]: numericAge,
      [genderField]: gender,
      allow_direct_contacts: directContactsEnabled,
    };

    if (!profile || Object.prototype.hasOwnProperty.call(profile, provinceField)) {
      payload[provinceField] = cleanProvince;
    }

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

      try {
        const preferencesResult = await supabase.from('notification_preferences').upsert({
          user_id: user.id,
          enabled: true,
          preferred_province: cleanProvince,
          updated_at: new Date().toISOString(),
        });
        if (preferencesResult.error) {
          console.warn('Preferenze notifiche non salvate:', preferencesResult.error.message);
        }
      } catch {
        // Se la tabella notifiche non è ancora pronta, il profilo resta comunque salvato.
      }

      Alert.alert('Profilo salvato', 'Le modifiche sono state registrate.');
      await loadAll();
    } catch (error: any) {
      Alert.alert('Errore salvataggio', error?.message || 'Non sono riuscito a salvare il profilo.');
    } finally {
      setSaving(false);
    }
  }, [ageRange, directContactsEnabled, gender, loadAll, photoUrl, profile, profileIdField, profileIdValue, province, user]);

  const answerItem = useCallback(
    async (item: ContactItem | InviteItem, status: 'accepted' | 'rejected') => {
      const ok = await safeUpdateStatus(item.table, item.id, status);
      if (!ok) {
        Alert.alert('Errore', 'Non sono riuscito ad aggiornare questa richiesta.');
        return;
      }

      if (status === 'accepted') {
        const updatedResult = await supabase.from(item.table).select('*').eq('id', item.id).maybeSingle();
        const row = updatedResult.data || {};
        const targetUserId = String(
          firstValue(row, ['requester_id', 'from_user_id', 'sender_id', 'created_by', 'creator_id', 'user_id']) || ''
        );

        if (targetUserId && targetUserId !== user?.id) {
          await sendBajujuPushNotification({
            type: 'contact_accepted',
            actorUserId: user?.id,
            targetUserId,
            title: 'Invito accettato',
            body: 'Il tuo invito Bajuju è stato accettato.',
            data: {
              screen: 'profile',
              requestId: item.id,
            },
          }).catch((error) => {
            console.log('Errore notifica contatto accettato:', error);
          });
        }
      }

      await loadAll();
    },
    [loadAll, user?.id]
  );

  const requestProfileDeletion = useCallback(() => {
    if (!user) return;

    Alert.alert(
      'Eliminazione profilo',
      'Vuoi inviare una richiesta di eliminazione del profilo? L’admin la vedrà nell’Area Admin.',
      [
        {
          text: 'Annulla',
          style: 'cancel',
        },
        {
          text: 'Invia richiesta',
          style: 'destructive',
          onPress: async () => {
            const payload = {
              user_id: user.id,
              email: user.email,
              status: 'pending',
              created_at: new Date().toISOString(),
            };

            const attempts = [
              () => supabase.from('profile_deletion_requests').insert(payload),
              () => supabase.from('deletion_requests').insert(payload),
              () =>
                supabase
                  .from(PROFILE_TABLE)
                  .update({ deletion_requested_at: new Date().toISOString() })
                  .eq(profileIdField, profileIdValue),
            ];

            for (const attempt of attempts) {
              try {
                const result = await attempt();

                if (!result.error) {
                  Alert.alert('Richiesta inviata', 'La richiesta di eliminazione profilo è stata registrata.');
                  return;
                }

                console.log('Errore richiesta eliminazione:', result.error.message);
              } catch (error) {
                console.log('Errore richiesta eliminazione:', error);
              }
            }

            Alert.alert('Errore', 'Non sono riuscito a registrare la richiesta di eliminazione.');
          },
        },
      ]
    );
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
      <Pressable style={styles.profileBackButton} onPress={() => router.push('/home')}>
        <Text style={styles.profileBackText}>← Torna alla Home</Text>
      </Pressable>

      <View style={styles.profileHeroCard}>
        <View style={styles.profileHeroTop}>
          <View
            style={[
              styles.photoBox,
              isAdminOrCreator
                ? styles.photoBoxAdmin
                : organizedActivities.length > 20
                  ? styles.photoBoxGold
                  : organizedActivities.length > 10
                    ? styles.photoBoxStrong
                    : organizedActivities.length > 5
                      ? styles.photoBoxGreen
                      : styles.photoBoxBase,
            ]}
          >
            {shouldShowProfilePhoto ? (
              <Image source={{ uri: photoUrl }} style={styles.photo} onError={() => setPhotoLoadError(true)} />
            ) : (
              <Image source={bajujuLogo} style={styles.photo} />
            )}
          </View>

          <View style={styles.profileIdentityBox}>
            <Text style={styles.profileNameText} numberOfLines={2}>
              {name}
            </Text>
            <Text style={styles.email} numberOfLines={2}>
              {user?.email}
            </Text>
            {isAdminOrCreator ? (
              <Text style={styles.profileRolePill}>Admin Bajuju</Text>
            ) : null}
          </View>
        </View>

        <Pressable style={styles.photoButton} onPress={uploadProfilePhoto} disabled={uploadingPhoto}>
          <Text style={styles.photoButtonText}>
            {uploadingPhoto ? 'Caricamento foto...' : photoUrl ? 'Cambia foto profilo' : 'Carica foto obbligatoria'}
          </Text>
        </Pressable>

        {!photoUrl ? (
          <Text style={styles.photoRequiredText}>
            La foto profilo è obbligatoria per completare il profilo Bajuju.
          </Text>
        ) : null}

        {photoLoadError ? (
          <Text style={styles.photoErrorText}>
            Non sono riuscito a caricare la tua foto profilo. Controlla il link o ricarica la foto.
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Dati profilo</Text>

        <Text style={styles.label}>Nome utente</Text>
        <TextInput
          value={profileName || 'Nuovo utente'}
          editable={false}
          placeholder="Nome scelto in registrazione"
          style={[styles.input, styles.inputDisabled]}
          autoCapitalize="words"
        />

        <View style={styles.locationInfoBox}>
          <Text style={styles.locationInfoTitle}>Dove ti trovi</Text>
          <Text style={styles.locationInfoText}>
            Scegli la provincia. Riceverai notifiche per le nuove esperienze create nella tua provincia. Puoi cambiarla quando ti sposti.
          </Text>
        </View>

        <Text style={styles.label}>Provincia</Text>
        <View style={styles.optionWrap}>
          {LOCATION_OPTIONS.map((item) => (
            <Pressable
              key={item}
              style={[styles.locationOption, province === item && styles.optionActive]}
              onPress={() => {
                setProvince(item);
              }}
            >
              <Text style={[styles.optionText, province === item && styles.optionTextActive]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Età</Text>
        <TextInput
          value={ageRange}
          onChangeText={(value) => setAgeRange(value.replace(/[^0-9]/g, '').slice(0, 2))}
          placeholder="Scrivi la tua età"
          style={styles.input}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Genere</Text>
        <View style={styles.genderGrid}>
          {GENDER_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.genderOption, gender === option.value && styles.optionActive]}
              onPress={() => setGender(option.value)}
            >
              <Text style={[styles.optionText, gender === option.value && styles.optionTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.genderOptionSmall, gender === 'preferisco_non_specificarlo' && styles.optionActive]}
          onPress={() => setGender('preferisco_non_specificarlo')}
        >
          <Text style={[styles.genderOptionSmallText, gender === 'preferisco_non_specificarlo' && styles.optionTextActive]}>
            Preferisco non specificarlo
          </Text>
        </Pressable>

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

      <View style={[styles.card, styles.contactCard]}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIconBubble, styles.contactIconBubble]}>
            <Text style={styles.sectionIconText}>📞</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Contatti diretti</Text>
            <Text style={styles.sectionHint}>Qui trovi le persone conosciute nelle esperienze Bajuju che vogliono restare in contatto con te.</Text>
          </View>
        </View>
        {contactRequests.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna richiesta di contatto al momento.</Text>
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

      <View style={[styles.card, styles.dateInviteCard]}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIconBubble, styles.dateInviteIconBubble]}>
            <Text style={styles.sectionIconText}>💗</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Inviti a uscire</Text>
            <Text style={styles.sectionHint}>Persone conosciute in una esperienza Bajuju che vorrebbero invitarti a vedervi fuori dall’evento.</Text>
          </View>
        </View>
        {invites.length === 0 ? (
          <Text style={styles.emptyText}>Nessun invito a uscire per ora.</Text>
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
        <Text style={styles.sectionTitle}>Esperienze create da me</Text>
        <Text style={styles.sectionCounter}>
          {organizedActivities.length} {organizedActivities.length === 1 ? 'esperienza' : 'esperienze'}
        </Text>
        {organizedActivities.length === 0 ? (
          <Text style={styles.emptyText}>Non hai ancora creato esperienze. Quando organizzi qualcosa, lo ritrovi qui.</Text>
        ) : (
          organizedActivities.map((activity) => (
            <Pressable
              key={activity.id}
              style={styles.activityRow}
              onPress={() => router.push(`/experience-detail?id=${activity.id}`)}
            >
              <Text style={styles.itemTitle}>{activity.title}</Text>
              <Text style={styles.itemSubtitle}>{activity.subtitle}</Text>
              <Text style={styles.openDetailText}>Apri dettaglio →</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Esperienze a cui partecipo</Text>
        <Text style={styles.sectionCounter}>
          {participatedActivities.length} {participatedActivities.length === 1 ? 'esperienza' : 'esperienze'}
        </Text>
        {participatedActivities.length === 0 ? (
          <Text style={styles.emptyText}>Non stai partecipando a esperienze. Quando ti unisci a qualcosa, lo ritrovi qui.</Text>
        ) : (
          participatedActivities.map((activity) => (
            <Pressable
              key={activity.id}
              style={styles.activityRow}
              onPress={() => router.push(`/experience-detail?id=${activity.id}`)}
            >
              <Text style={styles.itemTitle}>{activity.title}</Text>
              <Text style={styles.itemSubtitle}>{activity.subtitle}</Text>
              <Text style={styles.openDetailText}>Apri dettaglio →</Text>
            </Pressable>
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
  profileBackButton: {

    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd1e6',
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  profileBackText: {

    color: '#e43f98',
    fontSize: 14,
    fontWeight: '900',
  },

  page: {
    flex: 1,
    backgroundColor: '#fff7fb',
  },
  content: {
    paddingTop: 64,
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
  profileHeroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 12,
    overflow: 'hidden',
  },
  profileHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  profileIdentityBox: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  profileNameText: {
    color: '#4b1430',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    flexShrink: 1,
  },
  profileRolePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#fff0f7',
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
  },
  photoButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#e43f98',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  photoButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  photoBox: {
    width: 86,
    height: 86,
    borderRadius: 43,
    padding: 4,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  photoBoxBase: {
    borderColor: '#ffd3e6',
  },
  photoBoxGreen: {
    borderColor: '#2fb36d',
  },
  photoBoxStrong: {
    borderColor: '#e43f98',
  },
  photoBoxAdmin: {
    borderColor: '#e43f98',
  },
  photoBoxGold: {
    borderColor: '#d6a100',
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    resizeMode: 'cover',
  },
  photoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    resizeMode: 'contain',
  },
  headerText: {
    flex: 1,
    marginLeft: 14,
  },
  name: {

    color: '#48172f',
    fontSize: 27,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  email: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    flexShrink: 1,
  },
  changePhotoButton: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#e43f98',
  },
  changePhotoButtonDisabled: {
    opacity: 0.65,
  },
  changePhotoButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  photoRequiredText: {
    color: '#9b1f61',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    backgroundColor: '#fff8fb',
    borderRadius: 14,
    padding: 10,
  },
  photoErrorText: {
    color: '#9b1f61',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    backgroundColor: '#fff0f7',
    borderRadius: 14,
    padding: 10,
  },
  organizerBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '900',
  },
  organizerBadgeBase: {
    backgroundColor: '#ffffff',
    color: '#9b1f61',
    borderWidth: 1,
    borderColor: '#ffd3e7',
  },
  organizerBadgeGreen: {
    backgroundColor: '#e9f8ee',
    color: '#287a3e',
    borderWidth: 1,
    borderColor: '#9bd8aa',
  },
  organizerBadgeStrong: {
    backgroundColor: '#fff0f7',
    color: '#ef2d82',
    borderWidth: 1,
    borderColor: '#ef2d82',
  },
  organizerBadgeAdmin: {
    backgroundColor: '#ffe3f0',
    borderColor: BAJUJU_PINK,
  },
  organizerBadgeGold: {
    backgroundColor: '#fff6ce',
    color: '#8a6700',
    borderWidth: 1,
    borderColor: '#d8a600',
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
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    width: '100%',
    overflow: 'hidden',
  },
  contactCard: {

    backgroundColor: '#fff8fb',
    borderColor: '#ffc7df',
  },
  dateInviteCard: {
    borderColor: '#e43f98',
    backgroundColor: '#fff3f9',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionIconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  contactIconBubble: {

    backgroundColor: '#f0328b',
    borderRadius: 18,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInviteIconBubble: {
    backgroundColor: '#ffe3f1',
    borderColor: '#e43f98',
  },
  sectionIconText: {
    fontSize: 20,
  },

  locationInfoBox: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e7',
    marginBottom: 16,
  },
  locationInfoTitle: {
    color: '#e43f98',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },
  locationInfoText: {
    color: '#6b3652',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  locationOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd3e7',
    backgroundColor: '#ffffff',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  locationHint: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 16,
  },
  genderGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  genderOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ffd6ea',
    backgroundColor: '#fff8fb',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  genderOptionSmall: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ffd6ea',
    backgroundColor: '#fff8fb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  genderOptionSmallText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7a4267',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#311028',
    marginBottom: 6,
  },
  sectionHint: {
    marginTop: 4,
    color: '#7a4267',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  sectionCounter: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
  },
  label: {
    marginTop: 10,
    marginBottom: 7,
    color: '#5f2148',
    fontWeight: '800',
  },
  inputDisabled: {
    opacity: 0.65,
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

    backgroundColor: '#fff8fb',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffe1ee',
    color: '#8d315f',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 10,
    padding: 14,
    textAlign: 'center',
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

    color: '#48172f',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  itemSubtitle: {

    color: '#8d315f',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  openDetailText: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
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

    backgroundColor: '#fff8fb',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffe1ee',
    marginTop: 10,
    padding: 14,
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
