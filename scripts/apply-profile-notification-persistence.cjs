const fs = require('fs');

const file = 'app/profile.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(haystack, needle, replacement, label) {
  const first = haystack.indexOf(needle);
  if (first === -1) throw new Error(`PATCH_FAIL: ${label} non trovato`);
  if (haystack.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`PATCH_FAIL: ${label} trovato più di una volta`);
  }
  return haystack.slice(0, first) + replacement + haystack.slice(first + needle.length);
}

if (!source.includes("import AsyncStorage from '@react-native-async-storage/async-storage';")) {
  source = replaceOnce(
    source,
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';\nimport * as ImagePicker from 'expo-image-picker';",
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';\nimport AsyncStorage from '@react-native-async-storage/async-storage';\nimport * as ImagePicker from 'expo-image-picker';",
    'import AsyncStorage'
  );
}

if (!source.includes("import { refreshBajujuNotificationLocation } from '../src/utils/bajujuNotificationLocation';")) {
  source = replaceOnce(
    source,
    "import { supabase } from '../src/lib/supabase';\nimport {\n  registerForBajujuPushNotifications,",
    "import { supabase } from '../src/lib/supabase';\nimport { refreshBajujuNotificationLocation } from '../src/utils/bajujuNotificationLocation';\nimport {\n  registerForBajujuPushNotifications,",
    'import location helper'
  );
}

const oldBlock = `      try {\n        let notificationsSuccessfullyEnabled = notificationsEnabled;\n\n        if (notificationsEnabled) {\n          const notificationResult =\n            await registerForBajujuPushNotifications(String(user.id));\n\n          if (!notificationResult.ok) {\n            Alert.alert(\n              'Notifiche non attivate',\n              notificationResult.reason ||\n                'Non sono riuscito ad attivare le notifiche sul dispositivo.'\n            );\n          }\n        }\n\n        const preferencesResult = await supabase\n          .from('notification_preferences')\n          .upsert(\n            {\n              user_id: user.id,\n              enabled: notificationsSuccessfullyEnabled,\n              preferred_province: cleanProvince,\n              updated_at: new Date().toISOString(),\n            },\n            {\n              onConflict: 'user_id',\n            }\n          );\n\n        if (preferencesResult.error) {\n          console.warn('Preferenze notifiche non salvate.');\n        }\n      } catch {\n        // Se la tabella notifiche non è ancora pronta, il profilo resta comunque salvato.\n      }`;

const newBlock = `      const notificationChoiceKey = \`bajuju-notification-choice-v2:\${user.id}\`;\n\n      const preferencesResult = await supabase\n        .from('notification_preferences')\n        .upsert(\n          {\n            user_id: user.id,\n            enabled: notificationsEnabled,\n            preferred_province: cleanProvince,\n            updated_at: new Date().toISOString(),\n          },\n          {\n            onConflict: 'user_id',\n          }\n        );\n\n      if (preferencesResult.error) {\n        console.warn('Preferenze notifiche non salvate.', preferencesResult.error);\n        Alert.alert(\n          'Notifiche non salvate',\n          'Il profilo è stato aggiornato, ma non sono riuscito a salvare la preferenza notifiche.'\n        );\n      } else {\n        try {\n          await AsyncStorage.setItem(\n            notificationChoiceKey,\n            notificationsEnabled ? 'accepted' : 'declined'\n          );\n        } catch (error) {\n          console.log('Scelta notifiche locale non aggiornata.', error);\n        }\n\n        if (notificationsEnabled) {\n          try {\n            const notificationResult =\n              await registerForBajujuPushNotifications(String(user.id));\n\n            if (!notificationResult.ok) {\n              Alert.alert(\n                'Notifiche salvate',\n                notificationResult.reason ||\n                  'La preferenza è attiva, ma la registrazione push del dispositivo non è ancora riuscita.'\n              );\n            }\n          } catch (error) {\n            console.log('Registrazione push non completata.', error);\n          }\n\n          try {\n            const locationResult = await refreshBajujuNotificationLocation(String(user.id));\n            if (!locationResult.ok) {\n              console.log('Posizione notifiche non aggiornata:', locationResult.reason);\n            }\n          } catch (error) {\n            console.log('Posizione notifiche non aggiornata.', error);\n          }\n        }\n      }`;

source = replaceOnce(source, oldBlock, newBlock, 'blocco salvataggio notifiche profilo');

fs.writeFileSync(file, source);
console.log('PATCH_OK: preferenza notifiche salvata prima di push/posizione e scelta locale allineata.');
