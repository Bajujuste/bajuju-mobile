import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Linking, Text, TextInput, View,  } from 'react-native';

import BajujuMap, { BajujuMapItem } from '../components/BajujuMap';
import { supabase } from '../src/lib/supabase';
import { shareBajujuFlash } from '../src/utils/shareBajuju';
import { sendBajujuPushNotification, buildFlashNotificationTitle } from '../src/utils/bajujuNotifications';
import { ITALIAN_MUNICIPALITIES_BY_PROVINCE } from '../src/data/italianMunicipalities';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

type LooseRow = Record<string, any>;

type FlashTab = 'all' | 'mine' | 'joined';
type FlashDuration = 1 | 2 | 3;
type AvailabilityDuration = FlashDuration | 'evening';
type FlashSection = 'create' | 'find' | 'availability' | 'available' | null;

const ACTIVE_PROVINCES = ['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Brescia', 'Torino'] as const;

function normalizeMunicipalitySearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstValue(row: LooseRow | null | undefined, keys: string[], fallback: any = null) {
  if (!row) return fallback;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }

  return fallback;
}

function firstText(row: LooseRow | null | undefined, keys: string[], fallback = '') {
  const value = firstValue(row, keys, fallback);
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function booleanFromRow(row: LooseRow | null | undefined, keys: string[], fallback = false) {
  const value = firstValue(row, keys);

  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();

    if (['true', '1', 'yes', 'si', 'sì', 'attivo', 'active', 'flash'].includes(normalized)) return true;
    if (['false', '0', 'no', 'non attivo', 'inactive'].includes(normalized)) return false;
  }

  if (typeof value === 'number') return value === 1;

  return fallback;
}

