const fs = require('fs');
const path = require('path');

function replaceExact(filePath, search, replacement) {
  const absolute = path.resolve(filePath);
  const original = fs.readFileSync(absolute, 'utf8');

  if (!original.includes(search)) {
    throw new Error(`Blocco atteso non trovato in ${filePath}. Nessuna modifica applicata.`);
  }

  const backup = `${absolute}.bak-admin-hard-delete`;
  if (!fs.existsSync(backup)) fs.copyFileSync(absolute, backup);
  fs.writeFileSync(absolute, original.replace(search, replacement), 'utf8');
}

replaceExact(
  'supabase/functions/delete-bajuju-account/index.ts',
  `  const { error: deleteError } = await adminClient.auth.admin.deleteUser(\n    user.id,\n    false\n  );`,
  `  let requestedUserId = user.id;\n\n  try {\n    const body = await request.json();\n    const candidate = String(body?.target_user_id || '').trim();\n    if (candidate) requestedUserId = candidate;\n  } catch {\n    // Body facoltativo: senza target l’utente elimina il proprio account.\n  }\n\n  if (requestedUserId !== user.id) {\n    const isAdminFromMetadata =\n      user.app_metadata?.is_admin === true ||\n      user.app_metadata?.role === 'admin';\n\n    const adminProfileResult = await adminClient\n      .from('profiles')\n      .select('is_admin')\n      .eq('id', user.id)\n      .maybeSingle();\n\n    const isAdmin = isAdminFromMetadata || adminProfileResult.data?.is_admin === true;\n\n    if (!isAdmin) {\n      return jsonResponse({ error: 'Permessi amministratore richiesti' }, 403);\n    }\n  }\n\n  const { error: deleteError } = await adminClient.auth.admin.deleteUser(\n    requestedUserId,\n    false\n  );`
);

replaceExact(
  'app/admin-user-detail.tsx',
  `  const deleteUser = useCallback(() => {\n    if (!profile) return;\n\n    Alert.alert('Disattivare utente', \`Vuoi eliminare/disattivare \${profileName(profile)}?\`, [\n      { text: 'Annulla', style: 'cancel' },\n      {\n        text: 'Elimina',\n        style: 'destructive',\n        onPress: async () => {\n            try {\n          const result = await trySoftDeleteProfile(currentProfileId, profile);\n\n          if (!result.ok) {\n            Alert.alert('Errore', result.message);\n            return;\n          }\n\n          Alert.alert('Fatto', 'Utente disattivato.');\n          router.replace('/admin-users');\n            } catch (error: unknown) {\n              const message =\n                error instanceof Error\n                  ? error.message\n                  : \"Non è stato possibile disattivare l’utente.\";\n\n              Alert.alert(\"Errore\", message);\n            }\n        },\n      },\n    ]);\n  }, [currentProfileId, profile]);`,
  `  const deleteUser = useCallback(() => {\n    if (!profile) return;\n\n    Alert.alert('Disattivare utente', \`Vuoi disattivare \${profileName(profile)}? L’account resterà recuperabile.\`, [\n      { text: 'Annulla', style: 'cancel' },\n      {\n        text: 'Disattiva',\n        style: 'destructive',\n        onPress: async () => {\n          try {\n            const result = await trySoftDeleteProfile(currentProfileId, profile);\n\n            if (!result.ok) {\n              Alert.alert('Errore', result.message);\n              return;\n            }\n\n            Alert.alert('Fatto', 'Utente disattivato.');\n            router.replace('/admin-users');\n          } catch (error: unknown) {\n            const message =\n              error instanceof Error\n                ? error.message\n                : 'Non è stato possibile disattivare l’utente.';\n\n            Alert.alert('Errore', message);\n          }\n        },\n      },\n    ]);\n  }, [currentProfileId, profile]);\n\n  const hardDeleteUser = useCallback(() => {\n    if (!profile) return;\n\n    const name = profileName(profile);\n\n    Alert.alert(\n      'Eliminazione definitiva',\n      \`Stai per eliminare definitivamente \${name}. L’account e la sua email verranno rimossi e non potranno essere recuperati.\`,\n      [\n        { text: 'Annulla', style: 'cancel' },\n        {\n          text: 'Continua',\n          style: 'destructive',\n          onPress: () => {\n            Alert.alert(\n              'Conferma definitiva',\n              \`Confermi l’eliminazione definitiva di \${name}?\`,\n              [\n                { text: 'No', style: 'cancel' },\n                {\n                  text: 'Elimina definitivamente',\n                  style: 'destructive',\n                  onPress: async () => {\n                    try {\n                      const result = await supabase.functions.invoke('delete-bajuju-account', {\n                        body: { target_user_id: currentProfileId },\n                      });\n\n                      if (result.error) {\n                        Alert.alert('Errore eliminazione', result.error.message || 'Eliminazione non riuscita.');\n                        return;\n                      }\n\n                      if (result.data?.ok !== true) {\n                        Alert.alert(\n                          'Errore eliminazione',\n                          String(result.data?.error || result.data?.details || 'Eliminazione non riuscita.')\n                        );\n                        return;\n                      }\n\n                      Alert.alert('Utente eliminato', 'Account eliminato definitivamente e email liberata.');\n                      router.replace('/admin-users');\n                    } catch (error: unknown) {\n                      const message =\n                        error instanceof Error\n                          ? error.message\n                          : 'Non è stato possibile eliminare definitivamente l’utente.';\n\n                      Alert.alert('Errore eliminazione', message);\n                    }\n                  },\n                },\n              ]\n            );\n          },\n        },\n      ]\n    );\n  }, [currentProfileId, profile]);`
);

replaceExact(
  'app/admin-user-detail.tsx',
  `            <Pressable style={styles.dangerButton} onPress={deleteUser}>\n              <Text style={styles.actionButtonText}>Disattiva utente</Text>\n            </Pressable>`,
  `            <Pressable style={styles.dangerButton} onPress={deleteUser}>\n              <Text style={styles.actionButtonText}>Disattiva utente</Text>\n            </Pressable>\n\n            <Pressable style={styles.hardDeleteButton} onPress={hardDeleteUser}>\n              <Text style={styles.actionButtonText}>Elimina definitivamente</Text>\n            </Pressable>`
);

replaceExact(
  'app/admin-user-detail.tsx',
  `  dangerButton: {`,
  `  hardDeleteButton: {\n    marginTop: 10,\n    borderRadius: 16,\n    paddingVertical: 14,\n    paddingHorizontal: 16,\n    alignItems: 'center',\n    backgroundColor: '#7a001f',\n    borderWidth: 2,\n    borderColor: '#4d0014',\n  },\n  dangerButton: {`
);

console.log('Aggiunta eliminazione definitiva utenti Admin con doppia conferma e controllo server.');
