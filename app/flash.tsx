import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

type LooseRow = Record<string, any>;

type FlashTab = 'all' | 'mine' | 'joined';
type FlashDuration = 1 | 2 | 3;

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

async function geocodeAddress(address: string, city: string, province: string) {
  const cleanAddress = address.trim();
  const cleanCity = city.trim();
  const cleanProvince = province.trim();

  const queries = [
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

export default function FlashScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<LooseRow[]>([]);
  const [joinedActivityIds, setJoinedActivityIds] = useState<Set<string>>(new Set());
  const [joiningActivityId, setJoiningActivityId] = useState<string | null>(null);
  const [cancellingActivityId, setCancellingActivityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string>('Tutte');
  const [selectedTab, setSelectedTab] = useState<FlashTab>('all');

  const [newTitle, setNewTitle] = useState('');
  const [newProvince, setNewProvince] = useState('Bergamo');
  const [newCity, setNewCity] = useState('');
  const [newPlace, setNewPlace] = useState('');
  const [newDurationHours, setNewDurationHours] = useState<FlashDuration>(2);
  const [savingFlash, setSavingFlash] = useState(false);

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
    if (!cleanTitle || !cleanProvince || !cleanCity || !cleanPlace) {
      if (typeof window !== 'undefined') {
        window.alert('Compila titolo, provincia, comune e indirizzo preciso.');
      }
      return;
    }

    const hasStreetNumber = /\d+[a-zA-Z]?/.test(cleanPlace);

    if (!hasStreetNumber) {
      if (typeof window !== 'undefined') {
        window.alert('Inserisci un indirizzo preciso con numero civico, esempio: Via Roma 12.');
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
      } else {
        const byUserId = await supabase.from('profiles').select('id').eq('user_id', authUserId).maybeSingle();

        if (!byUserId.error && byUserId.data?.id) {
          creatorId = byUserId.data.id;
        }
      }

      const now = new Date();
      const cleanDate = now.toISOString().slice(0, 10);
      const cleanTime = now.toTimeString().slice(0, 8);
      const expiresAt = new Date(now.getTime() + newDurationHours * 60 * 60 * 1000).toISOString();

      const coordinates = await geocodeAddress(cleanPlace, cleanCity, cleanProvince);

      if (!coordinates) {
        if (typeof window !== 'undefined') {
          window.alert(
            'Indirizzo non trovato. Inserisci un indirizzo reale e completo con via, numero civico, comune corretto e provincia.'
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
        meeting_place: cleanPlace,
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

      setNewTitle('');
      setNewCity('');
      setNewPlace('');
      setSelectedProvince('Tutte');
      setSelectedTab('all');

      await loadFlashRows();

      if (typeof window !== 'undefined') {
        window.alert('Flash creato correttamente.');
      }
    } finally {
      setSavingFlash(false);
    }
  }, [loadFlashRows, newCity, newDurationHours, newPlace, newProvince, newTitle, savingFlash]);

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

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (selectedProvince !== 'Tutte') {
        const province = flashProvince(row).toLowerCase().trim();
        if (province !== selectedProvince.toLowerCase().trim()) return false;
      }

      const activityId = String(firstValue(row, ['id', 'activity_id'], ''));

      if (selectedTab === 'mine') return rowBelongsToUser(row, userId);
      if (selectedTab === 'joined') return joinedActivityIds.has(activityId);

      return true;
    });
  }, [joinedActivityIds, rows, selectedProvince, selectedTab, userId]);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>Bajuju Flash</Text>
        <Text style={styles.title}>Tutto può iniziare in pochi minuti</Text>

        <Text style={styles.text}>
          Scegli la provincia e guarda i Flash disponibili collegati a Supabase.
        </Text>

        <Pressable style={styles.button} onPress={() => router.push('/flash-map')}>
          <Text style={styles.buttonText}>Mappa Flash disponibili</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => router.push('/home')}>
          <Text style={styles.secondaryButtonText}>Torna alla Home</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Provincia</Text>

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

        <Text style={styles.sectionTitle}>Filtro</Text>

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

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Crea Flash</Text>

        <Text style={styles.label}>Titolo Flash</Text>
        <TextInput
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Es. Aperitivo tra mezz'ora"
          placeholderTextColor="#a36a86"
          style={styles.input}
        />

        <Text style={styles.label}>Provincia</Text>
        <TextInput
          value={newProvince}
          onChangeText={setNewProvince}
          placeholder="Es. Bergamo"
          placeholderTextColor="#a36a86"
          style={styles.input}
        />

        <Text style={styles.label}>Comune</Text>
        <TextInput
          value={newCity}
          onChangeText={setNewCity}
          placeholder="Es. Caprino Bergamasco"
          placeholderTextColor="#a36a86"
          style={styles.input}
        />

        <Text style={styles.label}>Indirizzo preciso e numero civico</Text>
        <TextInput
          value={newPlace}
          onChangeText={setNewPlace}
          placeholder="Es. Via Roma 12"
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
          L'indirizzo deve essere preciso perché poi verrà usato per la mappa.
        </Text>

        <Pressable style={[styles.button, savingFlash && styles.buttonDisabled]} onPress={createFlash}>
          <Text style={styles.buttonText}>{savingFlash ? 'Creazione in corso...' : 'Crea Flash'}</Text>
        </Pressable>

        <Text style={styles.formNote}>
          Il Flash viene salvato su Supabase nella tabella activities con is_flash attivo e scadenza automatica.
        </Text>
      </View>

      <View style={styles.card}>
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
            <Text style={styles.emptyTitle}>Nessun Flash trovato</Text>
            <Text style={styles.mutedText}>
              Non ci sono ancora Flash disponibili con questi filtri.
            </Text>
          </View>
        ) : (
          filteredRows.map((row, index) => (
            <View key={String(firstValue(row, ['id', 'activity_id']) || index)} style={styles.flashBox}>
              <Text style={styles.flashTitle}>{flashTitle(row)}</Text>
              <Text style={styles.flashMeta}>{flashCity(row)}{flashProvince(row) ? ` · ${flashProvince(row)}` : ''}</Text>
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

              {getCoordinates(row) ? (
                <Pressable style={styles.mapButton} onPress={() => openMap(row)}>
                  <Text style={styles.mapButtonText}>Apri mappa</Text>
                </Pressable>
              ) : (
                <Text style={styles.noMapText}>Coordinate non disponibili</Text>
              )}

              {rowBelongsToUser(row, userId) ? (
                <View style={styles.ownerActions}>
                  <Text style={styles.ownerBadge}>Creato da te</Text>

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
                <Text style={styles.joinedBadge}>Stai partecipando</Text>
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
  page: {
    flexGrow: 1,
    backgroundColor: '#fff8fb',
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  kicker: {
    color: '#ef2d82',
    fontWeight: '900',
    fontSize: 15,
    marginBottom: 8,
  },
  title: {
    color: '#e43f98',
    fontSize: 28,
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
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd3e6',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#ef2d82',
    fontSize: 16,
    fontWeight: '800',
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
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffd3e6',
    backgroundColor: '#fff8fb',
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
    backgroundColor: '#fff8fb',
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
    backgroundColor: '#fff8fb',
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
    fontWeight: '800',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  tabsRow: {
    gap: 10,
  },
  tabButton: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#ffd3e6',
  },
  tabButtonActive: {
    backgroundColor: '#ffe3f0',
    borderColor: '#ef2d82',
  },
  tabText: {
    color: '#7b4960',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#ef2d82',
  },
  emptyBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 16,
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
  smallButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  flashBox: {
    backgroundColor: '#fff8fb',
    borderRadius: 18,
    padding: 16,
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
    fontWeight: '800',
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
