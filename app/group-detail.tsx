import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { joinBajujuGroup, leaveBajujuGroup } from '../src/lib/bajujuGroups';
import { supabase } from '../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../src/theme/bajujuTheme';

type MemberRow = {
  user_id?: string | null;
  nickname?: string | null;
  age_range?: string | null;
  origin?: string | null;
};

type ExperienceRow = {
  id?: string | null;
  title?: string | null;
  city?: string | null;
  province?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
};

export default function GroupDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = String(params.id || '').trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [group, setGroup] = useState<any>(null);
  const [ownerName, setOwnerName] = useState('Bajuju');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [joined, setJoined] = useState(false);

  const refresh = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const authResult = await supabase.auth.getUser();
      if (authResult.error) throw authResult.error;
      const userId = authResult.data.user?.id || '';
      setCurrentUserId(userId);

      const groupResult = await supabase
        .from('groups')
        .select('id,name,description,city,province,category,owner_id,status')
        .eq('id', groupId)
        .maybeSingle();

      if (groupResult.error) throw groupResult.error;
      if (!groupResult.data) {
        setGroup(null);
        return;
      }
      setGroup(groupResult.data);

      const ownerId = String(groupResult.data.owner_id || '');
      const [ownerResult, membersResult, linksResult] = await Promise.all([
        ownerId
          ? supabase.from('profiles').select('nickname').eq('id', ownerId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.rpc('get_group_member_profiles', { p_group_id: groupId }),
        supabase.from('group_activities').select('activity_id').eq('group_id', groupId),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (linksResult.error) throw linksResult.error;

      setOwnerName(String(ownerResult.data?.nickname || 'Bajuju'));
      const safeMembers = (membersResult.data || []) as MemberRow[];
      setMembers(safeMembers);
      setJoined(safeMembers.some((member) => String(member.user_id || '') === userId));

      const activityIds = [...new Set((linksResult.data || []).map((row: any) => String(row.activity_id || '')).filter(Boolean))];
      if (activityIds.length === 0) {
        setExperiences([]);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const activitiesResult = await supabase
          .from('activities')
          .select('id,title,city,province,activity_date,activity_time')
          .in('id', activityIds)
          .eq('is_flash', false)
          .is('deleted_at', null)
          .gte('activity_date', today)
          .order('activity_date', { ascending: true })
          .order('activity_time', { ascending: true });

        if (activitiesResult.error) throw activitiesResult.error;
        setExperiences((activitiesResult.data || []) as ExperienceRow[]);
      }
    } catch (error) {
      console.log('Errore dettaglio gruppo:', error);
      Alert.alert('Errore', 'Non sono riuscito a caricare il gruppo.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function toggleMembership() {
    if (!currentUserId || !groupId || busy || !group) return;
    if (String(group.owner_id || '') === currentUserId) return;

    setBusy(true);
    try {
      if (joined) {
        await leaveBajujuGroup(groupId, currentUserId);
      } else {
        await joinBajujuGroup(groupId, currentUserId);
      }
      await refresh();
    } catch (error: any) {
      Alert.alert('Operazione non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={BAJUJU_COLORS.brightPink} />
          <Text style={styles.loadingText}>Carico il gruppo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <Text style={styles.notFoundTitle}>Gruppo non trovato</Text>
          <Pressable style={styles.backPill} onPress={() => router.replace('/groups' as any)}>
            <Text style={styles.backPillText}>Torna ai gruppi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = String(group.owner_id || '') === currentUserId;
  const place = [group.city, group.province].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>← Gruppi</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.heroIcon}><Text style={styles.heroIconText}>👥</Text></View>
          <Text style={styles.title}>{group.name}</Text>
          {place ? <Text style={styles.place}>{place}</Text> : null}
          {group.category ? <Text style={styles.category}>{group.category}</Text> : null}
          <Text style={styles.description}>{group.description}</Text>
          <Text style={styles.owner}>Gestito da {ownerName}</Text>
          <Text style={styles.count}>{members.length} {members.length === 1 ? 'iscritto' : 'iscritti'}</Text>

          {isOwner ? (
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerBadgeText}>Sei il proprietario del gruppo</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.joinButton, joined && styles.leaveButton, busy && styles.disabled]}
              disabled={busy}
              onPress={() => { void toggleMembership(); }}
            >
              <Text style={[styles.joinButtonText, joined && styles.leaveButtonText]}>
                {busy ? 'Aggiorno...' : joined ? 'Abbandona gruppo' : 'Iscriviti al gruppo'}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prossime esperienze</Text>
          {experiences.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nessuna esperienza associata al gruppo al momento.</Text>
            </View>
          ) : (
            experiences.map((experience) => (
              <Pressable
                key={String(experience.id)}
                style={styles.experienceCard}
                onPress={() => router.push({ pathname: '/experience-detail' as any, params: { id: String(experience.id || '') } })}
              >
                <Text style={styles.experienceTitle}>{experience.title || 'Esperienza Bajuju'}</Text>
                <Text style={styles.experienceMeta}>
                  {[experience.city || experience.province, experience.activity_date, experience.activity_time?.slice(0, 5)].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.experienceArrow}>Apri esperienza ›</Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Iscritti</Text>
          <Text style={styles.privacyText}>Nel gruppo sono mostrati solo nome, età e provenienza.</Text>
          <View style={styles.membersCard}>
            {members.map((member, index) => (
              <View key={String(member.user_id || index)} style={[styles.memberRow, index > 0 && styles.memberBorder]}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{String(member.nickname || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{member.nickname || 'Utente Bajuju'}</Text>
                  <Text style={styles.memberMeta}>
                    {[
                      member.age_range ? `${member.age_range} anni` : '',
                      member.origin || '',
                    ].filter(Boolean).join(' · ') || 'Informazioni non disponibili'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  container: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 80 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  loadingText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  notFoundTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 24 },
  backPill: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink },
  backPillText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  hero: { marginTop: 15, padding: 22, borderRadius: 30, borderWidth: 1.5, borderColor: BAJUJU_COLORS.line, backgroundColor: '#fff', alignItems: 'center', ...BAJUJU_SHADOW },
  heroIcon: { width: 74, height: 74, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  heroIconText: { fontSize: 36 },
  title: { marginTop: 13, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 31, textAlign: 'center' },
  place: { marginTop: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  category: { marginTop: 7, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, overflow: 'hidden', color: BAJUJU_COLORS.brightPink, backgroundColor: BAJUJU_COLORS.palePink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  description: { marginTop: 14, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  owner: { marginTop: 14, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  count: { marginTop: 4, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  joinButton: { minHeight: 50, marginTop: 17, paddingHorizontal: 22, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  joinButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  leaveButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: BAJUJU_COLORS.brightPink },
  leaveButtonText: { color: BAJUJU_COLORS.brightPink },
  ownerBadge: { minHeight: 46, marginTop: 17, paddingHorizontal: 18, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  ownerBadgeText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  disabled: { opacity: 0.5 },
  section: { marginTop: 26 },
  sectionTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 22 },
  privacyText: { marginTop: 4, marginBottom: 11, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  emptyCard: { marginTop: 11, padding: 18, borderRadius: 22, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff' },
  emptyText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  experienceCard: { marginTop: 11, padding: 17, borderRadius: 22, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  experienceTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  experienceMeta: { marginTop: 5, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  experienceArrow: { marginTop: 9, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  membersCard: { borderRadius: 23, overflow: 'hidden', borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff' },
  memberRow: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  memberBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line },
  memberAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  memberAvatarText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  memberCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  memberName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  memberMeta: { marginTop: 3, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
});