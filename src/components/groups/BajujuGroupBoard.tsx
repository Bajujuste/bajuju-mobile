import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { KeyboardAwareScrollView } from '../KeyboardAwareScrollView';
import { BajujuActionSheet } from './BajujuActionSheet';
import {
  addGroupPostComment,
  createGroupPost,
  deleteGroupPost,
  deleteGroupPostComment,
  formatRelativeTime,
  GROUP_COMMENT_MAX_LENGTH,
  GROUP_POST_MAX_IMAGES,
  GROUP_POST_MAX_LENGTH,
  GROUP_POSTS_PAGE_SIZE,
  GroupPost,
  GroupPostComment,
  GroupRole,
  groupErrorMessage,
  loadGroupPostComments,
  loadGroupPosts,
  roleLabel,
  setGroupPostPinned,
  toggleGroupPostLike,
  uploadGroupPostPhoto,
} from '../../lib/bajujuGroupBoard';
import { BAJUJU_COLORS, BAJUJU_FONTS } from '../../theme/bajujuTheme';
import { GroupTheme, needsOutline } from '../../utils/groupColors';

type Props = {
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar: string;
  canManage: boolean;
  canInteract: boolean;
  // Gruppo con approvazione e utente non membro: la bacheca è privata.
  locked: boolean;
  theme: GroupTheme;
  onPhotoPress: (url: string) => void;
};

