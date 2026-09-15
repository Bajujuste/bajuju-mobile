-- notify_new_activity_trigger chiama la edge function notify-new-activity (web push della versione web)
-- a ogni nuova attività. La funzione è pubblicata senza verifica JWT e prima si fidava del contenuto
-- della richiesta: chiunque poteva inviare notifiche con testo arbitrario a tutti gli iscritti.
--
-- Ora il trigger invia un segreto condiviso (header x-bajuju-trigger-secret) letto da Supabase Vault
-- e solo l'id dell'attività: titolo e luogo li legge la funzione dal database.
-- Il segreto va creato una volta con:
--   select vault.create_secret('<valore>', 'notify_new_activity_secret');
-- e lo stesso valore va impostato come secret della funzione (NOTIFY_NEW_ACTIVITY_SECRET).
-- Se il segreto manca o l'invio fallisce, l'inserimento dell'attività non viene mai bloccato.
create or replace function public.notify_new_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_secret text;
begin
  begin
    select ds.decrypted_secret
    into trigger_secret
    from vault.decrypted_secrets ds
    where ds.name = 'notify_new_activity_secret'
    limit 1;
  exception when others then
    trigger_secret := null;
  end;

  if trigger_secret is null or trigger_secret = '' then
    raise log 'notify_new_activity_trigger: segreto notify_new_activity_secret assente, notifica web non inviata';
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://xwcbmsfsirggozpcskcz.supabase.co/functions/v1/notify-new-activity',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_Kg74KvC--sJpim0_tY7K0Q_YJcMqf9g',
        'apikey', 'sb_publishable_Kg74KvC--sJpim0_tY7K0Q_YJcMqf9g',
        'x-bajuju-trigger-secret', trigger_secret
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'activities',
        'record', jsonb_build_object('id', new.id)
      )
    );
  exception when others then
    raise log 'notify_new_activity_trigger: invio non riuscito: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.notify_new_activity_trigger() from public, anon, authenticated;
