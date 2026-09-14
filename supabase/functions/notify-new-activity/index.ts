import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("BAJUJU_SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("BAJUJU_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

webpush.setVapidDetails(
  "mailto:info@bajuju.it",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    console.log("Payload ricevuto:", JSON.stringify(payload));

    const record = payload.record ?? payload;

    const title =
      record.title ||
      record.name ||
      record.activity_title ||
      "Nuova attività su Bajuju";

    const city =
      record.city ||
      record.comune ||
      record.municipality ||
      "";

    const province =
      record.province ||
      record.provincia ||
      "";

    const activityType =
      record.type ||
      record.activity_type ||
      record.kind ||
      "activity";

    let notificationTitle = "Nuova attività su Bajuju";
    let notificationBody = "Qualcuno ha appena creato una nuova attività.";

    if (activityType === "flash" || activityType === "bajuju_flash") {
      notificationTitle = "Nuovo Bajuju Flash";
      notificationBody = city
        ? `È stato creato un nuovo Flash a ${city}.`
        : "È stato creato un nuovo Flash.";
    } else {
      notificationTitle = "Nuovo evento su Bajuju";
      notificationBody = city
        ? `È stato creato un nuovo evento a ${city}.`
        : "È stato creato un nuovo evento.";
    }

    if (title) {
      notificationBody = city
        ? `${title} - ${city}`
        : `${title}`;
    }

    const subscriptionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?select=*`,
      {
        method: "GET",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!subscriptionsResponse.ok) {
      const errorText = await subscriptionsResponse.text();
      console.error("Errore lettura push_subscriptions:", errorText);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Errore lettura push_subscriptions",
          details: errorText,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const subscriptions = await subscriptionsResponse.json();

    console.log("Subscription trovate:", subscriptions.length);

    const notificationPayload = JSON.stringify({
      title: notificationTitle,
      body: notificationBody,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      url: "/",
      data: {
        activityId: record.id ?? null,
        activityType,
        city,
        province,
      },
    });

    const results = [];

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await webpush.sendNotification(pushSubscription, notificationPayload);

        results.push({
          endpoint: sub.endpoint,
          success: true,
        });
      } catch (error) {
        console.error("Errore invio notifica:", error);

        results.push({
          endpoint: sub.endpoint,
          success: false,
          error: String(error),
        });

        if (
          String(error).includes("410") ||
          String(error).includes("404") ||
          String(error).includes("expired")
        ) {
          await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(
              sub.endpoint,
            )}`,
            {
              method: "DELETE",
              headers: {
                apikey: SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notifiche elaborate",
        sent: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Errore generale notify-new-activity:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});