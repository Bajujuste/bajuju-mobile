#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/workspaces/bajuju-mobile"
NEW_MIGRATION="supabase/migrations/20260810184700_final_release_hardening.sql"

if [[ ! -d "$ROOT" ]]; then
  echo "ERRORE: cartella Bajuju non trovata: $ROOT" >&2
  exit 1
fi
cd "$ROOT"

REQUIRED=(
  "app/(tabs)/index.tsx"
  "app/_layout.tsx"
  "app/admin-create-experience.tsx"
  "app/create-experience.tsx"
  "app/edit-experience.tsx"
  "app/experience-detail.tsx"
  "app/experiences-map.tsx"
  "app/experiences.tsx"
  "app/flash-detail.tsx"
  "app/flash.tsx"
  "app/notifications.tsx"
  "app/profile.tsx"
  "components/BajujuMap.tsx"
  "scripts/check-before-build.js"
  "scripts/check-routes.js"
  "src/lib/addressAutocomplete.ts"
  "src/utils/bajujuNotifications.ts"
  "supabase/functions/address-autocomplete/index.ts"
  "supabase/functions/admin-create-experience/index.ts"
  "supabase/functions/analyze-admin-experience/index.ts"
  "supabase/functions/send-bajuju-push/index.ts"
  "supabase-push-notifications.sql"
)

for file in "${REQUIRED[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERRORE: file atteso mancante: $file" >&2
    exit 1
  fi
done

if [[ -e "$NEW_MIGRATION" ]]; then
  echo "ERRORE: questa correzione risulta gia' applicata ($NEW_MIGRATION esiste). Non eseguo nulla." >&2
  exit 1
fi

