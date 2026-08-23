import { supabase } from './supabase';

export type BajujuGroupCard = {
  id: string;
  name: string;
  description: string;
  city: string;
  province: string;
  category: string;
  coverUrl: string;
  ownerId: string;
  memberCount: number;
  joinedByMe: boolean;
};

type GroupRow = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  city?: string | null;
  province?: string | null;
  category?: string | null;
  cover_url?: string | null;
  owner_id?: string | null;
};

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function loadBajujuGroups(
  userId: string,
  options: { limit?: number; ownerId?: string } = {}
) {
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  let query = supabase
    .from('groups')
    .select('id,name,description,city,province,category,cover_url,owner_id,created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.ownerId) query = query.eq('owner_id', options.ownerId);

  const groupsResult = await query;
  if (groupsResult.error) throw groupsResult.error;

  const rows = (groupsResult.data || []) as GroupRow[];
  const ids = rows.map((row) => clean(row.id)).filter(Boolean);
  const counts = new Map<string, number>();
  const myMemberships = new Set<string>();

  if (ids.length > 0) {
    const membersResult = await supabase
      .from('group_members')
      .select('group_id,user_id')
      .in('group_id', ids);

    if (membersResult.error) throw membersResult.error;

    (membersResult.data || []).forEach((membership: any) => {
      const groupId = clean(membership.group_id);
      const memberId = clean(membership.user_id);
      if (!groupId) return;
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
      if (memberId === userId) myMemberships.add(groupId);
    });
  }

  return rows
    .map((row): BajujuGroupCard | null => {
      const id = clean(row.id);
      if (!id) return null;
      return {
        id,
        name: clean(row.name) || 'Gruppo Bajuju',
        description: clean(row.description),
        city: clean(row.city),
        province: clean(row.province),
        category: clean(row.category),
        coverUrl: clean(row.cover_url),
        ownerId: clean(row.owner_id),
        memberCount: counts.get(id) || 0,
        joinedByMe: myMemberships.has(id),
      };
    })
    .filter((group): group is BajujuGroupCard => Boolean(group));
}

export async function loadOwnedBajujuGroups(userId: string) {
  return loadBajujuGroups(userId, { ownerId: userId, limit: 100 });
}

export async function joinBajujuGroup(groupId: string, userId: string) {
  const result = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId });

  if (result.error && result.error.code !== '23505') throw result.error;
}

export async function leaveBajujuGroup(groupId: string, userId: string) {
  const result = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (result.error) throw result.error;
}

export async function createBajujuGroup(input: {
  ownerId: string;
  name: string;
  description: string;
  city?: string;
  province?: string;
  category?: string;
}) {
  const payload = {
    name: input.name.trim(),
    normalized_name: input.name.trim(),
    description: input.description.trim(),
    city: input.city?.trim() || null,
    province: input.province?.trim() || null,
    category: input.category?.trim() || null,
    owner_id: input.ownerId,
    created_by: input.ownerId,
    status: 'active',
  };

  const result = await supabase.from('groups').insert(payload).select('id').single();
  if (result.error) throw result.error;
  return String(result.data?.id || '');
}

export async function notifyBajujuGroupsForExperience(activityId: string, groupIds: string[]) {
  const uniqueGroupIds = [...new Set(groupIds.filter(Boolean))];
  if (uniqueGroupIds.length === 0) return { ok: true, sent: 0 };

  const result = await supabase.functions.invoke('notify-group-experience', {
    body: { activityId, groupIds: uniqueGroupIds },
  });

  if (result.error) throw result.error;
  return result.data;
}
