import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";

// Notifiche web push (vecchia versione web di Bajuju) per ogni nuova attività.
// La chiama solo il trigger public.notify_new_activity_trigger, che invia il segreto condiviso
// nell'header x-bajuju-trigger-secret: la funzione è pubblicata senza verifica JWT, quindi senza
// questo controllo chiunque potrebbe inviare notifiche con testo arbitrario a tutti gli iscritti.
// Titolo e luogo vengono letti dal database: della richiesta si usa solo l'id dell'attività.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BAJUJU_SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BAJUJU_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const TRIGGER_SECRET = Deno.env.get("NOTIFY_NEW_ACTIVITY_SECRET");

// Il trigger chiama la funzione subito dopo l'inserimento: attività più vecchie non vengono notificate.
const MAX_ACTIVITY_AGE_MS = 10 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ActivityRow = {
  id: string;
  title: string | null;
  city: string | null;
  province: string | null;
  is_flash: boolean | null;
  deleted_at: string | null;
  created_at: string | null;
};

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Confronto a tempo costante tramite digest SHA-256 di uguale lunghezza.
async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function serviceHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY ?? "",
    Authorization: `Bearer ${SERVICE_ROLE_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !TRIGGER_SECRET) {
    console.error("notify-new-activity: variabili d'ambiente mancanti.");
    return jsonResponse({ success: false, error: "SERVER_NOT_CONFIGURED" }, 500);
  }

  const providedSecret = req.headers.get("x-bajuju-trigger-secret") ?? "";
  if (!providedSecret || !(await constantTimeEqual(providedSecret, TRIGGER_SECRET))) {
    return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  try {
    const payload = await req.json().catch(() => null);
    const activityId = String(payload?.record?.id ?? payload?.activityId ?? "").trim();

    if (!UUID_PATTERN.test(activityId)) {
      return jsonResponse({ success: false, error: "INVALID_ACTIVITY_ID" }, 400);
    }

    const activityResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/activities?id=eq.${activityId}&select=id,title,city,province,is_flash,deleted_at,created_at&limit=1`,
      { headers: serviceHeaders() },
    );

    if (!activityResponse.ok) {
      console.error("Errore lettura attività:", activityResponse.status, await activityResponse.text());
      return jsonResponse({ success: false, error: "ACTIVITY_READ_FAILED" }, 500);
    }

    const [activity] = (await activityResponse.json()) as ActivityRow[];
    if (!activity) {
      return jsonResponse({ success: false, error: "ACTIVITY_NOT_FOUND" }, 404);
    }

    const createdAt = Date.parse(activity.created_at ?? "");
    if (activity.deleted_at || !Number.isFinite(createdAt) || Date.now() - createdAt > MAX_ACTIVITY_AGE_MS) {
      return jsonResponse({ success: true, sent: 0, failed: 0, reason: "ACTIVITY_NOT_ELIGIBLE" });
    }

    const title = (activity.title ?? "").trim();
    const city = (activity.city ?? "").trim();
    const isFlash = activity.is_flash === true;

    const notificationTitle = isFlash ? "Nuovo Bajuju Flash" : "Nuovo evento su Bajuju";
    let notificationBody = isFlash
      ? (city ? `È stato creato un nuovo Flash a ${city}.` : "È stato creato un nuovo Flash.")
      : (city ? `È stato creato un nuovo evento a ${city}.` : "È stato creato un nuovo evento.");

    if (title) {
      notificationBody = city ? `${title} - ${city}` : title;
    }

    const subscriptionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`,
      { headers: serviceHeaders() },
    );

    if (!subscriptionsResponse.ok) {
      console.error("Errore lettura push_subscriptions:", subscriptionsResponse.status, await subscriptionsResponse.text());
      return jsonResponse({ success: false, error: "SUBSCRIPTIONS_READ_FAILED" }, 500);
    }

    const subscriptions = (await subscriptionsResponse.json()) as SubscriptionRow[];

    webpush.setVapidDetails("mailto:info@bajuju.it", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const notificationPayload = JSON.stringify({
      title: notificationTitle,
      body: notificationBody,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      url: "/",
      data: {
        activityId: activity.id,
        activityType: isFlash ? "flash" : "activity",
        city,
        province: (activity.province ?? "").trim(),
      },
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notificationPayload,
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = Number((error as { statusCode?: number })?.statusCode ?? 0);
        console.error("Errore invio notifica web push:", statusCode || String(error));

        // Iscrizioni scadute o rimosse dal browser: vengono cancellate.
        if (statusCode === 404 || statusCode === 410) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
            { method: "DELETE", headers: serviceHeaders() },
          );
        }
      }
    }

    // Solo i conteggi: gli endpoint delle iscrizioni non vengono restituiti.
    return jsonResponse({ success: true, sent, failed });
  } catch (error) {
    console.error("Errore generale notify-new-activity:", error);
    return jsonResponse({ success: false, error: "INTERNAL_ERROR" }, 500);
  }
});
