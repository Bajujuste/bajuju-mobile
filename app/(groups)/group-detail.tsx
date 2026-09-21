import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BajujuGroupChat } from '../../src/components/groups/BajujuGroupChat';
import {
  joinBajujuGroup,
  leaveBajujuGroup,
  uploadBajujuGroupCover,
} from '../../src/lib/bajujuGroups';
import { supabase } from '../../src/lib/supabase';
import { BAJUJU_COLORS, BAJUJU_FONTS, BAJUJU_SHADOW } from '../../src/theme/bajujuTheme';
import { shareBajujuGroup } from '../../src/utils/shareBajuju';

type MemberRow = {
  user_id?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
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
  const [manageBusy, setManageBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const [ownerName, setOwnerName] = useState('Bajuju');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selectedMemberPhotoUrl, setSelectedMemberPhotoUrl] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [joined, setJoined] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');

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

      const [groupResult, profileResult] = await Promise.all([
        supabase
          .from('groups')
          .select('id,name,description,city,province,category,cover_url,owner_id,status,review_note')
          .eq('id', groupId)
          .maybeSingle(),
        userId
          ? supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      if (groupResult.error) throw groupResult.error;
      if (profileResult.error) throw profileResult.error;
      setIsAdmin(profileResult.data?.is_admin === true);

      if (!groupResult.data) {
        setGroup(null);
        return;
      }

      setGroup(groupResult.data);
      setDescriptionDraft(String(groupResult.data.description || ''));
      setNameDraft(String(groupResult.data.name || ''));

      const ownerId = String(groupResult.data.owner_id || '');
      const [ownerResult, membersResult, linksResult, memberCountResult] = await Promise.all([
        ownerId
          ? supabase.from('profiles').select('nickname').eq('id', ownerId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.rpc('get_group_member_profiles', { p_group_id: groupId }),
        supabase.from('group_activities').select('activity_id').eq('group_id', groupId),
        supabase.rpc('get_group_member_count' as any, { p_group_id: groupId }),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (linksResult.error) throw linksResult.error;

      setOwnerName(String(ownerResult.data?.nickname || 'Bajuju'));
      const safeMembers = (membersResult.data || []) as MemberRow[];
      const memberIds = safeMembers
        .map((member) => String(member.user_id || '').trim())
        .filter(Boolean);

      const avatarsResult = memberIds.length
        ? await supabase.from('profiles').select('id,avatar_url').in('id', memberIds)
        : ({ data: [], error: null } as any);

      if (avatarsResult.error) throw avatarsResult.error;

      const avatarByUserId = new Map<string, string>(
        (avatarsResult.data || []).map(
          (profile: any): [string, string] => [
            String(profile.id || ''),
            String(profile.avatar_url || '').trim(),
          ]
        )
      );

      const membersWithPhotos = safeMembers.map((member) => ({
        ...member,
        avatar_url: avatarByUserId.get(String(member.user_id || '')) || null,
      }));

      setMembers(membersWithPhotos);
      // Se la funzione di conteggio non è ancora disponibile si usa la lunghezza dell'elenco.
      setMemberCount(
        !memberCountResult.error && memberCountResult.data !== null && memberCountResult.data !== undefined
          ? Number(memberCountResult.data)
          : safeMembers.length
      );
      setJoined(safeMembers.some((member) => String(member.user_id || '') === userId));

      const activityIds = [
        ...new Set(
          (linksResult.data || [])
            .map((row: any) => String(row.activity_id || ''))
            .filter(Boolean)
        ),
      ];

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

  async function resubmitForApproval() {
    if (!groupId || !currentUserId || manageBusy || !group) return;
    if (String(group.owner_id || '') !== currentUserId || String(group.status || '') !== 'rejected') return;

    setManageBusy(true);
    try {
      const result = await supabase.rpc('resubmit_group_for_approval' as any, {
        p_group_id: groupId,
      });
      if (result.error) throw result.error;
      await refresh();
      Alert.alert('Richiesta inviata', 'Il gruppo è tornato in approvazione.');
    } catch (error: any) {
      Alert.alert('Invio non riuscito', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setManageBusy(false);
    }
  }

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

  async function handleShareGroup() {
    if (!group) return;

    try {
      await shareBajujuGroup({
        id: groupId,
        name: group.name,
        category: group.category,
        city: group.city,
        province: group.province,
      });
    } catch (error: unknown) {
      Alert.alert(
        'Condivisione non riuscita',
        error instanceof Error ? error.message : 'Non sono riuscito a condividere il gruppo.'
      );
    }
  }

  async function handleChangeCover() {
    if (!group || !currentUserId || coverBusy) return;
    const canManageCover = isAdmin || String(group.owner_id || '') === currentUserId;
    if (!canManageCover) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Copertina gruppo', 'Autorizza l’accesso alle immagini per scegliere la copertina del gruppo.');
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      setCoverBusy(true);
      const resized = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
      );

      await uploadBajujuGroupCover({
        groupId,
        userId: currentUserId,
        localUri: resized.uri,
      });

      await refresh();
      Alert.alert('Copertina aggiornata', 'La nuova immagine del gruppo è online.');
    } catch (error: unknown) {
      Alert.alert(
        'Copertina non aggiornata',
        error instanceof Error ? error.message : 'Non sono riuscito ad aggiornare la copertina.'
      );
    } finally {
      setCoverBusy(false);
    }
  }

  async function saveDescription() {
    const cleanDescription = descriptionDraft.trim();
    if (!groupId || manageBusy || cleanDescription.length < 10) {
      if (cleanDescription.length < 10) {
        Alert.alert('Descrizione troppo corta', 'Inserisci almeno 10 caratteri.');
      }
      return;
    }

    setManageBusy(true);
    try {
      const result = await supabase
        .from('groups')
        .update({ description: cleanDescription })
        .eq('id', groupId)
        .select('id,description')
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('La modifica non è stata applicata.');

      setGroup((current: any) => current ? { ...current, description: result.data.description } : current);
      setDescriptionDraft(String(result.data.description || ''));
      Alert.alert('Descrizione aggiornata', 'La nuova descrizione del gruppo è online.');
    } catch (error: any) {
      Alert.alert('Modifica non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setManageBusy(false);
    }
  }

  async function saveGroupChanges() {
    const cleanName = nameDraft.trim();
    const cleanDescription = descriptionDraft.trim();

    if (!isAdmin || !groupId || manageBusy) return;
    if (cleanName.length < 3) {
      Alert.alert('Nome troppo corto', 'Inserisci almeno 3 caratteri.');
      return;
    }
    if (cleanDescription.length < 10) {
      Alert.alert('Descrizione troppo corta', 'Inserisci almeno 10 caratteri.');
      return;
    }

    setManageBusy(true);
    try {
      const result = await supabase
        .from('groups')
        .update({
          name: cleanName,
          description: cleanDescription,
        })
        .eq('id', groupId)
        .select('id,name,description')
        .maybeSingle();

      if (result.error) throw result.error;
      if (!result.data) throw new Error('Le modifiche non sono state applicate.');

      setGroup((current: any) => current ? { ...current, ...result.data } : current);
      setNameDraft(String(result.data.name || ''));
      setDescriptionDraft(String(result.data.description || ''));
      Alert.alert('Gruppo aggiornato', 'Nome e descrizione sono stati salvati.');
    } catch (error: any) {
      Alert.alert('Modifica non riuscita', String(error?.message || 'Riprova tra poco.'));
    } finally {
      setManageBusy(false);
    }
  }

  function confirmTakeOwnership() {
    if (!isAdmin || !groupId || !currentUserId || manageBusy) return;

    Alert.alert(
      'Prendere possesso del gruppo?',
      `Il gruppo passerà da ${ownerName} al tuo account Admin. Gli iscritti e le esperienze resteranno invariati.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Prendi possesso',
          onPress: () => {
            void (async () => {
              setManageBusy(true);
              try {
                const result = await supabase
                  .from('groups')
                  .update({ owner_id: currentUserId })
                  .eq('id', groupId);
                if (result.error) throw result.error;
                await refresh();
                Alert.alert('Proprietà trasferita', 'Ora sei il proprietario del gruppo.');
              } catch (error: any) {
                Alert.alert('Trasferimento non riuscito', String(error?.message || 'Riprova tra poco.'));
              } finally {
                setManageBusy(false);
              }
            })();
          },
        },
      ]
    );
  }

  function confirmDeleteGroup() {
    if (!isAdmin || !groupId || manageBusy) return;

    Alert.alert(
      'Eliminare definitivamente il gruppo?',
      'Il gruppo verrà rimosso. Questa operazione è riservata agli Admin e non può essere annullata.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina gruppo',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setManageBusy(true);
              try {
                const result = await supabase.from('groups').delete().eq('id', groupId);
                if (result.error) throw result.error;
                router.replace('/groups' as any);
              } catch (error: any) {
                Alert.alert('Eliminazione non riuscita', String(error?.message || 'Riprova tra poco.'));
                setManageBusy(false);
              }
            })();
          },
        },
      ]
    );
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
  const place = String(group.city || '').trim();
  const canManageGroup = isOwner || isAdmin;
  const coverUrl = String(group.cover_url || '').trim();
  const groupStatus = String(group.status || 'active').toLowerCase();
  const isPublicGroup = groupStatus === 'active';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>← Gruppi</Text>
        </Pressable>

        <View style={styles.hero}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroIcon}><Text style={styles.heroIconText}>👥</Text></View>
          )}

          <Text style={styles.title}>{group.name}</Text>
          {place ? <Text style={styles.place}>{place}</Text> : null}
          {group.category ? <Text style={styles.category}>{group.category}</Text> : null}
          <Text style={styles.description}>{group.description}</Text>
          <Text style={styles.owner}>Gestito da {ownerName}</Text>
          {isPublicGroup ? <Text style={styles.count}>{memberCount} {memberCount === 1 ? 'iscritto' : 'iscritti'}</Text> : null}

          {!isPublicGroup ? (
            <View style={[styles.statusCard, groupStatus === 'rejected' && styles.statusCardRejected]}>
              <Text style={[styles.statusTitle, groupStatus === 'rejected' && styles.statusTitleRejected]}>
                {groupStatus === 'rejected' ? 'Da rivedere' : 'In approvazione'}
              </Text>
              <Text style={styles.statusText}>
                {groupStatus === 'rejected'
                  ? String(group.review_note || 'Bajuju non ha approvato questa versione del gruppo. Puoi correggerla e inviarla di nuovo.')
                  : 'Il gruppo è visibile solo a te e agli Admin finché Bajuju non lo approva.'}
              </Text>
              {isOwner && groupStatus === 'rejected' ? (
                <Pressable
                  style={[styles.resubmitButton, manageBusy && styles.disabled]}
                  disabled={manageBusy}
                  onPress={() => { void resubmitForApproval(); }}
                >
                  <Text style={styles.resubmitButtonText}>{manageBusy ? 'Invio...' : 'Invia di nuovo per approvazione'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Pressable style={styles.shareButton} onPress={() => { void handleShareGroup(); }}>
              <Text style={styles.shareButtonText}>↗ Condividi gruppo</Text>
            </Pressable>
          )}

          {isOwner ? (
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerBadgeText}>Sei il proprietario del gruppo</Text>
            </View>
          ) : isPublicGroup ? (
            <Pressable
              style={[styles.joinButton, joined && styles.leaveButton, busy && styles.disabled]}
              disabled={busy}
              onPress={() => { void toggleMembership(); }}
            >
              <Text style={[styles.joinButtonText, joined && styles.leaveButtonText]}>
                {busy ? 'Aggiorno...' : joined ? 'Abbandona gruppo' : 'Iscriviti al gruppo'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {canManageGroup ? (
          <View style={styles.managementCard}>
            <Text style={styles.managementEyebrow}>{isAdmin ? 'GESTIONE ADMIN' : 'GESTIONE GRUPPO'}</Text>
            <Text style={styles.managementTitle}>Gestisci il gruppo</Text>

            <Text style={styles.fieldLabel}>Immagine di copertina</Text>
            <Pressable
              style={[styles.secondaryAction, coverBusy && styles.disabled]}
              disabled={coverBusy}
              onPress={() => { void handleChangeCover(); }}
            >
              <Text style={styles.secondaryActionText}>
                {coverBusy ? 'Caricamento...' : coverUrl ? 'Cambia immagine di copertina' : 'Aggiungi immagine di copertina'}
              </Text>
            </Pressable>

            {isAdmin ? (
              <>
                <Text style={styles.fieldLabel}>Nome gruppo</Text>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  maxLength={60}
                  style={styles.input}
                  placeholder="Nome gruppo"
                  placeholderTextColor={BAJUJU_COLORS.muted}
                />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Descrizione</Text>
            <TextInput
              value={descriptionDraft}
              onChangeText={setDescriptionDraft}
              maxLength={500}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textArea]}
              placeholder="Descrizione del gruppo"
              placeholderTextColor={BAJUJU_COLORS.muted}
            />
            <Pressable
              style={[styles.saveButton, manageBusy && styles.disabled]}
              disabled={manageBusy}
              onPress={() => { void (isAdmin ? saveGroupChanges() : saveDescription()); }}
            >
              <Text style={styles.saveButtonText}>
                {manageBusy ? 'Salvataggio...' : isAdmin ? 'Salva modifiche' : 'Salva descrizione'}
              </Text>
            </Pressable>

            {isAdmin ? (
              <View style={styles.adminDangerZone}>
                {!isOwner ? (
                  <Pressable
                    style={[styles.takeOwnershipButton, manageBusy && styles.disabled]}
                    disabled={manageBusy}
                    onPress={confirmTakeOwnership}
                  >
                    <Text style={styles.takeOwnershipText}>Prendi possesso del gruppo</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  style={[styles.deleteButton, manageBusy && styles.disabled]}
                  disabled={manageBusy}
                  onPress={confirmDeleteGroup}
                >
                  <Text style={styles.deleteButtonText}>Elimina gruppo</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.ownerRuleText}>
                Il creatore può modificare copertina e descrizione. Nome, proprietà ed eliminazione sono riservati agli Admin.
              </Text>
            )}
          </View>
        ) : null}

        {isPublicGroup ? (
          <>
        <BajujuGroupChat
          groupId={groupId}
          currentUserId={currentUserId}
          canUseChat={joined || isOwner}
          members={members}
        />

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
          <Text style={styles.privacyText}>Tocca la foto per ingrandirla oppure il nome per aprire il profilo.</Text>
          <View style={styles.membersCard}>
            {members.map((member, index) => {
              const memberId = String(member.user_id || '').trim();
              const avatarUrl = String(member.avatar_url || '').trim();
              return (
                <View key={memberId || String(index)} style={[styles.memberRow, index > 0 && styles.memberBorder]}>
                  <Pressable
                    style={styles.memberAvatar}
                    disabled={!avatarUrl}
                    onPress={() => {
                      if (avatarUrl) setSelectedMemberPhotoUrl(avatarUrl);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={avatarUrl ? `Ingrandisci la foto di ${member.nickname || 'questo utente'}` : undefined}
                  >
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.memberAvatarImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.memberAvatarText}>{String(member.nickname || '?').slice(0, 1).toUpperCase()}</Text>
                    )}
                  </Pressable>

                  <Pressable
                    style={styles.memberCopy}
                    disabled={!memberId}
                    onPress={() => {
                      if (!memberId) return;
                      router.push({ pathname: '/user-profile' as any, params: { userId: memberId } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Apri il profilo di ${member.nickname || 'questo utente'}`}
                  >
                    <Text style={styles.memberName}>{member.nickname || 'Utente Bajuju'}</Text>
                    <Text style={styles.memberMeta}>
                      {[
                        member.age_range ? `${member.age_range} anni` : '',
                        member.origin || '',
                      ].filter(Boolean).join(' · ') || 'Informazioni non disponibili'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
          </>
        ) : (
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Le iscrizioni e le esperienze del gruppo si attivano dopo l’approvazione.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(selectedMemberPhotoUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMemberPhotoUrl(null)}
      >
        <Pressable style={styles.photoModalBackdrop} onPress={() => setSelectedMemberPhotoUrl(null)}>
          <Pressable style={styles.photoModalContent} onPress={() => {}}>
            {selectedMemberPhotoUrl ? (
              <Image source={{ uri: selectedMemberPhotoUrl }} style={styles.photoModalImage} resizeMode="contain" />
            ) : null}
            <Pressable style={styles.photoModalClose} onPress={() => setSelectedMemberPhotoUrl(null)}>
              <Text style={styles.photoModalCloseText}>Chiudi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  coverImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 22, backgroundColor: BAJUJU_COLORS.palePink },
  heroIcon: { width: 74, height: 74, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  heroIconText: { fontSize: 36 },
  title: { marginTop: 13, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 31, textAlign: 'center' },
  place: { marginTop: 4, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 13 },
  category: { marginTop: 7, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, overflow: 'hidden', color: BAJUJU_COLORS.brightPink, backgroundColor: BAJUJU_COLORS.palePink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  description: { marginTop: 14, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  owner: { marginTop: 14, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  count: { marginTop: 4, color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  statusCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#F0D58E',
    backgroundColor: '#FFF9E7',
  },
  statusCardRejected: { borderColor: '#F4C6D7', backgroundColor: '#FFF1F6' },
  statusTitle: { color: '#7A5A00', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  statusTitleRejected: { color: '#A3345E' },
  statusText: { marginTop: 5, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 13, lineHeight: 18 },
  resubmitButton: { marginTop: 12, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  resubmitButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  shareButton: { minHeight: 48, marginTop: 16, paddingHorizontal: 22, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  shareButtonText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  joinButton: { minHeight: 50, marginTop: 10, paddingHorizontal: 22, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  joinButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  leaveButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: BAJUJU_COLORS.brightPink },
  leaveButtonText: { color: BAJUJU_COLORS.brightPink },
  ownerBadge: { minHeight: 46, marginTop: 10, paddingHorizontal: 18, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  ownerBadgeText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  disabled: { opacity: 0.5 },
  managementCard: { marginTop: 22, padding: 20, borderRadius: 28, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: '#fff', ...BAJUJU_SHADOW },
  managementEyebrow: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 11, letterSpacing: 0.9 },
  managementTitle: { marginTop: 3, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 23 },
  fieldLabel: { marginTop: 16, marginBottom: 7, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, color: BAJUJU_COLORS.plum, backgroundColor: BAJUJU_COLORS.white, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  textArea: { minHeight: 112, paddingTop: 13 },
  saveButton: { minHeight: 50, marginTop: 11, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
  saveButtonText: { color: '#fff', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  secondaryAction: { minHeight: 48, marginTop: 10, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  secondaryActionText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  adminDangerZone: { marginTop: 20, paddingTop: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line, gap: 10 },
  takeOwnershipButton: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4D8', borderWidth: 1, borderColor: '#E7C56A' },
  takeOwnershipText: { color: '#7A5A00', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  deleteButton: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F0', borderWidth: 1.5, borderColor: '#E15A5A' },
  deleteButtonText: { color: '#B82424', fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  ownerRuleText: { marginTop: 14, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
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
  memberAvatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  memberAvatarImage: { width: '100%', height: '100%' },
  memberAvatarText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  memberCopy: { flex: 1, minWidth: 0, marginLeft: 12, paddingVertical: 12 },
  memberName: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  memberMeta: { marginTop: 3, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  photoModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  photoModalContent: { width: '100%', height: '86%', alignItems: 'center', justifyContent: 'center' },
  photoModalImage: { width: '100%', height: '100%', borderRadius: 18 },
  photoModalClose: { position: 'absolute', top: 12, right: 12, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  photoModalCloseText: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
});
