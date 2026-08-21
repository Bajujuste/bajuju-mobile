const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, value) {
  fs.writeFileSync(path.join(root, rel), value, 'utf8');
}

function replaceOnce(rel, oldValue, newValue, label) {
  let text = read(rel);
  const first = text.indexOf(oldValue);
  if (first < 0) throw new Error(`${label}: testo atteso non trovato in ${rel}`);
  if (text.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error(`${label}: testo atteso presente più di una volta in ${rel}`);
  }
  text = text.slice(0, first) + newValue + text.slice(first + oldValue.length);
  write(rel, text);
}

function replaceBetween(rel, startMarker, endMarker, replacement, label) {
  let text = read(rel);
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: inizio non trovato in ${rel}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${label}: fine non trovata in ${rel}`);
  text = text.slice(0, start) + replacement + text.slice(end);
  write(rel, text);
}

// 1) experience-detail: il vecchio Invita non invia più un testo fisso.
replaceOnce(
  'app/experience-detail.tsx',
  "  const [sendingInviteTo, setSendingInviteTo] = useState<string | null>(null);\n",
  '',
  'rimozione stato invito vecchio'
);

replaceBetween(
  'app/experience-detail.tsx',
  '  async function sendGoingOutInvite(targetUserId: string) {',
  '  async function sendChatMessage() {',
  `  function sendGoingOutInvite(targetUserId: string) {\n    if (!experienceId || !currentUserId || !canUseChat || !targetUserId) return;\n    if (String(targetUserId) === String(currentUserId)) return;\n\n    router.push({\n      pathname: '/invite-out' as any,\n      params: {\n        targetUserId,\n        activityId: experienceId,\n      },\n    });\n  }\n\n`,
  'nuovo flusso invito'
);

replaceOnce(
  'app/experience-detail.tsx',
  "                          onPress={() => router.push(`/user-profile?userId=${userId}`)}",
  `                          onPress={() => router.push({\n                            pathname: '/user-profile' as any,\n                            params: {\n                              userId,\n                              activityId: experienceId || '',\n                              postEvent: canShowInviteOut ? '1' : '0',\n                            },\n                          })}`,
  'passaggio contesto esperienza al profilo utente'
);

replaceOnce(
  'app/experience-detail.tsx',
  "                              disabled={sendingInviteTo === userId}\n",
  '',
  'rimozione disabled invito vecchio'
);

replaceOnce(
  'app/experience-detail.tsx',
  "                                {sendingInviteTo === userId ? 'Invio...' : 'Invita'}",
  "                                Invita",
  'testo pulsante Invita'
);

// 2) user-profile: dopo l'evento offre Invita + Condividi contatto.
replaceOnce(
  'app/user-profile.tsx',
  `  const params = useLocalSearchParams<{ userId?: string }>();\n  const userId = String(params.userId || '').trim();`,
  `  const params = useLocalSearchParams<{ userId?: string; activityId?: string; postEvent?: string }>();\n  const userId = String(params.userId || '').trim();\n  const activityId = String(params.activityId || '').trim();\n  const canUsePostExperienceActions = String(params.postEvent || '') === '1';`,
  'parametri profilo utente'
);

replaceOnce(
  'app/user-profile.tsx',
  `            {currentUserId && currentUserId !== userId ? (\n              <>\n                <Pressable\n                  style={styles.reportUserButton}`,
  `            {currentUserId && currentUserId !== userId ? (\n              <>\n                {canUsePostExperienceActions && activityId ? (\n                  <View style={{ width: '100%', gap: 8, marginTop: 12 }}>\n                    <Pressable\n                      style={{\n                        width: '100%',\n                        borderRadius: 999,\n                        paddingVertical: 12,\n                        paddingHorizontal: 16,\n                        alignItems: 'center',\n                        backgroundColor: BAJUJU_PINK,\n                      }}\n                      onPress={() => router.push({\n                        pathname: '/invite-out' as any,\n                        params: { targetUserId: userId, activityId },\n                      })}\n                    >\n                      <Text style={{ color: '#ffffff', fontWeight: '900' }}>Invita a uscire</Text>\n                    </Pressable>\n\n                    <Pressable\n                      style={{\n                        width: '100%',\n                        borderRadius: 999,\n                        paddingVertical: 12,\n                        paddingHorizontal: 16,\n                        alignItems: 'center',\n                        backgroundColor: '#fff0f7',\n                        borderWidth: 1,\n                        borderColor: '#ffd1e6',\n                      }}\n                      onPress={() => router.push({\n                        pathname: '/share-contact' as any,\n                        params: { targetUserId: userId, activityId },\n                      })}\n                    >\n                      <Text style={{ color: BAJUJU_PINK, fontWeight: '900' }}>Condividi contatto</Text>\n                    </Pressable>\n                  </View>\n                ) : null}\n\n                <Pressable\n                  style={styles.reportUserButton}`,
  'azioni post esperienza profilo utente'
);

// 3) notifications: icona rifiuto e deep-link alle nuove sezioni.
replaceOnce(
  'app/notifications.tsx',
  `    case 'contact_accepted':\n      return '✅';`,
  `    case 'contact_accepted':\n      return '✅';\n    case 'contact_rejected':\n      return '❌';`,
  'icona notifica rifiutata'
);

replaceOnce(
  'app/notifications.tsx',
  `        case 'profile':\n          if (section) router.push({ pathname: '/profile' as any, params: { section } });\n          else router.push('/profile' as any);\n          return;`,
  `        case 'date-invites':\n          router.push('/date-invites' as any);\n          return;\n\n        case 'direct-contacts':\n          router.push('/direct-contacts' as any);\n          return;\n\n        case 'profile':\n          if (section) router.push({ pathname: '/profile' as any, params: { section } });\n          else router.push('/profile' as any);\n          return;`,
  'deep-link notifiche inviti e contatti'
);

// 4) tipo client per il rifiuto.
replaceOnce(
  'src/utils/bajujuNotifications.ts',
  `  | 'contact_accepted'\n  | 'experience_cancelled'`,
  `  | 'contact_accepted'\n  | 'contact_rejected'\n  | 'experience_cancelled'`,
  'tipo contact_rejected'
);

// 5) Profilo: centralizza contatti/inviti nelle nuove schermate e toglie gli elenchi eventi.
replaceOnce(
  'app/profile.tsx',
  `  const [participatedActivities, setParticipatedActivities] = useState<ActivityItem[]>([]);`,
  `  const [, setParticipatedActivities] = useState<ActivityItem[]>([]);`,
  'rimozione lista partecipazioni dal profilo'
);

const contactStart = '      <View style={[styles.card, styles.contactCard]}>';
const dateStart = '      <View style={[styles.card, styles.dateInviteCard]}';
const createEventsStart = `      <View style={styles.card}>\n        <Text style={styles.sectionTitle}>Esperienze create da me</Text>`;
const privacyStart = `      <View style={styles.card}>\n        <Text style={styles.sectionTitle}>Privacy e regole</Text>`;

let profileText = read('app/profile.tsx');
let start = profileText.indexOf(contactStart);
let end = profileText.indexOf(dateStart, start + contactStart.length);
if (start < 0 || end < 0) throw new Error('profilo: sezione Contatti diretti non trovata');
const compactContacts = `      <View style={[styles.card, styles.contactCard]}>\n        <View style={styles.sectionHeaderRow}>\n          <View style={[styles.sectionIconBubble, styles.contactIconBubble]}>\n            <Text style={styles.sectionIconText}>📞</Text>\n          </View>\n          <View style={styles.sectionHeaderText}>\n            <Text style={styles.sectionTitle}>Contatti diretti</Text>\n            <Text style={styles.sectionHint}>Telefono/WhatsApp e Telegram condivisi dopo un’esperienza.</Text>\n          </View>\n        </View>\n        <Text style={styles.emptyText}>${'${'}contactRequests.length} ${'${'}contactRequests.length === 1 ? 'richiesta in attesa' : 'richieste in attesa'}</Text>\n        <Pressable style={styles.linkButton} onPress={() => router.push('/direct-contacts' as any)}>\n          <Text style={styles.linkButtonText}>Apri contatti diretti</Text>\n        </Pressable>\n      </View>\n\n`;
profileText = profileText.slice(0, start) + compactContacts + profileText.slice(end);
write('app/profile.tsx', profileText);

profileText = read('app/profile.tsx');
start = profileText.indexOf(dateStart);
end = profileText.indexOf(createEventsStart, start + dateStart.length);
if (start < 0 || end < 0) throw new Error('profilo: sezione Inviti a uscire non trovata');
const compactInvites = `      <View style={[styles.card, styles.dateInviteCard]} onLayout={(event) => setDateInvitesOffsetY(event.nativeEvent.layout.y)}>\n        <View style={styles.sectionHeaderRow}>\n          <View style={[styles.sectionIconBubble, styles.dateInviteIconBubble]}>\n            <Text style={styles.sectionIconText}>💗</Text>\n          </View>\n          <View style={styles.sectionHeaderText}>\n            <Text style={styles.sectionTitle}>Inviti a uscire</Text>\n            <Text style={styles.sectionHint}>Messaggio, accettazione/rifiuto e risposta sono gestiti in una schermata dedicata.</Text>\n          </View>\n        </View>\n        <Text style={styles.emptyText}>${'${'}invites.length} ${'${'}invites.length === 1 ? 'invito in attesa' : 'inviti in attesa'}</Text>\n        <Pressable style={styles.linkButton} onPress={() => router.push('/date-invites' as any)}>\n          <Text style={styles.linkButtonText}>Apri inviti a uscire</Text>\n        </Pressable>\n      </View>\n\n`;
profileText = profileText.slice(0, start) + compactInvites + profileText.slice(end);
write('app/profile.tsx', profileText);

profileText = read('app/profile.tsx');
start = profileText.indexOf(createEventsStart);
end = profileText.indexOf(privacyStart, start + createEventsStart.length);
if (start < 0 || end < 0) throw new Error('profilo: sezioni eventi non trovate');
profileText = profileText.slice(0, start) + profileText.slice(end);
write('app/profile.tsx', profileText);

// Il file è temporaneo: se tutto è riuscito lo togliamo dal working tree.
fs.unlinkSync(__filename);
console.log('PATCH_OK: inviti, contatti, notifiche e profilo aggiornati.');
