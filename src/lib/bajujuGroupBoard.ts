import { supabase } from './supabase';
import { withLocationIdentity } from './bajujuLocations';

// Gruppi v2: ruoli, membri, espulsioni, colori e bacheca. Tutto passa dalle funzioni del database.

export type GroupRole = 'owner' | 'admin' | 'member';

export type GroupMemberWithRole = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  age_range: string | null;
  origin: string | null;
  role: GroupRole;
  joined_at: string | null;
};

export type GroupBan = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  banned_at: string | null;
  banned_by_nickname: string | null;
};

export type GroupPost = {
  id: string;
  group_id: string;
  author_id: string;
  author_nickname: string | null;
  author_avatar_url: string | null;
  author_role: GroupRole | null;
  body: string;
  image_urls: string[];
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  can_manage: boolean;
};

export type GroupPostComment = {
  id: string;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  role: GroupRole | null;
  body: string;
  created_at: string;
  can_delete: boolean;
};

export const GROUP_POST_MAX_IMAGES = 6;
export const GROUP_POST_MAX_LENGTH = 2000;
export const GROUP_COMMENT_MAX_LENGTH = 1000;
export const GROUP_POSTS_PAGE_SIZE = 20;

const ERROR_MESSAGES: Record<string, string> = {
  BAJUJU_AUTH_REQUIRED: 'Accedi per continuare.',
  BAJUJU_USER_BLOCKED: 'Il tuo account è bloccato.',
  BAJUJU_GROUP_NOT_FOUND: 'Gruppo non trovato.',
  BAJUJU_GROUP_NOT_ACTIVE: 'Il gruppo non è ancora attivo.',
  BAJUJU_GROUP_BANNED: 'Non puoi entrare in questo gruppo.',
  BAJUJU_GROUP_MANAGE_FORBIDDEN: 'Solo il proprietario e gli admin del gruppo possono farlo.',
  BAJUJU_GROUP_MEMBERS_ONLY: 'Solo i membri del gruppo possono mettere like e commentare.',
  BAJUJU_ONLY_OWNER_CAN_SET_ROLES: 'Solo il proprietario può nominare o togliere gli admin.',
  BAJUJU_ADMIN_CANNOT_REMOVE_ADMIN: 'Solo il proprietario può rimuovere un admin.',
  BAJUJU_CANNOT_REMOVE_OWNER: 'Il proprietario non può essere rimosso.',
  BAJUJU_CANNOT_CHANGE_OWNER: 'Il ruolo del proprietario non si può cambiare.',
  BAJUJU_CANNOT_REMOVE_SELF: 'Non puoi rimuovere te stesso. Per uscire usa “Abbandona gruppo”.',
  BAJUJU_NOT_GROUP_MEMBER: 'Questa persona non è più nel gruppo.',
  BAJUJU_GROUP_ROLE_INVALID: 'Ruolo non valido.',
  BAJUJU_GROUP_ROLE_FORBIDDEN: 'Non puoi cambiare questo ruolo.',
  BAJUJU_GROUP_COLOR_INVALID: 'Colore non valido. Usa il formato #RRGGBB.',
  BAJUJU_GROUP_LOGO_INVALID: 'Foto del logo non valida. Riprova a caricarla.',
  BAJUJU_POST_EMPTY: 'Scrivi un testo o aggiungi almeno una foto.',
  BAJUJU_POST_TOO_LONG: 'Il testo è troppo lungo (massimo 2000 caratteri).',
  BAJUJU_POST_TOO_MANY_IMAGES: 'Puoi pubblicare al massimo 6 foto per post.',
  BAJUJU_POST_IMAGE_INVALID: 'Una delle foto non è stata caricata correttamente. Riprova.',
  BAJUJU_POST_NOT_FOUND: 'Questo post non esiste più.',
  BAJUJU_COMMENT_EMPTY: 'Scrivi un commento.',
  BAJUJU_COMMENT_TOO_LONG: 'Il commento è troppo lungo (massimo 1000 caratteri).',
  BAJUJU_COMMENT_NOT_FOUND: 'Questo commento non esiste più.',
  BAJUJU_JOIN_REQUEST_NOT_PENDING: 'Questa richiesta è già stata gestita.',
  BAJUJU_PROFILE_AGE_REQUIRED: 'Questo utente deve inserire la sua età precisa prima di poter essere accettato.',
  BAJUJU_AGE_RESTRICTED: 'Questo utente non rientra nella fascia d’età del gruppo.',
};

