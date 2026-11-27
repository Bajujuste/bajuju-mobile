import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';

// Richieste di partecipazione in attesa sugli eventi e sui gruppi che ho creato io.
// Solo l'organizzatore (creator_id dell'evento, owner_id del gruppo) le vede: per gli altri le mappe restano vuote.
export type MyPendingJoinRequests = {
  activities: Record<string, number>;
  groups: Record<string, number>;
};

const EMPTY: MyPendingJoinRequests = { activities: {}, groups: {} };
const MAX_EVENTS = 40;
const CACHE_MS = 20 * 1000;

let cache: { userId: string; at: number; value: MyPendingJoinRequests } | null = null;
let inFlight: Promise<MyPendingJoinRequests> | null = null;
const listeners = new Set<(value: MyPendingJoinRequests) => void>();

function todayIso() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function fetchCounts(userId: string): Promise<MyPendingJoinRequests> {
  const activities: Record<string, number> = {};
  const groups: Record<string, number> = {};

  const [eventsResult, groupsResult] = await Promise.allSettled([
    supabase
      .from('activities')
      .select('id')
      .eq('creator_id', userId)
      .is('deleted_at', null)
      .gte('activity_date', todayIso())
      .order('activity_date', { ascending: true })
      .limit(MAX_EVENTS),
    supabase.from('groups').select('id').eq('owner_id', userId).limit(100),
  ]);

  if (eventsResult.status === 'fulfilled' && !eventsResult.value.error) {
    const ids = (eventsResult.value.data || []).map((row: any) => String(row.id || '')).filter(Boolean);
    const results = await Promise.allSettled(
      ids.map((id) => supabase.rpc('get_activity_join_requests' as any, { p_activity_id: id }))
    );
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled' || result.value.error) return;
      const count = Array.isArray(result.value.data) ? result.value.data.length : 0;
      if (count > 0) activities[ids[index]] = count;
    });
  }

  if (groupsResult.status === 'fulfilled' && !groupsResult.value.error) {
    const ids = (groupsResult.value.data || []).map((row: any) => String(row.id || '')).filter(Boolean);
    const results = await Promise.allSettled(
      ids.map((id) => supabase.rpc('get_group_join_requests' as any, { p_group_id: id }))
    );
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled' || result.value.error) return;
      const count = Array.isArray(result.value.data) ? result.value.data.length : 0;
      if (count > 0) groups[ids[index]] = count;
    });
  }

  return { activities, groups };
}

export async function refreshMyPendingJoinRequests(force = false): Promise<MyPendingJoinRequests> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id || '';
  if (!userId) {
    cache = null;
    listeners.forEach((listener) => listener(EMPTY));
    return EMPTY;
  }
  if (!force && cache && cache.userId === userId && Date.now() - cache.at < CACHE_MS) return cache.value;
  if (inFlight) return inFlight;

  inFlight = fetchCounts(userId)
    .then((value) => {
      cache = { userId, at: Date.now(), value };
      listeners.forEach((listener) => listener(value));
      return value;
    })
    .catch(() => cache?.value || EMPTY)
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function useMyPendingJoinRequests() {
  const [value, setValue] = useState<MyPendingJoinRequests>(cache?.value || EMPTY);

  useEffect(() => {
    listeners.add(setValue);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshMyPendingJoinRequests(true);
    });
    return () => {
      listeners.delete(setValue);
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshMyPendingJoinRequests(true);
    }, [])
  );

  return value;
}
