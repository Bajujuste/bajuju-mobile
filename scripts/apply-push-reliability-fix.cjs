const fs = require('fs');
const { execSync } = require('child_process');

const expectedBranch = 'fix/push-registration-targeted-notifications';
const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
if (branch !== expectedBranch) throw new Error(`Ramo errato: ${branch}. Atteso: ${expectedBranch}`);

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(content, from, to, label) {
  const first = content.indexOf(from);
  if (first < 0) throw new Error(`Marker non trovato: ${label}`);
  if (content.indexOf(from, first + from.length) >= 0) throw new Error(`Marker duplicato: ${label}`);
  return content.slice(0, first) + to + content.slice(first + from.length);
}

// 1) Token push: preserva preferenze esistenti e consente refresh senza prompt se il permesso OS è già concesso.
{
  const path = 'src/utils/bajujuNotifications.ts';
  let s = read(path);

  s = replaceOnce(
    s,
    `    const existingPreferencesResult = await supabase\n      .from('notification_preferences')\n      .select('enabled')\n      .eq('user_id', userId)\n      .maybeSingle();\n\n    const existingEnabled =\n      existingPreferencesResult.data?.enabled;`,
    `    const existingPreferencesResult = await supabase\n      .from('notification_preferences')\n      .select('enabled,notify_new_experience,notify_new_flash,notify_new_participant,notify_contact_request,notify_contact_accepted,notify_experience_cancelled,notify_experience_reminder,notify_chat_messages')\n      .eq('user_id', userId)\n      .maybeSingle();\n\n    const existingPreferences = existingPreferencesResult.data;`,
    'preserve notification preferences select'
  );

  s = replaceOnce(
    s,
    `          enabled: existingEnabled ?? true,\n          notify_new_experience: true,\n          notify_new_flash: true,\n          notify_new_participant: true,\n          notify_contact_request: true,\n          notify_contact_accepted: true,\n          notify_experience_cancelled: true,\n          notify_experience_reminder: true,\n          notify_chat_messages: false,`,
    `          enabled: existingPreferences?.enabled ?? true,\n          notify_new_experience: existingPreferences?.notify_new_experience ?? true,\n          notify_new_flash: existingPreferences?.notify_new_flash ?? true,\n          notify_new_participant: existingPreferences?.notify_new_participant ?? true,\n          notify_contact_request: existingPreferences?.notify_contact_request ?? true,\n          notify_contact_accepted: existingPreferences?.notify_contact_accepted ?? true,\n          notify_experience_cancelled: existingPreferences?.notify_experience_cancelled ?? true,\n          notify_experience_reminder: existingPreferences?.notify_experience_reminder ?? true,\n          notify_chat_messages: false,`,
    'preserve notification preferences payload'
  );

  const helper = `export async function refreshBajujuPushRegistrationIfAuthorized(userId?: string | null) {\n  if (Platform.OS === 'web' || isRunningInExpoGo() || !Device.isDevice || __DEV__) {\n    return { ok: false, reason: 'Ambiente non compatibile con push produzione.' };\n  }\n\n  const Notifications = await getNotificationsModule();\n  if (!Notifications) return { ok: false, reason: 'Modulo notifiche non disponibile.' };\n\n  const permission = await Notifications.getPermissionsAsync();\n  if (permission.status !== 'granted') {\n    return { ok: false, reason: 'Permesso notifiche non concesso.' };\n  }\n\n  if (Platform.OS === 'android') {\n    await Notifications.setNotificationChannelAsync('bajuju-important', {\n      name: 'Bajuju',\n      importance: Notifications.AndroidImportance.HIGH,\n      vibrationPattern: [0, 250, 250, 250],\n      lightColor: BAJUJU_PINK,\n      sound: 'default',\n    });\n  }\n\n  const projectId = getProjectId();\n  if (!projectId) return { ok: false, reason: 'Project ID Expo/EAS non trovato.' };\n\n  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });\n  const token = tokenResult.data;\n\n  if (userId) {\n    const saveResult = await savePushToken(userId, token);\n    if (!saveResult.ok) {\n      return { ok: false, reason: 'Token ottenuto, ma salvataggio su Supabase non riuscito.', token };\n    }\n  }\n\n  return { ok: true, token };\n}\n\n`;

  s = replaceOnce(s, 'export function isChatNotificationAllowed() {', helper + 'export function isChatNotificationAllowed() {', 'authorized push refresh helper');
  write(path, s);
}

