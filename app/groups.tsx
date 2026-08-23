import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BajujuBottomNav } from '../src/components/navigation/BajujuBottomNav';
import { BajujuGroupCard, loadBajujuGroups } from '../src/lib/bajujuGroups';
import { supabase } from '../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../src/theme/bajujuTheme';

export default function GroupsScreen() {
  const [groups, setGroups] = useState<BajujuGroupCard[]>([]);
  const [myGroups, setMyGroups] = useState<BajujuGroupCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;
      const currentUserId = authResult.data.user?.id;
      if (!currentUserId) {
        setGroups([]);
        setMyGroups([]);
        setCanCreate(false);
        setUserId('');
        return;
      }

      setUserId(currentUserId);

      const [profileResult, loadedGroups] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_admin,is_premium_organizer')
          .eq('id', currentUserId)
          .maybeSingle(),
        loadBajujuGroups(currentUserId, { limit: 100 }),
      ]);

      if (profileResult.error) throw profileResult.error;
      setCanCreate(
        profileResult.data?.is_admin === true ||
        profileResult.data?.is_premium_organizer === true
      );
      setGroups(loadedGroups);
      setMyGroups(loadedGroups.filter((group) => group.joinedByMe));
    } catch (error) {
      console.log('Errore caricamento gruppi:', error);
      setGroups([]);
      setMyGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (!userId || loading) return;
    const query = search.trim();

    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const loadedGroups = await loadBajujuGroups(userId, {
            limit: 100,
            search: query || undefined,
          });
          setGroups(loadedGroups);
        } catch (error) {
          console.log('Errore ricerca gruppi:', error);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [search, userId, loading]);

  function openGroup(groupId: string) {
    router.push({ pathname: '/group-detail' as any, params: { id: groupId } });
  }

  const hasSearch = search.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>COMMUNITY BAJUJU</Text>
          <Text style={styles.title}>Gruppi</Text>
          <Text style={styles.subtitle}>
            Cerca una community, entra nel gruppo e scopri le esperienze dedicate.
          </Text>
          {canCreate ? (
            <Pressable style={styles.createButton} onPress={() => router.push('/create-group' as any)}>
              <Text style={styles.createButtonText}>+ Crea gruppo</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca gruppo o Comune"
            placeholderTextColor={BAJUJU_COLORS.muted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable style={styles.clearSearch} onPress={() => setSearch('')} accessibilityLabel="Cancella ricerca">
              <Text style={styles.clearSearchText}>×</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={BAJUJU_COLORS.brightPink} />
            <Text style={styles.loadingText}>Carico i gruppi...</Text>
          </View>
        ) : (
          <>
            {!hasSearch && myGroups.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>I miei gruppi</Text>
                {myGroups.map((group) => (
                  <GroupRow key={`mine-${group.id}`} group={group} onPress={() => openGroup(group.id)} />
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{hasSearch ? 'Risultati' : 'Tutti i gruppi'}</Text>
                {searching ? <ActivityIndicator size="small" color={BAJUJU_COLORS.brightPink} /> : null}
              </View>
              {!hasSearch ? <Text style={styles.sectionHint}>Prima quelli più vicini a te.</Text> : null}

              {groups.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>{hasSearch ? 'Nessun gruppo trovato' : 'I primi gruppi stanno arrivando'}</Text>
                  <Text style={styles.emptyText}>
                    {hasSearch
                      ? 'Prova con un altro nome o con il Comune.'
                      : 'Quando Admin e Organizzatori Premium ne creeranno uno, lo vedrai qui.'}
                  </Text>
                </View>
              ) : (
                groups.map((group) => (
                  <GroupRow key={group.id} group={group} onPress={() => openGroup(group.id)} />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <BajujuBottomNav active="groups" />
    </SafeAreaView>
  );
}

function GroupRow({ group, onPress }: { group: BajujuGroupCard; onPress: () => void }) {
  const distance = group.distanceKm === null
    ? ''
    : group.distanceKm < 1
      ? '< 1 km'
      : `${Math.round(group.distanceKm)} km`;
  const place = [group.city, distance].filter(Boolean).join(' · ');

  return (
    <Pressable style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.groupAvatar}>
        <Text style={styles.groupAvatarText}>👥</Text>
      </View>
      <View style={styles.groupCopy}>
        <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
        {place ? <Text style={styles.groupMeta} numberOfLines={1}>{place}</Text> : null}
        <Text style={styles.groupMembers}>
          {group.memberCount} {group.memberCount === 1 ? 'iscritto' : 'iscritti'}
          {group.joinedByMe ? ' · Sei iscritto' : ''}
        </Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 150 },
  header: {
    padding: 22,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#FFFFFFE8',
    ...BAJUJU_SHADOW,
  },
  eyebrow: {
    color: BAJUJU_COLORS.brightPink,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 12,
    letterSpacing: 1.1,
  },
  title: {
    marginTop: 2,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 38,
  },
  subtitle: {
    marginTop: 7,
    color: BAJUJU_COLORS.muted,
    fontFamily: BAJUJU_FONTS.medium,
    fontSize: 15,
    lineHeight: 21,
  },
  createButton: {
    alignSelf: 'flex-start',
    minHeight: 46,
    marginTop: 17,
    paddingHorizontal: 18,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.brightPink,
  },
  createButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  searchBox: {
    minHeight: 56,
    marginTop: 18,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    ...BAJUJU_SHADOW,
  },
  searchIcon: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 24, marginRight: 8 },
  searchInput: { flex: 1, minHeight: 52, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 16 },
  clearSearch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.bold, fontSize: 24 },
  loadingBox: { paddingVertical: 56, alignItems: 'center', gap: 12 },
  loadingText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  section: { marginTop: 25 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: {
    marginBottom: 6,
    color: BAJUJU_COLORS.plum,
    fontFamily: BAJUJU_FONTS.bold,
    fontSize: 22,
  },
  sectionHint: { marginBottom: 12, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  groupCard: {
    minHeight: 88,
    marginBottom: 11,
    padding: 13,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    ...BAJUJU_SHADOW,
  },
  groupAvatar: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BAJUJU_COLORS.palePink,
  },
  groupAvatarText: { fontSize: 28 },
  groupCopy: { flex: 1, minWidth: 0, marginLeft: 13 },
  groupName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  groupMeta: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  groupMembers: { marginTop: 5, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  arrow: { marginLeft: 10, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 30 },
  emptyCard: {
    marginTop: 6,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: BAJUJU_COLORS.palePink,
    backgroundColor: '#fff',
  },
  emptyTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  emptyText: { marginTop: 6, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.72 },
});