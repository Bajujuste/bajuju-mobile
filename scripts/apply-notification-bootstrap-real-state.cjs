const fs = require('fs');

function replaceOnce(path, before, after, label) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(before)) {
    throw new Error(`PATCH_FAIL ${label}: blocco non trovato in ${path}`);
  }
  const next = source.replace(before, after);
  if (next === source) throw new Error(`PATCH_FAIL ${label}: nessuna modifica`);
  fs.writeFileSync(path, next);
}

replaceOnce(
  'app/home.tsx',
`        const localChoiceKey = \`bajuju-notification-choice-v2:\${userId}\`;
        const localChoice = await AsyncStorage.getItem(localChoiceKey);

        const preferenceResult = await supabase
          .from('notification_preferences')
          .select('enabled')
          .eq('user_id', userId)
          .maybeSingle();`,
`        const localChoiceKey = \`bajuju-notification-choice-v2:\${userId}\`;
        const localChoice = await AsyncStorage.getItem(localChoiceKey);

        // Se Android/iOS ha già concesso il permesso, inizializziamo davvero
        // token e posizione anche quando la riga preferenze non esiste ancora.
        if (localChoice !== 'declined') {
          const authorizedRegistration = await refreshBajujuPushRegistrationIfAuthorized(userId);
          const authorizedLocation = await refreshBajujuNotificationLocation(userId, {
            requestPermission: false,
          });

          if (authorizedRegistration.ok) {
            await AsyncStorage.setItem(localChoiceKey, 'accepted');
          }

          if (!authorizedLocation.ok) {
            console.log('Posizione notifiche non aggiornata durante bootstrap Home.');
          }
        }

        const preferenceResult = await supabase
          .from('notification_preferences')
          .select('enabled')
          .eq('user_id', userId)
          .maybeSingle();`,
  'home-bootstrap'
);

replaceOnce(
  'app/home.tsx',
`          const registrationResult = await refreshBajujuPushRegistrationIfAuthorized(userId);
          if (registrationResult.ok) {
            const locationResult = await refreshBajujuNotificationLocation(userId, { requestPermission: false });
            if (!locationResult.ok) {
              console.log('Posizione notifiche non aggiornata al focus Home.');
            }
          }

          await refreshUnreadCount(userId);`,
`          const registrationResult = await refreshBajujuPushRegistrationIfAuthorized(userId);
          if (!registrationResult.ok) {
            console.log('Token push non aggiornato al focus Home.');
          }

          // La posizione deve essere sincronizzata anche se il token Expo fallisce:
          // serve comunque per creare la notifica in-app delle esperienze entro 25 km.
          const locationResult = await refreshBajujuNotificationLocation(userId, {
            requestPermission: false,
          });
          if (!locationResult.ok) {
            console.log('Posizione notifiche non aggiornata al focus Home.');
          }

          await refreshUnreadCount(userId);`,
  'home-focus-independent-location'
);

replaceOnce(
  'src/utils/bajujuNotificationLocation.ts',
`  if (preferenceResult.error || preferenceResult.data?.enabled !== true) {
    return { ok: false, reason: 'Notifiche Bajuju non abilitate.' };
  }

  const result = await supabase
    .from('notification_preferences')
    .update({
      latitude,
      longitude,
      location_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);`,
`  if (preferenceResult.error) {
    return { ok: false, reason: preferenceResult.error.message };
  }

  // Se l'utente le ha disattivate esplicitamente non riattiviamo nulla.
  // Se invece la riga non esiste ancora, la creiamo: i default DB mantengono
  // le preferenze standard e consentono il targeting geografico entro 25 km.
  if (preferenceResult.data?.enabled === false) {
    return { ok: false, reason: 'Notifiche Bajuju disattivate.' };
  }

  const result = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userId,
        latitude,
        longitude,
        location_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );`,
  'trova-location-bootstrap'
);

replaceOnce(
  'app/profile.tsx',
`  const [notificationsEnabled, setNotificationsEnabled] = useState(true);`,
`  const [notificationsEnabled, setNotificationsEnabled] = useState(false);`,
  'profile-default-real-state'
);

replaceOnce(
  'app/profile.tsx',
`    try {
      const notificationPreferencesResult = await supabase
        .from('notification_preferences')
        .select('enabled, preferred_province')
        .eq('user_id', String(currentUser.id))
        .maybeSingle();

      if (!notificationPreferencesResult.error && notificationPreferencesResult.data) {
        setNotificationsEnabled(notificationPreferencesResult.data.enabled !== false);`,
`    setNotificationsEnabled(false);

    try {
      const notificationPreferencesResult = await supabase
        .from('notification_preferences')
        .select('enabled, preferred_province')
        .eq('user_id', String(currentUser.id))
        .maybeSingle();

      if (!notificationPreferencesResult.error && notificationPreferencesResult.data) {
        setNotificationsEnabled(notificationPreferencesResult.data.enabled === true);`,
  'profile-load-real-state'
);

fs.unlinkSync(__filename);
console.log('PATCH_OK: bootstrap notifiche reale, posizione indipendente e toggle profilo allineato al database.');