// 2) Posizione: refresh senza prompt e salvataggio coordinate note solo se notifiche Bajuju sono abilitate.
{
  const path = 'src/utils/bajujuNotificationLocation.ts';
  let s = read(path);
  s = replaceOnce(
    s,
    'export async function refreshBajujuNotificationLocation(userId: string) {\n  try {',
    `export async function refreshBajujuNotificationLocation(\n  userId: string,\n  options?: { requestPermission?: boolean }\n) {\n  try {\n    const requestPermission = options?.requestPermission ?? true;`,
    'location options'
  );
  s = replaceOnce(
    s,
    `    if (status !== 'granted' && existingPermission.canAskAgain) {`,
    `    if (status !== 'granted' && requestPermission && existingPermission.canAskAgain) {`,
    'location no prompt condition'
  );

  const append = `\nexport async function saveBajujuNotificationCoordinatesIfEnabled(\n  userId: string,\n  coordinates: { latitude: number; longitude: number }\n) {\n  const latitude = Number(coordinates.latitude);\n  const longitude = Number(coordinates.longitude);\n  if (!userId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {\n    return { ok: false, reason: 'Coordinate non valide.' };\n  }\n\n  const preferenceResult = await supabase\n    .from('notification_preferences')\n    .select('enabled')\n    .eq('user_id', userId)\n    .maybeSingle();\n\n  if (preferenceResult.error || preferenceResult.data?.enabled !== true) {\n    return { ok: false, reason: 'Notifiche Bajuju non abilitate.' };\n  }\n\n  const result = await supabase\n    .from('notification_preferences')\n    .update({\n      latitude,\n      longitude,\n      location_updated_at: new Date().toISOString(),\n      updated_at: new Date().toISOString(),\n    })\n    .eq('user_id', userId);\n\n  if (result.error) return { ok: false, reason: result.error.message };\n  return { ok: true, latitude, longitude };\n}\n`;
  s = s.trimEnd() + '\n' + append;
  write(path, s);
}

// 3) Home: ad ogni focus riaggiorna token se il permesso OS è già concesso e salva la posizione senza nuovi prompt.
{
  const path = 'app/home.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    `import { registerForBajujuPushNotifications } from '../src/utils/bajujuNotifications';`,
    `import {\n  refreshBajujuPushRegistrationIfAuthorized,\n  registerForBajujuPushNotifications,\n} from '../src/utils/bajujuNotifications';`,
    'home notification import'
  );
  s = replaceOnce(
    s,
    `          await refreshUnreadCount(userId);`,
    `          const registrationResult = await refreshBajujuPushRegistrationIfAuthorized(userId);\n          if (registrationResult.ok) {\n            const locationResult = await refreshBajujuNotificationLocation(userId, { requestPermission: false });\n            if (!locationResult.ok) {\n              console.log('Posizione notifiche non aggiornata al focus Home.');\n            }\n          }\n\n          await refreshUnreadCount(userId);`,
    'home focus registration refresh'
  );
  write(path, s);
}

