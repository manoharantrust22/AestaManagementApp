/**
 * Cloudflare Worker - Supabase Reverse Proxy
 *
 * Proxies all requests from this worker's URL to the Supabase project URL.
 * This bypasses ISP-level blocks on *.supabase.co domains in India.
 *
 * Handles: REST API, Auth, Storage (uploads/downloads), Realtime WebSocket
 *
 * Edge cache: GET /rest/v1/<table> for tables in CACHEABLE_TABLES is cached
 * for CACHE_TTL_SECONDS keyed only by URL. Safe because each listed table has
 * an RLS SELECT policy with USING (true), so every caller sees the same rows.
 */

interface Env {
  SUPABASE_URL: string;
}

// Tables whose SELECT response is the same for every caller (verified RLS).
// Add a name here only if a `USING (true)` SELECT policy applies to all roles.
const CACHEABLE_TABLES = new Set<string>([
  "materials",
  "labor_categories",
  "labor_roles",
  "vendors",
]);

const CACHE_TTL_SECONDS = 60;

// All headers that Supabase client sends
const ALLOWED_HEADERS = [
  "Accept",
  "Accept-Encoding",
  "Accept-Language",
  "Authorization",
  "Content-Type",
  "apikey",
  "accept-profile",
  "content-profile",
  "prefer",
  "range",
  "cache-control",
  "x-client-info",
  "x-supabase-api-version",
  "x-upsert",
  "Upgrade",
  "Connection",
].join(", ");

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const supabaseOrigin = new URL(env.SUPABASE_URL);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCors(request);
    }

    // Build the target URL: replace worker origin with Supabase origin
    const targetUrl = new URL(url.pathname + url.search, env.SUPABASE_URL);

    // For WebSocket upgrade requests (Supabase Realtime),
    // create a new Request pointing to Supabase and let Cloudflare handle the upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
      // Clone headers and set correct Host
      const headers = new Headers(request.headers);
      headers.set("Host", supabaseOrigin.host);

      // WS upgrade MUST be a bodyless GET. Passing `body: request.body` (a
      // ReadableStream) on the upgrade fetch causes Cloudflare to reject the
      // upgrade intermittently — failed upgrades leave half-open sockets in
      // the browser's per-host pool, which then starves REST traffic to this
      // same host and produces silent infinite spinners on page navigation.
      try {
        return await fetch(targetUrl.toString(), {
          method: "GET",
          headers,
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "WebSocket upgrade failed",
            message: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 502,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeadersObj(request),
            },
          }
        );
      }
    }

    // For regular HTTP requests
    const headers = new Headers(request.headers);
    headers.set("Host", supabaseOrigin.host);

    const cacheableTable = getCacheableTableName(request.method, url);

    try {
      // Edge cache lookup for safe-to-cache GETs
      if (cacheableTable) {
        const cacheKey = new Request(url.toString(), { method: "GET" });
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) {
          const hit = new Response(cached.body, cached);
          setCorsHeaders(hit.headers, request);
          hit.headers.set("X-Edge-Cache", "HIT");
          return hit;
        }
      }

      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
        redirect: "follow",
      });

      // Build response with CORS headers
      const responseHeaders = new Headers(response.headers);
      setCorsHeaders(responseHeaders, request);

      // Edge cache store for safe-to-cache GETs
      if (cacheableTable && response.ok) {
        responseHeaders.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
        responseHeaders.set("X-Edge-Cache", "MISS");
        const cloned = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
        const cacheKey = new Request(url.toString(), { method: "GET" });
        ctx.waitUntil(caches.default.put(cacheKey, cloned.clone()));
        return cloned;
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Proxy error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeadersObj(request),
          },
        }
      );
    }
  },
};

/**
 * Handle CORS preflight request
 */
function handleCors(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...getCorsHeadersObj(request),
      "Access-Control-Max-Age": "86400",
    },
  });
}

function setCorsHeaders(headers: Headers, request: Request): void {
  const origin = request.headers.get("Origin") || "*";
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Access-Control-Expose-Headers", "Content-Range, Range, x-supabase-api-version, content-range");
  headers.set("Access-Control-Allow-Credentials", "true");
}

/**
 * Returns the table name if the request targets a cacheable PostgREST list endpoint,
 * or null. Only matches GET /rest/v1/<table> with a single path segment after the
 * version prefix — RPC calls and joined paths fall through to the regular proxy.
 */
function getCacheableTableName(method: string, url: URL): string | null {
  if (method !== "GET") return null;
  const m = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
  if (!m) return null;
  const table = m[1];
  return CACHEABLE_TABLES.has(table) ? table : null;
}

function getCorsHeadersObj(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": "Content-Range, Range, x-supabase-api-version, content-range",
    "Access-Control-Allow-Credentials": "true",
  };
}
