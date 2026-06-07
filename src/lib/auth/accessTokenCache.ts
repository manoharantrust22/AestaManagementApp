/**
 * Lock-free access-token cache.
 *
 * Why this exists: the supabase client is configured with `lock: processLock`
 * (see lib/supabase/client.ts), which serializes every `getSession()` and
 * `refreshSession()` in the tab on one in-memory lock. When a token refresh is
 * in-flight (e.g. proactiveRefreshIfNeeded on page load) and its `/auth/v1/token`
 * fetch is starved behind the single-origin proxy, that lock is held for up to
 * ~25s. Any `getSession()` queues behind it — which is exactly what made image
 * uploads hang at "Preparing upload… 50%" before timing out.
 *
 * The current access token is published here by AuthContext's onAuthStateChange
 * handler (which already holds the session in hand, no lock needed) on every
 * INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED event. Upload code can then read
 * a valid token synchronously without ever touching the lock.
 *
 * Browser-only module state: one instance per tab, intentionally module-level.
 */

let cachedToken: string | null = null;

/** Publish the latest access token (called from AuthContext on auth changes). */
export function setCachedAccessToken(token: string | null): void {
  cachedToken = token;
}

/** Read the last-published access token without acquiring the auth lock. */
export function getCachedAccessToken(): string | null {
  return cachedToken;
}