// 4) Trova: se il permesso push è già concesso registra il device e usa il GPS già letto per aggiornare la posizione notifiche.
{
  const path = 'app/experiences.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    `import { supabase } from '../src/lib/supabase';`,
    `import { supabase } from '../src/lib/supabase';\nimport { saveBajujuNotificationCoordinatesIfEnabled } from '../src/utils/bajujuNotificationLocation';\nimport { refreshBajujuPushRegistrationIfAuthorized } from '../src/utils/bajujuNotifications';`,
    'experiences notification imports'
  );
  s = replaceOnce(
    s,
    `      const userId = authResult.data.user?.id || '';\n      setCurrentUserId(userId);\n\n      let resolvedCoordinates: Coordinates | null = null;`,
    `      const userId = authResult.data.user?.id || '';\n      setCurrentUserId(userId);\n\n      if (userId) {\n        await refreshBajujuPushRegistrationIfAuthorized(userId).catch(() => ({ ok: false }));\n      }\n\n      let resolvedCoordinates: Coordinates | null = null;`,
    'experiences push registration refresh'
  );
  s = replaceOnce(
    s,
    `      setCoordinates(resolvedCoordinates);\n\n      const activitiesResult = await supabase`,
    `      setCoordinates(resolvedCoordinates);\n\n      if (userId && resolvedCoordinates) {\n        await saveBajujuNotificationCoordinatesIfEnabled(userId, resolvedCoordinates).catch(() => ({ ok: false }));\n      }\n\n      const activitiesResult = await supabase`,
    'experiences save location'
  );
  write(path, s);
}

