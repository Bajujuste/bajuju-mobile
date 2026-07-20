const fs = require('fs');
const path = require('path');

const filePath = path.resolve('app/register.tsx');
const original = fs.readFileSync(filePath, 'utf8');
const backupPath = `${filePath}.bak-autoconfirm`;

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(filePath, backupPath);
}

let next = original;

next = next.replace(
  "} from 'react-native';\n\nconst bajujuLogo",
  "} from 'react-native';\n\nimport { supabase } from '../src/lib/supabase';\n\nconst bajujuLogo"
);

next = next.replace(
  "type SignupResponse = {\n  id?: string;\n  identities?: unknown[];",
  "type SignupResponse = {\n  id?: string;\n  access_token?: string;\n  refresh_token?: string;\n  user?: { id?: string; identities?: unknown[] };\n  identities?: unknown[];"
);

const oldBlock = `      if (!payload.id) {\n        setMessageTitle('Registrazione non riuscita');\n        setMessageText('Supabase non ha restituito il nuovo account. Riprova tra poco.');\n        return;\n      }\n\n      if (Array.isArray(payload.identities) && payload.identities.length === 0) {\n        setMessageTitle('Email già utilizzata');\n        setMessageText('Questa email è già registrata. Accedi oppure usa un’altra email.');\n        return;\n      }\n\n      setMessageTitle('Controlla la tua email');\n      setMessageText('Abbiamo inviato il link di conferma. Dopo la conferma accedi e completa subito il profilo.');`;

const newBlock = `      const newUserId = payload.user?.id || payload.id;\n      const identities = payload.user?.identities || payload.identities;\n\n      if (!newUserId) {\n        setMessageTitle('Registrazione non riuscita');\n        setMessageText('Supabase non ha restituito il nuovo account. Riprova tra poco.');\n        return;\n      }\n\n      if (Array.isArray(identities) && identities.length === 0) {\n        setMessageTitle('Email già utilizzata');\n        setMessageText('Questa email è già registrata. Accedi oppure usa un’altra email.');\n        return;\n      }\n\n      if (payload.access_token && payload.refresh_token) {\n        const sessionResult = await supabase.auth.setSession({\n          access_token: payload.access_token,\n          refresh_token: payload.refresh_token,\n        });\n\n        if (sessionResult.error) {\n          setMessageTitle('Registrazione completata');\n          setMessageText('Il tuo account è stato creato. Accedi per completare il profilo.');\n          await new Promise((resolve) => setTimeout(resolve, 1600));\n          router.replace('/login');\n          return;\n        }\n\n        setMessageTitle('Registrazione avvenuta con successo');\n        setMessageText('Il tuo account è stato creato. Ora completa il profilo.');\n        await new Promise((resolve) => setTimeout(resolve, 1600));\n        router.replace('/profile');\n        return;\n      }\n\n      setMessageTitle('Registrazione avvenuta con successo');\n      setMessageText('Il tuo account è stato creato. Ora accedi e completa il profilo.');\n      await new Promise((resolve) => setTimeout(resolve, 1600));\n      router.replace('/login');`;

if (!next.includes(oldBlock)) {
  throw new Error('Blocco registrazione atteso non trovato. Nessuna modifica applicata.');
}

next = next.replace(oldBlock, newBlock);

if (next === original) {
  throw new Error('Nessuna modifica applicata.');
}

fs.writeFileSync(filePath, next, 'utf8');
console.log('Registrazione aggiornata: messaggio di successo e accesso diretto al profilo.');