// Messaggio leggibile per gli errori BAJUJU_* lanciati dal database.
export function groupErrorMessage(error: unknown, fallback = 'Riprova tra poco.') {
  const raw = String((error as any)?.message || error || '');
  const code = raw.match(/BAJUJU_[A-Z_]+/)?.[0];
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (/function .* does not exist|Could not find the function/i.test(raw)) {
    return 'Questa funzione non è ancora attiva. Riprova più tardi.';
  }
  return raw || fallback;
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asRole(value: unknown): GroupRole | null {
  return value === 'owner' || value === 'admin' || value === 'member' ? value : null;
}

async function rpc<T>(name: string, params: Record<string, unknown>) {
  const result = await supabase.rpc(name as any, params as any);
  if (result.error) throw result.error;
  return result.data as T;
}

export async function loadMyGroupRole(groupId: string) {
  if (!groupId) return null;
  return asRole(await rpc<string | null>('get_my_group_role', { p_group_id: groupId }));
}

export async function loadGroupMembersWithRoles(groupId: string, ownerId: string) {
  let rows: GroupMemberWithRole[];
  try {
    const data = await rpc<any[]>('get_group_members_with_roles', { p_group_id: groupId });
    rows = (data || []).map((row) => ({
      user_id: clean(row.user_id),
      nickname: row.nickname ?? null,
      avatar_url: clean(row.avatar_url) || null,
      age_range: row.age_range ?? null,
      origin: row.origin ?? null,
      role: asRole(row.role) || 'member',
      joined_at: row.joined_at ?? null,
    }));
  } catch (error) {
    // Database non ancora aggiornato: elenco classico senza ruoli (solo il proprietario si riconosce).
    console.log('Ruoli gruppo non disponibili, uso elenco classico:', error);
    const data = await rpc<any[]>('get_group_member_profiles', { p_group_id: groupId });
    const ids = (data || []).map((row) => clean(row.user_id)).filter(Boolean);
    const avatars = ids.length
      ? await supabase.from('profiles').select('id,avatar_url').in('id', ids)
      : ({ data: [], error: null } as any);
    if (avatars.error) throw avatars.error;
    const avatarById = new Map<string, string>(
      (avatars.data || []).map((p: any): [string, string] => [String(p.id || ''), clean(p.avatar_url)])
    );
    rows = (data || []).map((row) => {
      const id = clean(row.user_id);
      return {
        user_id: id,
        nickname: row.nickname ?? null,
        avatar_url: avatarById.get(id) || null,
        age_range: row.age_range ?? null,
        origin: row.origin ?? null,
        role: id === ownerId ? 'owner' : 'member',
        joined_at: null,
      } as GroupMemberWithRole;
    });
    const rank = (role: GroupRole) => (role === 'owner' ? 0 : role === 'admin' ? 1 : 2);
    rows.sort((a, b) => rank(a.role) - rank(b.role));
  }

  return withLocationIdentity(rows.filter((row) => row.user_id), {
    idKey: 'user_id',
    nameKeys: ['nickname'],
    avatarKey: 'avatar_url',
  });
}

export async function setGroupMemberRole(groupId: string, userId: string, role: 'admin' | 'member') {
  return rpc<string>('set_group_member_role', { p_group_id: groupId, p_user_id: userId, p_role: role });
}

export async function removeGroupMember(groupId: string, userId: string, ban: boolean) {
  return rpc<'removed' | 'banned'>('remove_group_member', { p_group_id: groupId, p_user_id: userId, p_ban: ban });
}

export async function loadGroupBans(groupId: string) {
  const data = await rpc<any[]>('get_group_bans', { p_group_id: groupId });
  const rows = (data || []).map((row) => ({
    user_id: clean(row.user_id),
    nickname: row.nickname ?? null,
    avatar_url: clean(row.avatar_url) || null,
    banned_at: row.banned_at ?? null,
    banned_by_nickname: row.banned_by_nickname ?? null,
  })) as GroupBan[];
  return withLocationIdentity(rows, { idKey: 'user_id', nameKeys: ['nickname'], avatarKey: 'avatar_url' });
}

export async function unbanGroupUser(groupId: string, userId: string) {
  await rpc<void>('unban_group_user', { p_group_id: groupId, p_user_id: userId });
}

export async function saveGroupColors(groupId: string, primary: string | null, secondary: string | null) {
  await rpc<void>('set_group_colors', { p_group_id: groupId, p_primary: primary, p_secondary: secondary });
}

export async function saveGroupLogo(groupId: string, logoUrl: string | null) {
  await rpc<void>('set_group_logo', { p_group_id: groupId, p_logo_url: logoUrl });
}

function mapPost(row: any): GroupPost {
  return {
    id: clean(row.id),
    group_id: clean(row.group_id),
    author_id: clean(row.author_id),
    author_nickname: row.author_nickname ?? null,
    author_avatar_url: clean(row.author_avatar_url) || null,
    author_role: asRole(row.author_role),
    body: String(row.body || ''),
    image_urls: Array.isArray(row.image_urls) ? row.image_urls.filter(Boolean) : [],
    is_pinned: row.is_pinned === true,
    pinned_at: row.pinned_at ?? null,
    created_at: String(row.created_at || ''),
    like_count: Math.max(0, Number(row.like_count || 0)),
    comment_count: Math.max(0, Number(row.comment_count || 0)),
    liked_by_me: row.liked_by_me === true,
    can_manage: row.can_manage === true,
  };
}

// p_before = created_at dell'ultimo post non fissato già mostrato (per caricare i successivi).
export async function loadGroupPosts(groupId: string, before?: string | null) {
  const data = await rpc<any[]>('get_group_posts', {
    p_group_id: groupId,
    p_limit: GROUP_POSTS_PAGE_SIZE,
    p_before: before || null,
  });
  const posts = (data || []).map(mapPost).filter((post) => post.id);
  return withLocationIdentity(posts, {
    idKey: 'author_id',
    nameKeys: ['author_nickname'],
    avatarKey: 'author_avatar_url',
  });
}

export async function createGroupPost(groupId: string, body: string, imageUrls: string[]) {
  return rpc<string>('create_group_post', { p_group_id: groupId, p_body: body, p_image_urls: imageUrls });
}

// Avvisa gli iscritti di un nuovo annuncio/foto o sondaggio. Se la notifica non parte, il contenuto resta pubblicato.
export async function notifyGroupBoard(groupId: string, kind: 'post' | 'poll', id: string) {
  if (!groupId || !id) return;
  try {
    const result = await supabase.functions.invoke('notify-group-board', { body: { groupId, kind, id } });
    if (result.error) console.log('Notifica bacheca non inviata:', result.error);
  } catch (error) {
    console.log('Notifica bacheca non inviata:', error);
  }
}

export async function setGroupPostPinned(postId: string, pinned: boolean) {
  await rpc<void>('set_group_post_pinned', { p_post_id: postId, p_pinned: pinned });
}

export async function deleteGroupPost(postId: string) {
  await rpc<void>('delete_group_post', { p_post_id: postId });
}

export async function toggleGroupPostLike(postId: string) {
  return (await rpc<boolean>('toggle_group_post_like', { p_post_id: postId })) === true;
}

export async function loadGroupPostComments(postId: string) {
  const data = await rpc<any[]>('get_group_post_comments', { p_post_id: postId });
  const rows = (data || []).map((row) => ({
    id: clean(row.id),
    user_id: clean(row.user_id),
    nickname: row.nickname ?? null,
    avatar_url: clean(row.avatar_url) || null,
    role: asRole(row.role),
    body: String(row.body || ''),
    created_at: String(row.created_at || ''),
    can_delete: row.can_delete === true,
  })) as GroupPostComment[];
  return withLocationIdentity(rows, { idKey: 'user_id', nameKeys: ['nickname'], avatarKey: 'avatar_url' });
}

export async function addGroupPostComment(postId: string, body: string) {
  return rpc<string>('add_group_post_comment', { p_post_id: postId, p_body: body });
}

export async function deleteGroupPostComment(commentId: string) {
  await rpc<void>('delete_group_post_comment', { p_comment_id: commentId });
}

// Foto della bacheca: stessa cartella della copertina, groups/<group_id>/<user_id>-...
export async function uploadGroupPostPhoto(input: { groupId: string; userId: string; localUri: string; index: number }) {
  const photoResponse = await fetch(input.localUri);
  const photoBuffer = await photoResponse.arrayBuffer();
  const filePath = `groups/${input.groupId}/${input.userId}-post-${Date.now()}-${input.index}.jpg`;

  const uploadResult = await supabase.storage
    .from('event-photos')
    .upload(filePath, photoBuffer, { contentType: 'image/jpeg', upsert: false });
  if (uploadResult.error) throw uploadResult.error;

  const publicUrl = supabase.storage.from('event-photos').getPublicUrl(filePath).data.publicUrl;
  if (!publicUrl) throw new Error('URL pubblico della foto non disponibile.');
  return publicUrl;
}

// Logo del gruppo (riquadro quadrato sotto la copertina), stessa cartella delle foto della bacheca.
export async function uploadGroupLogo(input: { groupId: string; userId: string; localUri: string }) {
  const photoResponse = await fetch(input.localUri);
  const photoBuffer = await photoResponse.arrayBuffer();
  const filePath = `groups/${input.groupId}/${input.userId}-logo-${Date.now()}.jpg`;

  const uploadResult = await supabase.storage
    .from('event-photos')
    .upload(filePath, photoBuffer, { contentType: 'image/jpeg', upsert: false });
  if (uploadResult.error) throw uploadResult.error;

  const publicUrl = supabase.storage.from('event-photos').getPublicUrl(filePath).data.publicUrl;
  if (!publicUrl) throw new Error('URL pubblico del logo non disponibile.');
  return publicUrl;
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'ora';
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 ora fa' : `${hours} ore fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

export function roleLabel(role: GroupRole | null | undefined) {
  if (role === 'owner') return 'Proprietario';
  if (role === 'admin') return 'Admin';
  return '';
}
