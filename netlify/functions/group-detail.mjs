// Pagina pubblica di un gruppo: i link condivisi dall'app (bajuju.it/group-detail?id=...) arrivano qui
// e mostrano la card con foto e nome del gruppo, generata dalla funzione Supabase group-page.
export default async function(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  const upstream = new URL("https://xwcbmsfsirggozpcskcz.supabase.co/functions/v1/group-page");
  upstream.searchParams.set("id", url.searchParams.get("id") ?? "");
  try {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(10000) });
    const html = await response.text();
    if (!response.ok || !/^\s*<!doctype html>/i.test(html)) throw new Error("Group page unavailable");
    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(request.method === "HEAD" ? null : '<!doctype html><html lang="it"><meta charset="utf-8"><title>Bajuju</title><h1>Bajuju</h1><p>Gruppo temporaneamente non disponibile.</p><a href="https://bajuju.it">Vai su Bajuju</a></html>', { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
export const config = { path: "/group-detail" };