function formatDate(value: any) {
  if (!value) return 'Orario non disponibile';

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

function normalizeDate(value: any) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

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

function getFlashDate(row: LooseRow) {
  const activityDate = firstText(row, ['activity_date', 'event_date', 'date', 'data', 'day', 'giorno'], '');
  const activityTime = firstText(row, ['activity_time', 'event_time', 'time', 'ora'], '');

  if (activityDate && activityTime) {
    const combined = `${activityDate}T${activityTime}`;
    const parsed = normalizeDate(combined);
    if (parsed) return parsed;
  }

  return normalizeDate(
    firstValue(row, [
      'start_at',
      'starts_at',
      'start_time',
      'event_start_at',
      'activity_start_at',
      'scheduled_at',
      'date_time',
      'data_ora',
    ])
  );
}

function flashTitle(row: LooseRow) {
  return firstText(row, ['title', 'titolo', 'name', 'nome', 'activity_title'], 'Bajuju Flash');
}

function flashCity(row: LooseRow) {
  return firstText(row, ['city', 'citta', 'comune', 'location_city'], 'Comune non indicato');
}

function flashProvince(row: LooseRow) {
  return firstText(row, ['province', 'provincia', 'location_province'], '');
}

function flashCreatorId(row: LooseRow) {
  return String(
    firstValue(
      row,
      [
        'user_id',
        'owner_id',
        'creator_id',
        'created_by',
        'organizer_id',
        'profile_id',
        'author_id',
      ],
      ''
    )
  );
}

function flashCreator(row: LooseRow) {
  return firstText(
    row,
    [
      'creator_name',
      'organizer_name',
      'author_name',
      'profile_name',
      'display_name',
      'full_name',
      'name',
      'nome',
      'created_by_name',
      'user_name',
    ],
    ''
  );
}

function flashPlace(row: LooseRow) {
  return firstText(row, ['place', 'luogo', 'address', 'indirizzo', 'meeting_point', 'punto_ritrovo'], '');
}

function confirmNative(title: string, message: string, confirmText = 'Conferma') {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function isDeleted(row: LooseRow) {
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

function isFlashRow(row: LooseRow) {
  if (booleanFromRow(row, ['is_flash', 'flash', 'bajuju_flash', 'isFlash'], false)) return true;

  const text = firstText(row, ['type', 'activity_type', 'event_type', 'category', 'categoria', 'kind'], '')
    .toLowerCase()
    .trim();

  return ['flash', 'bajuju_flash', 'bajuju flash', 'istantaneo', 'veloce'].includes(text);
}

function isFlashStillAvailable(row: LooseRow) {
  const expiresAt = normalizeDate(firstValue(row, ['expires_at', 'expire_at', 'expiresAt']));

  if (expiresAt) {
    return expiresAt.getTime() >= new Date().getTime();
  }

  const date = getFlashDate(row);
  if (!date) return true;

  return date.getTime() >= new Date().getTime();
}

function rowBelongsToUser(row: LooseRow, userId: string | null) {
  if (!userId) return false;

  const owner = firstValue(row, ['creator_id', 'organizer_id', 'created_by', 'user_id', 'profile_id']);

  return owner ? String(owner) === String(userId) : false;
}

function getCoordinates(row: LooseRow) {
  const latitude = Number(firstValue(row, ['latitude', 'lat']));
  const longitude = Number(firstValue(row, ['longitude', 'lng', 'lon']));

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

  return { latitude, longitude };
}

function openMap(row: LooseRow) {
  const coordinates = getCoordinates(row);

  if (!coordinates) {
    if (typeof window !== 'undefined') {
      window.alert('Coordinate non disponibili per questo Flash.');
    }
    return;
  }

  const { latitude, longitude } = coordinates;
  const title = encodeURIComponent(flashTitle(row));
  const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}&layers=N&marker=${latitude},${longitude}`;

  Linking.openURL(url).catch(() => {
    if (typeof window !== 'undefined') {
      window.alert(`Non riesco ad aprire la mappa per ${decodeURIComponent(title)}.`);
    }
  });
}


function flashId(row: LooseRow) {
  return String(firstValue(row, ['id', 'activity_id'], '') || '');
}

function availableUserId(row: LooseRow) {
  return String(firstValue(row, ['user_id'], '') || '');
}

function availableProfileName(profile: LooseRow | null | undefined) {
  return firstText(profile, ['nickname'], 'Utente Bajuju');
}

function availableProfilePhoto(profile: LooseRow | null | undefined) {
  return firstText(profile, ['avatar_url'], '');
}

function availabilityRemainingText(row: LooseRow) {
  const expiresAt = normalizeDate(firstValue(row, ['expires_at']));

  if (!expiresAt) return 'Disponibilità attiva';

  const diffMs = expiresAt.getTime() - Date.now();

  if (diffMs <= 0) return 'Disponibilità scaduta';

  const minutes = Math.max(1, Math.ceil(diffMs / 60000));

  if (minutes < 60) return `Ancora ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (restMinutes === 0) return `Ancora ${hours} ${hours === 1 ? 'ora' : 'ore'}`;

  return `Ancora ${hours}h ${restMinutes}min`;
}

async function geocodeAddress(address: string, streetNumber: string, city: string, province: string) {
  const cleanAddress = address.trim();
  const cleanStreetNumber = streetNumber.trim();
  const cleanCity = city.trim();
  const cleanProvince = province.trim();

  const addressAlreadyHasStreetNumber =
    cleanStreetNumber.length > 0 &&
    new RegExp(`\\b${cleanStreetNumber.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(cleanAddress);

  const fullAddress =
    cleanStreetNumber && !addressAlreadyHasStreetNumber ? `${cleanAddress} ${cleanStreetNumber}` : cleanAddress;

  const queries = [
    `${fullAddress}, ${cleanCity}, ${cleanProvince}`,
    `${fullAddress}, ${cleanCity}`,
    `${cleanAddress}, ${cleanCity}, ${cleanProvince}`,
    `${cleanAddress}, ${cleanCity}`,
    `${cleanCity}, ${cleanProvince}, Italia`,
    `${cleanCity}, Italia`,
  ];

  for (const query of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BajujuMobileApp/1.0',
        },
      });

      if (!response.ok) {
        console.log('Geocoding non riuscito:', response.status, query);
        continue;
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        console.log('Nessun risultato geocoding per:', query);
        continue;
      }

      const first = data[0];
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        console.log('Coordinate non valide per:', query);
        continue;
      }

      return { latitude, longitude };
    } catch (error) {
      console.log('Errore geocoding per:', query, error);
    }
  }

  return null;
}

type FlashScreenProps = {
  forcedSection?: FlashSection;
};

export default function FlashScreen({ forcedSection }: FlashScreenProps = {}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<LooseRow[]>([]);
  const [joinedActivityIds, setJoinedActivityIds] = useState<Set<string>>(new Set());
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [availableRows, setAvailableRows] = useState<LooseRow[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<Record<string, LooseRow>>({});
  const [myActiveAvailability, setMyActiveAvailability] = useState<LooseRow | null>(null);
  const [cancellingAvailability, setCancellingAvailability] = useState(false);
  const [loadingAvailableUsers, setLoadingAvailableUsers] = useState(false);
  const [sendingAvailabilityInviteTo, setSendingAvailabilityInviteTo] = useState<string | null>(null);
  const [joiningActivityId, setJoiningActivityId] = useState<string | null>(null);
  const [leavingActivityId, setLeavingActivityId] = useState<string | null>(null);
  const [cancellingActivityId, setCancellingActivityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string>('Tutte');
  const [selectedTab, setSelectedTab] = useState<FlashTab>('all');
  const [selectedSection, setSelectedSection] = useState<FlashSection>(forcedSection ?? null);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newProvince, setNewProvince] = useState('Bergamo');
  const [newCity, setNewCity] = useState('');
  const [showNewMunicipalityList, setShowNewMunicipalityList] = useState(false);
  const [newPlace, setNewPlace] = useState('');
  const [newStreetNumber, setNewStreetNumber] = useState('');
  const [newDurationHours, setNewDurationHours] = useState<FlashDuration>(2);
  const [availabilityProvince, setAvailabilityProvince] = useState('Bergamo');
  const [availabilityCity, setAvailabilityCity] = useState('');
  const [showAvailabilityMunicipalityList, setShowAvailabilityMunicipalityList] = useState(false);
  const [availabilityDurationHours, setAvailabilityDurationHours] = useState<AvailabilityDuration>(2);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [savingFlash, setSavingFlash] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const newMunicipalities = useMemo(() => {
    return ITALIAN_MUNICIPALITIES_BY_PROVINCE[
      newProvince as keyof typeof ITALIAN_MUNICIPALITIES_BY_PROVINCE
    ] ?? [];
  }, [newProvince]);

  const hasSelectedValidNewCity = newMunicipalities.includes(newCity as never);

  const availabilityMunicipalities = useMemo(() => {
    return ITALIAN_MUNICIPALITIES_BY_PROVINCE[
      availabilityProvince as keyof typeof ITALIAN_MUNICIPALITIES_BY_PROVINCE
    ] ?? [];
  }, [availabilityProvince]);

  const filteredAvailabilityMunicipalities = useMemo(() => {
    const query = normalizeMunicipalitySearch(availabilityCity);

    if (!query) return availabilityMunicipalities.slice(0, 24);

    return availabilityMunicipalities
      .filter((city) => normalizeMunicipalitySearch(city).includes(query))
      .slice(0, 24);
  }, [availabilityCity, availabilityMunicipalities]);

  const hasSelectedValidAvailabilityCity = availabilityMunicipalities.includes(availabilityCity as never);

  useEffect(() => {
    setNewCity('');
    setShowNewMunicipalityList(false);
  }, [newProvince]);

  useEffect(() => {
    setAvailabilityCity('');
  }, [availabilityProvince]);

  useEffect(() => {
    if (forcedSection) {
      setSelectedSection(forcedSection);
      if (forcedSection === 'create') {
        setShowCreateForm(true);
      }
    }
  }, [forcedSection]);


  const loadFlashRows = useCallback(async () => {
    setErrorMessage(null);

    const authResult = await supabase.auth.getUser();
    const currentUserId = authResult.data.user?.id || null;
    setUserId(currentUserId);

    const result = await supabase
      .from('activities')
      .select('*')
      .limit(120);

    if (result.error) {
      setRows([]);
      setJoinedActivityIds(new Set());
      setErrorMessage(result.error.message || 'Non sono riuscito a caricare i Flash.');
      return;
    }

    if (currentUserId) {
      const joinedResult = await supabase
        .from('activity_participants')
        .select('activity_id,user_id,status')
        .eq('user_id', currentUserId)
        .limit(300);

      if (!joinedResult.error && Array.isArray(joinedResult.data)) {
        const joinedIds = new Set(
          joinedResult.data
            .filter((item: LooseRow) => {
              const status = firstText(item, ['status', 'stato'], '').toLowerCase().trim();

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
            .map((item: LooseRow) => String(firstValue(item, ['activity_id', 'event_id', 'experience_id'], '')))
            .filter(Boolean)
        );

        setJoinedActivityIds(joinedIds);
      } else {
        setJoinedActivityIds(new Set());
      }
    } else {
      setJoinedActivityIds(new Set());
    }

    const cleanRows = ((result.data || []) as LooseRow[])
      .filter((row) => !isDeleted(row))
      .filter(isFlashRow)
      .filter(isFlashStillAvailable)
      .sort((a, b) => {
        const dateA = getFlashDate(a)?.getTime() || 0;
        const dateB = getFlashDate(b)?.getTime() || 0;
        return dateA - dateB;
      });

    setRows(cleanRows);

      const flashIds = cleanRows
        ? cleanRows.map((item: LooseRow) => String(firstValue(item, ['id', 'activity_id'], ''))).filter(Boolean)
        : [];

      if (flashIds.length > 0) {
        const participantsResult = await supabase
          .from('activity_participants')
          .select('activity_id')
          .in('activity_id', flashIds);

        if (!participantsResult.error) {
          const counts: Record<string, number> = {};

          for (const participant of participantsResult.data ?? []) {
            const participantActivityId = String((participant as LooseRow).activity_id ?? '');
            if (!participantActivityId) continue;
            counts[participantActivityId] = (counts[participantActivityId] ?? 0) + 1;
          }

          setParticipantCounts(counts);
        }

        const creatorIds = Array.from(
          new Set(
            cleanRows
              .map((item: LooseRow) => flashCreatorId(item))
              .filter(Boolean)
          )
        );

        if (creatorIds.length > 0) {
          const profilesResult = await supabase
            .from('profiles')
            .select('*')
            .in('id', creatorIds);

          if (!profilesResult.error) {
            const names: Record<string, string> = {};

            for (const profile of profilesResult.data ?? []) {
              const profileRow = profile as LooseRow;
              const profileId = String(firstValue(profileRow, ['id', 'user_id'], ''));
              const profileName = firstText(
                profileRow,
                ['display_name', 'full_name', 'name', 'nome', 'username', 'email'],
                ''
              );

              if (profileId && profileName) {
                names[profileId] = profileName;
              }
            }

            setCreatorNames(names);
          }
        } else {
          setCreatorNames({});
        }
      } else {
        setParticipantCounts({});
        setCreatorNames({});
      }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setLoading(true);
      await loadFlashRows();
      if (mounted) setLoading(false);
    }

    start();

    return () => {
      mounted = false;
    };
  }, [loadFlashRows]);

  const loadAvailableUsers = useCallback(async () => {
    setLoadingAvailableUsers(true);

    try {
      const authResult = await supabase.auth.getUser();
      const currentUserId = authResult.data.user?.id || null;

      const nowIso = new Date().toISOString();

      if (currentUserId) {
        const myActiveResult = await supabase
          .from('user_availability')
          .select('id,user_id,province,city,expires_at,created_at')
          .eq('user_id', currentUserId)
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!myActiveResult.error && myActiveResult.data && myActiveResult.data.length > 0) {
          setMyActiveAvailability(myActiveResult.data[0] as LooseRow);
        } else {
          setMyActiveAvailability(null);
        }
      } else {
        setMyActiveAvailability(null);
      }

      const result = await supabase
        .from('user_availability')
        .select('id,user_id,province,city,expires_at,created_at')
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(100);

      if (result.error) {
        setAvailableRows([]);
        setAvailableProfiles({});
        return;
      }

      let cleanRows = result.data || [];

      if (currentUserId) {
        cleanRows = cleanRows.filter((row: LooseRow) => availableUserId(row) !== currentUserId);

        const userIds = cleanRows.map((row: LooseRow) => availableUserId(row)).filter(Boolean);

        if (userIds.length > 0) {
          const [blockedByMe, blockedMe] = await Promise.all([
            supabase
              .from('user_blocks')
              .select('blocked_id')
              .eq('blocker_id', currentUserId)
              .in('blocked_id', userIds),
            supabase
              .from('user_blocks')
              .select('blocker_id')
              .eq('blocked_id', currentUserId)
              .in('blocker_id', userIds),
          ]);

          const blockedIds = new Set<string>();

          if (!blockedByMe.error) {
            (blockedByMe.data || []).forEach((row: LooseRow) => blockedIds.add(String(row.blocked_id || '')));
          }

          if (!blockedMe.error) {
            (blockedMe.data || []).forEach((row: LooseRow) => blockedIds.add(String(row.blocker_id || '')));
          }

          cleanRows = cleanRows.filter((row: LooseRow) => !blockedIds.has(availableUserId(row)));
        }
      } else {
        setMyActiveAvailability(null);
      }

      const profileIds = Array.from(new Set(cleanRows.map((row: LooseRow) => availableUserId(row)).filter(Boolean)));
      const profileMap: Record<string, LooseRow> = {};

      if (profileIds.length > 0) {
        const profilesResult = await supabase
          .from('profiles')
          .select('id,nickname,avatar_url,city,is_admin,age')
          .in('id', profileIds);

        if (!profilesResult.error) {
          (profilesResult.data || []).forEach((profile: LooseRow) => {
            profileMap[String(profile.id)] = profile;
          });
        }
      }

      setAvailableRows(cleanRows);
      setAvailableProfiles(profileMap);
    } finally {
      setLoadingAvailableUsers(false);
    }
  }, []);

  useEffect(() => {
    loadAvailableUsers();
  }, [loadAvailableUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadFlashRows(), loadAvailableUsers()]);
    setRefreshing(false);
  }, [loadAvailableUsers, loadFlashRows]);

  const saveAvailability = useCallback(async () => {
    if (savingAvailability) return;

    if (myActiveAvailability) {
      if (typeof window !== 'undefined') {
        window.alert('Sei già disponibile. Annulla la disponibilità prima di crearne una nuova.');
      }
      return;
    }

    const cleanProvince = availabilityProvince.trim();
    const cleanCity = availabilityCity.trim();

    if (!cleanProvince || !cleanCity) {
      if (typeof window !== 'undefined') {
        window.alert('Scegli provincia e seleziona il comune da cui parti.');
      }
      return;
    }

    if (!availabilityMunicipalities.includes(cleanCity as never)) {
      if (typeof window !== 'undefined') {
        window.alert('Seleziona un comune valido dalla lista ufficiale. Il comune serve solo per indicare da dove parti.');
      }
      return;
    }

    setSavingAvailability(true);

    try {
      const authResult = await supabase.auth.getUser();
      const authUserId = authResult.data.user?.id;

      if (!authUserId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per renderti disponibile.');
        }
        return;
      }

      const existingAvailabilityResult = await supabase
        .from('user_availability')
        .select('id,user_id,province,city,expires_at,created_at')
        .eq('user_id', authUserId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (!existingAvailabilityResult.error && existingAvailabilityResult.data && existingAvailabilityResult.data.length > 0) {
        setMyActiveAvailability(existingAvailabilityResult.data[0] as LooseRow);
        if (typeof window !== 'undefined') {
          window.alert('Sei già disponibile. Annulla la disponibilità prima di crearne una nuova.');
        }
        return;
      }

      const now = new Date();
      const expiresAtDate =
        availabilityDurationHours === 'evening'
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0)
          : new Date(now.getTime() + availabilityDurationHours * 60 * 60 * 1000);
      const expiresAt = expiresAtDate.toISOString();

      const result = await supabase.from('user_availability').insert({
        user_id: authUserId,
        province: cleanProvince,
        city: cleanCity,
        expires_at: expiresAt,
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore disponibilità: ${result.error.message}`);
        }
        return;
      }

      setSelectedProvince(cleanProvince);
      setAvailabilityCity('');
      await loadAvailableUsers();

      if (typeof window !== 'undefined') {
        window.alert(
          availabilityDurationHours === 'evening'
            ? 'Ora sei visibile fino a stasera alle 23:59.'
            : `Ora sei visibile per ${availabilityDurationHours} ${availabilityDurationHours === 1 ? 'ora' : 'ore'}.`
        );
      }
    } finally {
      setSavingAvailability(false);
    }
  }, [availabilityCity, availabilityDurationHours, availabilityMunicipalities, availabilityProvince, loadAvailableUsers, myActiveAvailability, savingAvailability]);

  const cancelAvailability = useCallback(async () => {
    if (cancellingAvailability) return;

    setCancellingAvailability(true);

    try {
      const authResult = await supabase.auth.getUser();
      const authUserId = authResult.data.user?.id || null;

      if (!authUserId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per annullare la disponibilità.');
        }
        return;
      }

      let availabilityId = String(firstValue(myActiveAvailability || {}, ['id'], '') || '').trim();

      if (!availabilityId) {
        const activeResult = await supabase
          .from('user_availability')
          .select('id')
          .eq('user_id', authUserId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        availabilityId = String(firstValue((activeResult.data || [])[0] || {}, ['id'], '') || '').trim();
      }

      if (!availabilityId) {
        setMyActiveAvailability(null);
        await loadAvailableUsers();

        if (typeof window !== 'undefined') {
          window.alert('Non hai una disponibilità attiva da annullare.');
        }
        return;
      }

      const result = await supabase
        .from('user_availability')
        .delete()
        .eq('id', availabilityId)
        .eq('user_id', authUserId);

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore annulla disponibilità: ${result.error.message}`);
        }
        return;
      }

      setMyActiveAvailability(null);
      await loadAvailableUsers();

      if (typeof window !== 'undefined') {
        window.alert('Disponibilità annullata.');
      }
    } finally {
      setCancellingAvailability(false);
    }
  }, [cancellingAvailability, loadAvailableUsers, myActiveAvailability]);

  const sendAvailabilityInvite = useCallback(async (targetUserId: string) => {
    const cleanTargetUserId = String(targetUserId || '').trim();

    if (!cleanTargetUserId || sendingAvailabilityInviteTo) return;

    const authResult = await supabase.auth.getUser();
    const currentUserId = authResult.data.user?.id || null;

    if (!currentUserId) {
      if (typeof window !== 'undefined') {
        window.alert('Devi essere collegato per invitare una persona.');
      }
      return;
    }

    if (currentUserId === cleanTargetUserId) return;

    setSendingAvailabilityInviteTo(cleanTargetUserId);

    try {
      const [blockedByMeResult, blockedMeResult] = await Promise.all([
        supabase
          .from('user_blocks')
          .select('id')
          .eq('blocker_id', currentUserId)
          .eq('blocked_id', cleanTargetUserId)
          .maybeSingle(),
        supabase
          .from('user_blocks')
          .select('id')
          .eq('blocker_id', cleanTargetUserId)
          .eq('blocked_id', currentUserId)
          .maybeSingle(),
      ]);

      if (blockedByMeResult.data || blockedMeResult.data) {
        if (typeof window !== 'undefined') {
          window.alert('Invito non disponibile per questo utente.');
        }
        return;
      }

      const ownFlashResult = await supabase
        .from('activities')
        .select('id,title,city,province,expires_at,created_at')
        .eq('creator_id', currentUserId)
        .eq('is_flash', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      const ownFlash = Array.isArray(ownFlashResult.data) ? ownFlashResult.data[0] as LooseRow | undefined : undefined;
      const ownFlashId = ownFlash ? String(firstValue(ownFlash, ['id', 'activity_id'], '') || '').trim() : '';

      if (ownFlashResult.error || !ownFlashId || !ownFlash) {
        if (typeof window !== 'undefined') {
          window.alert('Devi prima creare un Bajuju Flash attivo per poter invitare questa persona.');
        }
        return;
      }

      const existingResult = await supabase
        .from('direct_contact_requests')
        .select('id,status,activity_id')
        .eq('requester_id', currentUserId)
        .eq('receiver_id', cleanTargetUserId)
        .eq('activity_id', ownFlashId)
        .in('status', ['pending', 'accepted'])
        .limit(1);

      if (!existingResult.error && existingResult.data && existingResult.data.length > 0) {
        if (typeof window !== 'undefined') {
          window.alert('Hai già invitato questa persona a questo Flash.');
        }
        return;
      }

      const result = await supabase.from('direct_contact_requests').insert({
        requester_id: currentUserId,
        sender_id: currentUserId,
        receiver_id: cleanTargetUserId,
        activity_id: ownFlashId,
        contact_type: 'flash_invite',
        status: 'pending',
        message: `Ti invito al mio Bajuju Flash “${flashTitle(ownFlash)}”. Ti ho visto disponibile: ti va di partecipare?`,
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore invito: ${result.error.message}`);
        }
        return;
      }

      await sendBajujuPushNotification({
        type: 'contact_request',
        actorUserId: currentUserId,
        targetUserId: cleanTargetUserId,
        title: 'Nuovo invito Bajuju Flash',
        body: `Una persona ti invita al suo Flash: ${flashTitle(ownFlash)}.`,
        data: {
          screen: 'profile',
          activityId: ownFlashId,
        },
      }).catch((error) => {
        console.log('Errore notifica invito disponibilità:', error);
      });

      if (typeof window !== 'undefined') {
        window.alert('Invito inviato.');
      }
    } finally {
      setSendingAvailabilityInviteTo(null);
    }
  }, [sendingAvailabilityInviteTo]);

  const createFlash = useCallback(async () => {
    if (savingFlash) return;

    const cleanTitle = newTitle.trim();
    const cleanDescription = newDescription.trim();
    const cleanProvince = newProvince.trim();
    const cleanCity = newCity.trim();
    const cleanPlace = newPlace.trim();
    const cleanStreetNumber = newStreetNumber.trim();
    if (!cleanTitle || !cleanProvince || !cleanCity || !cleanPlace) {
      if (typeof window !== 'undefined') {
        window.alert('Compila titolo, provincia, comune e indirizzo. Il numero civico è separato e consigliato.');
      }
      return;
    }

    if (!newMunicipalities.includes(cleanCity as never)) {
      if (typeof window !== 'undefined') {
        window.alert('Seleziona un comune valido dalla lista ufficiale.');
      }
      return;
    }

    setSavingFlash(true);

    try {
      const authResult = await supabase.auth.getUser();
      const authUserId = authResult.data.user?.id;

      if (!authUserId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per creare un Flash.');
        }
        return;
      }

      let creatorId = authUserId;

      const byId = await supabase.from('profiles').select('id').eq('id', authUserId).maybeSingle();

      if (!byId.error && byId.data?.id) {
        creatorId = byId.data.id;
      }

      const creatorIdsToCheck = [authUserId];

      if (creatorId && creatorId !== authUserId) {
        creatorIdsToCheck.push(creatorId);
      }

      const now = new Date();
      const nowIso = now.toISOString();

      const activeFlashResult = await supabase
        .from('activities')
        .select('id,title,expires_at')
        .eq('is_flash', true)
        .in('creator_id', creatorIdsToCheck)
        .gt('expires_at', nowIso)
        .limit(1);

      if (!activeFlashResult.error && (activeFlashResult.data || []).length > 0) {
        if (typeof window !== 'undefined') {
          window.alert('Hai già un Flash attivo. Annulla quello prima di crearne un altro.');
        }
        return;
      }

      const cleanDate = now.toISOString().slice(0, 10);
      const cleanTime = now.toTimeString().slice(0, 8);
      const expiresAt = new Date(now.getTime() + newDurationHours * 60 * 60 * 1000).toISOString();

      const coordinates = await geocodeAddress(cleanPlace, cleanStreetNumber, cleanCity, cleanProvince);

      if (!coordinates) {
        if (typeof window !== 'undefined') {
          window.alert('Non sono riuscito a trovare nemmeno il centro del comune selezionato. Controlla il comune e riprova.');
        }
        return;
      }

      const addressAlreadyHasStreetNumber =
        cleanStreetNumber.length > 0 &&
        new RegExp(`\\b${cleanStreetNumber.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(cleanPlace);

      const finalMeetingPlace =
        cleanStreetNumber && !addressAlreadyHasStreetNumber ? `${cleanPlace} ${cleanStreetNumber}` : cleanPlace;

      const payload = {
        creator_id: creatorId,
        title: cleanTitle,
        category: 'altro',
        description: cleanDescription || `Bajuju Flash disponibile per ${newDurationHours} ore.`,
        city: cleanCity,
        province: cleanProvince,
        meeting_place: finalMeetingPlace,
        activity_date: cleanDate,
        activity_time: cleanTime,
        min_participants: 1,
        max_participants: 10,
        is_flash: true,
        expires_at: expiresAt,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      };

      const result = await supabase.from('activities').insert(payload).select('*').single();

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore creazione Flash: ${result.error.message}`);
        }
        return;
      }

      await sendBajujuPushNotification({
        type: 'new_flash',
        actorUserId: String(payload.creator_id || ''),
        title: buildFlashNotificationTitle(payload.title),
        body: `${payload.city}: qualcuno ha creato un Flash Bajuju.`,
        province: payload.province,
        city: payload.city,
        data: {
          screen: 'flash',
          activityId: result.data?.id,
          title: payload.title,
        },
      }).catch((error) => {
        console.log('Errore notifica nuovo Flash:', error);
      });

      setNewTitle('');
      setNewDescription('');
      setNewCity('');
      setNewPlace('');
      setNewStreetNumber('');
      setSelectedProvince('Tutte');
      setSelectedTab('all');
      setShowCreateForm(false);

      await loadFlashRows();

      if (typeof window !== 'undefined') {
        window.alert('Flash creato correttamente.');
      }
    } finally {
      setSavingFlash(false);
    }
  }, [loadFlashRows, newCity, newDescription, newDurationHours, newMunicipalities, newPlace, newProvince, newStreetNumber, newTitle, savingFlash]);

  const joinFlash = useCallback(async (row: LooseRow) => {
    const activityId = String(firstValue(row, ['id', 'activity_id'], ''));

    if (!activityId || joiningActivityId) return;

    if (rowBelongsToUser(row, userId)) {
      if (typeof window !== 'undefined') {
        window.alert('Questo Flash lo hai creato tu.');
      }
      return;
    }

    if (joinedActivityIds.has(activityId)) {
      if (typeof window !== 'undefined') {
        window.alert('Stai già partecipando a questo Flash.');
      }
      return;
    }

    setJoiningActivityId(activityId);

    try {
      const authResult = await supabase.auth.getUser();
      const authUserId = authResult.data.user?.id;

      if (!authUserId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per partecipare.');
        }
        return;
      }

      const result = await supabase.from('activity_participants').insert({
        activity_id: activityId,
        user_id: authUserId,
        status: 'accepted',
      });

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore partecipazione: ${result.error.message}`);
        }
        return;
      }

      await loadFlashRows();

      if (typeof window !== 'undefined') {
        window.alert('Partecipazione registrata.');
      }
    } finally {
      setJoiningActivityId(null);
    }
  }, [joinedActivityIds, joiningActivityId, loadFlashRows, userId]);

  const cancelFlash = useCallback(async (row: LooseRow) => {
    const activityId = String(firstValue(row, ['id', 'activity_id'], ''));

    if (!activityId || cancellingActivityId) return;

    if (!rowBelongsToUser(row, userId)) {
      if (typeof window !== 'undefined') {
        window.alert('Puoi annullare solo i Flash creati da te.');
      }
      return;
    }

    const confirmed = await confirmNative(
      'Annulla Flash',
      'Vuoi annullare questo Flash? Non sarà più visibile tra i Flash disponibili.',
      'Sì, annulla'
    );

    if (!confirmed) return;

    setCancellingActivityId(activityId);

    try {
      const authResult = await supabase.auth.getUser();
      const authUserId = authResult.data.user?.id;

      if (!authUserId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per annullare il Flash.');
        }
        return;
      }

      const profileByIdResult = await supabase
        .from('profiles')
        .select('id,user_id')
        .eq('id', authUserId)
        .maybeSingle();

      const profileByUserIdResult = await supabase
        .from('profiles')
        .select('id,user_id')
        .eq('user_id', authUserId)
        .maybeSingle();

      const creatorIds = new Set<string>([authUserId]);

      if (!profileByIdResult.error && profileByIdResult.data?.id) {
        creatorIds.add(String(profileByIdResult.data.id));
      }

      if (!profileByUserIdResult.error && profileByUserIdResult.data?.id) {
        creatorIds.add(String(profileByUserIdResult.data.id));
      }

      const result = await supabase
        .from('activities')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', activityId)
        .in('creator_id', Array.from(creatorIds))
        .select('id');

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore annullamento Flash: ${result.error.message}`);
        }
        return;
      }

      if (!result.data || result.data.length === 0) {
        if (typeof window !== 'undefined') {
          window.alert('Non sono riuscito ad annullare il Flash. Ricarica e riprova.');
        }
        return;
      }

      await loadFlashRows();

      if (typeof window !== 'undefined') {
        window.alert('Flash annullato correttamente.');
      }
    } finally {
      setCancellingActivityId(null);
    }
  }, [cancellingActivityId, loadFlashRows, userId]);

  const leaveFlash = useCallback(async (row: LooseRow) => {
    const activityId = String(firstValue(row, ['id', 'activity_id'], ''));

    if (!activityId || leavingActivityId) return;

    const confirmed = await confirmNative(
      'Abbandona Flash',
      'Vuoi abbandonare questo Flash?',
      'Sì, abbandona'
    );

    if (!confirmed) return;

    setLeavingActivityId(activityId);

    try {
      const authResult = await supabase.auth.getUser();
      const authUserId = authResult.data.user?.id;

      if (!authUserId) {
        if (typeof window !== 'undefined') {
          window.alert('Devi essere collegato per abbandonare il Flash.');
        }
        return;
      }

      const result = await supabase
        .from('activity_participants')
        .delete()
        .eq('activity_id', activityId)
        .eq('user_id', authUserId);

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore abbandono Flash: ${result.error.message}`);
        }
        return;
      }

      await loadFlashRows();

      if (typeof window !== 'undefined') {
        window.alert('Hai abbandonato il Flash.');
      }
    } finally {
      setLeavingActivityId(null);
    }
  }, [leavingActivityId, loadFlashRows]);

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        if (selectedProvince !== 'Tutte') {
          const province = flashProvince(row).toLowerCase().trim();
          if (province !== selectedProvince.toLowerCase().trim()) return false;
        }

        const activityId = String(firstValue(row, ['id', 'activity_id'], ''));

        if (selectedTab === 'mine') return rowBelongsToUser(row, userId);
        if (selectedTab === 'joined') return rowBelongsToUser(row, userId) || joinedActivityIds.has(activityId);

        return true;
      })
      .sort((a, b) => {
        const aDate = new Date(String(firstValue(a, ['expires_at', 'expiresAt', 'activity_date', 'created_at'], ''))).getTime();
        const bDate = new Date(String(firstValue(b, ['expires_at', 'expiresAt', 'activity_date', 'created_at'], ''))).getTime();

        if (Number.isNaN(aDate) && Number.isNaN(bDate)) return 0;
        if (Number.isNaN(aDate)) return 1;
        if (Number.isNaN(bDate)) return -1;

        return bDate - aDate;
      });
  }, [joinedActivityIds, rows, selectedProvince, selectedTab, userId]);

  const isCreatePage = forcedSection === 'create';
  const isFindPage = forcedSection === 'find';
  const isMenuPage = !forcedSection;

  const flashMapItems: BajujuMapItem[] = filteredRows.flatMap((row) => {
    const id = flashId(row);
    const coordinates = getCoordinates(row);

    if (!id || !coordinates) return [];

    return [{
      id,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      icon: '⚡',
      kicker: 'Bajuju Flash',
      title: flashTitle(row),
      locationText: [flashCity(row), flashProvince(row)].filter(Boolean).join(' · '),
      dateText: formatDate(getFlashDate(row)),
    }];
  });

  function openFlashMapItem(item: BajujuMapItem) {
    router.push({
      pathname: '/flash-detail',
      params: { id: item.id },
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {isMenuPage ? (
        <View style={styles.flashHeroCard}>
        <Pressable style={styles.flashBackButton} onPress={() => router.push(forcedSection ? '/flash' : '/home')}>
          <Text style={styles.flashBackText}>{forcedSection ? '← Bajuju Flash' : '← Home'}</Text>
        </Pressable>

        <View style={styles.flashHeroTopRow}>
          <View style={styles.flashHeroTextBlock}>
            <Text style={styles.kicker}>Bajuju Flash</Text>
            <Text style={styles.flashHeroPhrase}>
              Fatti vedere ed esci subito.
            </Text>
          </View>

          <View style={styles.flashLogoCircle}>
            <Image source={bajujuLogo} style={styles.flashLogoImage} resizeMode="contain" />
          </View>
        </View>

        <Text style={styles.flashInstructions}>Crea, trova o raggiungi qualcuno disponibile adesso.</Text>

        <Pressable
          style={[styles.flashChoiceButton, styles.flashCreateChoiceButton, styles.flashMainChoiceButton, styles.flashWideMainButton]}
          onPress={() => router.push('/flash-create')}
        >
          <Text style={[styles.flashChoiceIcon, styles.flashMainChoiceIcon]}>FLASH</Text>
          <Text style={[styles.flashChoiceText, styles.flashMainChoiceText]}>Crea un nuovo Flash</Text>
          <Text style={styles.flashMainChoiceSubtext}>Lancia un invito, raduna le persone, vivilo dal vivo.</Text>
        </Pressable>

        <View style={styles.flashChoiceRow}>
          <Pressable
            style={[styles.flashChoiceButton, styles.flashFindChoiceButton]}
            onPress={() => router.push('/flash-find')}
          >
            <Text style={[styles.flashChoiceIcon, styles.flashSecondaryChoiceIcon]}>CERCA</Text>
            <Text style={[styles.flashChoiceText, styles.flashSecondaryChoiceText]}>Trova Flash</Text>
          </Pressable>
          <Pressable
            style={[styles.flashChoiceButton, styles.flashFindChoiceButton]}
            onPress={() => router.push('/flash-availability')}
          >
            <Text style={[styles.flashChoiceIcon, styles.flashSecondaryChoiceIcon]}>ORA</Text>
            <Text style={[styles.flashChoiceText, styles.flashSecondaryChoiceText]}>Renditi disponibile</Text>
          </Pressable>

        </View>

        <Pressable
          style={[styles.flashChoiceButton, styles.flashFindChoiceButton, styles.flashLiveWideButton]}
          onPress={() => router.push('/flash-available')}
        >
          <Text style={[styles.flashChoiceIcon, styles.flashSecondaryChoiceIcon]}>LIVE</Text>
          <Text style={[styles.flashChoiceText, styles.flashSecondaryChoiceText]}>Guarda chi è disponibile</Text>
        </Pressable>
        </View>
      ) : null}

      {!isMenuPage ? (
        <View style={styles.flashDedicatedHeroCard}>
          <Pressable style={styles.flashBackButton} onPress={() => router.push('/flash')}>
            <Text style={styles.flashBackText}>← Bajuju Flash</Text>
          </Pressable>

          <View style={styles.flashDedicatedLogoCircle}>
            <Image source={bajujuLogo} style={styles.flashLogoImage} resizeMode="contain" />
          </View>

          <Text style={styles.kicker}>Bajuju Flash</Text>
          <Text style={styles.flashDedicatedTitle}>
            {isCreatePage ? 'Crea un Flash' : selectedSection === 'availability' ? 'Renditi disponibile' : selectedSection === 'available' ? 'Guarda chi è disponibile' : 'Trova Flash'}
          </Text>
          <Text style={styles.flashDedicatedText}>
            {isCreatePage
              ? 'Compila pochi dati e pubblica subito il tuo Flash.'
              : selectedSection === 'availability' ? 'Scegli dove vuoi farti trovare e per quanto tempo restare visibile.' : selectedSection === 'available' ? 'Scorri le persone disponibili ora e invita chi vuoi al tuo Flash.' : 'Guarda i Flash disponibili adesso e scegli a quale partecipare.'}
          </Text>
        </View>
      ) : null}

      <View style={[styles.card, !(selectedSection === 'find' || selectedSection === 'availability' || selectedSection === 'available' || isFindPage) && styles.hiddenSection]}>
        {selectedSection === 'available' ? (
          <Text style={styles.sectionTitle}>Guarda chi è disponibile</Text>
        ) : null}

        <View style={[styles.availabilityHeroCard, selectedSection !== 'availability' && styles.hiddenSection]}>
          <Text style={styles.availabilityKicker}>La parte forte di Bajuju Flash</Text>
          <Text style={styles.availabilityText}>
            Scegli provincia, comune e durata. Gli altri potranno trovarti e invitarti a fare qualcosa dal vivo.
          </Text>

          <Text style={styles.availabilityLabel}>Provincia</Text>
          <View style={styles.choiceWrap}>
            {ACTIVE_PROVINCES.map((province) => (
              <Pressable
                key={`availability-province-${province}`}
                style={[
                  styles.choiceChip,
                  availabilityProvince === province && styles.choiceChipActive,
                ]}
                onPress={() => setAvailabilityProvince(province)}
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    availabilityProvince === province && styles.choiceChipTextActive,
                  ]}
                >
                  {availabilityProvince === province ? `✓ ${province}` : province}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.availabilityLabel}>Seleziona comune</Text>

          <Pressable
            style={styles.municipalityDropdownButton}
            onPress={() => setShowAvailabilityMunicipalityList((value) => !value)}
          >
            <Text
              style={[
                styles.municipalityDropdownText,
                hasSelectedValidAvailabilityCity && styles.municipalityDropdownTextSelected,
              ]}
              numberOfLines={1}
            >
              {hasSelectedValidAvailabilityCity ? availabilityCity : 'Seleziona comune'}
            </Text>
            <Text style={styles.municipalityDropdownArrow}>
              {showAvailabilityMunicipalityList ? '⌃' : '⌄'}
            </Text>
          </Pressable>

          {showAvailabilityMunicipalityList ? (
            <ScrollView
              style={styles.municipalitySelectBox}
              contentContainerStyle={styles.municipalitySelectContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {availabilityMunicipalities.map((city) => (
                <Pressable
                  key={`availability-city-${city}`}
                  style={[
                    styles.municipalitySelectItem,
                    availabilityCity === city && styles.municipalitySelectItemActive,
                  ]}
                  onPress={() => {
                    setAvailabilityCity(city);
                    setShowAvailabilityMunicipalityList(false);
                  }}
                >
                  <Text
                    style={[
                      styles.municipalitySelectItemText,
                      availabilityCity === city && styles.municipalitySelectItemTextActive,
                    ]}
                  >
                    {availabilityCity === city ? `✓ ${city}` : city}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <Text style={styles.availabilityLabel}>Per quanto tempo vuoi farti vedere?</Text>
          <View style={styles.choiceRow}>
            {[
              { value: 1 as AvailabilityDuration, label: '1 ora' },
              { value: 2 as AvailabilityDuration, label: '2 ore' },
              { value: 3 as AvailabilityDuration, label: '3 ore' },
              { value: 'evening' as AvailabilityDuration, label: 'Fino a stasera' },
            ].map((duration) => (
              <Pressable
                key={`availability-duration-${duration.value}`}
                style={[
                  styles.durationChip,
                  availabilityDurationHours === duration.value && styles.durationChipActive,
                ]}
                onPress={() => setAvailabilityDurationHours(duration.value)}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    availabilityDurationHours === duration.value && styles.durationChipTextActive,
                  ]}
                >
                  {availabilityDurationHours === duration.value ? `✓ ${duration.label}` : duration.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {myActiveAvailability ? (
            <View style={styles.activeAvailabilityBox}>
              <Text style={styles.activeAvailabilityTitle}>Sei già disponibile</Text>
              <Text style={styles.activeAvailabilityText}>
                La tua disponibilità è attiva. Se vuoi cambiarla, annullala e creane una nuova.
              </Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.availabilityMainButton,
              (savingAvailability || !!myActiveAvailability) && styles.buttonDisabled,
            ]}
            onPress={saveAvailability}
            disabled={savingAvailability || !!myActiveAvailability}
          >
            <Text style={styles.availabilityMainButtonText}>
              {savingAvailability ? 'Ti sto rendendo visibile...' : myActiveAvailability ? 'Disponibilità già attiva' : 'Mi rendo disponibile'}
            </Text>
          </Pressable>

          {myActiveAvailability ? (
            <Pressable
              style={[styles.cancelAvailabilityButton, cancellingAvailability && styles.buttonDisabled]}
              onPress={cancelAvailability}
              disabled={cancellingAvailability}
            >
              <Text style={styles.cancelAvailabilityButtonText}>
                {cancellingAvailability ? 'Annullamento...' : 'Annulla disponibilità'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.availablePeopleSection, selectedSection !== 'available' && styles.hiddenSection]}>
          <View style={styles.availablePeopleHeader}>
            <View style={styles.availablePeopleHeaderText}>
              <Text style={styles.availablePeopleTitle}>Persone disponibili ora</Text>
              <Text style={styles.availablePeopleSubtitle}>Scorri chi è disponibile ora. Per invitare una persona devi avere un tuo Flash attivo.</Text>
            </View>
            <Text style={styles.availablePeopleCount}>
              {availableRows.filter((row) => selectedProvince === 'Tutte' || firstText(row, ['province']) === selectedProvince).length}
            </Text>
          </View>

          {loadingAvailableUsers ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator />
              <Text style={styles.mutedText}>Cerco persone disponibili...</Text>
            </View>
          ) : availableRows.filter((row) => selectedProvince === 'Tutte' || firstText(row, ['province']) === selectedProvince).length === 0 ? (
            <Text style={styles.availablePeopleEmpty}>
              Nessuna persona disponibile ora con questi filtri. Renditi disponibile tu e apri il movimento.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.availableCardsRow}>
              {availableRows
                .filter((row) => selectedProvince === 'Tutte' || firstText(row, ['province']) === selectedProvince)
                .map((row, index) => {
                  const profile = availableProfiles[availableUserId(row)];
                  const photo = availableProfilePhoto(profile);

                  return (
                    <View key={`available-user-${firstText(row, ['id'], String(index))}`} style={styles.availablePersonCard}>
                      <View style={styles.availablePhotoBox}>
                        {photo ? (
                          <Image source={{ uri: photo }} style={styles.availablePhoto} resizeMode="cover" />
                        ) : (
                          <Image source={bajujuLogo} style={styles.availablePhotoFallback} resizeMode="contain" />
                        )}
                      </View>

                      <Text style={styles.availableName} numberOfLines={1}>
                        {availableProfileName(profile)}
                        {firstValue(profile, ['age'], null) ? ` · ${firstValue(profile, ['age'], '')} anni` : ''}
                      </Text>
                      <Text style={styles.availableZone} numberOfLines={1}>
                        {[firstText(row, ['city']), firstText(row, ['province'])].filter(Boolean).join(' · ')}
                      </Text>
                      <Text style={styles.availableTime}>{availabilityRemainingText(row)}</Text>

                      <Pressable
                        style={[
                          styles.availableInviteButton,
                          sendingAvailabilityInviteTo === availableUserId(row) && styles.buttonDisabled,
                        ]}
                        onPress={() => sendAvailabilityInvite(availableUserId(row))}
                        disabled={sendingAvailabilityInviteTo === availableUserId(row)}
                      >
                        <Text style={styles.availableInviteButtonText}>
                          {sendingAvailabilityInviteTo === availableUserId(row) ? 'Invio...' : 'Invita al mio Flash'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
            </ScrollView>
          )}
        </View>

        <View style={[selectedSection !== 'find' && !isFindPage && styles.hiddenSection]}>
          <Text style={styles.sectionTitleSmall}>Provincia</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {['Tutte', ...ACTIVE_PROVINCES].map((province) => (
              <Pressable
                key={province}
                style={[styles.chip, selectedProvince === province && styles.chipActive]}
                onPress={() => setSelectedProvince(province)}
              >
                <Text style={[styles.chipText, selectedProvince === province && styles.chipTextActive]}>
                  {province}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitleSmall}>Filtri</Text>

          <View style={styles.tabsRow}>
            <Pressable
              style={[styles.tabButton, selectedTab === 'all' && styles.tabButtonActive]}
              onPress={() => setSelectedTab('all')}
            >
              <Text style={[styles.tabText, selectedTab === 'all' && styles.tabTextActive]}>Tutti</Text>
            </Pressable>

            <Pressable
              style={[styles.tabButton, selectedTab === 'mine' && styles.tabButtonActive]}
              onPress={() => setSelectedTab('mine')}
            >
              <Text style={[styles.tabText, selectedTab === 'mine' && styles.tabTextActive]}>I miei</Text>
            </Pressable>

            <Pressable
              style={[styles.tabButton, selectedTab === 'joined' && styles.tabButtonActive]}
              onPress={() => setSelectedTab('joined')}
            >
              <Text style={[styles.tabText, selectedTab === 'joined' && styles.tabTextActive]}>A cui partecipo</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={[styles.card, !(selectedSection === 'create' || isCreatePage) && styles.hiddenSection]}>
        <Text style={styles.sectionTitle}>Crea un Flash</Text>

        {!isCreatePage ? (
          <Pressable style={styles.secondaryButton} onPress={() => setShowCreateForm((value) => !value)}>
            <Text style={styles.secondaryButtonText}>
              {showCreateForm ? 'Nascondi modulo' : 'Apri modulo crea Flash'}
            </Text>
          </Pressable>
        ) : null}

        <>
            <Text style={styles.label}>Titolo Flash</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Es. Aperitivo tra mezz'ora"
              placeholderTextColor="#a36a86"
              style={styles.input}
              maxLength={80}
            />

            <Text style={styles.label}>Descrizione breve</Text>
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Es. Ci troviamo per bere qualcosa e fare due chiacchiere"
              placeholderTextColor="#a36a86"
              style={[styles.input, styles.flashDescriptionInput]}
              multiline
              maxLength={140}
              textAlignVertical="top"
            />
            <Text style={styles.flashDescriptionCounter}>
              {newDescription.length}/140
            </Text>

            <Text style={styles.label}>Provincia</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {ACTIVE_PROVINCES.map((province) => (
                <Pressable
                  key={province}
                  style={[styles.chip, newProvince === province && styles.chipActive]}
                  onPress={() => {
                    setNewProvince(province);
                    setNewCity('');
                  }}
                >
                  <Text style={[styles.chipText, newProvince === province && styles.chipTextActive]}>
                    {province}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>Comune</Text>
            <Pressable
              style={styles.municipalityDropdownButton}
              onPress={() => setShowNewMunicipalityList((value) => !value)}
            >
              <Text
                style={[
                  styles.municipalityDropdownText,
                  hasSelectedValidNewCity && styles.municipalityDropdownTextSelected,
                ]}
                numberOfLines={1}
              >
                {hasSelectedValidNewCity ? newCity : 'Seleziona comune'}
              </Text>
              <Text style={styles.municipalityDropdownArrow}>
                {showNewMunicipalityList ? '⌃' : '⌄'}
              </Text>
            </Pressable>

            {showNewMunicipalityList ? (
              <ScrollView style={styles.municipalitySelectBox} nestedScrollEnabled>
                {newMunicipalities.map((city) => (
                  <Pressable
                    key={`new-flash-city-${city}`}
                    style={[
                      styles.municipalitySelectItem,
                      newCity === city && styles.municipalitySelectItemActive,
                    ]}
                    onPress={() => {
                      setNewCity(city);
                      setShowNewMunicipalityList(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.municipalitySelectItemText,
                        newCity === city && styles.municipalitySelectItemTextActive,
                      ]}
                    >
                      {newCity === city ? `✓ ${city}` : city}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <Text style={styles.label}>Indirizzo</Text>
            <TextInput
              value={newPlace}
              onChangeText={setNewPlace}
              placeholder="Es. Via Roma"
              placeholderTextColor="#a36a86"
              style={styles.input}
            />

            <Text style={styles.addressFallbackText}>
              Se l’indirizzo inserito non viene trovato correttamente, verrà utilizzato il centro del comune selezionato.
            </Text>

            <Text style={styles.label}>Numero civico</Text>
            <TextInput
              value={newStreetNumber}
              onChangeText={(value) => setNewStreetNumber(value.replace(/[^0-9a-zA-Z\/\-]/g, '').slice(0, 8))}
              placeholder="Es. 12"
              placeholderTextColor="#a36a86"
              style={styles.input}
            />

            <Text style={styles.label}>Disponibilità</Text>
            <View style={styles.durationRow}>
              {[1, 2, 3].map((hours) => (
                <Pressable
                  key={hours}
                  style={[styles.durationButton, newDurationHours === hours && styles.durationButtonActive]}
                  onPress={() => setNewDurationHours(hours as FlashDuration)}
                >
                  <Text style={[styles.durationText, newDurationHours === hours && styles.durationTextActive]}>
                    {hours} {hours === 1 ? 'ora' : 'ore'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.formNote}>
              Per i Flash non devi inserire data e ora: partono subito e restano disponibili per il tempo scelto.
              Inserisci via e numero civico separati: se il civico non viene trovato, Bajuju prova comunque a cercare la via.
            </Text>

            <Pressable
              style={[styles.button, savingFlash && styles.buttonDisabled]}
              onPress={createFlash}
              disabled={savingFlash}
            >
              <Text style={styles.buttonText}>{savingFlash ? 'Creazione in corso...' : 'Crea un Flash'}</Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, savingFlash && styles.buttonDisabled]}
              disabled={savingFlash}
              onPress={() => {
                setNewTitle('');
                setNewDescription('');
                setNewCity('');
                setNewPlace('');
                setNewStreetNumber('');
                setNewProvince('Bergamo');
                setNewDurationHours(2);
                setShowCreateForm(false);
              }}
            >
              <Text style={styles.secondaryButtonText}>Annulla creazione</Text>
            </Pressable>

          </>
      </View>

      <View style={!(selectedSection === 'find' || isFindPage) ? styles.hiddenSection : undefined}>
        {!loading && !errorMessage ? (
          <BajujuMap
            items={flashMapItems}
            mapTitle="Flash sulla mappa"
            mapSubtitle="Tocca un marker per vedere l’anteprima."
            emptyText="Nessun Flash con coordinate disponibile con questi filtri."
            previewActionText="Tocca questa anteprima per aprire il Flash"
            onOpenItem={openFlashMapItem}
          />
        ) : null}
      </View>

      <View style={[styles.card, !(selectedSection === 'find' || isFindPage) && styles.hiddenSection]}>
        <Text style={styles.sectionTitle}>Flash disponibili</Text>

        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>Caricamento Flash...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.emptyBox}>
            <Text style={styles.errorTitle}>Errore caricamento</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable style={styles.smallButton} onPress={loadFlashRows}>
              <Text style={styles.smallButtonText}>Riprova</Text>
            </Pressable>
          </View>
        ) : filteredRows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {selectedTab === 'mine'
                ? 'Non hai Flash attivi'
                : selectedTab === 'joined'
                  ? 'Non stai partecipando a nessun Flash'
                  : 'Nessun Flash trovato'}
            </Text>
            <Text style={styles.mutedText}>
              {selectedTab === 'mine'
                ? 'Quando crei un Flash, lo vedrai qui finché resta disponibile.'
                : selectedTab === 'joined'
                  ? 'Quando partecipi a un Flash, lo ritroverai in questa sezione.'
                  : 'Non ci sono ancora Flash disponibili con questi filtri.'}
            </Text>
          </View>
        ) : (
          filteredRows.map((row, index) => (
            <View key={String(firstValue(row, ['id', 'activity_id']) || index)} style={styles.flashBox}>
              <Text style={styles.flashTitle}>{flashTitle(row)}</Text>

              {firstText(row, ['description', 'descrizione'], '').trim() ? (
                <Text style={styles.flashDescription} numberOfLines={3}>
                  {firstText(row, ['description', 'descrizione'], '').trim()}
                </Text>
              ) : null}

              <Text style={styles.flashMeta}>{flashCity(row)}{flashProvince(row) ? ` · ${flashProvince(row)}` : ''}</Text>
              {flashCreator(row) || creatorNames[flashCreatorId(row)] ? (
                <Text style={styles.flashMeta}>
                  Creato da: {flashCreator(row) || creatorNames[flashCreatorId(row)]}
                </Text>
              ) : null}
              <Text style={styles.flashMeta}>{formatDate(firstValue(row, [
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
              ]))}</Text>

              {flashPlace(row) ? <Text style={styles.flashPlace}>{flashPlace(row)}</Text> : null}

              <Text style={styles.flashMeta}>
                Partecipanti: {participantCounts[String(firstValue(row, ['id', 'activity_id'], ''))] ?? 0}
              </Text>

              {firstValue(row, ['expires_at', 'expiresAt', 'expiry_at', 'expires']) ? (
                <Text style={styles.flashMeta}>
                  Disponibile fino a: {formatDate(firstValue(row, ['expires_at', 'expiresAt', 'expiry_at', 'expires']))}
                </Text>
              ) : null}

              <Text style={styles.flashStatusText}>
                {rowBelongsToUser(row, userId)
                  ? 'Tu organizzi questo Flash'
                  : joinedActivityIds.has(String(firstValue(row, ['id', 'activity_id'], '')))
                    ? 'Partecipi a questo Flash'
                    : 'Puoi partecipare a questo Flash'}
              </Text>

              <View style={styles.flashActionsRow}>
                <Pressable
                  style={[styles.smallButton, styles.flashActionButton]}
                  onPress={() => router.push({
                    pathname: '/flash-detail',
                    params: { id: String(firstValue(row, ['id', 'activity_id'], '')) },
                  })}
                >
                  <Text style={styles.smallButtonText}>Vedi dettaglio</Text>
                </Pressable>

                <Pressable
                  style={[styles.shareFlashButton, styles.flashActionButton]}
                  onPress={() =>
                    shareBajujuFlash({
                      title: flashTitle(row),
                      city: flashCity(row),
                      province: flashProvince(row),
                      date: String(firstValue(row, ['activity_date', 'date', 'data', 'day', 'giorno'], '') || ''),
                      time: String(firstValue(row, ['activity_time', 'time', 'ora'], '') || ''),
                    })
                  }
                >
                  <Text style={styles.shareFlashButtonText}>Condividi</Text>
                </Pressable>
              </View>

              {rowBelongsToUser(row, userId) ? (
                <View style={styles.ownerActions}>
                  <Text style={styles.ownerBadge}>Creato da: te</Text>

                  <Pressable
                    style={[
                      styles.cancelButton,
                      cancellingActivityId === String(firstValue(row, ['id', 'activity_id'], '')) && styles.buttonDisabled,
                    ]}
                    onPress={() => cancelFlash(row)}
                    disabled={cancellingActivityId === String(firstValue(row, ['id', 'activity_id'], ''))}
                  >
                    <Text style={styles.cancelButtonText}>
                      {cancellingActivityId === String(firstValue(row, ['id', 'activity_id'], ''))
                        ? 'Annullamento...'
                        : 'Annulla Flash'}
                    </Text>
                  </Pressable>
                </View>
              ) : joinedActivityIds.has(String(firstValue(row, ['id', 'activity_id'], ''))) ? (
                <View style={styles.joinedActions}>
                  <Text style={styles.joinedBadge}>Stai partecipando</Text>

                  <Pressable
                    style={[
                      styles.leaveButton,
                      leavingActivityId === String(firstValue(row, ['id', 'activity_id'], '')) && styles.buttonDisabled,
                    ]}
                    onPress={() => leaveFlash(row)}
                    disabled={leavingActivityId === String(firstValue(row, ['id', 'activity_id'], ''))}
                  >
                    <Text style={styles.leaveButtonText}>
                      {leavingActivityId === String(firstValue(row, ['id', 'activity_id'], ''))
                        ? 'Uscita...'
                        : 'Abbandona Flash'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.joinButton}
                  onPress={() => joinFlash(row)}
                  disabled={joiningActivityId === String(firstValue(row, ['id', 'activity_id'], ''))}
                >
                  <Text style={styles.joinButtonText}>
                    {joiningActivityId === String(firstValue(row, ['id', 'activity_id'], ''))
                      ? 'Partecipazione...'
                      : 'Partecipa al Flash'}
                  </Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flashLiveWideButton: {
    width: '100%',
    minHeight: 68,
    marginTop: 10,
    alignItems: 'flex-start',
  },
  flashWideMainButton: {
    width: '100%',
    minHeight: 112,
    marginTop: 4,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  flashMainChoiceSubtext: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6,
  },
  flashMainChoiceIcon: {
    color: '#ef2d82',
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  flashMainChoiceText: {
    color: '#331426',
  },
  flashHeroTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 10,
  },
  flashHeroTextBlock: {
    flex: 1,
  },
  flashDedicatedText: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  flashDedicatedTitle: {
    color: '#4b1430',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  flashDedicatedLogoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff0f7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    overflow: 'hidden',
  },
  flashDedicatedHeroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    width: '100%',
  },
  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14,
  },
  hiddenSection: {
    display: 'none',
  },
  flashBackButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginTop: 0,
    marginBottom: 4,
  },
  flashBackText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
  },
  flashHeroCard: {
    borderRadius: 32,
    padding: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f7d4e3',
    alignItems: 'stretch',
    shadowColor: '#8b2d5a',
    shadowOpacity: 0.12,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  flashLogoCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f6d7e4',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  flashLogoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    borderRadius: 999,
  },
  flashHeroPhrase: {
    color: '#331426',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'left',
    marginTop: 4,
    letterSpacing: -0.6,
  },
  flashHeroText: {
    color: '#43152f',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  flashChoiceRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  flashChoiceButton: {
    flex: 1,
    minHeight: 104,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderWidth: 2,
  },
  flashCreateChoiceButton: {
    backgroundColor: '#ffffff',
    borderColor: '#f5d4e2',
  },
  flashMainChoiceButton: {
    minHeight: 118,
    shadowColor: '#8b2d5a',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  flashFindChoiceButton: {
    backgroundColor: '#ffffff',
    shadowColor: '#8b2d5a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    borderColor: '#f5d4e2',
  },
  flashSecondaryChoiceIcon: {
    color: '#ef2d82',
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  flashSecondaryChoiceText: {
    color: '#331426',
  },
  flashChoiceIcon: {
    fontSize: 11,
    marginBottom: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  flashChoiceText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  flashAvailabilityHeroButton: {
    width: '100%',
    marginTop: 14,
    borderRadius: 24,
    paddingVertical: 19,
    paddingHorizontal: 18,
    backgroundColor: '#ef2d82',
    borderWidth: 2,
    borderColor: '#f7a7cd',
    shadowColor: '#ef2d82',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashAvailabilityHeroIcon: {
    fontSize: 30,
    marginBottom: 6,
  },
  flashAvailabilityHeroText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  flashSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  availabilityHeroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 10,
  },
  availabilityKicker: {
    color: '#ef2d82',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  availabilityTitle: {
    color: '#ffffff',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  availabilityText: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  availabilityLabel: {
    color: '#4b1430',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 6,
  },
  availabilityHelpText: {
    color: '#ffe5f1',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  availabilityMainButton: {
    backgroundColor: '#ef2d82',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  availabilityMainButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  activeAvailabilityBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#ffd3e6',
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginTop: 8,
  },
  activeAvailabilityTitle: {
    color: '#7a1248',
    fontSize: 15,
    fontWeight: '900',
  },
  activeAvailabilityText: {
    color: '#9b1f61',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  cancelAvailabilityButton: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#ffd3e6',
  },
  cancelAvailabilityButtonText: {
    color: '#9b1f61',
    fontSize: 16,
    fontWeight: '900',
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: '#ffd3e6',
  },
  choiceChipActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#7a1248',
    borderWidth: 4,
    shadowColor: '#ef2d82',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  choiceChipText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
  },
  choiceChipTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  durationChip: {
    backgroundColor: '#fff0f7',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderWidth: 2,
    borderColor: '#ffd3e6',
  },
  durationChipActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#7a1248',
    borderWidth: 4,
    shadowColor: '#ef2d82',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  durationChipText: {
    color: '#9b1f61',
    fontSize: 13,
    fontWeight: '900',
  },
  durationChipTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  selectedAvailabilityBox: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#ef2d82',
    paddingVertical: 10,
    paddingHorizontal: 13,
    marginTop: 10,
    marginBottom: 8,
  },
  selectedAvailabilityLabel: {
    color: '#7a1248',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  selectedAvailabilityValue: {
    color: '#ef2d82',
    fontSize: 16,
    fontWeight: '900',
  },
  addressFallbackText: {
    color: '#8b4b69',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  municipalityDropdownButton: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#ffd3e6',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  municipalityDropdownText: {
    flex: 1,
    color: '#9b1f61',
    fontSize: 15,
    fontWeight: '900',
  },
  municipalityDropdownTextSelected: {
    color: '#ef2d82',
  },
  municipalityDropdownArrow: {
    color: '#ef2d82',
    fontSize: 20,
    fontWeight: '900',
  },
  municipalitySelectBox: {
    maxHeight: 340,
    backgroundColor: '#fff8fb',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffd3e6',
    marginTop: 8,
  },
  municipalitySelectContent: {
    padding: 8,
    gap: 7,
  },
  municipalitySelectItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderWidth: 2,
    borderColor: '#ffd3e6',
  },
  municipalitySelectItemActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#7a1248',
    borderWidth: 4,
  },
  municipalitySelectItemText: {
    color: '#9b1f61',
    fontSize: 14,
    fontWeight: '900',
  },
  municipalitySelectItemTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },

  availablePeopleSection: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    padding: 15,
    marginBottom: 18,
    gap: 13,
    shadowColor: '#e43f98',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  availablePeopleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  availablePeopleHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  availablePeopleTitle: {
    color: '#4b1430',
    fontSize: 21,
    fontWeight: '900',
  },
  availablePeopleSubtitle: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 3,
  },
  availablePeopleCount: {
    color: '#e43f98',
    fontSize: 28,
    fontWeight: '900',
  },
  availablePeopleEmpty: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  availableCardsRow: {
    gap: 14,
    paddingRight: 16,
    paddingBottom: 4,
  },
  availablePersonCard: {
    width: 250,
    backgroundColor: '#ffffff',
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#ffd3e6',
    padding: 13,
    shadowColor: '#e43f98',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  availablePhotoBox: {
    width: '100%',
    height: 240,
    borderRadius: 26,
    backgroundColor: '#fff0f7',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  availablePhoto: {
    width: '100%',
    height: '100%',
  },
  availablePhotoFallback: {
    width: 120,
    height: 120,
  },
  availableName: {
    color: '#4b1430',
    fontSize: 20,
    fontWeight: '900',
  },
  availableZone: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  availableTime: {
    color: '#e43f98',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 7,
  },
  availableInviteButton: {
    backgroundColor: '#e43f98',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  availableInviteButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },

  sectionTitleSmall: {
    color: '#86104f',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },

  mapHighlightButton: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#fff0f7',
    borderWidth: 2,
    borderColor: '#e43f98',
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapHighlightIcon: {
    fontSize: 30,
  },
  mapHighlightTextBox: {
    flex: 1,
  },
  mapHighlightTitle: {
    color: '#e43f98',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 3,
  },
  mapHighlightSubtitle: {
    color: '#43152f',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },

  mapSmallButton: {
    borderRadius: 999,
    backgroundColor: '#e43f98',
    shadowColor: '#e43f98',
    shadowOpacity: 0.30,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  mapSmallButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  flashInstructions: {
    backgroundColor: '#fff0f7',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    color: '#7b4960',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 21,
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  kicker: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 15,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 33,
    fontWeight: '900',
    marginBottom: 14,
  },
  text: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
  },
  button: {
    backgroundColor: '#ef2d82',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    backgroundColor: '#fff0f7',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#ef2d82',
    fontSize: 16,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  label: {
    color: '#4b1430',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 7,
  },
  flashDescriptionInput: {
    minHeight: 72,
    maxHeight: 90,
    paddingTop: 12,
  },
  flashDescriptionCounter: {
    alignSelf: 'flex-end',
    color: '#9c7b8b',
    fontSize: 11,
    fontWeight: '800',
    marginTop: -6,
    marginBottom: 2,
  },
  flashDescription: {
    color: '#6f4258',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
  },
  input: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    backgroundColor: '#fff0f7',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#4b1430',
    marginBottom: 14,
  },
  formNote: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  durationRow: {
    gap: 10,
    marginBottom: 14,
  },
  durationButton: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
  },
  durationButtonActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#ef2d82',
  },
  durationText: {
    color: '#7b4960',
    fontSize: 15,
    fontWeight: '900',
  },
  durationTextActive: {
    color: '#ffffff',
  },
  sectionTitle: {
    color: '#4b1430',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  chipsRow: {
    gap: 10,
    paddingBottom: 18,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  chipActive: {
    backgroundColor: '#ef2d82',
    borderColor: '#ef2d82',
  },
  chipText: {
    color: '#7b4960',
    fontSize: 14,
    fontWeight: '900',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ef8fbe',
    backgroundColor: '#fff0f7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tabButtonActive: {
    backgroundColor: '#ffe3f0',
    borderColor: '#ef2d82',
  },
  tabText: {
    color: '#86104f',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#ef2d82',
  },
  emptyBox: {
    backgroundColor: '#fff0f7',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    gap: 8,
  },
  emptyTitle: {
    color: '#4b1430',
    fontSize: 17,
    fontWeight: '900',
  },
  mutedText: {
    color: '#7b4960',
    fontSize: 15,
    lineHeight: 21,
  },
  errorTitle: {
    color: '#b00020',
    fontSize: 17,
    fontWeight: '900',
  },
  errorText: {
    color: '#7b1d35',
    fontSize: 15,
    lineHeight: 21,
  },
  smallButton: {
    backgroundColor: '#ef2d82',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  flashActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  flashActionButton: {
    flex: 1,
    borderRadius: 999,
    minHeight: 42,
    justifyContent: 'center',
  },
  shareFlashButton: {
    borderRadius: 999,
    backgroundColor: '#fff7fb',
    borderWidth: 1,
    borderColor: '#f4b3d1',
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  shareFlashButtonText: {
    color: '#e43f98',
    fontSize: 13,
    fontWeight: '900',
  },
  smallButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  flashBox: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd5e8',
    marginBottom: 12,
    shadowColor: '#e43f98',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  flashTitle: {
    color: '#421229',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 5,
    letterSpacing: -0.2,
  },
  flashMeta: {
    color: '#7f5268',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  flashPlace: {
    color: '#4b1430',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    fontWeight: '800',
    backgroundColor: '#fff7fb',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  mapButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ef2d82',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  mapButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  noMapText: {
    color: '#a36a86',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
  },
  ownerActions: {
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ffe1ee',
  },
  cancelButton: {
    backgroundColor: '#fff7fb',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ef8fbe',
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#e43f98',
    fontWeight: '900',
    fontSize: 13,
  },
  flashStatusText: {
    alignSelf: 'flex-start',
    marginTop: 12,
    color: '#8f3d65',
    backgroundColor: '#fff2f8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontWeight: '900',
    fontSize: 12,
  },
  joinedActions: {
    gap: 10,
    marginTop: 12,
  },
  leaveButton: {
    backgroundColor: '#fff0f7',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#d6457a',
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#d6457a',
    fontWeight: '900',
    fontSize: 14,
  },
  joinButton: {
    width: '100%',
    backgroundColor: '#ef2d82',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  joinedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8fff2',
    color: '#187a45',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    marginTop: 10,
  },
  ownerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffe3f0',
    color: '#ef2d82',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    marginTop: 10,
  },
});
