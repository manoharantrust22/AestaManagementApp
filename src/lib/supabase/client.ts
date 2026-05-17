import { createBrowserClient } from "@supabase/ssr";
import { processLock } from "@supabase/supabase-js";
import { Database } from "@/types/database.types";

/**
 * Custom error for expired sessions.
 * Thrown when session refresh fails or times out.
 */
export class SessionExpiredError extends Error {
  constructor(message = "Session expired. Please log in again.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

// Singleton instance for browser client
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

// Default fetch hands out sockets and never times them out at the network
// layer. When the Cloudflare proxy gets into a half-open state, hung fetches
// hold their sockets indefinitely — subsequent queries queue behind dead
// sockets and time out at the React Query layer (wrapQueryFn) without ever
// freeing the pool. QueryProvider's QueryCache.onError already calls
// cancelQueries() + invalidateQueries() to recover, but cancel does nothing
// against a fetch that isn't listening to an AbortSignal — so refetches queue
// behind the same dead sockets. Result: error stuck on screen until the user
// hard-refreshes.
//
// Installing AbortSignal.timeout on every supabase fetch closes that gap.
// Hung fetches abort at the network level → socket freed → the existing
// recovery handler's refetch opens a fresh socket and succeeds. Storage gets
// a longer ceiling because file uploads legitimately take minutes.
// 25s for REST/Auth (was 45s): the lower ceiling is what surfaces the
// "Saving..." infinite-spinner bug to the user as a real error within a
// reasonable wait. Combined with the mutation retry path skipping
// TimeoutError (see QueryProvider), end-to-end max wait on a stalled proxy
// is ~25s — not 45s × 2 retries.
const REST_AUTH_TIMEOUT_MS = 25_000;
const STORAGE_TIMEOUT_MS = 5 * 60_000;

const timeoutFetch: typeof fetch = async (input, init = {}) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const ms = url.includes("/storage/") ? STORAGE_TIMEOUT_MS : REST_AUTH_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(ms);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  try {
    return await fetch(input, { ...init, signal });
  } catch (err) {
    // AbortSignal.timeout rejects with DOMException name="TimeoutError" and
    // a terse "signal timed out" message. Re-throw with a friendlier message
    // that dialogs' generic catch-blocks can surface to the user directly,
    // and preserve the name so QueryProvider's retry path can detect it.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      const friendly = new Error(
        `Request timed out after ${Math.round(ms / 1000)}s — your network or our proxy is slow. Please try again.`,
      );
      friendly.name = "TimeoutError";
      throw friendly;
    }
    throw err;
  }
};

export function createClient() {
  // Return existing singleton if available (browser only)
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables");
    console.error("URL:", supabaseUrl ? "SET" : "MISSING");
    console.error("KEY:", supabaseKey ? "SET" : "MISSING");
    throw new Error(
      "Missing Supabase environment variables. Please check your .env.local file."
    );
  }

  const client = createBrowserClient<Database>(supabaseUrl, supabaseKey, {
    global: { fetch: timeoutFetch },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      // The default navigator.locks-based cross-tab lock serializes every
      // getSession() and token refresh across all tabs of the same origin.
      // With the Cloudflare proxy adding latency, the 3rd+ tab routinely
      // queues behind the lock past AuthContext's 5+3s safety budget — the
      // original getSession never resolves before setLoading(false) fires
      // with user=null, and SiteProvider clears sites → "No sites available".
      // processLock is in-tab only. Trade-off: tabs may occasionally race on
      // token refresh; SDK retries on 401 so worst case is one extra request.
      lock: processLock,
    },
  });

  // Store as singleton in browser environment
  if (typeof window !== 'undefined') {
    browserClient = client;
  }

  return client;
}

/**
 * Re-export ensureFreshSession from sessionManager for backwards compatibility.
 * Session management is now consolidated in sessionManager.ts to avoid
 * duplicate refresh timers and competing session checks.
 */
export { ensureFreshSession } from "@/lib/auth/sessionManager";
