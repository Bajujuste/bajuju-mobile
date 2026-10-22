import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { BajujuIcon } from '../../src/components/icons/BajujuIcon';
import { BajujuBottomNav } from '../../src/components/navigation/BajujuBottomNav';
import { BajujuGroupCard, loadBajujuGroups } from '../../src/lib/bajujuGroups';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../src/theme/bajujuTheme';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';

type GroupRequestRow = {
  id: string;
  name?: string | null;
  city?: string | null;
  status?: string | null;
  review_note?: string | null;
};

export default function GroupsScreen() {
  const [groups, setGroups] = useState<BajujuGroupCard[]>([]);
  const [myGroups, setMyGroups] = useState<BajujuGroupCard[]>([]);
  const [groupRequests, setGroupRequests] = useState<GroupRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(320, Math.max(260, screenWidth - 76));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;
      const currentUserId = authResult.data.user?.id;
      if (!currentUserId) {
        setGroups([]);
        setMyGroups([]);
        setGroupRequests([]);
        setUserId('');
        return;
      }

      setUserId(currentUserId);

      const [loadedGroups, requestsResult] = await Promise.all([
        loadBajujuGroups(currentUserId, { limit: 100 }),
        supabase
          .from('groups')
          .select('id,name,city,status,review_note')
          .eq('owner_id', currentUserId)
          .in('status', ['pending', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (requestsResult.error) throw requestsResult.error;
      setGroups(loadedGroups);
      setMyGroups(loadedGroups.filter((group) => group.joinedByMe));
      setGroupRequests((requestsResult.data || []) as GroupRequestRow[]);
    } catch (error) {
      console.log('Errore caricamento gruppi:', error);
      setGroups([]);
      setMyGroups([]);
      setGroupRequests([]);
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
      <KeyboardAwareScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.screenTitle}>Gruppi</Text>
        <Text style={styles.subtitle}>Entra in una community e scopri le sue esperienze.</Text>

        <View style={styles.searchBox}>
          <BajujuIcon name="search" size={20} color={BAJUJU_COLORS.pink} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca per parola chiave"
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
          <View style={styles.emptyCard}>
            <ActivityIndicator color={BAJUJU_COLORS.pink} />
            <Text style={styles.emptyText}>Carico i gruppi…</Text>
          </View>
        ) : (
          <>
            {!hasSearch && groupRequests.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="Le mie richieste" count={groupRequests.length} hint="I gruppi diventano pubblici solo dopo l’approvazione di Bajuju." />
                {groupRequests.map((group) => (
                  <Pressable
                    key={`request-${group.id}`}
                    style={({ pressed }) => [styles.requestCard, pressed && styles.pressed]}
                    onPress={() => openGroup(group.id)}
                  >
                    <View style={styles.requestCopy}>
                      <Text style={styles.requestName} numberOfLines={1}>{group.name || 'Gruppo Bajuju'}</Text>
                      {group.city ? <Text style={styles.requestMeta}>{group.city}</Text> : null}
                      {group.status === 'rejected' && group.review_note ? (
                        <Text style={styles.requestNote} numberOfLines={2}>{group.review_note}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.requestBadge, group.status === 'rejected' && styles.requestBadgeRejected]}>
                      {group.status === 'rejected' ? 'Da rivedere' : 'In approvazione'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {!hasSearch && myGroups.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="I miei gruppi" count={myGroups.length} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
                  {myGroups.map((group) => (
                    <GroupCard key={`mine-${group.id}`} group={group} width={cardWidth} onPress={() => openGroup(group.id)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionHeader
                title={hasSearch ? 'Risultati' : 'Tutti i gruppi'}
                count={groups.length}
                detail={hasSearch ? '' : 'dal più vicino'}
                loading={searching}
              />

              {groups.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>{hasSearch ? 'Nessun gruppo trovato' : 'I primi gruppi stanno arrivando'}</Text>
                  <Text style={styles.emptyText}>
                    {hasSearch
                      ? 'Prova con un’altra parola.'
                      : 'Quando verranno approvati nuovi gruppi, li vedrai qui.'}
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
                  {groups.map((group) => (
                    <GroupCard key={group.id} group={group} width={cardWidth} onPress={() => openGroup(group.id)} />
                  ))}
                </ScrollView>
              )}
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Come la lista eventi: nessuna scheda evidenziata, così il tasto Home riporta davvero alla Home. */}
      <BajujuBottomNav active="find" />
    </SafeAreaView>
  );
}

function SectionHeader({ title, count, detail, hint, loading }: { title: string; count: number; detail?: string; hint?: string; loading?: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>
          {count} {count === 1 ? 'gruppo' : 'gruppi'}{detail ? ` · ${detail}` : ''}
        </Text>
        {loading ? <ActivityIndicator size="small" color={BAJUJU_COLORS.pink} /> : null}
      </View>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) return '';
  return distanceKm < 1 ? '< 1 km' : `${Math.round(distanceKm)} km`;
}

function GroupCard({ group, width, onPress }: { group: BajujuGroupCard; width: number; onPress: () => void }) {
  const distance = formatDistance(group.distanceKm);
  const place = group.city || group.province;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Apri il gruppo ${group.name}`}
      style={({ pressed }) => [styles.groupCard, { width }, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.imageBox}>
        {group.coverUrl ? (
          <Image source={{ uri: group.coverUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}><BajujuIcon name="group" size={44} color={BAJUJU_COLORS.pink} /></View>
        )}
        {group.category ? <Text style={[styles.imageChip, styles.categoryChip]} numberOfLines={1}>{group.category}</Text> : null}
        {distance ? <Text style={[styles.imageChip, styles.distanceChip]}>{distance}</Text> : null}
        {group.joinedByMe ? <Text style={[styles.imageChip, styles.joinedChip]}>Sei iscritto</Text> : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{group.name}</Text>
        {place ? (
          <View style={styles.metaRow}>
            <BajujuIcon name="pin" size={16} color="#C2287A" />
            <Text style={styles.cardMeta} numberOfLines={1}>{place}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <BajujuIcon name="group" size={16} color="#C2287A" />
          <Text style={styles.cardMeta} numberOfLines={1}>
            {group.memberCount} {group.memberCount === 1 ? 'iscritto' : 'iscritti'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { padding: 16, paddingTop: 20, paddingBottom: 150 },
  pressed: { opacity: 0.85 },
  screenTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 28, letterSpacing: -0.5 },
  subtitle: { marginTop: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 19 },
  searchBox: {
    height: 50,
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, height: 48, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 16 },
  clearSearch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.bold, fontSize: 22 },
  section: { marginTop: 24 },
  sectionHeader: { marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  sectionTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 21 },
  sectionCount: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  sectionHint: { marginTop: 3, color: '#8F5573', fontFamily: BAJUJU_FONTS.medium, fontSize: 13, lineHeight: 18 },
  cardsRow: { gap: 12, paddingRight: 16, paddingBottom: 8 },
  groupCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BAJUJU_COLORS.line },
  imageBox: { height: 150, backgroundColor: BAJUJU_COLORS.softPink },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageChip: { position: 'absolute', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  categoryChip: { top: 10, left: 10, maxWidth: '62%', backgroundColor: '#FFFFFF', color: '#9B1F61' },
  distanceChip: { top: 10, right: 10, backgroundColor: 'rgba(75, 12, 45, 0.82)', color: '#FFFFFF' },
  joinedChip: { bottom: 10, left: 10, backgroundColor: BAJUJU_COLORS.pink, color: '#FFFFFF', fontSize: 12 },
  cardBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 6 },
  cardTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18, lineHeight: 22, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMeta: { flex: 1, color: '#6B3652', fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  requestCard: {
    marginBottom: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BAJUJU_COLORS.line,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requestCopy: { flex: 1, minWidth: 0 },
  requestName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  requestMeta: { marginTop: 3, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  requestNote: { marginTop: 5, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12, lineHeight: 16 },
  requestBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#FFF4C7',
    color: '#7A5A00',
    fontFamily: BAJUJU_FONTS.semiBold,
    fontSize: 12,
  },
  requestBadgeRejected: { backgroundColor: '#FCE5EC', color: '#A3345E' },
  emptyCard: { minHeight: 150, borderRadius: 22, padding: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: BAJUJU_COLORS.line, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.bold, fontSize: 18, textAlign: 'center' },
  emptyText: { marginTop: 8, color: '#6b3652', fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
