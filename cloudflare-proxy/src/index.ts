/**
 * Cloudflare Worker - Supabase Reverse Proxy
 *
 * Proxies all requests from this worker's URL to the Supabase project URL.
 * This bypasses ISP-level blocks on *.supabase.co domains in India.
 *
 * Handles: REST API, Auth, Storage (uploads/downloads), Realtime WebSocket
 */

interface Env {
  SUPABASE_URL: string;
}

// Headers that should not be forwarded (hop-by-hop)
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const supabaseUrl = env.SUPABASE_URL;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCors(request);
    }

    // Build the target URL: replace worker origin with Supabase origin
    const targetUrl = `${supabaseUrl}${url.pathname}${url.search}`;

    // Check for WebSocket upgrade (Realtime connections)
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
      return handleWebSocket(request, targetUrl);
    }

    // Forward the request to Supabase
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    }

    // Override the Host header to match Supabase
    const supabaseHost = new URL(supabaseUrl).host;
    headers.set("Host", supabaseHost);

    try {
      const response = await fetch(targetUrl, {
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
 * Handle WebSocket upgrade for Supabase Realtime
 */
async function handleWebSocket(
  request: Request,
  targetUrl: string
): Promise<Response> {
  // Cloudflare Workers support WebSocket proxying via fetch with Upgrade header
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  const supabaseHost = new URL(targetUrl).host;
  headers.set("Host", supabaseHost);

  // Use the target URL with wss:// for WebSocket
  const wsUrl = targetUrl.replace("https://", "wss://").replace("http://", "ws://");

  const response = await fetch(wsUrl, {
    method: request.method,
    headers,
    body: request.body,
  });

  return response;
}

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

/**
 * Set CORS headers on a response
 */
function setCorsHeaders(headers: Headers, request: Request): void {
  const origin = request.headers.get("Origin") || "*";
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, range, prefer"
  );
  headers.set("Access-Control-Expose-Headers", "Content-Range, Range, x-supabase-api-version");
  headers.set("Access-Control-Allow-Credentials", "true");
}

/**
 * Get CORS headers as a plain object (for Response constructor)
 */
function getCorsHeadersObj(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, range, prefer",
    "Access-Control-Expose-Headers": "Content-Range, Range, x-supabase-api-version",
    "Access-Control-Allow-Credentials": "true",
  };
}
