const fs = require('fs');
const path = require('path');

function replaceExact(filePath, search, replacement) {
  const absolute = path.resolve(filePath);
  const original = fs.readFileSync(absolute, 'utf8');

  if (!original.includes(search)) {
    throw new Error(`Blocco atteso non trovato in ${filePath}. Nessuna modifica applicata.`);
  }

  const backup = `${absolute}.bak-critical-flows`;
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(absolute, backup);
  }

  fs.writeFileSync(absolute, original.replace(search, replacement), 'utf8');
}

replaceExact(
  'app/home.tsx',
  "import React, { useEffect, useState } from 'react';",
  "import React, { useEffect, useRef, useState } from 'react';\nimport AsyncStorage from '@react-native-async-storage/async-storage';"
);

replaceExact(
  'app/home.tsx',
  `export default function HomeScreen() {\n  React.useEffect(() => {\n    let active = true;\n\n    async function setupBajujuNotifications() {\n      try {\n        const authResult = await supabase.auth.getUser();\n\n        if (authResult.error) {\n          throw authResult.error;\n        }\n\n        const userId = authResult.data.user?.id;\n\n        if (!active || !userId) return;\n\n        const preferencesResult = await supabase\n          .from('notification_preferences')\n          .select('enabled')\n          .eq('user_id', userId)\n          .maybeSingle();\n\n        if (preferencesResult.error) {\n          throw preferencesResult.error;\n        }\n\n        if (!active) return;\n\n        if (preferencesResult.data?.enabled === false) {\n          return;\n        }\n\n        if (preferencesResult.data?.enabled === true) {\n          return;\n        }\n\n        Alert.alert(\n          'Notifiche Bajuju',\n          'Vuoi ricevere notifiche per nuove esperienze, Flash, partecipazioni e richieste?',\n          [\n            {\n              text: 'No',\n              style: 'cancel',\n              onPress: () => {\n                void supabase.from('notification_preferences').upsert(\n                  {\n                    user_id: userId,\n                    enabled: false,\n                    updated_at: new Date().toISOString(),\n                  },\n                  {\n                    onConflict: 'user_id',\n                  }\n                );\n              },\n            },\n            {\n              text: 'Sì',\n              onPress: () => {\n                void registerForBajujuPushNotifications(userId);\n              },\n            },\n          ]\n        );\n      } catch (error) {\n        console.log('Errore registrazione notifiche Bajuju.');\n      }\n    }\n\n    setupBajujuNotifications();\n\n    return () => {\n      active = false;\n    };\n  }, []);`,
  `export default function HomeScreen() {\n  const notificationPromptRunningRef = useRef(false);\n\n  React.useEffect(() => {\n    let active = true;\n\n    async function setupBajujuNotifications() {\n      if (notificationPromptRunningRef.current) return;\n      notificationPromptRunningRef.current = true;\n\n      try {\n        const authResult = await supabase.auth.getUser();\n\n        if (authResult.error) throw authResult.error;\n\n        const userId = authResult.data.user?.id;\n        if (!active || !userId) return;\n\n        const localChoiceKey = \`bajuju-notification-choice:\${userId}\`;\n        const localChoice = await AsyncStorage.getItem(localChoiceKey);\n\n        if (!active || localChoice === 'accepted' || localChoice === 'declined') return;\n\n        const preferencesResult = await supabase\n          .from('notification_preferences')\n          .select('enabled')\n          .eq('user_id', userId)\n          .maybeSingle();\n\n        if (!active) return;\n\n        if (!preferencesResult.error && preferencesResult.data?.enabled === false) {\n          await AsyncStorage.setItem(localChoiceKey, 'declined');\n          return;\n        }\n\n        if (!preferencesResult.error && preferencesResult.data?.enabled === true) {\n          await AsyncStorage.setItem(localChoiceKey, 'accepted');\n          return;\n        }\n\n        Alert.alert(\n          'Notifiche Bajuju',\n          'Vuoi ricevere notifiche per nuove esperienze, Flash, partecipazioni e richieste?',\n          [\n            {\n              text: 'No',\n              style: 'cancel',\n              onPress: () => {\n                void (async () => {\n                  await AsyncStorage.setItem(localChoiceKey, 'declined');\n                  const saveResult = await supabase.from('notification_preferences').upsert(\n                    {\n                      user_id: userId,\n                      enabled: false,\n                      updated_at: new Date().toISOString(),\n                    },\n                    { onConflict: 'user_id' }\n                  );\n\n                  if (saveResult.error) {\n                    console.log('Preferenza notifiche No non salvata su Supabase.');\n                  }\n                })();\n              },\n            },\n            {\n              text: 'Sì',\n              onPress: () => {\n                void (async () => {\n                  await AsyncStorage.setItem(localChoiceKey, 'accepted');\n                  const registerResult = await registerForBajujuPushNotifications(userId);\n\n                  if (!registerResult.ok) {\n                    console.log('Attivazione notifiche non completata.');\n                  }\n                })();\n              },\n            },\n          ]\n        );\n      } catch {\n        console.log('Errore registrazione notifiche Bajuju.');\n      } finally {\n        notificationPromptRunningRef.current = false;\n      }\n    }\n\n    void setupBajujuNotifications();\n\n    return () => {\n      active = false;\n    };\n  }, []);`
);

replaceExact(
  'app/experience-detail.tsx',
  "import { router, useLocalSearchParams } from 'expo-router';\nimport React, { useCallback, useEffect, useMemo, useState } from 'react';",
  "import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';\nimport React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';"
);

replaceExact(
  'app/experience-detail.tsx',
  `  const [uploadingAlbumPhoto, setUploadingAlbumPhoto] = useState(false);\n  const [updatingCoverPhoto, setUpdatingCoverPhoto] = useState(false);`,
  `  const [uploadingAlbumPhoto, setUploadingAlbumPhoto] = useState(false);\n  const albumUploadLockRef = useRef(false);\n  const [updatingCoverPhoto, setUpdatingCoverPhoto] = useState(false);`
);

replaceExact(
  'app/experience-detail.tsx',
  `  useEffect(() => {\n    loadAlbumPhotos();\n  }, [loadAlbumPhotos]);`,
  `  useFocusEffect(\n    useCallback(() => {\n      void loadAlbumPhotos();\n    }, [loadAlbumPhotos])\n  );`
);

replaceExact(
  'app/experience-detail.tsx',
  `  const uploadAlbumPhoto = useCallback(async () => {\n    if (!experienceId || !currentUserId || uploadingAlbumPhoto) return;`,
  `  const uploadAlbumPhoto = useCallback(async () => {\n    if (!experienceId || !currentUserId || uploadingAlbumPhoto || albumUploadLockRef.current) return;\n\n    albumUploadLockRef.current = true;`
);

replaceExact(
  'app/experience-detail.tsx',
  `    } finally {\n      setUploadingAlbumPhoto(false);\n    }`,
  `    } finally {\n      albumUploadLockRef.current = false;\n      setUploadingAlbumPhoto(false);\n    }`
);

console.log('Correzioni applicate: notifiche persistenti, blocco doppio upload e ricaricamento galleria al rientro.');