command -v python3 >/dev/null || { echo "ERRORE: python3 non disponibile" >&2; exit 1; }
command -v node >/dev/null || { echo "ERRORE: node non disponibile" >&2; exit 1; }
command -v npx >/dev/null || { echo "ERRORE: npx non disponibile" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/tmp/bajuju-before-final-hardening-${STAMP}.tar.gz"
tar -czf "$BACKUP" "${REQUIRED[@]}"
echo "BACKUP_OK: $BACKUP"

CHANGED=0
rollback() {
  local code=$?
  trap - ERR
  if [[ "$CHANGED" -eq 1 ]]; then
    echo "CONTROLLO_FALLITO: ripristino automatico dei file precedenti..." >&2
    tar -xzf "$BACKUP" -C "$ROOT"
    rm -f "$NEW_MIGRATION"
    echo "RIPRISTINO_OK: il progetto e' tornato allo stato precedente." >&2
  fi
  exit "$code"
}
trap rollback ERR

CHANGED=1
python3 - <<'PY_PATCH'
from pathlib import Path
import re, sys
ROOT=Path.cwd()

def read(p): return (ROOT/p).read_text()
def write(p,s): (ROOT/p).write_text(s)
def repl(p, old, new, count=1):
    s=read(p)
    c=s.count(old)
    if c != count:
        raise SystemExit(f'{p}: expected {count} occurrences, found {c}: {old[:80]!r}')
    write(p, s.replace(old,new,count))
    print('patched',p)

# 1. Province lists
repl('app/create-experience.tsx', "const LOCATION_OPTIONS = [\n  'Bergamo',\n  'Milano',\n  'Lecco',\n  'Monza e Brianza',\n  'Brescia',\n  'Torino',\n];", "const LOCATION_OPTIONS = [\n  'Bergamo',\n  'Milano',\n  'Lecco',\n  'Monza e Brianza',\n  'Verona',\n];")
repl('app/experiences.tsx', "const PROVINCE_OPTIONS = [\n  'Tutte',\n  'Bergamo',\n  'Milano',\n  'Lecco',\n  'Monza e Brianza',\n  'Brescia',\n  'Torino',\n] as const;", "const PROVINCE_OPTIONS = [\n  'Tutte',\n  'Bergamo',\n  'Milano',\n  'Lecco',\n  'Monza e Brianza',\n  'Verona',\n] as const;")
repl('app/flash.tsx', "const ACTIVE_PROVINCES = ['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Brescia', 'Torino'] as const;", "const ACTIVE_PROVINCES = ['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Verona'] as const;")
repl('app/experiences-map.tsx', "  Brescia: {\n    latitude: 45.5416,\n    longitude: 10.2118,\n    latitudeDelta: 0.52,\n    longitudeDelta: 0.64,\n  },\n  Torino: {\n    latitude: 45.0703,\n    longitude: 7.6869,\n    latitudeDelta: 0.58,\n    longitudeDelta: 0.7,\n  },", "  Verona: {\n    latitude: 45.4384,\n    longitude: 10.9916,\n    latitudeDelta: 0.48,\n    longitudeDelta: 0.58,\n  },")
repl('app/experiences-map.tsx', "const PROVINCE_OPTIONS = ['Tutte', 'Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Brescia', 'Torino'] as const;", "const PROVINCE_OPTIONS = ['Tutte', 'Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Verona'] as const;")

# 2. Map Android permission + prevent repeated fit churn
repl('components/BajujuMap.tsx', "  hideHeader?: boolean;\n};", "  hideHeader?: boolean;\n  viewportKey?: string;\n};")
repl('components/BajujuMap.tsx', "  showUserLocation = false,\n  hideHeader = false,\n}: BajujuMapProps) {", "  showUserLocation = false,\n  hideHeader = false,\n  viewportKey,\n}: BajujuMapProps) {")
repl('components/BajujuMap.tsx', "  const preferredRegionKeyRef = useRef(\"\");", "  const preferredRegionKeyRef = useRef(\"\");\n  const fittedViewportKeyRef = useRef(\"\");")
old_effect = '''  useEffect(() => {\n    if (!mapReady || !mapRef.current) return;\n\n    if (preferFallbackRegion && fallbackRegion) {\n      const regionKey = `${fallbackRegion.latitude}:${fallbackRegion.longitude}:${fallbackRegion.latitudeDelta}:${fallbackRegion.longitudeDelta}`;\n      if (preferredRegionKeyRef.current !== regionKey) {\n        preferredRegionKeyRef.current = regionKey;\n        mapRef.current.animateToRegion(fallbackRegion, 350);\n      }\n      return;\n    }\n\n    if (items.length === 0) {\n      mapRef.current.animateToRegion(\n        fallbackRegion || DEFAULT_REGION,\n        350\n      );\n      return;\n    }\n\n    if (items.length === 1) {\n      mapRef.current.animateToRegion(\n        {\n          latitude: items[0].latitude,\n          longitude: items[0].longitude,\n          latitudeDelta: 0.08,\n          longitudeDelta: 0.08,\n        },\n        350\n      );\n      return;\n    }\n\n    mapRef.current.fitToCoordinates(\n      items.map((item) => ({\n        latitude: item.latitude,\n        longitude: item.longitude,\n      })),\n      {\n        edgePadding: {\n          top: 70,\n          right: 50,\n          bottom: 70,\n          left: 50,\n        },\n        animated: true,\n      }\n    );\n  }, [fallbackRegion, items, mapReady, preferFallbackRegion]);'''
new_effect = '''  useEffect(() => {\n    if (!mapReady || !mapRef.current) return;\n\n    if (preferFallbackRegion && fallbackRegion) {\n      const regionKey = `${fallbackRegion.latitude}:${fallbackRegion.longitude}:${fallbackRegion.latitudeDelta}:${fallbackRegion.longitudeDelta}`;\n      if (preferredRegionKeyRef.current !== regionKey) {\n        preferredRegionKeyRef.current = regionKey;\n        mapRef.current.animateToRegion(fallbackRegion, 350);\n      }\n      return;\n    }\n\n    if (viewportKey && fittedViewportKeyRef.current === viewportKey) return;\n\n    if (items.length === 0) {\n      mapRef.current.animateToRegion(\n        fallbackRegion || DEFAULT_REGION,\n        350\n      );\n      return;\n    }\n\n    if (items.length === 1) {\n      mapRef.current.animateToRegion(\n        {\n          latitude: items[0].latitude,\n          longitude: items[0].longitude,\n          latitudeDelta: 0.08,\n          longitudeDelta: 0.08,\n        },\n        350\n      );\n      if (viewportKey) fittedViewportKeyRef.current = viewportKey;\n      return;\n    }\n\n    mapRef.current.fitToCoordinates(\n      items.map((item) => ({\n        latitude: item.latitude,\n        longitude: item.longitude,\n      })),\n      {\n        edgePadding: {\n          top: 70,\n          right: 50,\n          bottom: 70,\n          left: 50,\n        },\n        animated: true,\n      }\n    );\n    if (viewportKey) fittedViewportKeyRef.current = viewportKey;\n  }, [fallbackRegion, items, mapReady, preferFallbackRegion, viewportKey]);'''
repl('components/BajujuMap.tsx', old_effect, new_effect)
repl('components/BajujuMap.tsx', "            showsUserLocation={showUserLocation}", "          showsUserLocation={showUserLocation}")
repl('app/experiences-map.tsx', '''              showUserLocation\n              hideHeader''', '''              showUserLocation={viewerCoordinates !== null}\n              hideHeader''')
repl('app/experiences-map.tsx', '''            fallbackRegion={viewerRegion}\n              preferFallbackRegion''', '''            fallbackRegion={viewerRegion}\n              preferFallbackRegion={viewerRegion !== undefined}\n              viewportKey={`${selectedCategory}|${selectedProvince}|${selectedWhen}`}''')

# 3. address-autocomplete resolve_text action
marker = "  const action = cleanString(body.action, 30);\n  const sessionToken = cleanString(body.sessionToken, 36);"
insert = '''  const action = cleanString(body.action, 30);\n\n  if (action === 'resolve_text') {\n    const query = cleanString(body.query, 300);\n\n    if (query.length < 3) {\n      return jsonResponse({ ok: false, error: 'INVALID_QUERY' }, 400);\n    }\n\n    const searchResponse = await fetch(\n      'https://places.googleapis.com/v1/places:searchText',\n      {\n        method: 'POST',\n        headers: {\n          'Content-Type': 'application/json',\n          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,\n          'X-Goog-FieldMask': 'places.location,places.formattedAddress',\n        },\n        body: JSON.stringify({\n          textQuery: query,\n          languageCode: 'it',\n          regionCode: 'it',\n          maxResultCount: 1,\n        }),\n      }\n    );\n\n    if (!searchResponse.ok) {\n      console.error('Google Places text search failed:', searchResponse.status);\n      return jsonResponse(\n        { ok: false, error: 'TEXT_SEARCH_FAILED', provider_status: searchResponse.status },\n        502\n      );\n    }\n\n    const searchData = await searchResponse.json();\n    const place = Array.isArray(searchData.places) ? searchData.places[0] : null;\n    const latitude = Number(place?.location?.latitude);\n    const longitude = Number(place?.location?.longitude);\n\n    if (\n      !Number.isFinite(latitude) ||\n      !Number.isFinite(longitude) ||\n      latitude < -90 ||\n      latitude > 90 ||\n      longitude < -180 ||\n      longitude > 180\n    ) {\n      return jsonResponse({ ok: false, error: 'ADDRESS_NOT_FOUND' }, 404);\n    }\n\n    return jsonResponse({\n      ok: true,\n      latitude,\n      longitude,\n      formatted_address: cleanString(place?.formattedAddress, 400),\n    });\n  }\n\n  const sessionToken = cleanString(body.sessionToken, 36);'''
repl('supabase/functions/address-autocomplete/index.ts', marker, insert)

# client resolve helper
p='src/lib/addressAutocomplete.ts'
s=read(p)
append='''\n\nexport type ResolvedCoordinates = {\n  latitude: number;\n  longitude: number;\n  formattedAddress: string;\n};\n\nexport async function resolveAddressText(query: string): Promise<ResolvedCoordinates> {\n  const cleanQuery = query.trim();\n\n  if (cleanQuery.length < 3) {\n    throw new Error('INVALID_QUERY');\n  }\n\n  const result = await supabase.functions.invoke('address-autocomplete', {\n    body: {\n      action: 'resolve_text',\n      query: cleanQuery,\n    },\n  });\n\n  if (result.error) {\n    throw result.error;\n  }\n\n  const response = (result.data || {}) as FunctionResponse;\n  const latitude = Number(response.latitude);\n  const longitude = Number(response.longitude);\n\n  if (\n    response.ok !== true ||\n    !Number.isFinite(latitude) ||\n    !Number.isFinite(longitude)\n  ) {\n    throw new Error(String(response.error || 'ADDRESS_NOT_FOUND'));\n  }\n\n  return {\n    latitude,\n    longitude,\n    formattedAddress: String(response.formatted_address || '').trim(),\n  };\n}\n'''
if 'export async function resolveAddressText' in s: raise SystemExit('helper already exists')
write(p,s.rstrip()+append)
print('patched',p)

# 4. edit experience coordinates on location change
repl('app/edit-experience.tsx', "import React, { useCallback, useEffect, useState } from 'react';", "import React, { useCallback, useEffect, useRef, useState } from 'react';")
repl('app/edit-experience.tsx', "import { EXPERIENCE_CATEGORIES } from '@/src/constants/experienceCategories';\nimport { supabase } from '../src/lib/supabase';", "import { EXPERIENCE_CATEGORIES } from '@/src/constants/experienceCategories';\nimport { resolveAddressText } from '../src/lib/addressAutocomplete';\nimport { supabase } from '../src/lib/supabase';\n\nconst ACTIVE_PROVINCES = ['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Verona'] as const;")
repl('app/edit-experience.tsx', "  is_flash: boolean | null;\n};", "  is_flash: boolean | null;\n  latitude: number | null;\n  longitude: number | null;\n};")
repl('app/edit-experience.tsx', "  const [budgetAmount, setBudgetAmount] = useState('');", "  const [budgetAmount, setBudgetAmount] = useState('');\n  const originalLocationRef = useRef({ signature: '', latitude: null as number | null, longitude: null as number | null });")
repl('app/edit-experience.tsx', ".select('id,creator_id,title,description,activity_date,activity_time,city,province,meeting_place,category,max_participants,budget_amount,is_flash')", ".select('id,creator_id,title,description,activity_date,activity_time,city,province,meeting_place,category,max_participants,budget_amount,is_flash,latitude,longitude')")
repl('app/edit-experience.tsx', "      setBudgetAmount(row.budget_amount !== null && row.budget_amount !== undefined ? String(row.budget_amount) : '');", "      setBudgetAmount(row.budget_amount !== null && row.budget_amount !== undefined ? String(row.budget_amount) : '');\n      originalLocationRef.current = {\n        signature: [String(row.meeting_place || '').trim(), String(row.city || '').trim(), String(row.province || '').trim()].join('|').toLowerCase(),\n        latitude: row.latitude,\n        longitude: row.longitude,\n      };")
repl('app/edit-experience.tsx', "    if (!validDate(activityDate)) {", "    if (!(ACTIVE_PROVINCES as readonly string[]).includes(cleanProvince)) {\n      Alert.alert('Provincia non valida', 'Scegli una provincia attiva su Bajuju.');\n      return;\n    }\n\n    if (!validDate(activityDate)) {")
old_save = '''    try {\n      const result = await supabase\n        .from('activities')\n        .update({\n          title: cleanTitle,\n          description: cleanDescription,\n          activity_date: activityDate,\n          activity_time: normalizedTime,\n          city: cleanCity,\n          province: cleanProvince,\n          meeting_place: cleanMeetingPlace,\n          category,\n          max_participants: parsedMax,\n          budget_amount: parsedBudget,\n        })'''
new_save = '''    try {\n      const nextLocationSignature = [cleanMeetingPlace, cleanCity, cleanProvince].join('|').toLowerCase();\n      let latitude = originalLocationRef.current.latitude;\n      let longitude = originalLocationRef.current.longitude;\n\n      if (\n        nextLocationSignature !== originalLocationRef.current.signature ||\n        latitude === null ||\n        longitude === null\n      ) {\n        try {\n          const resolved = await resolveAddressText(\n            [cleanMeetingPlace, cleanCity, cleanProvince, 'Italia'].join(', ')\n          );\n          latitude = resolved.latitude;\n          longitude = resolved.longitude;\n        } catch {\n          Alert.alert(\n            'Luogo non trovato',\n            'Non riesco a geolocalizzare il nuovo luogo. Controlla indirizzo, comune e provincia prima di salvare.'\n          );\n          return;\n        }\n      }\n\n      const result = await supabase\n        .from('activities')\n        .update({\n          title: cleanTitle,\n          description: cleanDescription,\n          activity_date: activityDate,\n          activity_time: normalizedTime,\n          city: cleanCity,\n          province: cleanProvince,\n          meeting_place: cleanMeetingPlace,\n          category,\n          max_participants: parsedMax,\n          budget_amount: parsedBudget,\n          latitude,\n          longitude,\n        })'''
repl('app/edit-experience.tsx', old_save, new_save)
repl('app/edit-experience.tsx', "      Alert.alert('Evento aggiornato', 'Le modifiche sono state salvate.', [", "      originalLocationRef.current = {\n        signature: [cleanMeetingPlace, cleanCity, cleanProvince].join('|').toLowerCase(),\n        latitude,\n        longitude,\n      };\n\n      Alert.alert('Evento aggiornato', 'Le modifiche sono state salvate.', [")

# 5. Admin ChatGPT event geocode before create + only active province
repl('app/admin-create-experience.tsx', "import { supabase } from '../src/lib/supabase';", "import { resolveAddressText } from '../src/lib/addressAutocomplete';\nimport { supabase } from '../src/lib/supabase';\n\nconst ACTIVE_PROVINCES = ['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Verona'] as const;")
repl('app/admin-create-experience.tsx', "      !payload.category ||\n      !Number.isInteger(maxParticipants) ||", "      !payload.category ||\n      !(ACTIVE_PROVINCES as readonly string[]).includes(payload.province) ||\n      !Number.isInteger(maxParticipants) ||")
repl('app/admin-create-experience.tsx', "      const stableKey =\n        idempotencyKey ||", "      const resolvedLocation = await resolveAddressText(\n        [payload.meeting_place, payload.city, payload.province, 'Italia'].join(', ')\n      );\n      const geolocatedPayload = {\n        ...payload,\n        latitude: resolvedLocation.latitude,\n        longitude: resolvedLocation.longitude,\n      };\n\n      const stableKey =\n        idempotencyKey ||")
repl('app/admin-create-experience.tsx', "          payload,\n        },", "          payload: geolocatedPayload,\n        },")
repl('supabase/functions/analyze-admin-experience/index.ts', "    \"La provincia deve essere il nome completo, per esempio Bergamo, Milano, Lecco o Monza e Brianza.\",", "    \"La provincia deve essere una tra Bergamo, Milano, Lecco, Monza e Brianza o Verona.\",")
# server edge require coordinates and active province
repl('supabase/functions/admin-create-experience/index.ts', "const MAX_LONG_TEXT_LENGTH = 4000;", "const MAX_LONG_TEXT_LENGTH = 4000;\nconst ACTIVE_PROVINCES = new Set(['Bergamo', 'Milano', 'Lecco', 'Monza e Brianza', 'Verona']);")
repl('supabase/functions/admin-create-experience/index.ts', "  const province = cleanString(payload.province || payload.provincia);\n  const description", "  const province = cleanString(payload.province || payload.provincia);\n  const meetingPlace = cleanString(payload.meeting_place || payload.place || payload.address);\n  const description")
repl('supabase/functions/admin-create-experience/index.ts', "  if (!province || province.length > 100) return 'INVALID_PROVINCE';\n  if (latitude !== null", "  if (!province || province.length > 100 || !ACTIVE_PROVINCES.has(province)) return 'INVALID_PROVINCE';\n  if (!meetingPlace || meetingPlace.length > MAX_TEXT_LENGTH) return 'INVALID_MEETING_PLACE';\n  if (latitude === null || Number.isNaN(latitude) || latitude < -90 || latitude > 90) return 'INVALID_LATITUDE';\n  if (longitude === null || Number.isNaN(longitude) || longitude < -180 || longitude > 180) return 'INVALID_LONGITUDE';\n  if (latitude !== null")
# remove now-redundant optional lat checks (will not hurt logically but duplicate impossible; remove exact two lines)
repl('supabase/functions/admin-create-experience/index.ts', "  if (latitude !== null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) return 'INVALID_LATITUDE';\n  if (longitude !== null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) return 'INVALID_LONGITUDE';\n", "")

# 6. Notifications delete UI
repl('app/notifications.tsx', "  ActivityIndicator,\n  Pressable,", "  ActivityIndicator,\n  Alert,\n  Pressable,")
insert_before_return = '''\n  const deleteNotification = useCallback((notificationId: string) => {\n    Alert.alert('Elimina notifica', 'Vuoi eliminare questa notifica?', [\n      { text: 'Annulla', style: 'cancel' },\n      {\n        text: 'Elimina',\n        style: 'destructive',\n        onPress: () => {\n          void (async () => {\n            const { error } = await supabase\n              .from('push_notification_logs')\n              .delete()\n              .eq('id', notificationId);\n\n            if (error) {\n              Alert.alert('Errore', 'Non sono riuscito a eliminare la notifica.');\n              return;\n            }\n\n            setNotifications((current) => current.filter((item) => item.id !== notificationId));\n          })();\n        },\n      },\n    ]);\n  }, []);\n\n  const deleteAllNotifications = useCallback(() => {\n    Alert.alert('Elimina tutte', 'Vuoi eliminare tutte le notifiche?', [\n      { text: 'Annulla', style: 'cancel' },\n      {\n        text: 'Elimina tutte',\n        style: 'destructive',\n        onPress: () => {\n          void (async () => {\n            const { data: userData, error: userError } = await supabase.auth.getUser();\n            const userId = userData.user?.id;\n\n            if (userError || !userId) {\n              Alert.alert('Errore', 'Utente non autenticato.');\n              return;\n            }\n\n            const { error } = await supabase\n              .from('push_notification_logs')\n              .delete()\n              .eq('user_id', userId);\n\n            if (error) {\n              Alert.alert('Errore', 'Non sono riuscito a eliminare le notifiche.');\n              return;\n            }\n\n            setNotifications([]);\n          })();\n        },\n      },\n    ]);\n  }, []);\n'''
repl('app/notifications.tsx', "\n  return (\n    <SafeAreaView", insert_before_return + "\n  return (\n    <SafeAreaView")
repl('app/notifications.tsx', '''          ) : notifications.length === 0 ? (''', '''          ) : notifications.length === 0 ? (''')  # assertion only, no-op impossible due function replace same? handle below
# add delete all immediately before map branch by exact notifications map start
repl('app/notifications.tsx', '''          ) : (\n            notifications.map((notification) => (''', '''          ) : (\n            <>\n              <Pressable\n                style={styles.deleteAllButton}\n                onPress={deleteAllNotifications}\n                accessibilityRole="button"\n                accessibilityLabel="Elimina tutte le notifiche"\n              >\n                <Text style={styles.deleteAllButtonText}>Elimina tutte</Text>\n              </Pressable>\n\n              {notifications.map((notification) => (''')
repl('app/notifications.tsx', '''              </Pressable>\n            ))\n          )}''', '''                  <Pressable\n                    style={styles.deleteNotificationButton}\n                    onPress={(event) => {\n                      event.stopPropagation();\n                      deleteNotification(notification.id);\n                    }}\n                    accessibilityRole="button"\n                    accessibilityLabel={`Elimina notifica: ${notification.title}`}\n                  >\n                    <Text style={styles.deleteNotificationButtonText}>Elimina</Text>\n                  </Pressable>\n              </Pressable>\n              ))}\n            </>\n          )}''')
repl('app/notifications.tsx', "  notificationCard: {", "  deleteAllButton: {\n    alignSelf: 'flex-end',\n    marginBottom: 10,\n    borderRadius: 999,\n    paddingHorizontal: 14,\n    paddingVertical: 8,\n    backgroundColor: WHITE,\n    borderWidth: 1,\n    borderColor: BORDER,\n  },\n  deleteAllButtonText: {\n    fontSize: 12,\n    fontWeight: '900',\n    color: PINK_DARK,\n  },\n  notificationCard: {")
repl('app/notifications.tsx', "  notificationDate: {\n    marginTop: 8,\n    fontSize: 11,\n    fontWeight: '800',\n    color: MUTED,\n  },", "  notificationDate: {\n    marginTop: 8,\n    fontSize: 11,\n    fontWeight: '800',\n    color: MUTED,\n  },\n  deleteNotificationButton: {\n    alignSelf: 'flex-start',\n    marginTop: 8,\n    paddingVertical: 4,\n    paddingHorizontal: 8,\n  },\n  deleteNotificationButtonText: {\n    fontSize: 11,\n    fontWeight: '900',\n    color: PINK_DARK,\n    textDecorationLine: 'underline',\n  },")

# Verify notification mutations really changed rows
repl('app/notifications.tsx', """          const { error } = await supabase
            .from('push_notification_logs')
            .update({ is_read: true })
            .eq('id', notification.id);

          if (error) {
            throw error;
          }""", """          const { data: updatedRow, error } = await supabase
            .from('push_notification_logs')
            .update({ is_read: true })
            .eq('id', notification.id)
            .select('id')
            .maybeSingle();

          if (error || !updatedRow) {
            throw error || new Error('NOTIFICATION_NOT_UPDATED');
          }""")
repl('app/notifications.tsx', """            const { error } = await supabase
              .from('push_notification_logs')
              .delete()
              .eq('id', notificationId);

            if (error) {""", """            const { data: deletedRow, error } = await supabase
              .from('push_notification_logs')
              .delete()
              .eq('id', notificationId)
              .select('id')
              .maybeSingle();

            if (error || !deletedRow) {""")
repl('app/notifications.tsx', """            const { error } = await supabase
              .from('push_notification_logs')
              .delete()
              .eq('user_id', userId);

            if (error) {
              Alert.alert('Errore', 'Non sono riuscito a eliminare le notifiche.');
              return;
            }

            setNotifications([]);""", """            const { data: deletedRows, error } = await supabase
              .from('push_notification_logs')
              .delete()
              .eq('user_id', userId)
              .select('id');

            if (error) {
              Alert.alert('Errore', 'Non sono riuscito a eliminare le notifiche.');
              return;
            }

            const deletedIds = new Set((deletedRows || []).map((row) => String(row.id)));
            setNotifications((current) => current.filter((item) => !deletedIds.has(item.id)));""")

# 7. Notification SQL mismatch + DELETE RLS + index
for old_log, new_log in [
    ('success: false, error: "Push non abilitata per questo utente."', 'success: false, error_message: "Push non abilitata per questo utente."'),
    ('success: false, error: "Nessun push token valido."', 'success: false, error_message: "Nessun push token valido."'),
    ('        error: error instanceof Error ? error.message : String(error),', '        error_message: error instanceof Error ? error.message : String(error),'),
    ('      error: null,', '      error_message: null,'),
]:
    repl('supabase/functions/send-bajuju-push/index.ts', old_log, new_log)
repl('supabase-push-notifications.sql', '''drop policy if exists "push_notification_logs_update_own" on public.push_notification_logs;\ncreate policy "push_notification_logs_update_own"\non public.push_notification_logs\nfor update\nto authenticated\nusing (auth.uid() = user_id)\nwith check (auth.uid() = user_id);''', '''drop policy if exists "push_notification_logs_update_own" on public.push_notification_logs;\ncreate policy "push_notification_logs_update_own"\non public.push_notification_logs\nfor update\nto authenticated\nusing (auth.uid() = user_id)\nwith check (auth.uid() = user_id);\n\ndrop policy if exists "push_notification_logs_delete_own" on public.push_notification_logs;\ncreate policy "push_notification_logs_delete_own"\non public.push_notification_logs\nfor delete\nto authenticated\nusing (auth.uid() = user_id);''')
repl('supabase-push-notifications.sql', "create index if not exists notification_preferences_enabled_idx on public.notification_preferences(enabled);", "create index if not exists notification_preferences_enabled_idx on public.notification_preferences(enabled);\ncreate index if not exists push_notification_logs_user_sent_idx on public.push_notification_logs(user_id, sent_at desc);")

# Push auth minimum hardening
repl('supabase/functions/send-bajuju-push/index.ts', "  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');\n\n  if (!supabaseUrl || !serviceRoleKey) {", "  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');\n  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');\n\n  if (!supabaseUrl || !serviceRoleKey || !anonKey) {")
repl('supabase/functions/send-bajuju-push/index.ts', "  const supabase = createClient(supabaseUrl, serviceRoleKey);\n\n  let payload", "  const authorization = request.headers.get('Authorization') || '';\n\n  if (!authorization.toLowerCase().startsWith('bearer ')) {\n    return jsonResponse({ error: 'Authentication required' }, 401);\n  }\n\n  const authClient = createClient(supabaseUrl, anonKey, {\n    global: { headers: { Authorization: authorization } },\n    auth: { persistSession: false, autoRefreshToken: false },\n  });\n  const { data: userData, error: userError } = await authClient.auth.getUser();\n\n  if (userError || !userData.user) {\n    return jsonResponse({ error: 'Authentication required' }, 401);\n  }\n\n  const authenticatedUserId = userData.user.id;\n  const supabase = createClient(supabaseUrl, serviceRoleKey);\n\n  let payload")
repl('supabase/functions/send-bajuju-push/index.ts', "  const actorUserId = payload.actorUserId || null;", "  if (payload.actorUserId && payload.actorUserId !== authenticatedUserId) {\n    return jsonResponse({ error: 'Actor non autorizzato' }, 403);\n  }\n\n  const actorUserId = authenticatedUserId;")

# 8. Session profile gate
repl('app/(tabs)/index.tsx', "      if (data.session) {\n        router.replace('/home');\n      }", "      if (data.session) {\n        const userId = data.session.user.id;\n        const profileResult = await supabase\n          .from('profiles')\n          .select('*')\n          .eq('id', userId)\n          .maybeSingle();\n\n        if (profileResult.error) {\n          throw profileResult.error;\n        }\n\n        const profile = profileResult.data as Record<string, unknown> | null;\n        const profileProvince = String(\n          profile?.province ||\n            profile?.provincia ||\n            profile?.location_province ||\n            ''\n        ).trim();\n        const profileAge = String(\n          profile?.age ||\n            profile?.eta ||\n            profile?.['età'] ||\n            profile?.user_age ||\n            profile?.age_range ||\n            profile?.fascia_eta ||\n            profile?.age_band ||\n            profile?.eta_range ||\n            ''\n        ).trim();\n\n        router.replace(profile && profileProvince && profileAge ? '/home' : '/profile');\n      }")

# 9. Album lock
repl('app/experience-detail.tsx', "    albumUploadLockRef.current = true;\n\n    if (!canUseAlbum)", "    if (!canUseAlbum)")
repl('app/experience-detail.tsx', "    if (userAlbumLimitReached) {\n      window.alert('Hai già caricato 3 foto per questo evento.');\n      return;\n    }\n\n    setUploadingAlbumPhoto(true);", "    if (userAlbumLimitReached) {\n      window.alert('Hai già caricato 3 foto per questo evento.');\n      return;\n    }\n\n    albumUploadLockRef.current = true;\n    setUploadingAlbumPhoto(true);")

# 10. update status checks actual row
repl('app/profile.tsx', "      const result = await supabase.from(table).update(payload).eq('id', id);\n      if (!result.error) return true;", "      const result = await supabase\n        .from(table)\n        .update(payload)\n        .eq('id', id)\n        .select('id')\n        .maybeSingle();\n      if (!result.error && result.data) return true;")

# 11. cancellation verify actual modified row
repl('app/experience-detail.tsx', "                  .from('activities')\n                  .update(payload)\n                  .eq('id', experienceId);\n\n                if (!result.error) {", "                  .from('activities')\n                  .update(payload)\n                  .eq('id', experienceId)\n                  .select('id')\n                  .maybeSingle();\n\n                if (!result.error && result.data) {")

# 12. Push token fallback verify update occurred
repl('src/utils/bajujuNotifications.ts', "    const result = await supabase.from('profiles').update(update).eq('id', userId);\n\n    if (!result.error) {", "    const result = await supabase\n      .from('profiles')\n      .update(update)\n      .eq('id', userId)\n      .select('id')\n      .maybeSingle();\n\n    if (!result.error && result.data) {")

# 13. Push-tap deep navigation in root
repl('app/_layout.tsx', "import { Stack, usePathname } from 'expo-router';", "import { router, Stack, usePathname } from 'expo-router';")
repl('app/_layout.tsx', "import { StyleSheet } from 'react-native';", "import { Platform, StyleSheet } from 'react-native';")
helper='''\nfunction openPushNotification(data: Record<string, unknown>) {\n  const screen = typeof data.screen === 'string' ? data.screen : '';\n  const activityId = typeof data.activityId === 'string' ? data.activityId : '';\n  const section = typeof data.section === 'string' ? data.section : '';\n\n  switch (screen) {\n    case 'experience':\n      router.push(activityId ? ({ pathname: '/experience-detail', params: { id: activityId } } as any) : '/experiences');\n      break;\n    case 'experiences':\n      router.push('/experiences');\n      break;\n    case 'flash':\n      router.push('/flash');\n      break;\n    case 'flash-detail':\n      router.push(activityId ? ({ pathname: '/flash-detail', params: { id: activityId } } as any) : '/flash');\n      break;\n    case 'profile':\n      router.push(section ? ({ pathname: '/profile', params: { section } } as any) : '/profile');\n      break;\n  }\n}\n'''
repl('app/_layout.tsx', "SplashScreen.preventAutoHideAsync().catch(() => {});", "SplashScreen.preventAutoHideAsync().catch(() => {});"+helper)
root_effect='''\n  useEffect(() => {\n    if (Platform.OS === 'web') return;\n\n    let active = true;\n    let subscription: { remove: () => void } | null = null;\n\n    void (async () => {\n      try {\n        const Notifications = await import('expo-notifications');\n        if (!active) return;\n\n        const handleResponse = (response: any) => {\n          const data = response?.notification?.request?.content?.data;\n          if (data && typeof data === 'object') {\n            openPushNotification(data as Record<string, unknown>);\n          }\n        };\n\n        const lastResponse = Notifications.getLastNotificationResponse();\n        if (lastResponse) handleResponse(lastResponse);\n\n        subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);\n      } catch {\n        console.log('Gestione apertura notifiche non disponibile.');\n      }\n    })();\n\n    return () => {\n      active = false;\n      subscription?.remove();\n    };\n  }, []);\n'''
repl('app/_layout.tsx', "  useEffect(() => {\n    if (fontsLoaded || fontError) {", root_effect+"\n  useEffect(() => {\n    if (fontsLoaded || fontError) {")

# 14. Chat realtime subscriptions
exp_subscription='''\n  useEffect(() => {\n    if (!experienceId) return;\n\n    const channel = supabase\n      .channel(`experience-messages-${experienceId}`)\n      .on(\n        'postgres_changes',\n        {\n          event: '*',\n          schema: 'public',\n          table: 'activity_messages',\n          filter: `activity_id=eq.${experienceId}`,\n        },\n        () => {\n          void loadMessages(experienceId);\n        }\n      )\n      .subscribe();\n\n    return () => {\n      void supabase.removeChannel(channel);\n    };\n  }, [experienceId, loadMessages]);\n'''
repl('app/experience-detail.tsx', "  useEffect(() => {\n    loadExperience();\n  }, [loadExperience]);", "  useEffect(() => {\n    loadExperience();\n  }, [loadExperience]);"+exp_subscription)
flash_subscription='''\n  useEffect(() => {\n    if (!flashId) return;\n\n    const channel = supabase\n      .channel(`flash-messages-${flashId}`)\n      .on(\n        'postgres_changes',\n        {\n          event: '*',\n          schema: 'public',\n          table: 'activity_messages',\n          filter: `activity_id=eq.${flashId}`,\n        },\n        () => {\n          void loadMessages(flashId);\n        }\n      )\n      .subscribe();\n\n    return () => {\n      void supabase.removeChannel(channel);\n    };\n  }, [flashId, loadMessages]);\n'''
repl('app/flash-detail.tsx', "  useEffect(() => {\n    loadFlash();\n  }, [loadFlash]);", "  useEffect(() => {\n    loadFlash();\n  }, [loadFlash]);"+flash_subscription)

# 15. migration for notification delete and realtime
migration=ROOT/'supabase/migrations/20260810184700_final_release_hardening.sql'
if migration.exists(): raise SystemExit('migration exists')
migration.write_text('''-- Bajuju final release hardening: notification deletion and live chat.\n\ndrop policy if exists "push_notification_logs_delete_own" on public.push_notification_logs;\ncreate policy "push_notification_logs_delete_own"\non public.push_notification_logs\nfor delete\nto authenticated\nusing ((select auth.uid()) = user_id);\n\ncreate index if not exists push_notification_logs_user_sent_idx\non public.push_notification_logs(user_id, sent_at desc);\n\ndo $$\nbegin\n  if to_regclass('public.activity_messages') is not null\n     and not exists (\n       select 1\n       from pg_publication_tables\n       where pubname = 'supabase_realtime'\n         and schemaname = 'public'\n         and tablename = 'activity_messages'\n     ) then\n    alter publication supabase_realtime add table public.activity_messages;\n  end if;\nend\n$$;\n''')
print('created',migration.relative_to(ROOT))

# 16. Extend build preflight with regression assertions
pre='scripts/check-before-build.js'
s=read(pre)
add='''\n\nfunction requireContent(relativePath, needle, label) {\n  const fullPath = path.join(root, relativePath);\n  if (!fs.existsSync(fullPath)) {\n    fail(`File mancante per controllo: ${relativePath}`);\n    return;\n  }\n  const content = fs.readFileSync(fullPath, 'utf8');\n  if (!content.includes(needle)) fail(label);\n  else success(label.replace(/^Manca /, 'Presente '));\n}\n\nfunction forbidContent(relativePath, needle, label) {\n  const fullPath = path.join(root, relativePath);\n  if (!fs.existsSync(fullPath)) return;\n  const content = fs.readFileSync(fullPath, 'utf8');\n  if (content.includes(needle)) fail(label);\n  else success(label.replace(/^È ancora presente /, 'Assente '));\n}\n\nrequireContent('app/experiences-map.tsx', 'showUserLocation={viewerCoordinates !== null}', 'Manca protezione permesso GPS prima della posizione utente');\nrequireContent('components/BajujuMap.tsx', 'viewportKey?: string', 'Manca protezione dai ricentramenti ripetuti della mappa');\nrequireContent('app/admin-create-experience.tsx', 'resolveAddressText', 'Manca geolocalizzazione eventi Admin/ChatGPT');\nrequireContent('app/edit-experience.tsx', 'latitude,\\n          longitude,', 'Manca aggiornamento coordinate durante modifica evento');\nrequireContent('app/notifications.tsx', 'deleteAllNotifications', 'Manca eliminazione notifiche');\nrequireContent('app/_layout.tsx', 'addNotificationResponseReceivedListener', 'Manca apertura destinazione al tap della push');\nrequireContent('app/experience-detail.tsx', 'experience-messages-${experienceId}', 'Manca realtime chat esperienze');\nrequireContent('app/flash-detail.tsx', 'flash-messages-${flashId}', 'Manca realtime chat Flash');\nforbidContent('app/create-experience.tsx', "'Brescia',", 'È ancora presente Brescia tra le province attive di Crea esperienza');\nforbidContent('app/create-experience.tsx', "'Torino',", 'È ancora presente Torino tra le province attive di Crea esperienza');\nrequireContent('app/create-experience.tsx', "'Verona',", 'Manca Verona tra le province attive di Crea esperienza');\n'''
# insert before final if(failed)
needle="\nif (failed) {\n"
if needle not in s: raise SystemExit('check-before-build insertion point missing')
write(pre,s.replace(needle,add+needle,1)); print('patched',pre)

print('ALL PATCHES APPLIED')

PY_PATCH

echo "PATCH_OK"
node scripts/check-routes.js
node scripts/check-before-build.js

if [[ "${BAJUJU_SKIP_EXTERNAL_CHECKS:-0}" != "1" ]]; then
  npx tsc --noEmit
  npx expo-doctor
  npm run lint
fi

CHANGED=0
trap - ERR

echo "FINAL_HARDENING_OK"
echo "Backup disponibile: $BACKUP"
echo "Migration creata: $NEW_MIGRATION"
git status --short || true
