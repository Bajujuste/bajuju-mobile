import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BajujuAdminRing } from '../profile/BajujuAdminRing';
import { BajujuActionSheet, BajujuSheetAction } from './BajujuActionSheet';
import { RoleBadge } from './BajujuGroupBoard';
import {
  GroupMemberWithRole,
  GroupRole,
  groupErrorMessage,
  removeGroupMember,
  setGroupMemberRole,
} from '../../lib/bajujuGroupBoard';
import { GroupJoinRequest } from '../../lib/bajujuGroups';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import { GroupTheme, needsOutline } from '../../utils/groupColors';

type Props = {
  groupId: string;
  currentUserId: string;
  myRole: GroupRole | null;
  // Admin di Bajuju: può tutto quello che può il proprietario.
  isSuperAdmin: boolean;
  members: GroupMemberWithRole[];
  joinRequests: GroupJoinRequest[];
  reviewBusyUserId: string;
  onReview: (userId: string, accept: boolean) => void;
  adminIds: Set<string>;
  theme: GroupTheme;
  onChanged: () => void;
  onPhotoPress: (url: string) => void;
};

function MemberAvatar({ name, url, isAdmin, onPress }: { name: string | null; url: string | null; isAdmin: boolean; onPress: () => void }) {
  return (
    <BajujuAdminRing size={48} isAdmin={isAdmin}>
      <Pressable style={styles.avatar} disabled={!url} onPress={onPress}>
        {url ? (
          <Image source={{ uri: url }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <Text style={styles.avatarText}>{String(name || '?').slice(0, 1).toUpperCase()}</Text>
        )}
      </Pressable>
    </BajujuAdminRing>
  );
}

export function BajujuGroupMembers({
  groupId,
  currentUserId,
  myRole,
  isSuperAdmin,
  members,
  joinRequests,
  reviewBusyUserId,
  onReview,
  adminIds,
  theme,
  onChanged,
  onPhotoPress,
}: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GroupMemberWithRole | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = isSuperAdmin || myRole === 'owner' || myRole === 'admin';
  const actsAsOwner = isSuperAdmin || myRole === 'owner';

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => String(member.nickname || '').toLowerCase().includes(query));
  }, [members, search]);

  const owners = filtered.filter((member) => member.role === 'owner');
  const admins = filtered.filter((member) => member.role === 'admin');
  const regular = filtered.filter((member) => member.role === 'member');

  function actionsFor(member: GroupMemberWithRole): BajujuSheetAction[] {
    if (!canManage || member.user_id === currentUserId || member.role === 'owner') return [];
    if (member.role === 'admin' && !actsAsOwner) return [];

    const name = member.nickname || 'questo utente';
    const actions: BajujuSheetAction[] = [];
    if (actsAsOwner) {
      actions.push(member.role === 'admin'
        ? {
            key: 'demote',
            label: 'Togli ruolo admin',
            description: 'Torna membro normale, resta nel gruppo',
            icon: 'person-remove-outline',
            onPress: () => { void changeRole(member, 'member'); },
          }
        : {
            key: 'promote',
            label: 'Nomina admin',
            description: 'Potrà pubblicare, accettare richieste e gestire i membri',
            icon: 'shield-checkmark-outline',
            onPress: () => { void changeRole(member, 'admin'); },
          });
    }
    actions.push(
      {
        key: 'remove',
        label: 'Rimuovi dal gruppo',
        description: 'Potrà chiedere di rientrare',
        icon: 'exit-outline',
        destructive: true,
        onPress: () => confirmRemove(member, false, name),
      },
      {
        key: 'ban',
        label: 'Rimuovi e blocca',
        description: 'Non potrà più rientrare né richiederlo',
        icon: 'ban-outline',
        destructive: true,
        onPress: () => confirmRemove(member, true, name),
      }
    );
    return actions;
  }

  async function changeRole(member: GroupMemberWithRole, role: 'admin' | 'member') {
    if (busy) return;
    setBusy(true);
    try {
      await setGroupMemberRole(groupId, member.user_id, role);
      onChanged();
    } catch (error) {
      Alert.alert('Operazione non riuscita', groupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(member: GroupMemberWithRole, ban: boolean, name: string) {
    Alert.alert(
      ban ? `Rimuovere e bloccare ${name}?` : `Rimuovere ${name} dal gruppo?`,
      ban
        ? 'Uscirà dal gruppo e non potrà più rientrare né chiederlo, finché non lo sblocchi dalle impostazioni del gruppo.'
        : 'Uscirà dal gruppo, ma potrà chiedere di rientrare.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: ban ? 'Rimuovi e blocca' : 'Rimuovi',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await removeGroupMember(groupId, member.user_id, ban);
                onChanged();
              } catch (error) {
                Alert.alert('Operazione non riuscita', groupErrorMessage(error));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }

  function renderMember(member: GroupMemberWithRole, index: number) {
    const actions = actionsFor(member);
    const mine = member.user_id === currentUserId;
    return (
      <View key={member.user_id} style={[styles.row, index > 0 && styles.rowBorder]}>
        <MemberAvatar
          name={member.nickname}
          url={member.avatar_url}
          isAdmin={adminIds.has(member.user_id)}
          onPress={() => { if (member.avatar_url) onPhotoPress(member.avatar_url); }}
        />
        <Pressable
          style={styles.rowCopy}
          onPress={() => router.push({ pathname: '/user-profile' as any, params: { userId: member.user_id } })}
          accessibilityRole="button"
          accessibilityLabel={`Apri il profilo di ${member.nickname || 'questo utente'}`}
        >
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{member.nickname || 'Utente Bajuju'}{mine ? ' (tu)' : ''}</Text>
            <RoleBadge role={member.role} theme={theme} />
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {[member.age_range ? `${member.age_range} anni` : '', member.origin || ''].filter(Boolean).join(' · ') || ' '}
          </Text>
        </Pressable>
        {actions.length > 0 ? (
          <Pressable
            style={styles.moreButton}
            onPress={() => setSelected(member)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Gestisci ${member.nickname || 'membro'}`}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={BAJUJU_COLORS.muted} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  function section(title: string, rows: GroupMemberWithRole[]) {
    if (rows.length === 0) return null;
    return (
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.card}>{rows.map(renderMember)}</View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={BAJUJU_COLORS.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cerca un membro"
          placeholderTextColor={BAJUJU_COLORS.muted}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      {canManage && joinRequests.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Richieste in attesa · {joinRequests.length}</Text>
          <View style={styles.card}>
            {joinRequests.map((request, index) => {
              const requestUserId = String(request.user_id || '').trim();
              const avatarUrl = String(request.avatar_url || '').trim();
              const requestBusy = reviewBusyUserId === requestUserId;
              return (
                <View key={requestUserId || String(index)} style={[styles.requestRow, index > 0 && styles.rowBorder]}>
                  <View style={styles.requestTop}>
                    <MemberAvatar
                      name={request.nickname || null}
                      url={avatarUrl || null}
                      isAdmin={adminIds.has(requestUserId)}
                      onPress={() => { if (avatarUrl) onPhotoPress(avatarUrl); }}
                    />
                    <Pressable
                      style={styles.rowCopy}
                      disabled={!requestUserId}
                      onPress={() => router.push({ pathname: '/user-profile' as any, params: { userId: requestUserId } })}
                    >
                      <Text style={styles.name} numberOfLines={1}>{request.nickname || 'Utente Bajuju'}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {[
                          request.gender || '',
                          request.age_range ? `${request.age_range} anni` : '',
                          request.origin || '',
                        ].filter(Boolean).join(' · ') || 'Apri il profilo per vedere i dettagli'}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.requestActions}>
                    <Pressable
                      style={[styles.rejectButton, requestBusy && styles.disabled]}
                      disabled={requestBusy}
                      onPress={() => onReview(requestUserId, false)}
                    >
                      <Text style={styles.rejectText}>Rifiuta</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.acceptButton,
                        { backgroundColor: theme.primary },
                        needsOutline(theme.primary) && styles.outline,
                        requestBusy && styles.disabled,
                      ]}
                      disabled={requestBusy}
                      onPress={() => onReview(requestUserId, true)}
                    >
                      <Text style={[styles.acceptText, { color: theme.onPrimary }]}>{requestBusy ? '...' : 'Accetta'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {section('Proprietario', owners)}
      {section(`Admin · ${admins.length}`, admins)}
      {section(`Membri · ${regular.length}`, regular)}
      {filtered.length === 0 ? <Text style={styles.empty}>Nessun membro trovato.</Text> : null}

      <BajujuActionSheet
        visible={Boolean(selected)}
        title={selected?.nickname || 'Membro'}
        subtitle={selected?.role === 'admin' ? 'Admin del gruppo' : 'Membro del gruppo'}
        actions={selected ? actionsFor(selected) : []}
        onClose={() => setSelected(null)}
        footer={!actsAsOwner ? (
          <Text style={styles.sheetNote}>Gli admin possono gestire solo i membri normali. Gli admin li gestisce il proprietario.</Text>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outline: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  disabled: { opacity: 0.5 },
  wrap: { gap: 14 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: BAJUJU_COLORS.white },
  searchInput: { flex: 1, minHeight: 46, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.medium, fontSize: 15 },
  sectionTitle: { marginBottom: 8, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white },
  row: { minHeight: 68, paddingLeft: 14, paddingRight: 4, flexDirection: 'row', alignItems: 'center' },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BAJUJU_COLORS.line },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 17 },
  rowCopy: { flex: 1, minWidth: 0, marginLeft: 12, paddingVertical: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  meta: { marginTop: 2, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  moreButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  requestRow: { padding: 14 },
  requestTop: { flexDirection: 'row', alignItems: 'center' },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rejectButton: { flex: 1, minHeight: 42, borderRadius: 21, borderWidth: 1.5, borderColor: '#E3A0B8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  rejectText: { color: '#A3345E', fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  acceptButton: { flex: 1, minHeight: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  acceptText: { fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  empty: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  sheetNote: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: BAJUJU_COLORS.softPink, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
});
