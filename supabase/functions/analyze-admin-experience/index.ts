import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');


function isAdminUser(user: Record<string, unknown>) {
  const appMetadata = (user.app_metadata || {}) as Record<string, unknown>;
  const role = String(appMetadata.role || "").toLowerCase().trim();
  const isAdmin = appMetadata.is_admin;

  return (
    ["admin", "master", "superadmin"].includes(role) ||
    isAdmin === true ||
    isAdmin === 1 ||
    isAdmin === "1"
  );
}


const experienceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    activity_date: { type: ["string", "null"] },
    activity_time: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    province: { type: ["string", "null"] },
    meeting_place: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    max_participants: { type: ["integer", "null"] },
    missing_fields: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "title",
    "description",
    "activity_date",
    "activity_time",
    "city",
    "province",
    "meeting_place",
    "category",
    "max_participants",
    "missing_fields",
  ],
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "SERVER_NOT_CONFIGURED" }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  }

  let authorizedAdmin = isAdminUser(
    userData.user as unknown as Record<string, unknown>
  );

  if (!authorizedAdmin) {
    const rpcNames = [
      "master_is_admin",
      "is_current_user_admin",
      "is_admin",
    ];

    for (const rpcName of rpcNames) {
      try {
        const rpcResult = await supabase.rpc(rpcName);

        if (!rpcResult.error && rpcResult.data === true) {
          authorizedAdmin = true;
          break;
        }
      } catch {
        // Prova la RPC successiva.
      }
    }
  }

  if (!authorizedAdmin) {
    return jsonResponse({ ok: false, error: "ADMIN_REQUIRED" }, 403);
  }

  let body: { text?: unknown };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (text.length < 10 || text.length > 5000) {
    return jsonResponse({ ok: false, error: "INVALID_TEXT" }, 400);
  }

  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const instructions = [
    "Estrai dal testo i dati di un evento Bajuju.",
    "La data corrente è " + currentDate + ".",
    "Converti date relative come oggi, domani e sabato prossimo nel formato YYYY-MM-DD.",
    "Converti l’orario nel formato HH:mm.",
    "Non inventare informazioni assenti.",
    "Usa null per i valori mancanti.",
    "Inserisci in missing_fields i nomi dei campi obbligatori mancanti.",
    "La provincia deve essere il nome completo, per esempio Bergamo, Milano, Lecco o Monza e Brianza.",
    "La categoria deve essere una tra Cena, Aperitivo, Camminata, Sport, Cultura, Musica, Cinema/Teatro, Gita, Giochi o Altro.",
  ].join(" ");

  const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      store: false,
      instructions,
      input: text,
      text: {
        format: {
          type: "json_schema",
          name: "bajuju_experience",
          strict: true,
          schema: experienceSchema,
        },
      },
    }),
  });

  if (!openAIResponse.ok) {
    const openAIError = await openAIResponse.json().catch(() => ({}));
    const errorCode =
      typeof openAIError?.error?.code === "string"
        ? openAIError.error.code
        : "OPENAI_REQUEST_FAILED";

    console.error("OpenAI analysis failed:", openAIResponse.status, errorCode);

    return jsonResponse(
      {
        ok: false,
        error: "ANALYSIS_FAILED",
        provider_status: openAIResponse.status,
        provider_code: errorCode,
      },
      502
    );
  }

  const responseData = await openAIResponse.json();

  const outputText = Array.isArray(responseData.output)
    ? responseData.output
        .flatMap((item: Record<string, unknown>) =>
          Array.isArray(item.content) ? item.content : []
        )
        .find(
          (content: Record<string, unknown>) =>
            content.type === "output_text" && typeof content.text === "string"
        )?.text || ""
    : "";

  if (!outputText) {
    return jsonResponse({ ok: false, error: "EMPTY_ANALYSIS" }, 502);
  }

  try {
    const experience = JSON.parse(outputText);
    return jsonResponse({ ok: true, experience });
  } catch {
    return jsonResponse({ ok: false, error: "INVALID_ANALYSIS" }, 502);
  }
});
