# `admin-create-experience`

Edge Function per creare una riga in `public.activities` da flussi admin con autenticazione utente, autorizzazione server-side, idempotenza e protezione da doppie creazioni concorrenti.

## Deploy

La funzione deve essere deployata con verifica JWT attiva:

```bash
supabase functions deploy admin-create-experience
```

`supabase/config.toml` imposta `verify_jwt = true`; la funzione esegue comunque una verifica esplicita dell'utente con `supabase.auth.getUser()`.

## Variabili richieste

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Non usare la service-role key nella funzione: la RPC SQL è `security definer`, ma riceve il JWT dell'utente e usa `auth.uid()` per autorizzazione, RLS e idempotenza per-admin.

## Autorizzazione admin

L'autorizzazione admin usa solo claim non modificabili dall'utente in `app_metadata`:

- `app_metadata.role` in `admin`, `master`, `superadmin`; oppure
- `app_metadata.is_admin` uguale a `true` o `1`.

La migrazione non considera `user_metadata` o campi profilo editabili dall'utente.

## Richiesta

```http
POST /functions/v1/admin-create-experience
Authorization: Bearer <user-jwt>
Idempotency-Key: <stable-key>
Content-Type: application/json
```

Body:

```json
{
  "payload": {
    "title": "Aperitivo Bajuju",
    "description": "Evento creato da admin",
    "activity_date": "2026-07-17",
    "activity_time": "19:30",
    "city": "Milano",
    "province": "MI",
    "latitude": 45.4642,
    "longitude": 9.19,
    "max_participants": 20
  }
}
```

In alternativa la chiave idempotente può essere passata come `idempotencyKey` o `idempotency_key` nel body.

## Validazione payload

Sono obbligatori:

- `title`/`activity_title`/`name` non vuoto e massimo 500 caratteri;
- `activity_date`/`date` in formato `YYYY-MM-DD` valido;
- `activity_time`/`time` in formato `HH:mm` o `HH:mm:ss` valido;
- `city`/`citta` non vuoto e massimo 500 caratteri;
- `province`/`provincia` non vuoto e massimo 100 caratteri.

Campi opzionali validati:

- `description`/`activity_description`: massimo 4000 caratteri;
- `latitude`: numero tra `-90` e `90`;
- `longitude`: numero tra `-180` e `180`;
- `max_participants`: intero tra `1` e `10000`.

Le stesse validazioni sono duplicate nella RPC SQL, così richieste dirette alla RPC non possono aggirare la funzione Edge.

## Garanzie

- **Autenticazione**: richiesta `Authorization: Bearer` valida e `getUser()` positivo.
- **Autorizzazione admin**: delegata alla RPC `public.admin_create_experience_command`, che chiama `public.is_current_user_admin()` basata solo su `app_metadata`.
- **Idempotenza**: `public.admin_event_commands` ha vincolo unico su `(admin_user_id, idempotency_key)`. Lo stesso payload restituisce la risposta salvata; un payload diverso con la stessa chiave restituisce `409 IDEMPOTENCY_KEY_REUSED`.
- **Concorrenza**: la RPC blocca la riga comando con `FOR UPDATE`, quindi due richieste simultanee con la stessa chiave non creano due attività.
- **Compatibilità `activities`**: `activity_id` è salvato come `text`, compatibile con `activities.id` UUID, bigint o testo. La migrazione inserisce solo colonne esistenti in `public.activities` e lascia al database i cast finali dei tipi reali dopo validazioni sicure.
- **RLS**: la tabella comandi ha RLS abilitata e policy limitate all'admin proprietario del comando.
- **Errori client**: le risposte non espongono dettagli SQL; gli errori inattesi ritornano `CREATE_EXPERIENCE_FAILED`.

## Casi di verifica manuale

1. **Auth mancante**: chiamare senza `Authorization`; atteso `401 AUTH_REQUIRED` e nessuna riga in `admin_event_commands`.
2. **Utente non admin**: JWT valido senza claim admin in `app_metadata`; atteso `403 ADMIN_REQUIRED` dalla RPC.
3. **Payload invalido**: data `2026-02-31`, coordinate fuori range o `max_participants` decimale; atteso `400` con codice `INVALID_*` e nessuna attività creata.
4. **Idempotenza positiva**: inviare due volte stessa chiave e stesso payload; atteso una sola attività, seconda risposta con `idempotent: true` e `status: 200`.
5. **Riutilizzo chiave con payload diverso**: stessa chiave ma titolo/data diversa; atteso `409 IDEMPOTENCY_KEY_REUSED` e nessuna seconda attività.
6. **Concorrenza**: inviare due POST simultanee con stessa chiave e payload; atteso un solo insert in `activities` perché la RPC serializza su `FOR UPDATE`.
7. **Compatibilità ID**: verificare che `admin_event_commands.activity_id` conservi correttamente l'`id` ritornato da `activities` anche se non è UUID.