function Avatar({ name, url, size = 38 }: { name: string | null; url: string | null; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {url ? (
        <Image source={{ uri: url }} style={styles.avatarImage} resizeMode="cover" />
      ) : (
        <Text style={styles.avatarText}>{String(name || '?').slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
}

export function RoleBadge({ role, theme }: { role: GroupRole | null | undefined; theme: GroupTheme }) {
  const label = roleLabel(role);
  if (!label) return null;
  const owner = role === 'owner';
  return (
    <Text
      style={[
        styles.roleBadge,
        owner
          ? { backgroundColor: theme.primary, color: theme.onPrimary }
          : { backgroundColor: BAJUJU_COLORS.softPink, color: BAJUJU_COLORS.plum },
        owner && needsOutline(theme.primary) && styles.outline,
      ]}
    >
      {label}
    </Text>
  );
}

function PhotoGrid({ urls, onPress }: { urls: string[]; onPress: (url: string) => void }) {
  if (urls.length === 0) return null;
  const columns = urls.length === 1 ? 1 : urls.length === 2 || urls.length === 4 ? 2 : 3;
  const height = columns === 1 ? 230 : columns === 2 ? 160 : 112;
  return (
    <View style={styles.photoGrid}>
      {urls.map((url, index) => (
        <Pressable
          key={`${url}-${index}`}
          style={{ width: `${100 / columns}%`, height, padding: 1.5 }}
          onPress={() => onPress(url)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Apri la foto ${index + 1}`}
        >
          <Image source={{ uri: url }} style={styles.photoGridImage} resizeMode="cover" />
        </Pressable>
      ))}
    </View>
  );
}

export function BajujuGroupBoard({
  groupId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  canManage,
  canInteract,
  locked,
  theme,
  onPhotoPress,
}: Props) {
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [menuPost, setMenuPost] = useState<GroupPost | null>(null);
  const [commentsPost, setCommentsPost] = useState<GroupPost | null>(null);
  const [comments, setComments] = useState<GroupPostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [likeBusyId, setLikeBusyId] = useState('');

  const refresh = useCallback(async () => {
    if (!groupId || locked) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await loadGroupPosts(groupId);
      setPosts(rows);
      setHasMore(rows.filter((post) => !post.is_pinned).length >= GROUP_POSTS_PAGE_SIZE);
      setError('');
    } catch (loadError) {
      console.log('Errore bacheca gruppo:', loadError);
      setError(groupErrorMessage(loadError, 'Non sono riuscito a caricare la bacheca.'));
    } finally {
      setLoading(false);
    }
  }, [groupId, locked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function loadMore() {
    const lastLoose = [...posts].reverse().find((post) => !post.is_pinned);
    if (!lastLoose || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await loadGroupPosts(groupId, lastLoose.created_at);
      const known = new Set(posts.map((post) => post.id));
      setPosts((current) => [...current, ...rows.filter((post) => !known.has(post.id))]);
      setHasMore(rows.length >= GROUP_POSTS_PAGE_SIZE);
    } catch (loadError) {
      Alert.alert('Bacheca', groupErrorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  }

  async function addPhotos() {
    const remaining = GROUP_POST_MAX_IMAGES - draftPhotos.length;
    if (remaining <= 0) {
      Alert.alert('Foto', `Puoi aggiungere al massimo ${GROUP_POST_MAX_IMAGES} foto.`);
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Foto', 'Autorizza l’accesso alle immagini per aggiungere foto al post.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.9,
      });
      if (result.canceled) return;
      const resized: string[] = [];
      for (const asset of result.assets.slice(0, remaining)) {
        const output = await ImageManipulator.manipulateAsync(
          asset.uri,
          asset.width > 1280 ? [{ resize: { width: 1280 } }] : [],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
        );
        resized.push(output.uri);
      }
      setDraftPhotos((current) => [...current, ...resized].slice(0, GROUP_POST_MAX_IMAGES));
    } catch (pickError) {
      Alert.alert('Foto', pickError instanceof Error ? pickError.message : 'Non sono riuscito a preparare le foto.');
    }
  }

  async function publish() {
    const body = draft.trim();
    if (publishing) return;
    if (!body && draftPhotos.length === 0) {
      Alert.alert('Bacheca', 'Scrivi un testo o aggiungi almeno una foto.');
      return;
    }
    setPublishing(true);
    try {
      const urls: string[] = [];
      for (let index = 0; index < draftPhotos.length; index += 1) {
        urls.push(await uploadGroupPostPhoto({ groupId, userId: currentUserId, localUri: draftPhotos[index], index }));
      }
      await createGroupPost(groupId, body, urls);
      setDraft('');
      setDraftPhotos([]);
      setComposerOpen(false);
      await refresh();
    } catch (publishError) {
      Alert.alert('Pubblicazione non riuscita', groupErrorMessage(publishError));
    } finally {
      setPublishing(false);
    }
  }

  async function toggleLike(post: GroupPost) {
    if (!canInteract) {
      Alert.alert('Bacheca', 'Iscriviti al gruppo per mettere like e commentare.');
      return;
    }
    if (likeBusyId) return;
    setLikeBusyId(post.id);
    try {
      const liked = await toggleGroupPostLike(post.id);
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, liked_by_me: liked, like_count: Math.max(0, item.like_count + (liked ? 1 : -1)) }
        : item));
    } catch (likeError) {
      Alert.alert('Like', groupErrorMessage(likeError));
    } finally {
      setLikeBusyId('');
    }
  }

  async function togglePin(post: GroupPost) {
    try {
      await setGroupPostPinned(post.id, !post.is_pinned);
      await refresh();
    } catch (pinError) {
      Alert.alert('Bacheca', groupErrorMessage(pinError));
    }
  }

  function confirmDelete(post: GroupPost) {
    Alert.alert('Eliminare il post?', 'Il post sparirà dalla bacheca per tutti.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteGroupPost(post.id);
              setPosts((current) => current.filter((item) => item.id !== post.id));
            } catch (deleteError) {
              Alert.alert('Bacheca', groupErrorMessage(deleteError));
            }
          })();
        },
      },
    ]);
  }

  async function openComments(post: GroupPost) {
    setCommentsPost(post);
    setComments([]);
    setCommentDraft('');
    setCommentsLoading(true);
    try {
      setComments(await loadGroupPostComments(post.id));
    } catch (commentsError) {
      Alert.alert('Commenti', groupErrorMessage(commentsError));
    } finally {
      setCommentsLoading(false);
    }
  }

  function updateCommentCount(postId: string, delta: number) {
    setPosts((current) => current.map((item) => item.id === postId
      ? { ...item, comment_count: Math.max(0, item.comment_count + delta) }
      : item));
  }

  async function sendComment() {
    const body = commentDraft.trim();
    if (!commentsPost || !body || commentBusy) return;
    setCommentBusy(true);
    try {
      await addGroupPostComment(commentsPost.id, body);
      setCommentDraft('');
      setComments(await loadGroupPostComments(commentsPost.id));
      updateCommentCount(commentsPost.id, 1);
    } catch (commentError) {
      Alert.alert('Commento non inviato', groupErrorMessage(commentError));
    } finally {
      setCommentBusy(false);
    }
  }

  function confirmDeleteComment(comment: GroupPostComment) {
    const postId = commentsPost?.id || '';
    Alert.alert('Eliminare il commento?', '', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteGroupPostComment(comment.id);
              setComments((current) => current.filter((item) => item.id !== comment.id));
              updateCommentCount(postId, -1);
            } catch (deleteError) {
              Alert.alert('Commenti', groupErrorMessage(deleteError));
            }
          })();
        },
      },
    ]);
  }

  if (locked) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="lock-closed-outline" size={22} color={theme.accent} />
        <Text style={styles.emptyTitle}>Bacheca riservata ai membri</Text>
        <Text style={styles.emptyText}>Questo gruppo è con approvazione: entra nel gruppo per vedere annunci e foto.</Text>
      </View>
    );
  }

  const pinned = posts.filter((post) => post.is_pinned);
  const others = posts.filter((post) => !post.is_pinned);

  return (
    <View style={styles.wrap}>
      {canManage ? (
        <Pressable style={styles.composerBar} onPress={() => setComposerOpen(true)} accessibilityRole="button">
          <Avatar name={currentUserName} url={currentUserAvatar || null} size={36} />
          <Text style={styles.composerPlaceholder}>Pubblica un annuncio o delle foto…</Text>
          <Ionicons name="images-outline" size={22} color={theme.accent} />
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={BAJUJU_COLORS.brightPink} />
        </View>
      ) : error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={() => { void refresh(); }} accessibilityRole="button">
            <Text style={[styles.linkText, { color: theme.accent }]}>Riprova</Text>
          </Pressable>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="megaphone-outline" size={22} color={theme.accent} />
          <Text style={styles.emptyTitle}>Ancora nessun annuncio</Text>
          <Text style={styles.emptyText}>
            {canManage
              ? 'Pubblica il primo annuncio: orari, novità, foto dell’ultima uscita.'
              : 'Qui troverai gli annunci e le foto di chi gestisce il gruppo.'}
          </Text>
        </View>
      ) : (
        [...pinned, ...others].map((post) => (
          <View key={post.id} style={styles.post}>
            {post.is_pinned ? (
              <View style={styles.pinnedRow}>
                <Ionicons name="pin" size={13} color={theme.accent} />
                <Text style={[styles.pinnedText, { color: theme.accent }]}>Annuncio fissato</Text>
              </View>
            ) : null}
            <View style={styles.postHeader}>
              <Avatar name={post.author_nickname} url={post.author_avatar_url} />
              <View style={styles.postAuthor}>
                <View style={styles.postAuthorRow}>
                  <Text style={styles.postAuthorName} numberOfLines={1}>{post.author_nickname || 'Utente Bajuju'}</Text>
                  <RoleBadge role={post.author_role} theme={theme} />
                </View>
                <Text style={styles.postTime}>{formatRelativeTime(post.created_at)}</Text>
              </View>
              {post.can_manage ? (
                <Pressable
                  style={styles.postMenuButton}
                  onPress={() => setMenuPost(post)}
                  accessibilityRole="button"
                  accessibilityLabel="Opzioni post"
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={BAJUJU_COLORS.muted} />
                </Pressable>
              ) : null}
            </View>
            {post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}
            <PhotoGrid urls={post.image_urls} onPress={onPhotoPress} />
            <View style={styles.postActions}>
              <Pressable
                style={styles.postAction}
                onPress={() => { void toggleLike(post); }}
                disabled={likeBusyId === post.id}
                accessibilityRole="button"
                accessibilityLabel={post.liked_by_me ? 'Togli il like' : 'Metti like'}
              >
                <Ionicons
                  name={post.liked_by_me ? 'heart' : 'heart-outline'}
                  size={21}
                  color={post.liked_by_me ? BAJUJU_COLORS.brightPink : BAJUJU_COLORS.muted}
                />
                <Text style={[styles.postActionText, post.liked_by_me && styles.postActionTextActive]}>{post.like_count}</Text>
              </Pressable>
              <Pressable
                style={styles.postAction}
                onPress={() => { void openComments(post); }}
                accessibilityRole="button"
              >
                <Ionicons name="chatbubble-outline" size={19} color={BAJUJU_COLORS.muted} />
                <Text style={styles.postActionText}>
                  {post.comment_count === 1 ? '1 commento' : `${post.comment_count} commenti`}
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {hasMore && !loading ? (
        <Pressable style={styles.moreButton} onPress={() => { void loadMore(); }} disabled={loadingMore}>
          <Text style={[styles.linkText, { color: theme.accent }]}>{loadingMore ? 'Carico...' : 'Mostra post precedenti'}</Text>
        </Pressable>
      ) : null}

      <BajujuActionSheet
        visible={Boolean(menuPost)}
        title="Post"
        onClose={() => setMenuPost(null)}
        actions={menuPost ? [
          {
            key: 'pin',
            label: menuPost.is_pinned ? 'Sblocca' : 'Fissa in cima',
            description: menuPost.is_pinned ? 'Torna tra gli altri post' : 'Resta in alto come annuncio fissato',
            icon: menuPost.is_pinned ? 'pin-outline' : 'pin',
            onPress: () => { const post = menuPost; void togglePin(post); },
          },
          {
            key: 'delete',
            label: 'Elimina',
            description: 'Sparisce dalla bacheca per tutti',
            icon: 'trash-outline',
            destructive: true,
            onPress: () => confirmDelete(menuPost),
          },
        ] : []}
      />

      <Modal visible={composerOpen} animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setComposerOpen(false)} style={styles.modalHeaderButton} accessibilityRole="button" accessibilityLabel="Chiudi">
              <Ionicons name="close" size={22} color={BAJUJU_COLORS.plum} />
            </Pressable>
            <Text style={styles.modalTitle}>Nuovo annuncio</Text>
            <View style={styles.modalHeaderButton} />
          </View>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Scrivi un annuncio per il gruppo…"
              placeholderTextColor={BAJUJU_COLORS.muted}
              multiline
              textAlignVertical="top"
              maxLength={GROUP_POST_MAX_LENGTH}
              style={styles.composerInput}
            />
            <Text style={styles.counter}>{draft.length}/{GROUP_POST_MAX_LENGTH}</Text>
            <View style={styles.draftPhotos}>
              {draftPhotos.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.draftPhoto}>
                  <Image source={{ uri }} style={styles.photoGridImage} resizeMode="cover" />
                  <Pressable
                    style={styles.draftPhotoRemove}
                    onPress={() => setDraftPhotos((current) => current.filter((_, i) => i !== index))}
                    accessibilityRole="button"
                    accessibilityLabel="Togli la foto"
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {draftPhotos.length < GROUP_POST_MAX_IMAGES ? (
                <Pressable style={styles.addPhoto} onPress={() => { void addPhotos(); }} accessibilityRole="button">
                  <Ionicons name="images-outline" size={24} color={BAJUJU_COLORS.pink} />
                  <Text style={styles.addPhotoText}>Foto</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.helper}>Fino a {GROUP_POST_MAX_IMAGES} foto per post.</Text>
          </KeyboardAwareScrollView>
          <View style={styles.modalFooter}>
            <Pressable
              style={[
                styles.publishButton,
                { backgroundColor: theme.primary },
                needsOutline(theme.primary) && styles.outline,
                publishing && styles.disabled,
              ]}
              disabled={publishing}
              onPress={() => { void publish(); }}
              accessibilityRole="button"
            >
              {publishing ? (
                <ActivityIndicator color={theme.onPrimary} />
              ) : (
                <Text style={[styles.publishText, { color: theme.onPrimary }]}>Pubblica</Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={Boolean(commentsPost)} animationType="slide" onRequestClose={() => setCommentsPost(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setCommentsPost(null)} style={styles.modalHeaderButton} accessibilityRole="button" accessibilityLabel="Chiudi">
              <Ionicons name="chevron-back" size={22} color={BAJUJU_COLORS.plum} />
            </Pressable>
            <Text style={styles.modalTitle}>Commenti</Text>
            <View style={styles.modalHeaderButton} />
          </View>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {commentsPost?.body ? <Text style={styles.commentsPostBody} numberOfLines={4}>{commentsPost.body}</Text> : null}
            {commentsLoading ? (
              <ActivityIndicator color={BAJUJU_COLORS.brightPink} />
            ) : comments.length === 0 ? (
              <Text style={styles.emptyText}>Ancora nessun commento.</Text>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.comment}>
                  <Avatar name={comment.nickname} url={comment.avatar_url} size={34} />
                  <View style={styles.commentBubble}>
                    <View style={styles.postAuthorRow}>
                      <Text style={styles.commentName} numberOfLines={1}>{comment.nickname || 'Utente Bajuju'}</Text>
                      <RoleBadge role={comment.role} theme={theme} />
                    </View>
                    <Text style={styles.commentBody}>{comment.body}</Text>
                    <View style={styles.commentFooter}>
                      <Text style={styles.postTime}>{formatRelativeTime(comment.created_at)}</Text>
                      {comment.can_delete ? (
                        <Pressable onPress={() => confirmDeleteComment(comment)} hitSlop={8}>
                          <Text style={styles.deleteText}>Elimina</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))
            )}

            {canInteract ? (
              <View style={styles.commentComposer}>
                <TextInput
                  value={commentDraft}
                  onChangeText={setCommentDraft}
                  placeholder="Scrivi un commento…"
                  placeholderTextColor={BAJUJU_COLORS.muted}
                  multiline
                  maxLength={GROUP_COMMENT_MAX_LENGTH}
                  style={styles.commentInput}
                />
                <Pressable
                  style={[styles.sendButton, (!commentDraft.trim() || commentBusy) && styles.disabled]}
                  disabled={!commentDraft.trim() || commentBusy}
                  onPress={() => { void sendComment(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Invia commento"
                >
                  <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helper}>Solo i membri del gruppo possono commentare.</Text>
            )}
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outline: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  disabled: { opacity: 0.5 },
  wrap: { gap: 12 },
  avatar: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.palePink },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: BAJUJU_COLORS.brightPink, fontFamily: BAJUJU_FONTS.bold, fontSize: 15 },
  roleBadge: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 11 },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white },
  composerPlaceholder: { flex: 1, color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14 },
  stateBox: { padding: 24, alignItems: 'center' },
  emptyCard: { padding: 18, gap: 6, borderRadius: 22, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white, alignItems: 'flex-start' },
  emptyTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  emptyText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 14, lineHeight: 20 },
  linkText: { marginTop: 4, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 14 },
  post: { borderRadius: 20, borderWidth: 1, borderColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white, overflow: 'hidden' },
  pinnedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingTop: 12 },
  pinnedText: { fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, paddingTop: 10, paddingBottom: 8 },
  postAuthor: { flex: 1, minWidth: 0 },
  postAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postAuthorName: { flexShrink: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 14 },
  postTime: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12 },
  postMenuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  postBody: { paddingHorizontal: 14, paddingBottom: 12, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.regular, fontSize: 15, lineHeight: 21 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  photoGridImage: { width: '100%', height: '100%', backgroundColor: BAJUJU_COLORS.softPink },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  postAction: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  postActionText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 13 },
  postActionTextActive: { color: BAJUJU_COLORS.brightPink },
  moreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modalSafe: { flex: 1, backgroundColor: BAJUJU_COLORS.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BAJUJU_COLORS.line },
  modalHeaderButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 18 },
  modalContent: { padding: 16, gap: 12 },
  composerInput: { minHeight: 150, maxHeight: 320, padding: 14, borderRadius: 18, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: BAJUJU_COLORS.white, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.regular, fontSize: 16, lineHeight: 22 },
  counter: { alignSelf: 'flex-end', color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.medium, fontSize: 12 },
  draftPhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  draftPhoto: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden' },
  draftPhotoRemove: { position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  addPhoto: { width: 96, height: 96, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BAJUJU_COLORS.line, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: BAJUJU_COLORS.white },
  addPhotoText: { color: BAJUJU_COLORS.pink, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12 },
  helper: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.regular, fontSize: 12, lineHeight: 17 },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: BAJUJU_COLORS.line, backgroundColor: BAJUJU_COLORS.white },
  publishButton: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  publishText: { fontFamily: BAJUJU_FONTS.bold, fontSize: 16 },
  commentsPostBody: { padding: 12, borderRadius: 14, backgroundColor: BAJUJU_COLORS.softPink, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.regular, fontSize: 14, lineHeight: 20 },
  comment: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentBubble: { flex: 1, minWidth: 0, padding: 10, borderRadius: 16, backgroundColor: BAJUJU_COLORS.white, borderWidth: 1, borderColor: BAJUJU_COLORS.line },
  commentName: { flexShrink: 1, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.bold, fontSize: 13 },
  commentBody: { marginTop: 2, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.regular, fontSize: 14, lineHeight: 20 },
  commentFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  deleteText: { color: BAJUJU_COLORS.muted, fontFamily: BAJUJU_FONTS.semiBold, fontSize: 12, textDecorationLine: 'underline' },
  commentComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  commentInput: { flex: 1, minHeight: 46, maxHeight: 120, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderRadius: 22, borderWidth: 1.5, borderColor: BAJUJU_COLORS.palePink, backgroundColor: BAJUJU_COLORS.white, color: BAJUJU_COLORS.plum, fontFamily: BAJUJU_FONTS.regular, fontSize: 15 },
  sendButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: BAJUJU_COLORS.brightPink },
});

// Foto: tutte le foto pubblicate in bacheca (le ultime 100 pubblicazioni).
export function BajujuGroupPhotos({
  groupId,
  locked,
  onPhotoPress,
}: {
  groupId: string;
  locked: boolean;
  onPhotoPress: (url: string) => void;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (locked || !groupId) {
      setUrls([]);
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const collected: GroupPost[] = [];
        let before: string | null = null;
        for (let page = 0; page < 5; page += 1) {
          const rows = await loadGroupPosts(groupId, before);
          collected.push(...rows.filter((post) => page === 0 || !post.is_pinned));
          const loose = rows.filter((post) => !post.is_pinned);
          if (loose.length < GROUP_POSTS_PAGE_SIZE) break;
          before = loose[loose.length - 1].created_at;
        }
        const sorted = collected.sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (active) setUrls(sorted.flatMap((post) => post.image_urls));
      } catch (error) {
        console.log('Errore foto gruppo:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [groupId, locked]);

  if (locked) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Foto riservate ai membri</Text>
        <Text style={styles.emptyText}>Entra nel gruppo per vedere le foto.</Text>
      </View>
    );
  }
  if (loading) return <View style={styles.stateBox}><ActivityIndicator color={BAJUJU_COLORS.brightPink} /></View>;
  if (urls.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Ancora nessuna foto</Text>
        <Text style={styles.emptyText}>Le foto pubblicate in bacheca compariranno qui.</Text>
      </View>
    );
  }
  return (
    <View style={[styles.photoGrid, photoStyles.grid]}>
      {urls.map((url, index) => (
        <Pressable
          key={`${url}-${index}`}
          style={photoStyles.cell}
          onPress={() => onPhotoPress(url)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Apri la foto ${index + 1}`}
        >
          <Image source={{ uri: url }} style={styles.photoGridImage} resizeMode="cover" />
        </Pressable>
      ))}
    </View>
  );
}

const photoStyles = StyleSheet.create({
  grid: { borderRadius: 18, overflow: 'hidden' },
  cell: { width: '33.333%', aspectRatio: 1, padding: 1.5 },
});
