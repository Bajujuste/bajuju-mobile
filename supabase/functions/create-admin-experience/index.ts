import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const BAJUJU_CHATGPT_API_KEY = Deno.env.get('BAJUJU_CHATGPT_API_KEY');
const BAJUJU_ADMIN_USER_ID = Deno.env.get('BAJUJU_ADMIN_USER_ID');


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

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !BAJUJU_CHATGPT_API_KEY ||
    !BAJUJU_ADMIN_USER_ID
  ) {
    return jsonResponse({ ok: false, error: "SERVER_NOT_CONFIGURED" }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  const bearerKey = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const apiKey = req.headers.get("x-api-key") || bearerKey;

  if (apiKey !== BAJUJU_CHATGPT_API_KEY) {
    return jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const activityDate = typeof body.activity_date === "string" ? body.activity_date.trim() : "";
  const activityTime = typeof body.activity_time === "string" ? body.activity_time.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const province = typeof body.province === "string" ? body.province.trim() : "";
  const meetingPlace = typeof body.meeting_place === "string" ? body.meeting_place.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "altro";
  const maxParticipants = Number(body.max_participants);

  if (
    !title ||
    !description ||
    !activityDate ||
    !activityTime ||
    !city ||
    !province ||
    !meetingPlace ||
    !Number.isInteger(maxParticipants) ||
    maxParticipants < 1 ||
    maxParticipants > 99
  ) {
    return jsonResponse({ ok: false, error: "INVALID_EVENT_DATA" }, 400);
  }

  const insertResult = await supabase
    .from("activities")
    .insert({
      creator_id: BAJUJU_ADMIN_USER_ID,
      title,
      description,
      activity_date: activityDate,
      activity_time: activityTime,
      city,
      province,
      meeting_place: meetingPlace,
      category,
      min_participants: 1,
      max_participants: maxParticipants,
      budget_amount: null,
      is_flash: false,
      expires_at: null,
      latitude: null,
      longitude: null,
    })
    .select("id,title")
    .single();

  if (insertResult.error) {
    console.error("Admin experience creation failed:", insertResult.error.message);
    return jsonResponse(
      { ok: false, error: "CREATE_FAILED", detail: insertResult.error.message },
      400
    );
  }

  return jsonResponse({ ok: true, experience: insertResult.data });
});
