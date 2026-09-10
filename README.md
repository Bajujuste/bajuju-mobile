# Bajuju Mobile

App mobile di Bajuju, costruita con [Expo](https://expo.dev) (React Native, file-based routing via [expo-router](https://docs.expo.dev/router/introduction)) e [Supabase](https://supabase.com) come backend.

## Avvio rapido

```bash
npm install
npx expo start
```

Dall'output di `expo start` puoi aprire l'app in:

- una [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- un emulatore Android o un simulatore iOS
- [Expo Go](https://expo.dev/go)

## Struttura del progetto

```
app/                  Schermate (rotte expo-router). Ogni file qui è una rotta reale.
  (tabs)/             Tab principali (Home, Esplora)
  (auth)/             Login, registrazione, recupero password, callback OAuth/reset
  (admin)/             Pannello di amministrazione
  (experiences)/       Esperienze: lista, mappa, dettaglio, creazione/modifica, waitlist
  (flash)/             Flash: creazione, ricerca, disponibilità, dettaglio
  (groups)/             Gruppi: lista, dettaglio, creazione
  (social)/             Contatti diretti, inviti, condivisione, inviti a data
  (legal)/              Privacy e regole
  _layout.tsx           Layout radice: navigazione, gestione notifiche push, controllo profilo
  home.tsx               Home principale post-login

src/
  components/          Componenti riusabili (inclusi i componenti base generati da Expo)
  constants/            Costanti condivise (tema colori, categorie esperienze)
  data/                 Dataset statici (es. comuni italiani)
  hooks/                Hook React condivisi
  lib/                  Client Supabase, autocompletamento indirizzi, recupero sessione
  theme/                 Tema visivo Bajuju (colori, font, ombre)
  utils/                 Utility applicative (notifiche, analytics, condivisione, grading organizzatori)

supabase/
  functions/            Edge Functions Supabase
  migrations/            Migrazioni SQL del database
  schema-contract.json  Contratto schema verificato da scripts/check-live-contracts.mjs

scripts/                Script di supporto (audit rotte, controllo contratti Supabase, controlli pre-build)
```

> Nota su `app/(nome)/`: le cartelle tra parentesi sono *route group* di expo-router — servono solo a organizzare i file, **non compaiono nell'URL/rotta**. `app/(admin)/admin-users.tsx` resta raggiungibile come `/admin-users`, esattamente come prima del riordino.

L'alias `@/*` punta a `src/*` (vedi `tsconfig.json`): da qualunque file puoi importare con `@/lib/supabase`, `@/components/...`, `@/hooks/...`, ecc.

## Script disponibili

```bash
npm run lint             # ESLint (config Expo)
npm run typecheck        # Controllo TypeScript
npm run doctor            # expo-doctor
npm run check:contracts   # Verifica che il codice sia allineato allo schema Supabase live
npm run check:bundle      # Prova di export del bundle Android/iOS
npm run check:release     # typecheck + doctor + check:contracts + check:bundle (usato in CI)
```

Script aggiuntivi in `scripts/`:

- `check-routes.js` — verifica che ogni `router.push`/`href` nel codice punti a una rotta esistente in `app/`.
- `check-before-build.js` — controlli manuali di regressione su alcuni flussi critici (recupero password, mappa, notifiche). Non è ancora collegato a `check:release`.

## Rilascio

Le push OTA a produzione partono dai workflow in `.github/workflows/` (`mobile-release-check.yml`, `mobile-ota-publish.yml`), innescati da push su `main` o dal file `.ota-release-trigger`. Non spostare o rinominare `.ota-release-trigger` / `.ota-release-result.json`: i workflow li referenziano per nome.

## Approfondimenti

- [Documentazione Expo](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction)
- [Supabase](https://supabase.com/docs)