// 5) Backend: le notifiche mirate vengono sempre registrate in-app; la push resta subordinata a preferenze + token.
{
  const path = 'supabase/functions/send-bajuju-push/index.ts';
  let s = read(path);

  const oldPreferences = `  let preferencesQuery = supabase\n    .from('notification_preferences')\n    .select(\`user_id, enabled, preferred_province, latitude, longitude, location_updated_at, \${prefColumn}\`)\n    .eq('enabled', true)\n    .eq(prefColumn, true);\n\n  if (targetUserId) preferencesQuery = preferencesQuery.eq('user_id', targetUserId);\n\n  const { data: preferences, error: preferencesError } = await preferencesQuery;\n  if (preferencesError) return jsonResponse({ error: preferencesError.message }, 500);\n\n  let matchingUserIds = (preferences || [])\n    .filter((pref: Record<string, unknown>) => {\n      const userId = String(pref.user_id || '').trim();\n      if (!userId || userId === actorUserId) return false;\n      if (targetUserId) return true;\n\n      if (type === 'new_experience') {\n        const userLatitude = asFiniteNumber(pref.latitude);\n        const userLongitude = asFiniteNumber(pref.longitude);\n        if (userLatitude === null || userLongitude === null || experienceLatitude === null || experienceLongitude === null) return false;\n        return distanceKm(experienceLatitude, experienceLongitude, userLatitude, userLongitude) <= NEARBY_EXPERIENCE_RADIUS_KM;\n      }\n\n      const preferredProvince = pref.preferred_province ? String(pref.preferred_province).trim().toLowerCase() : '';\n      if (preferredProvince && province && preferredProvince !== province.toLowerCase()) return false;\n      return true;\n    })\n    .map((pref: Record<string, unknown>) => String(pref.user_id));\n\n  matchingUserIds = [...new Set(matchingUserIds)];`;

  const newPreferences = `  let matchingUserIds: string[] = [];\n  let pushEligibleUserIds: string[] = [];\n\n  if (targetUserId) {\n    if (targetUserId !== actorUserId) matchingUserIds = [targetUserId];\n\n    const targetPreferencesResult = await supabase\n      .from('notification_preferences')\n      .select(\`user_id, enabled, \${prefColumn}\`)\n      .eq('user_id', targetUserId)\n      .maybeSingle();\n\n    if (targetPreferencesResult.error) {\n      return jsonResponse({ error: targetPreferencesResult.error.message }, 500);\n    }\n\n    const targetPreferences = targetPreferencesResult.data as Record<string, unknown> | null;\n    if (\n      targetPreferences &&\n      targetPreferences.enabled === true &&\n      targetPreferences[prefColumn] === true &&\n      targetUserId !== actorUserId\n    ) {\n      pushEligibleUserIds = [targetUserId];\n    }\n  } else {\n    const preferencesResult = await supabase\n      .from('notification_preferences')\n      .select(\`user_id, enabled, preferred_province, latitude, longitude, location_updated_at, \${prefColumn}\`)\n      .eq('enabled', true)\n      .eq(prefColumn, true);\n\n    if (preferencesResult.error) return jsonResponse({ error: preferencesResult.error.message }, 500);\n\n    matchingUserIds = (preferencesResult.data || [])\n      .filter((pref: Record<string, unknown>) => {\n        const userId = String(pref.user_id || '').trim();\n        if (!userId || userId === actorUserId) return false;\n\n        if (type === 'new_experience') {\n          const userLatitude = asFiniteNumber(pref.latitude);\n          const userLongitude = asFiniteNumber(pref.longitude);\n          if (userLatitude === null || userLongitude === null || experienceLatitude === null || experienceLongitude === null) return false;\n          return distanceKm(experienceLatitude, experienceLongitude, userLatitude, userLongitude) <= NEARBY_EXPERIENCE_RADIUS_KM;\n        }\n\n        const preferredProvince = pref.preferred_province ? String(pref.preferred_province).trim().toLowerCase() : '';\n        if (preferredProvince && province && preferredProvince !== province.toLowerCase()) return false;\n        return true;\n      })\n      .map((pref: Record<string, unknown>) => String(pref.user_id));\n\n    matchingUserIds = [...new Set(matchingUserIds)];\n    pushEligibleUserIds = [...matchingUserIds];\n  }`;

  s = replaceOnce(s, oldPreferences, newPreferences, 'backend target/internal separation');

  s = replaceOnce(
    s,
    `  if (matchingUserIds.length === 0) {`,
    `  pushEligibleUserIds = pushEligibleUserIds.filter((userId) => matchingUserIds.includes(userId));\n\n  if (matchingUserIds.length === 0) {`,
    'backend push eligibility after filtering'
  );

  const oldTokens = `  const { data: tokens, error: tokensError } = await supabase\n    .from('push_tokens')\n    .select('user_id, expo_push_token')\n    .in('user_id', matchingUserIds)\n    .eq('is_active', true);\n\n  if (tokensError) return jsonResponse({ error: tokensError.message }, 500);`;
  const newTokens = `  let tokens: Record<string, unknown>[] = [];\n  if (pushEligibleUserIds.length > 0) {\n    const tokensResult = await supabase\n      .from('push_tokens')\n      .select('user_id, expo_push_token')\n      .in('user_id', pushEligibleUserIds)\n      .eq('is_active', true);\n\n    if (tokensResult.error) return jsonResponse({ error: tokensResult.error.message }, 500);\n    tokens = (tokensResult.data || []) as Record<string, unknown>[];\n  }`;
  s = replaceOnce(s, oldTokens, newTokens, 'backend push eligible tokens');

  s = replaceOnce(
    s,
    `  if (messageRows.length === 0) {\n    await Promise.all(`,
    `  if (messageRows.length === 0) {\n    const noPushReason = pushEligibleUserIds.length === 0\n      ? 'Push non abilitata nelle preferenze; notifica interna registrata.'\n      : 'Nessun push token valido.';\n\n    await Promise.all(`,
    'backend no push reason'
  );
  s = replaceOnce(
    s,
    `.update({ status: 'in_app_only', success: false, error: 'Nessun push token valido.' })`,
    `.update({ status: 'in_app_only', success: false, error: noPushReason })`,
    'backend in app only reason'
  );
  s = replaceOnce(
    s,
    `return jsonResponse({ ok: true, sent: 0, users: matchingUserIds.length, reason: 'Notifica interna registrata; nessun push token valido.' });`,
    `return jsonResponse({ ok: true, sent: 0, users: matchingUserIds.length, inAppRegistered: matchingUserIds.length, reason: noPushReason });`,
    'backend no push response'
  );

  write(path, s);
}

fs.unlinkSync(__filename);
console.log('PATCH_OK: registrazione push, posizione 25 km e notifiche mirate in-app corrette.');
