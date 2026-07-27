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

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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

function optionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function prepareBase64Photo(
  rawValue: string,
  declaredContentType: string
) {
  let base64Value = rawValue.trim();
  let contentType = declaredContentType.trim().toLowerCase();

  const dataUrlMatch = base64Value.match(
    /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s
  );

  if (dataUrlMatch) {
    contentType = dataUrlMatch[1].toLowerCase();
    base64Value = dataUrlMatch[2];
  }

  if (!ALLOWED_PHOTO_TYPES[contentType]) {
    throw new Error('INVALID_PHOTO_TYPE');
  }

  base64Value = base64Value.replace(/\s+/g, '');

  const estimatedBytes = Math.floor((base64Value.length * 3) / 4);

  if (!base64Value || estimatedBytes > MAX_PHOTO_BYTES) {
    throw new Error('PHOTO_TOO_LARGE');
  }

  let decoded: string;

  try {
    decoded = atob(base64Value);
  } catch {
    throw new Error('INVALID_PHOTO_BASE64');
  }

  if (decoded.length === 0 || decoded.length > MAX_PHOTO_BYTES) {
    throw new Error('PHOTO_TOO_LARGE');
  }

  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return {
    bytes,
    contentType,
    extension: ALLOWED_PHOTO_TYPES[contentType],
  };
}

async function prepareChatAttachment(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new Error('INVALID_PHOTO_ATTACHMENT');
  }

  const fileReference = value as Record<string, unknown>;
  const downloadLink = optionalText(
    fileReference.download_link || fileReference.downloadLink
  );

  if (!downloadLink.startsWith('https://')) {
    throw new Error('INVALID_PHOTO_ATTACHMENT');
  }

  const response = await fetch(downloadLink, {
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error('PHOTO_DOWNLOAD_FAILED');
  }

  const declaredLength = Number(response.headers.get('content-length') || 0);

  if (declaredLength > MAX_PHOTO_BYTES) {
    throw new Error('PHOTO_TOO_LARGE');
  }

  const contentType = optionalText(
    fileReference.mime_type ||
      fileReference.mimeType ||
      response.headers.get('content-type')
  )
    .split(';')[0]
    .toLowerCase();

  if (!ALLOWED_PHOTO_TYPES[contentType]) {
    throw new Error('INVALID_PHOTO_TYPE');
  }

  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_PHOTO_BYTES) {
    throw new Error('PHOTO_TOO_LARGE');
  }

  return {
    bytes: new Uint8Array(arrayBuffer),
    contentType,
    extension: ALLOWED_PHOTO_TYPES[contentType],
  };
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
  const suppliedPhotoUrl = optionalText(body.photo_url || body.image_url);
  const suppliedPhotoBase64 = optionalText(body.photo_base64 || body.image_base64);
  const suppliedPhotoContentType = optionalText(
    body.photo_content_type || body.image_content_type
  );
  const chatFileReferences = Array.isArray(body.openaiFileIdRefs)
    ? body.openaiFileIdRefs
    : [];

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

  if (
    suppliedPhotoUrl &&
    (!suppliedPhotoUrl.startsWith('https://') || suppliedPhotoUrl.length > 2000)
  ) {
    return jsonResponse({ ok: false, error: 'INVALID_PHOTO_URL' }, 400);
  }

  let uploadedPhotoPath = '';
  let eventPhotoUrl = suppliedPhotoUrl;

  if (suppliedPhotoBase64 || chatFileReferences.length > 0) {
    let preparedPhoto:
      | ReturnType<typeof prepareBase64Photo>
      | Awaited<ReturnType<typeof prepareChatAttachment>>;

    try {
      preparedPhoto = suppliedPhotoBase64
        ? prepareBase64Photo(
            suppliedPhotoBase64,
            suppliedPhotoContentType
          )
        : await prepareChatAttachment(chatFileReferences[0]);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : 'INVALID_PHOTO_BASE64',
        },
        400
      );
    }

    uploadedPhotoPath =
      `chatgpt/${BAJUJU_ADMIN_USER_ID}-${Date.now()}-` +
      `${crypto.randomUUID()}.${preparedPhoto.extension}`;

    const photoUploadResult = await supabase.storage
      .from('event-photos')
      .upload(uploadedPhotoPath, preparedPhoto.bytes, {
        contentType: preparedPhoto.contentType,
        upsert: false,
      });

    if (photoUploadResult.error) {
      console.error(
        'Admin experience photo upload failed:',
        photoUploadResult.error.message
      );
      return jsonResponse({ ok: false, error: 'PHOTO_UPLOAD_FAILED' }, 400);
    }

    eventPhotoUrl = supabase.storage
      .from('event-photos')
      .getPublicUrl(uploadedPhotoPath).data.publicUrl;

    if (!eventPhotoUrl) {
      await supabase.storage.from('event-photos').remove([uploadedPhotoPath]);
      return jsonResponse(
        { ok: false, error: 'PHOTO_PUBLIC_URL_UNAVAILABLE' },
        500
      );
    }
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
      photo_url: eventPhotoUrl || null,
    })
    .select("id,title,photo_url")
    .single();

  if (insertResult.error) {
    if (uploadedPhotoPath) {
      await supabase.storage.from('event-photos').remove([uploadedPhotoPath]);
    }

    console.error("Admin experience creation failed:", insertResult.error.message);
    return jsonResponse(
      { ok: false, error: "CREATE_FAILED", detail: insertResult.error.message },
      400
    );
  }

  return jsonResponse({
    ok: true,
    experience: insertResult.data,
    photo_url: insertResult.data.photo_url || null,
  });
});
