import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Linking,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '../src/lib/supabase';
import { shareBajujuFlash } from '../src/utils/shareBajuju';
import { sendBajujuPushNotification, buildFlashNotificationTitle } from '../src/utils/bajujuNotifications';

const bajujuLogo = require('../assets/brand/bajuju-logo.png');

type LooseRow = Record<string, any>;

type FlashTab = 'all' | 'mine' | 'joined';
type FlashDuration = 1 | 2 | 3;
type FlashSection = 'create' | 'find' | null;

const ACTIVE_PROVINCES = ['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Brescia', 'Torino'];

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

function flashMapPinPosition(index: number) {
  const positions = [
    { top: '18%', left: '18%' },
    { top: '30%', left: '58%' },
    { top: '52%', left: '34%' },
    { top: '64%', left: '70%' },
    { top: '42%', left: '14%' },
    { top: '16%', left: '76%' },
    { top: '72%', left: '22%' },
    { top: '48%', left: '52%' },
  ];

  return positions[index % positions.length];
}

async function geocodeAddress(address: string, streetNumber: string, city: string, province: string) {
  const cleanAddress = address.trim();
  const cleanStreetNumber = streetNumber.trim();
  const cleanCity = city.trim();
  const cleanProvince = province.trim();

  const fullAddress = cleanStreetNumber ? `${cleanAddress} ${cleanStreetNumber}` : cleanAddress;

  const queries = [
    `${fullAddress}, ${cleanCity}, ${cleanProvince}, Italia`,
    `${fullAddress}, ${cleanCity}, Italia`,
    `${cleanAddress}, ${cleanCity}, ${cleanProvince}, Italia`,
    `${cleanAddress}, ${cleanCity}, Italia`,
    `${cleanAddress}, ${cleanProvince}, Italia`,
    `${cleanCity}, ${cleanProvince}, Italia`,
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
  const [joiningActivityId, setJoiningActivityId] = useState<string | null>(null);
  const [leavingActivityId, setLeavingActivityId] = useState<string | null>(null);
  const [cancellingActivityId, setCancellingActivityId] = useState<string | null>(null);
  const [selectedMapFlashId, setSelectedMapFlashId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string>('Tutte');
  const [selectedTab, setSelectedTab] = useState<FlashTab>('all');
  const [selectedSection, setSelectedSection] = useState<FlashSection>(forcedSection ?? null);

  const [newTitle, setNewTitle] = useState('');
  const [newProvince, setNewProvince] = useState('Bergamo');
  const [newCity, setNewCity] = useState('');
  const [newPlace, setNewPlace] = useState('');
  const [newStreetNumber, setNewStreetNumber] = useState('');
  const [newDurationHours, setNewDurationHours] = useState<FlashDuration>(2);
  const [savingFlash, setSavingFlash] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFlashRows();
    setRefreshing(false);
  }, [loadFlashRows]);

  const createFlash = useCallback(async () => {
    if (savingFlash) return;

    const cleanTitle = newTitle.trim();
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

    const hasStreetNumber = /\d+[a-zA-Z]?/.test(cleanStreetNumber);

    if (!hasStreetNumber) {
      if (typeof window !== 'undefined') {
        window.alert('Inserisci il numero civico nel campo dedicato, esempio: 12.');
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

      const now = new Date();
      const cleanDate = now.toISOString().slice(0, 10);
      const cleanTime = now.toTimeString().slice(0, 8);
      const expiresAt = new Date(now.getTime() + newDurationHours * 60 * 60 * 1000).toISOString();

      const coordinates = await geocodeAddress(cleanPlace, cleanStreetNumber, cleanCity, cleanProvince);

      if (!coordinates) {
        if (typeof window !== 'undefined') {
          window.alert(
            'Indirizzo non trovato. Controlla via e comune, oppure prova a togliere o correggere il numero civico.'
          );
        }
        return;
      }

      const payload = {
        creator_id: creatorId,
        title: cleanTitle,
        category: 'altro',
        description: `Bajuju Flash creato da mobile app. Disponibile per ${newDurationHours} ore.`,
        city: cleanCity,
        province: cleanProvince,
        meeting_place: cleanStreetNumber ? `${cleanPlace} ${cleanStreetNumber}` : cleanPlace,
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
  }, [loadFlashRows, newCity, newDurationHours, newPlace, newProvince, newStreetNumber, newTitle, savingFlash]);

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

    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm('Vuoi annullare questo Flash? Non sarà più visibile tra i Flash disponibili.');

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

      const result = await supabase
        .from('activities')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', activityId);

      if (result.error) {
        if (typeof window !== 'undefined') {
          window.alert(`Errore annullamento Flash: ${result.error.message}`);
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

    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm('Vuoi abbandonare questo Flash?');

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

        <Text style={styles.kicker}>Bajuju Flash</Text>
        <Text style={styles.flashInstructions}>Qui puoi scegliere se farti vedere dagli altri per 1, 2 o 3 ore, organizzare subito qualcosa o essere invitato in un Flash.</Text>

        <View style={styles.flashLogoCircle}>
          <Image source={bajujuLogo} style={styles.flashLogoImage} resizeMode="contain" />
        </View>

        <Text style={styles.flashHeroPhrase}>
          Un’idea semplice. Qualcuno disponibile. Si parte.
        </Text>

        <Text style={styles.flashHeroText}>
          Fatti vedere per 1, 2 o 3 ore. Organizza subito qualcosa o fatti invitare da chi è disponibile ora.
        </Text>

        <View style={styles.flashChoiceRow}>
          <Pressable
            style={[styles.flashChoiceButton, styles.flashCreateChoiceButton]}
            onPress={() => router.push('/flash-create')}
          >
            <Text style={styles.flashChoiceIcon}>⚡</Text>
            <Text style={styles.flashChoiceText}>Crea un Flash</Text>
          </Pressable>

          <Pressable
            style={[styles.flashChoiceButton, styles.flashFindChoiceButton]}
            onPress={() => router.push('/flash-find')}
          >
            <Text style={styles.flashChoiceIcon}>👀</Text>
            <Text style={styles.flashChoiceText}>Trova chi c’è ora</Text>
          </Pressable>
        </View>

        <Text style={styles.flashHeroNote}>
          Flash è pensato per decidere adesso: poche ore, persone disponibili, zero perdite di tempo.
        </Text>
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
            {isCreatePage ? 'Crea un Flash' : 'Trova chi c’è ora'}
          </Text>
          <Text style={styles.flashDedicatedText}>
            {isCreatePage
              ? 'Compila pochi dati e pubblica subito il tuo Flash.'
              : 'Guarda i Flash disponibili adesso e scegli a quale partecipare.'}
          </Text>
        </View>
      ) : null}

      <View style={[styles.card, !(selectedSection === 'find' || isFindPage) && styles.hiddenSection]}>
        <Text style={styles.sectionTitle}>Trova chi c’è ora</Text>

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
            />

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
            <TextInput
              value={newCity}
              onChangeText={setNewCity}
              placeholder="Es. Bergamo"
              placeholderTextColor="#a36a86"
              style={styles.input}
            />

            <Text style={styles.label}>Indirizzo</Text>
            <TextInput
              value={newPlace}
              onChangeText={setNewPlace}
              placeholder="Es. Via Roma"
              placeholderTextColor="#a36a86"
              style={styles.input}
            />

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

      <View style={[styles.card, !(selectedSection === 'find' || isFindPage) && styles.hiddenSection]}>
        <Text style={styles.sectionTitle}>Mappa Flash disponibili</Text>

        {filteredRows.filter((row) => !!getCoordinates(row)).length === 0 ? (
          <Text style={styles.mutedText}>Nessun Flash con coordinate disponibile con questi filtri.</Text>
        ) : (
          <View style={styles.flashVisualMapCard}>
            <View style={styles.flashVisualMapHeader}>
              <View style={styles.flashVisualMapHeaderText}>
                <Text style={styles.flashVisualMapTitle}>Flash sulla mappa</Text>
                <Text style={styles.flashVisualMapSubtitle}>Tocca un punto per vedere l’anteprima.</Text>
              </View>
              <Text style={styles.flashVisualMapCount}>{filteredRows.filter((row) => !!getCoordinates(row)).length}</Text>
            </View>

            <View style={styles.flashMapCanvas}>
              <View style={styles.flashMapBlobOne} />
              <View style={styles.flashMapBlobTwo} />
              <View style={styles.flashMapRoadOne} />
              <View style={styles.flashMapRoadTwo} />
              <Text style={styles.flashMapWatermark}>Bajuju Flash</Text>

              {filteredRows.filter((row) => !!getCoordinates(row)).slice(0, 40).map((row, index) => {
                const id = flashId(row);
                const selected = selectedMapFlashId === id;

                return (
                  <Pressable
                    key={`flash-map-pin-${id || index}`}
                    style={[
                      styles.flashMapPin,
                      flashMapPinPosition(index) as any,
                      selected && styles.flashMapPinSelected,
                    ]}
                    onPress={() => setSelectedMapFlashId(selected ? null : id)}
                  >
                    <Text style={styles.flashMapPinText}>⚡</Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedMapFlashId ? (
              (() => {
                const selectedRow = filteredRows.find((row) => flashId(row) === selectedMapFlashId);

                if (!selectedRow) return null;

                return (
                  <Pressable
                    style={styles.flashMapPreview}
                    onPress={() => router.push({
                      pathname: '/flash-detail',
                      params: { id: flashId(selectedRow) },
                    })}
                  >
                    <Text style={styles.flashMapPreviewKicker}>Flash selezionato</Text>
                    <Text style={styles.flashMapPreviewTitle} numberOfLines={2}>{flashTitle(selectedRow)}</Text>
                    <Text style={styles.flashMapPreviewMeta} numberOfLines={1}>
                      {[flashCity(selectedRow), flashProvince(selectedRow)].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.flashMapPreviewAction}>Tocca per aprire il dettaglio</Text>
                  </Pressable>
                );
              })()
            ) : null}
          </View>
        )}
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
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    alignItems: 'center',
    gap: 10,
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
    borderRadius: 36,
    padding: 20,
    backgroundColor: '#fffafd',
    borderWidth: 1,
    borderColor: '#ef8fbe',
    alignItems: 'center',
    shadowColor: '#e43f98',
    shadowOpacity: 0.26,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  flashLogoCircle: {
    width: 178,
    height: 178,
    borderRadius: 89,
    backgroundColor: '#fff0f7',
    borderWidth: 2,
    borderColor: '#ffc2df',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 16,
    overflow: 'hidden',
  },
  flashLogoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    borderRadius: 999,
  },
  flashHeroPhrase: {
    color: '#e43f98',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
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
    backgroundColor: '#c2185b',
    borderColor: '#a8144d',
  },
  flashFindChoiceButton: {
    backgroundColor: '#e43f98',
    shadowColor: '#e43f98',
    shadowOpacity: 0.30,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
    borderColor: '#c72d7d',
  },
  flashChoiceIcon: {
    fontSize: 33,
    marginBottom: 8,
  },
  flashChoiceText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  flashHeroNote: {
    marginTop: 14,
    color: '#86104f',
    fontSize: 12,
    lineHeight: 18,
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
  sectionTitleSmall: {
    color: '#86104f',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },
  flashVisualMapCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  flashVisualMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  flashVisualMapHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  flashVisualMapTitle: {
    color: '#4b1430',
    fontSize: 19,
    fontWeight: '900',
  },
  flashVisualMapSubtitle: {
    color: '#7b4960',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  flashVisualMapCount: {
    color: '#e43f98',
    fontSize: 26,
    fontWeight: '900',
  },
  flashMapCanvas: {
    position: 'relative',
    height: 260,
    borderRadius: 22,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    overflow: 'hidden',
  },
  flashMapBlobOne: {
    position: 'absolute',
    width: 190,
    height: 150,
    borderRadius: 95,
    backgroundColor: '#fff0f7',
    top: 22,
    left: 18,
    transform: [{ rotate: '-18deg' }],
  },
  flashMapBlobTwo: {
    position: 'absolute',
    width: 150,
    height: 130,
    borderRadius: 80,
    backgroundColor: '#ffe3f0',
    bottom: 18,
    right: 18,
    transform: [{ rotate: '24deg' }],
  },
  flashMapRoadOne: {
    position: 'absolute',
    width: '120%',
    height: 18,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    top: 112,
    left: -28,
    transform: [{ rotate: '-14deg' }],
    opacity: 0.88,
  },
  flashMapRoadTwo: {
    position: 'absolute',
    width: 18,
    height: '120%',
    borderRadius: 999,
    backgroundColor: '#ffffff',
    top: -22,
    left: '53%',
    transform: [{ rotate: '18deg' }],
    opacity: 0.72,
  },
  flashMapWatermark: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    color: '#f0a4ca',
    fontSize: 12,
    fontWeight: '900',
  },
  flashMapPin: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#e43f98',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashMapPinSelected: {
    backgroundColor: '#9b1f61',
    transform: [{ scale: 1.12 }],
  },
  flashMapPinText: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '900',
  },
  flashMapPreview: {
    borderRadius: 18,
    backgroundColor: '#fff0f7',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    padding: 13,
  },
  flashMapPreviewKicker: {
    color: '#e43f98',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  flashMapPreviewTitle: {
    color: '#4b1430',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  flashMapPreviewMeta: {
    color: '#7b4960',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },
  flashMapPreviewAction: {
    color: '#9b1f61',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
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
    backgroundColor: '#fffafd',
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
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  flashActionButton: {
    flex: 1,
  },
  shareFlashButton: {
    borderRadius: 999,
    backgroundColor: '#fffafd',
    borderWidth: 1,
    borderColor: '#ef8fbe',
    paddingVertical: 10,
    alignItems: 'center',
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
    backgroundColor: '#fff0f7',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginBottom: 12,
  },
  flashTitle: {
    color: '#4b1430',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  flashMeta: {
    color: '#7b4960',
    fontSize: 14,
    lineHeight: 20,
  },
  flashPlace: {
    color: '#4b1430',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    fontWeight: '700',
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
    gap: 10,
    marginTop: 12,
  },
  cancelButton: {
    backgroundColor: '#fff0f7',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ef2d82',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 14,
  },
  flashStatusText: {
    marginTop: 12,
    color: '#8f3d65',
    fontWeight: '900',
    fontSize: 13,
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
    alignSelf: 'flex-start',
    backgroundColor: '#ef2d82',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
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
