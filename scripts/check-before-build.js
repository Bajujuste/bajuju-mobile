const fs = require('fs');
const path = require('path');

const root = process.cwd();

const requiredFiles = [
  'app.base.json',
  'app.config.js',
  'app/_layout.tsx',
  'app/login.tsx',
  'app/forgot-password.tsx',
  'app/reset-password.tsx',
  'app/auth/callback.tsx',
  'src/lib/authRecovery.ts',
  'src/lib/supabase.ts',
  'components/BajujuMap.tsx',
];

let failed = false;

function fail(message) {
  failed = true;
  console.error(`❌ ${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

for (const relativePath of requiredFiles) {
  const fullPath = path.join(root, relativePath);

  if (!fs.existsSync(fullPath)) {
    fail(`File mancante: ${relativePath}`);
  } else {
    success(`File presente: ${relativePath}`);
  }
}

const forgotPasswordPath = path.join(root, 'app/forgot-password.tsx');

if (fs.existsSync(forgotPasswordPath)) {
  const forgotPassword = fs.readFileSync(forgotPasswordPath, 'utf8');

  if (!forgotPassword.includes("bajuju://reset-password")) {
    fail('Il recupero password non punta a bajuju://reset-password');
  } else {
    success('Redirect recupero password corretto');
  }
}

const callbackPath = path.join(root, 'app/auth/callback.tsx');

if (fs.existsSync(callbackPath)) {
  const callback = fs.readFileSync(callbackPath, 'utf8');

  if (!callback.includes('establishRecoverySession')) {
    fail('La rotta auth/callback non gestisce la sessione di recupero');
  } else {
    success('Callback di recupero presente');
  }
}

const resetPath = path.join(root, 'app/reset-password.tsx');

if (fs.existsSync(resetPath)) {
  const reset = fs.readFileSync(resetPath, 'utf8');

  if (!reset.includes('supabase.auth.updateUser')) {
    fail('La schermata reset-password non aggiorna la password');
  } else {
    success('Aggiornamento password presente');
  }

  if (!reset.includes('SAVED_PASSWORD_KEY')) {
    fail('La vecchia password locale non viene cancellata');
  } else {
    success('Cancellazione vecchia password locale presente');
  }

  if (!reset.includes('supabase.auth.signOut')) {
    fail('La sessione temporanea non viene chiusa dopo il cambio password');
  } else {
    success('Chiusura sessione temporanea presente');
  }
}

const mapPath = path.join(root, 'components/BajujuMap.tsx');

if (fs.existsSync(mapPath)) {
  const map = fs.readFileSync(mapPath, 'utf8');

  if (!map.includes('PROVIDER_GOOGLE')) {
    fail('Il provider Google non è configurato per Android');
  } else {
    success('Provider Google configurato per Android');
  }

  if (!map.includes("Platform.OS === 'android'")) {
    fail('La mappa non distingue Android da iOS');
  } else {
    success('Android usa Google Maps e iOS usa Apple Maps');
  }
}

const appConfigPath = path.join(root, 'app.config.js');

if (fs.existsSync(appConfigPath)) {
  const appConfig = fs.readFileSync(appConfigPath, 'utf8');

  if (!appConfig.includes('GOOGLE_MAPS_API_KEY')) {
    fail('app.config.js non legge GOOGLE_MAPS_API_KEY');
  } else {
    success('Variabile GOOGLE_MAPS_API_KEY configurata');
  }

  if (!appConfig.includes('googleMaps')) {
    fail('Configurazione android.config.googleMaps non presente');
  } else {
    success('Configurazione android.config.googleMaps presente');
  }

  if (!appConfig.includes('apiKey: googleMapsApiKey')) {
    fail('La chiave Google Maps non viene assegnata alla configurazione Android');
  } else {
    success('Chiave Google Maps collegata alla configurazione Android');
  }

  if (appConfig.includes('androidGoogleMapsApiKey')) {
    fail('È ancora presente la configurazione plugin non compatibile con SDK 54');
  } else {
    success('Nessun plugin react-native-maps incompatibile');
  }
}


function requireContent(relativePath, needle, label) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`File mancante per controllo: ${relativePath}`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.includes(needle)) fail(label);
  else success(label.replace(/^Manca /, 'Presente '));
}

function forbidContent(relativePath, needle, label) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes(needle)) fail(label);
  else success(label.replace(/^È ancora presente /, 'Assente '));
}

requireContent('app/experiences-map.tsx', 'showUserLocation={viewerCoordinates !== null}', 'Manca protezione permesso GPS prima della posizione utente');
requireContent('components/BajujuMap.tsx', 'viewportKey?: string', 'Manca protezione dai ricentramenti ripetuti della mappa');
requireContent('app/admin-create-experience.tsx', 'resolveAddressText', 'Manca geolocalizzazione eventi Admin/ChatGPT');
requireContent('app/edit-experience.tsx', 'latitude,\n          longitude,', 'Manca aggiornamento coordinate durante modifica evento');
requireContent('app/notifications.tsx', 'deleteAllNotifications', 'Manca eliminazione notifiche');
requireContent('app/_layout.tsx', 'addNotificationResponseReceivedListener', 'Manca apertura destinazione al tap della push');
requireContent('app/experience-detail.tsx', 'experience-messages-${experienceId}', 'Manca realtime chat esperienze');
requireContent('app/flash-detail.tsx', 'flash-messages-${flashId}', 'Manca realtime chat Flash');
forbidContent('app/create-experience.tsx', "'Brescia',", 'È ancora presente Brescia tra le province attive di Crea esperienza');
forbidContent('app/create-experience.tsx', "'Torino',", 'È ancora presente Torino tra le province attive di Crea esperienza');
requireContent('app/create-experience.tsx', "'Verona',", 'Manca Verona tra le province attive di Crea esperienza');

if (failed) {
  console.error('\nCONTROLLO PRE-BUILD NON SUPERATO');
  process.exit(1);
}

console.log('\n✅ CONTROLLO PRE-BUILD SUPERATO');
