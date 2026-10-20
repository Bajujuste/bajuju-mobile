export default async function(request) {
 const url = new URL(request.url);
    if (url.pathname === "/experience-detail") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }
      const upstream = new URL("https://xwcbmsfsirggozpcskcz.supabase.co/functions/v1/event-page");
      upstream.searchParams.set("id", url.searchParams.get("id") ?? "");
      try {
        const response = await fetch(upstream, { signal: AbortSignal.timeout(10000) });
        const html = await response.text();
        if (!response.ok || !/^\s*<!doctype html>/i.test(html)) throw new Error("Event page unavailable");
        return new Response(request.method === "HEAD" ? null : html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch {
        return new Response(request.method === "HEAD" ? null : '<!doctype html><html lang="it"><meta charset="utf-8"><title>Bajuju</title><h1>Bajuju</h1><p>Evento temporaneamente non disponibile.</p><a href="https://bajuju.it">Vai su Bajuju</a></html>', { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60" } });
      }
    }

}
export const config = { path: "/experience-detail" };
