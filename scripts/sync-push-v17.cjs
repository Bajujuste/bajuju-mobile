const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'supabase/functions/send-bajuju-push/index.ts');
let text = fs.readFileSync(file, 'utf8');

const oldQuery = "      supabase.from('activity_participants').select('user_id,status').eq('activity_id', activityId).eq('user_id', actorUserId).maybeSingle(),";
const newQuery = "      supabase.from('activity_participants').select('user_id,status').eq('activity_id', activityId).eq('user_id', actorUserId).limit(10),";

if (!text.includes(oldQuery)) throw new Error('sync push v17: query partecipante attesa non trovata');
text = text.replace(oldQuery, newQuery);

const oldCheck = `    if (!participantResult.data || !participantStatusIsActive((participantResult.data as Record<string, unknown>).status)) {\n      return jsonResponse({ error: 'Utente non risulta partecipante attivo.' }, 403);\n    }`;
const newCheck = `    const actorParticipationRows = (participantResult.data || []) as Record<string, unknown>[];\n    const hasActiveParticipation = actorParticipationRows.some((row) => participantStatusIsActive(row.status));\n    if (!hasActiveParticipation) {\n      return jsonResponse({ error: 'Utente non risulta partecipante attivo.' }, 403);\n    }`;

if (!text.includes(oldCheck)) throw new Error('sync push v17: controllo partecipante atteso non trovato');
text = text.replace(oldCheck, newCheck);

fs.writeFileSync(file, text, 'utf8');
fs.unlinkSync(__filename);
console.log('PUSH_V17_OK');
