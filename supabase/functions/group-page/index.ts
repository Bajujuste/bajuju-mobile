// group-page
// Pagina HTML con anteprima (Open Graph) per un singolo gruppo Bajuju, come event-page fa per gli eventi.
// Il sito bajuju.it (Netlify) instrada /group-detail?id=<uuid> qui, così il link condiviso su
// Facebook/WhatsApp mostra foto, nome e descrizione del gruppo invece di "Page not found".

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BAJUJU_SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BAJUJU_SERVICE_ROLE_KEY");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_HOST = "https://bajuju.it";
const APP_SCHEME = "bajuju";
const ANDROID_PACKAGE = "it.bajuju.mobile";
const IOS_STORE_URL = "https://apps.apple.com/it/app/bajuju/id6790152821";

type GroupRow = {
  id: string;
  name: string | null;
  description: string | null;
  city: string | null;
  province: string | null;
  category: string | null;
  cover_url: string | null;
  status: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function safeImageUrl(value: string | null): string | null {
  try {
    const candidate = new URL(value ?? "");
    if (["http:", "https:"].includes(candidate.protocol) && !candidate.username && !candidate.password) return candidate.href;
  } catch { /* Nessuna immagine per URL non validi. */ }
  return null;
}

function renderPage(opts: {
  title: string;
  description: string;
  imageUrl: string | null;
  canonicalUrl: string;
  deepLink: string;
  heading: string;
  details: string[];
  bodyText: string;
  found: boolean;
}): string {
  const { title, description, imageUrl, canonicalUrl, deepLink, heading, details, bodyText, found } = opts;
  const image = imageUrl ?? `${CANONICAL_HOST}/bajuju-logo.png`;

  const detailsHtml = details
    .filter(Boolean)
    .map((line) => `<p class="detail">${escapeHtml(line)}</p>`)
    .join("\n      ");

  const bodyHtml = bodyText
    ? `<p class="text">${escapeHtml(bodyText).replace(/\n/g, "<br>")}</p>`
    : "";

  const actionsHtml = found
    ? `<a class="btn btn-primary" href="${escapeHtml(deepLink)}">Apri il gruppo nell'app</a>
      <a class="btn btn-secondary" href="https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}">Scarica su Android</a>
      <a class="btn btn-secondary" href="${IOS_STORE_URL}">Scarica su iPhone</a>`
    : `<a class="btn btn-secondary" href="${CANONICAL_HOST}">Vai su Bajuju</a>`;

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Bajuju" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta name="description" content="${escapeHtml(description)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />

  <meta property="al:ios:url" content="${escapeHtml(deepLink)}" />
  <meta property="al:ios:app_name" content="Bajuju" />
  <meta property="al:android:url" content="${escapeHtml(deepLink)}" />
  <meta property="al:android:package" content="${ANDROID_PACKAGE}" />
  <meta property="al:android:app_name" content="Bajuju" />
  <meta property="al:web:url" content="${escapeHtml(canonicalUrl)}" />

  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background: #fff5fa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #2a1a24;
    }
    .card { max-width: 440px; width: 100%; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 32px rgba(228, 63, 152, 0.18); }
    .cover { width: 100%; display: block; aspect-ratio: 16 / 9; object-fit: cover; background: #fff0f7; }
    .content { padding: 22px; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; text-decoration: none; color: #e43f98; font-weight: 800; }
    .brand img { width: 40px; height: 40px; object-fit: contain; }
    .eyebrow { margin: 0 0 4px; color: #e43f98; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    h1 { font-size: 1.4rem; margin: 0 0 10px; color: #4b0c2d; }
    .detail { margin: 0 0 4px; font-size: 0.95rem; color: #6b4a58; }
    .text { margin: 14px 0 0; font-size: 0.95rem; line-height: 1.5; color: #4f2a3e; }
    .actions { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
    .btn { display: block; text-align: center; padding: 12px 16px; border-radius: 12px; text-decoration: none; font-weight: 600; }
    .btn-primary { background: #e43f98; color: #fff; }
    .btn-secondary { background: #f3e2ec; color: #8a1f5c; }
  </style>
</head>
<body>
  <div class="card">
    ${imageUrl ? `<img class="cover" src="${escapeHtml(imageUrl)}" alt="" />` : ""}
    <div class="content">
      <a class="brand" href="${CANONICAL_HOST}"><img src="${CANONICAL_HOST}/bajuju-logo.png" alt="Bajuju">Bajuju · Dal vivo è meglio</a>
      ${found ? `<p class="eyebrow">Gruppo</p>` : ""}
      <h1>${escapeHtml(heading)}</h1>
      ${detailsHtml}
      ${bodyHtml}
      <div class="actions">${actionsHtml}</div>
    </div>
  </div>
</body>
</html>`;
}

function htmlResponse(html: string, status = 200, cache = "no-store") {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const groupId = (url.searchParams.get("id") ?? "").trim();

  const fallbackHtml = renderPage({
    title: "Bajuju — Dal Vivo è Meglio",
    description: "Trova persone e gruppi per esperienze dal vivo su Bajuju.",
    imageUrl: null,
    canonicalUrl: CANONICAL_HOST,
    deepLink: `${APP_SCHEME}://`,
    heading: "Gruppo non disponibile",
    details: ["Questo gruppo non è più disponibile su Bajuju."],
    bodyText: "",
    found: false,
  });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("group-page: variabili d'ambiente SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY mancanti.");
    return htmlResponse(fallbackHtml, 500);
  }
  if (!UUID_PATTERN.test(groupId)) return htmlResponse(fallbackHtml);

  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  try {
    const [groupResponse, membersResponse] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/groups?id=eq.${groupId}&select=id,name,description,city,province,category,cover_url,status&limit=1`,
        { headers },
      ),
      fetch(`${SUPABASE_URL}/rest/v1/group_members?group_id=eq.${groupId}&select=user_id`, {
        method: "HEAD",
        headers: { ...headers, Prefer: "count=exact" },
      }),
    ]);

    if (!groupResponse.ok) {
      console.error("group-page: lettura groups fallita", groupResponse.status, await groupResponse.text());
      return htmlResponse(fallbackHtml);
    }

    const [group] = (await groupResponse.json()) as GroupRow[];
    // Solo i gruppi approvati sono pubblici: quelli in attesa o rifiutati non si mostrano fuori dall'app.
    if (!group || group.status !== "active") return htmlResponse(fallbackHtml);

    const memberCount = Number(membersResponse.headers.get("content-range")?.split("/")[1] ?? "");
    const name = (group.name ?? "").trim() || "Gruppo Bajuju";
    const place = [group.city, group.province].filter(Boolean).join(", ");
    const description = (group.description ?? "").trim();

    const ogDescription = truncate(
      [place ? `Gruppo a ${place}` : "Gruppo Bajuju", description].filter(Boolean).join(" — "),
      300,
    );

    const html = renderPage({
      title: `${name} — Bajuju`,
      description: ogDescription,
      imageUrl: safeImageUrl(group.cover_url),
      canonicalUrl: `${CANONICAL_HOST}/group-detail?id=${encodeURIComponent(groupId)}`,
      deepLink: `${APP_SCHEME}://group-detail?id=${encodeURIComponent(groupId)}`,
      heading: name,
      details: [
        place ? `📍 ${place}` : "",
        group.category ? `🏷️ ${group.category}` : "",
        Number.isFinite(memberCount) && memberCount > 0 ? `👥 ${memberCount} ${memberCount === 1 ? "iscritto" : "iscritti"}` : "",
      ],
      bodyText: truncate(description, 600),
      found: true,
    });

    return htmlResponse(html, 200, "public, max-age=300, s-maxage=300");
  } catch (error) {
    console.error("group-page: errore generale", error);
    return htmlResponse(fallbackHtml);
  }
});
