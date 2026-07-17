# admin-create-experience

Supabase Edge Function per preparare e pubblicare esperienze Bajuju tramite un comando amministrativo autenticato.

## Sicurezza

- Richiede un JWT Supabase valido.
- Autorizza solo utenti con `profiles.is_admin = true` oppure email presente nel secret `BAJUJU_ADMIN_EMAILS`.
- La service role key resta esclusivamente nei secret Supabase e non viene mai inserita nel bundle Expo.
- `preview` valida e restituisce il riepilogo senza scrivere nel database.
- `publish` richiede l'header `Idempotency-Key` e registra esito e audit.
- Le tabelle di audit hanno RLS attivo e nessuna policy client.

## Secret richiesti

Le variabili standard `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono disponibili nell'ambiente Edge Functions di Supabase.

Configurare inoltre una allowlist di emergenza:

```bash
supabase secrets set BAJUJU_ADMIN_EMAILS="admin@example.com"
```

Usare l'indirizzo reale dell'amministratore senza salvarlo nel repository.

## Deploy sicuro

Eseguire prima in un progetto Supabase di staging:

```bash
supabase db push
supabase functions deploy admin-create-experience
```

Non distribuire in produzione prima dei test riportati sotto.

## Anteprima

```bash
curl -X POST "$SUPABASE_URL/functions/v1/admin-create-experience" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "preview",
    "event": {
      "title": "Evento di prova",
      "category": "evento",
      "description": "Evento fittizio usato soltanto per verificare la validazione.",
      "province": "Bergamo",
      "city": "Bergamo",
      "meeting_place": "Piazza di prova 1",
      "activity_date": "2026-08-16",
      "activity_time": "21:30",
      "max_participants": 10,
      "latitude": 45.6983,
      "longitude": 9.6773
    }
  }'
```

La modalità `preview` non crea righe in `activities`.

## Pubblicazione

Ripetere la richiesta con `mode: publish` e aggiungere una chiave univoca:

```bash
-H "Idempotency-Key: bajuju-event-20260816-2130-v1"
```

La stessa chiave non può creare due eventi.

## Test obbligatori prima della produzione

1. Nessun JWT: risposta 401.
2. JWT utente normale: risposta 403.
3. Payload incompleto: risposta 400 e nessuna riga creata.
4. Modalità preview: risposta 200 e nessuna riga creata.
5. Pubblicazione admin: una sola riga in `activities`.
6. Ripetizione con la stessa idempotency key: nessun duplicato.
7. Verifica presenza log in `admin_action_logs`.
8. Verifica che l'app mobile continui ad avviarsi e leggere gli eventi senza modifiche.

## Rollback

La funzione può essere disattivata o rimossa senza aggiornare l'app mobile. Le nuove tabelle sono indipendenti da `activities`; la migrazione non altera colonne o policy esistenti dell'app.
