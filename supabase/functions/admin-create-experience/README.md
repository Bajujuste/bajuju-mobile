# `admin-create-experience`

Edge Function per creare una riga in `public.activities` da flussi admin con autenticazione utente, autorizzazione server-side e idempotenza.

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
    "province": "MI"
  }
}
```

In alternativa la chiave idempotente può essere passata come `idempotencyKey` o `idempotency_key` nel body.

## Garanzie

- **Autenticazione**: richiesta `Authorization: Bearer` valida e `getUser()` positivo.
- **Autorizzazione admin**: delegata alla RPC `public.admin_create_experience_command`, che chiama `public.is_current_user_admin()`.
- **Idempotenza**: `public.admin_event_commands` ha vincolo unico su `(admin_user_id, idempotency_key)`. Lo stesso payload restituisce la risposta salvata; un payload diverso con la stessa chiave restituisce `409 IDEMPOTENCY_KEY_REUSED`.
- **Concorrenza**: la RPC blocca la riga comando con `FOR UPDATE`, quindi due richieste simultanee con la stessa chiave non creano due attività.
- **Compatibilità `activities`**: la migrazione inserisce solo colonne esistenti in `public.activities` e imposta colonne creatore/status quando presenti.
- **RLS**: la tabella comandi ha RLS abilitata e policy limitate all'admin proprietario del comando.
