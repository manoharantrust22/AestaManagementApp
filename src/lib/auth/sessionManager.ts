import { createClient } from "@/lib/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Centralized Session Manager
 *
 * Consolidates all session refresh logic into a single manager.
 * Replaces multiple refresh layers in AuthContext, useSessionRefresh, and client.ts
 *
 * Features:
 * - Single 45-minute refresh timer
 * - Activity tracking (debounced user interactions)
 * - Idle detection (15 minutes threshold)
 * - Pre-mutation session check
 * - Error recovery with user notification
 */

// const REFRESH_INTERVAL = 45 * 60 * 1000; // REMOVED: Conflicting with Supabase auto-refresh
const IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
const PROACTIVE_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes - check if refresh needed
const EXPIRY_BUFFER = 15 * 60; // 15 minutes in seconds - refresh if token expires within this time
const ACTIVITY_DEBOUNCE = 2000; // 2 seconds
const SESSION_CHECK_DEBOUNCE = 30000; // 30 seconds - trust a verified session for this long
const SESSION_CHECK_TIMEOUT = 4000; // 4 seconds - if slow, proceed and let Supabase 401 handle it
// 15s - the post-idle path now heals the connection pool (canary + warm-up +
// recheck, ~9s worst case) before the mutation's request chain. This safety
// timeout must comfortably exceed that so the heal normally finishes inside it;
// if it ever doesn't, we proceed anyway (a stale token just 401s → retry).
const SESSION_CHECK_TIMEOUT_POST_IDLE = 15000;
// After idle, only force a blocking token refresh if the token can't survive at
// least this long. Access tokens last ~1h, so after a short idle the token is
// almost always still valid and a forced refresh is just another slow round-trip
// (and the source of the false "session expired" banner).
const POST_IDLE_EXPIRY_BUFFER = 120; // seconds
const VISIBILITY_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes - re-auth on tab return if hidden longer than this

// Module-level singleton in-flight refresh. ALL callers (SessionManager methods,
// QueryProvider error handlers, NetworkRecoveryHandler) funnel through this so
// concurrent refresh calls cannot race and trigger refresh-token-rotation reuse
// detection (which surfaces as a 400 invalid_grant from /auth/v1/token).
let _refreshInFlight: Promise<boolean> | null = null;

// Module-level dedupe for the full idle-wake recovery (refresh + pool heal).
// Both `handleVisibilityChange` (tab return) and `handleActivity` (same-tab idle
// end) can race here when the user backgrounds the tab and clicks immediately
// on return — let only one run finish.
let _recoverInFlight: Promise<void> | null = null;

// Module-level dedupe for the connection-pool heal. recoverFromIdleWake() (tab
// return / same-tab idle end) and ensureFreshSession() (the next mutation) can
// both reach for a heal after the same idle period — share one canary+warm-up
// pass instead of firing duplicate pings.
let _healInFlight: Promise<boolean> | null = null;

// Canary endpoint: a tiny GET against the proxy used to detect a poisoned
// per-host connection pool. labor_categories is in the Worker's CACHEABLE_TABLES
// so it's edge-cached and never round-trips to Supabase under normal conditions.
const CANARY_TIMEOUT_MS = 3000;

// Number of parallel warm-up GETs fired after a failed canary. The realtime WS
// eviction only frees the WS socket; the REST sockets the app's queries use are
// still half-open. Firing a few parallel pings trips the dead sockets so the
// browser evicts them and the user's NEXT real query opens a fresh connection
// instead of queuing behind a dead one. Kept below the browser's ~6-per-host
// cap so warm-up itself never starves real traffic.
const POOL_WARMUP_REQUESTS = 3;

type SessionManagerState = {
  isInitialized: boolean;
  lastActivity: number;
  lastSessionCheckTime: number;
  needsRefreshOnNextMutation: boolean; // Set on idle wake, cleared after refresh
  // refreshTimer: ReturnType<typeof setInterval> | null; // REMOVED
  proactiveRefreshTimer: ReturnType<typeof setInterval> | null;
  activityTimer: ReturnType<typeof setTimeout> | null;
  hiddenAt: number | null; // Set when document.visibilityState transitions to "hidden"
  queryClient: QueryClient | null;
};

class SessionManager {
  private state: SessionManagerState = {
    isInitialized: false,
    lastActivity: Date.now(),
    lastSessionCheckTime: 0,
    needsRefreshOnNextMutation: false,
    // refreshTimer: null,
    proactiveRefreshTimer: null,
    activityTimer: null,
    hiddenAt: null,
    queryClient: null,
  };

  /**
   * Hand the QueryClient to the session manager so it can cancel/invalidate
   * queries during the visibility-wake recovery sequence. Called once from
   * QueryProvider after the client is constructed.
   */
  setQueryClient(qc: QueryClient): void {
    this.state.queryClient = qc;
  }

  /**
   * Initialize the session manager
   * Should be called once when the app starts (in AuthContext)
   */
  initialize(): void {
    if (this.state.isInitialized || typeof window === "undefined") {
      return;
    }

    console.log("[SessionManager] Initializing...");

    this.state.isInitialized = true;
    this.state.lastActivity = Date.now();

    // Start refresh timer - REMOVED to avoid race condition with Supabase auto-refresh
    // this.startRefreshTimer();

    // Start proactive refresh timer to prevent session expiry during idle
    this.startProactiveRefreshTimer();

    // Setup activity tracking
    this.setupActivityTracking();

    // Setup tab visibility tracking — the primary wake-from-idle signal
    this.setupVisibilityTracking();

    console.log("[SessionManager] Initialized with proactive refresh timer");
  }

  /**
   * Stop the session manager
   * Should be called when the user logs out
   */
  stop(): void {
    console.log("[SessionManager] Stopping...");

    // if (this.state.refreshTimer) {
    //   clearInterval(this.state.refreshTimer);
    //   this.state.refreshTimer = null;
    // }

    if (this.state.proactiveRefreshTimer) {
      clearInterval(this.state.proactiveRefreshTimer);
      this.state.proactiveRefreshTimer = null;
    }

    if (this.state.activityTimer) {
      clearTimeout(this.state.activityTimer);
      this.state.activityTimer = null;
    }

    this.cleanupActivityTracking();
    this.cleanupVisibilityTracking();
    this.state.hiddenAt = null;

    this.state.isInitialized = false;
    console.log("[SessionManager] Stopped");
  }

  /**
   * Check if user is idle
   */
  isUserIdle(): boolean {
    const timeSinceLastActivity = Date.now() - this.state.lastActivity;
    return timeSinceLastActivity > IDLE_THRESHOLD;
  }

  /**
   * Get last activity time
   */
  getLastActivity(): number {
    return this.state.lastActivity;
  }

  /**
   * Manually refresh session.
   * Returns true if successful, false otherwise.
   *
   * Routes through refreshSessionDeduped() so concurrent callers (SDK auto-refresh,
   * QueryCache.onError, mutation onError, NetworkRecoveryHandler, visibility wake)
   * never trigger refresh-token-rotation reuse detection (Supabase 400 invalid_grant).
   */
  async refreshSession(): Promise<boolean> {
    return this.refreshSessionDeduped();
  }

  /**
   * Single source of truth for token refresh. Holds a module-level in-flight
   * promise so all callers share the same outcome. Dispatches refresh-failed
   * event on hard failures (UI banner). The caller is responsible for deciding
   * whether to redirect to login on a hard failure (e.g. invalid_grant 400).
   */
  async refreshSessionDeduped(): Promise<boolean> {
    if (_refreshInFlight) {
      return _refreshInFlight;
    }

    _refreshInFlight = (async (): Promise<boolean> => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          console.warn("[SessionManager] No session to refresh");
          return false;
        }

        const { error } = await supabase.auth.refreshSession();

        if (error) {
          console.error("[SessionManager] Failed to refresh:", error);
          this.dispatchRefreshFailedEvent(error.message);
          return false;
        }

        console.log("[SessionManager] Session refreshed successfully");
        return true;
      } catch (err) {
        console.error("[SessionManager] Refresh error:", err);
        return false;
      } finally {
        _refreshInFlight = null;
      }
    })();

    return _refreshInFlight;
  }

  /**
   * Ensure session is fresh before mutation
   * Throws error only if session is actually invalid.
   * Timeouts are logged but do NOT throw - the mutation proceeds and
   * Supabase will return a proper 401/403 if the session is truly expired.
   *
   * Includes debouncing: if called multiple times within 5 seconds (e.g., batch
   * upserts), only the first call actually checks the session.
   *
   * After idle periods (15+ min), forces a token refresh instead of just
   * checking the cached session, since the token may have expired.
   */
  async ensureFreshSession(): Promise<void> {
    const now = Date.now();
    const needsRefresh = this.state.needsRefreshOnNextMutation;

    // Debounce: skip if checked recently (unless flagged for refresh after idle wake)
    if (!needsRefresh && now - this.state.lastSessionCheckTime < SESSION_CHECK_DEBOUNCE) {
      return; // Session was verified recently, skip check
    }

    // Use longer timeout if waking from idle
    const timeout = needsRefresh ? SESSION_CHECK_TIMEOUT_POST_IDLE : SESSION_CHECK_TIMEOUT;

    if (needsRefresh) {
      console.log("[SessionManager] Post-idle check: healing pool + verifying token");
      // Clear the flag immediately to prevent duplicate work from concurrent mutations
      this.state.needsRefreshOnNextMutation = false;
    }

    const sessionCheckPromise = async (): Promise<void> => {
      const supabase = createClient();

      // After idle wake: the real problem is a poisoned per-host connection pool
      // (dead half-open sockets), which makes EVERY subsequent request crawl for
      // 15-20s — a mutation's chain of round-trips then takes minutes and the
      // Save button spins. So heal the pool FIRST, before the mutation fires its
      // requests. Bounded + deduped, with a no-op fast path when the pool is fine.
      if (needsRefresh) {
        await this.healConnectionPool();

        // Refresh the token ONLY if it's missing or actually near expiry. After a
        // short idle the token (≈1h life) is almost always still valid, so a
        // forced refresh is just another slow round-trip. A genuinely stale token
        // 401s and QueryProvider's retry→refresh path recovers it.
        const { data: { session } } = await supabase.auth.getSession();
        const expiresAt = session?.expires_at;
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (!session || (expiresAt !== undefined && expiresAt < nowSeconds + POST_IDLE_EXPIRY_BUFFER)) {
          const ok = await this.refreshSessionDeduped();
          if (!ok) {
            console.error("[SessionManager] Post-idle refresh failed");
            throw new Error("Session expired. Please log in again.");
          }
          console.log("[SessionManager] Post-idle token refresh successful");
        } else {
          console.log("[SessionManager] Post-idle pool healed; token still valid — proceeding");
        }
        this.state.lastSessionCheckTime = Date.now();
        return;
      }

      // Normal flow: check cached session first
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error("[SessionManager] Session check error:", error);
        throw new Error("Session expired. Please log in again.");
      }

      if (!session) {
        console.warn("[SessionManager] No active session");
        throw new Error("Session expired. Please log in again.");
      }

      // Check if token is expired or about to expire (within 5 minutes)
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const fiveMinutesFromNow = Math.floor(Date.now() / 1000) + 300;
        if (expiresAt < fiveMinutesFromNow) {
          console.log("[SessionManager] Session expiring soon, refreshing...");
          const ok = await this.refreshSessionDeduped();
          if (!ok) {
            console.error("[SessionManager] Session refresh failed before mutation");
            throw new Error("Session expired. Please log in again.");
          }
          console.log("[SessionManager] Session refreshed before mutation");
        }
      }

      // Mark successful check
      this.state.lastSessionCheckTime = Date.now();
    };

    // Safety timeout: in BOTH cases, proceed (resolve) if the check is still
    // running when it fires. The post-idle work (pool heal + optional refresh)
    // is internally bounded and normally finishes well within `timeout`; if it
    // ever doesn't, a genuinely stale token just 401s and QueryProvider's
    // retry→refresh path recovers it. We deliberately do NOT reject or pop a
    // "session may have expired" banner here — that was a false alarm that hung
    // the Save dialog while the token was actually still valid.
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn(`[SessionManager] ensureFreshSession slow (${timeout / 1000}s) - proceeding anyway`);
        this.state.lastSessionCheckTime = Date.now();
        resolve();
      }, timeout);
    });

    // Race: first to complete wins
    await Promise.race([sessionCheckPromise(), timeoutPromise]);
  }

  // ==================== PRIVATE METHODS ====================

  // private startRefreshTimer(): void {
  //   this.state.refreshTimer = setInterval(async () => {
  //     await this.refreshSession();
  //   }, REFRESH_INTERVAL);
  // }

  private startProactiveRefreshTimer(): void {
    // Clear existing timer if any
    if (this.state.proactiveRefreshTimer) {
      clearInterval(this.state.proactiveRefreshTimer);
    }

    // Run proactive refresh check every 10 minutes
    this.state.proactiveRefreshTimer = setInterval(async () => {
      await this.proactiveRefreshIfNeeded();
    }, PROACTIVE_REFRESH_INTERVAL);

    // Also run immediately on start to catch near-expiry sessions
    this.proactiveRefreshIfNeeded();
  }

  private async proactiveRefreshIfNeeded(): Promise<void> {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // No session - nothing to refresh
        return;
      }

      const expiresAt = session.expires_at;
      if (expiresAt) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt - nowSeconds;

        // Refresh if within buffer period (15 minutes)
        if (timeUntilExpiry < EXPIRY_BUFFER && timeUntilExpiry > 0) {
          console.log(`[SessionManager] Proactive refresh - ${Math.round(timeUntilExpiry / 60)} min until expiry`);
          const ok = await this.refreshSessionDeduped();
          if (ok) {
            console.log("[SessionManager] Proactive refresh successful");
          }
        }
      }
    } catch (err) {
      console.error("[SessionManager] Proactive refresh error:", err);
    }
  }

  private setupVisibilityTracking(): void {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private cleanupVisibilityTracking(): void {
    if (typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  /**
   * Primary wake-from-idle handler. Browsers throttle setInterval/setTimeout
   * to ~1/min while the tab is hidden, so the SDK's autoRefreshToken and our
   * proactive timer both miss the actual expiry window. visibilitychange is
   * the only event guaranteed to fire on tab return.
   *
   * On hidden→visible transition where hidden duration exceeds the threshold:
   *   1. Cancel in-flight queries (they're carrying a stale Authorization).
   *   2. Force a single deduped refresh.
   *   3. On success → dispatch session-restored-after-idle so IdleRecoveryHandler
   *      invalidates active queries with the fresh token.
   *   4. On failure that looks like invalid_grant → redirect to login (the
   *      refresh token is unrecoverable; a hard reload is the only path back).
   */
  private handleVisibilityChange = (): void => {
    if (typeof document === "undefined") return;

    if (document.visibilityState === "hidden") {
      this.state.hiddenAt = Date.now();
      // Pause proactive timer — throttled in background anyway, and contributes
      // to the refresh race when it eventually fires alongside SDK auto-refresh.
      if (this.state.proactiveRefreshTimer) {
        clearInterval(this.state.proactiveRefreshTimer);
        this.state.proactiveRefreshTimer = null;
      }
      return;
    }

    if (document.visibilityState !== "visible") return;

    const hiddenAt = this.state.hiddenAt;
    this.state.hiddenAt = null;

    // Restart proactive timer
    if (!this.state.proactiveRefreshTimer && this.state.isInitialized) {
      this.startProactiveRefreshTimer();
    }

    if (hiddenAt === null) return;
    const hiddenDuration = Date.now() - hiddenAt;
    if (hiddenDuration < VISIBILITY_REFRESH_THRESHOLD) return;

    console.log(
      `[SessionManager] Tab visible after ${Math.round(hiddenDuration / 60000)} min hidden — refreshing session`
    );

    void this.recoverFromIdleWake();
  };

  private async recoverFromIdleWake(): Promise<void> {
    if (_recoverInFlight) {
      return _recoverInFlight;
    }
    _recoverInFlight = (async () => {
      try {
        const qc = this.state.queryClient;

        // NOTE: cancelQueries() intentionally removed here. Supabase JS SDK has
        // autoRefreshToken:true and attaches the current token at request time,
        // so in-flight queries will either complete with a valid token (if the
        // SDK refreshed it first) or get a 401 that the QueryCache.onError
        // handler retries. Cancelling all fetching queries produced cascading
        // CancelledErrors on every idle-wake, making every page appear broken
        // until the IdleRecoveryHandler's invalidateQueries fired 1 second later.

        // Heal the browser per-host connection pool FIRST. The token refresh
        // below is itself a request through the same proxy origin, so if the
        // pool is poisoned the refresh crawls behind a dead socket. Cycling the
        // pool first (canary → WS evict → REST warm-up) makes the refresh — and
        // the user's next request — fast. Root-cause fix for "Upload/Save timed
        // out" after idle.
        await this.healConnectionPool();

        const ok = await this.refreshSessionDeduped();

        if (ok) {
          this.state.lastSessionCheckTime = Date.now();
          this.state.needsRefreshOnNextMutation = false;
          this.dispatchSessionRestoredEvent();
          return;
        }

        // Refresh failed. If it's an unrecoverable refresh-token state (rotated
        // / reused / expired), the only path back is a fresh login. Anything
        // else — transient network — will recover on the next user action.
        console.error("[SessionManager] Idle-wake refresh failed — redirecting to login");
        if (typeof window !== "undefined") {
          window.location.href = "/login?session_expired=true";
        }
      } finally {
        _recoverInFlight = null;
      }
    })();
    return _recoverInFlight;
  }

  /**
   * Detect and heal a poisoned browser per-host connection pool.
   *
   * When the tab has been idle, the Supabase realtime WebSocket can die
   * silently (browser timer throttling, ISP/Cloudflare killing idle TCP).
   * The browser keeps the half-open socket in its per-host pool until
   * something tries to use it — at which point an XHR upload to the same
   * host queues behind the dead socket and never gets a progress event.
   *
   * Strategy: run a tiny canary GET bound by 3s. If it succeeds, the pool
   * is fine — leave realtime alone. If it fails, force-disconnect the WS
   * (which evicts its socket from the pool) and re-subscribe channels.
   *
   * Deduped via `_healInFlight` so a concurrent idle-wake recovery and a
   * pre-mutation check share one canary+warm-up pass.
   */
  private async healConnectionPool(): Promise<boolean> {
    if (_healInFlight) {
      return _healInFlight;
    }
    _healInFlight = this.runHealConnectionPool().finally(() => {
      _healInFlight = null;
    });
    return _healInFlight;
  }

  private async runHealConnectionPool(): Promise<boolean> {
    const canaryOk = await this.runPoolCanary();
    if (canaryOk) {
      // The pool is provably alive — a cheap GET round-tripped. If a query
      // still timed out, the cause is that ONE slow/large response stalling
      // mid-transfer (e.g. the Material Hub's heavy PO fetch on a flaky
      // proxy), NOT a poisoned socket pool. Report healthy so callers refetch
      // that query instead of declaring "connection lost" and forcing a reload.
      console.log("[SessionManager] Pool canary OK — no heal needed");
      return true;
    }

    console.warn(
      "[SessionManager] Pool canary failed — forcing realtime reconnect to evict dead socket"
    );
    try {
      const { forceRealtimeReconnect } = await import("@/lib/supabase/realtime");
      forceRealtimeReconnect();
    } catch (err) {
      console.error("[SessionManager] forceRealtimeReconnect failed:", err);
      return false;
    }

    // Cycle the REST socket pool too. Evicting only the WS socket above is not
    // enough — the half-open REST sockets the drawer/page queries actually use
    // are what produce the "stuck on skeleton" hang. Warming forces fresh ones.
    await this.warmConnectionPool();

    // Verify the heal worked. If still failing, surface a UI-level event so
    // the app can show a brief "Reconnecting…" banner instead of leaving the
    // user to puzzle out why the next action fails.
    const recoveredOk = await this.runPoolCanary();
    if (recoveredOk) {
      console.log("[SessionManager] Pool healed after realtime reconnect");
      return true;
    }
    if (typeof window !== "undefined") {
      console.error("[SessionManager] Pool still degraded after heal");
      window.dispatchEvent(new CustomEvent("connection-degraded"));
    }
    return false;
  }

  /**
   * Tiny GET against the Worker proxy to detect a poisoned connection pool.
   * Hits a Worker-cached table so it's cheap and doesn't load Supabase.
   * Returns true on 2xx within CANARY_TIMEOUT_MS, false on timeout / network
   * failure / non-2xx.
   */
  private async runPoolCanary(): Promise<boolean> {
    if (typeof window === "undefined") return true;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !apikey) return true;

    const startedAt = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CANARY_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${url}/rest/v1/labor_categories?select=id&limit=1`,
        {
          method: "GET",
          headers: { apikey, Accept: "application/json" },
          signal: ctrl.signal,
          cache: "no-store",
        }
      );
      const elapsed = Date.now() - startedAt;
      if (!res.ok) {
        console.warn(`[SessionManager] Canary HTTP ${res.status} in ${elapsed}ms`);
        return false;
      }
      console.log(`[SessionManager] Canary OK in ${elapsed}ms`);
      return true;
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.warn(
        `[SessionManager] Canary ${isAbort ? "timed out" : "failed"} after ${elapsed}ms`,
        isAbort ? "" : err
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Force the browser to open fresh REST sockets after the pool was found
   * poisoned. Fires POOL_WARMUP_REQUESTS parallel GETs (each bound by
   * CANARY_TIMEOUT_MS) at the proxy. Results are intentionally ignored — this
   * is a pool-cycling side effect, not a health check: the stalled pings trip
   * the dead half-open sockets so the browser evicts them, and the user's next
   * real query opens a clean connection instead of hanging the InspectPane.
   */
  private async warmConnectionPool(): Promise<void> {
    if (typeof window === "undefined") return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !apikey) return;

    const pings = Array.from({ length: POOL_WARMUP_REQUESTS }, () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CANARY_TIMEOUT_MS);
      return fetch(`${url}/rest/v1/labor_categories?select=id&limit=1`, {
        method: "GET",
        headers: { apikey, Accept: "application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      })
        .catch(() => undefined)
        .finally(() => clearTimeout(timer));
    });
    await Promise.allSettled(pings);
    console.log(
      `[SessionManager] Fired ${POOL_WARMUP_REQUESTS} REST pool warm-up pings`
    );
  }

  /**
   * Public entry point for QueryProvider's timeout circuit-breaker. Lets the
   * query-error path escalate to a real pool heal (canary + WS eviction + REST
   * warm-up) before blindly refetching onto a dead pool.
   */
  async healConnectionPoolNow(): Promise<boolean> {
    return this.healConnectionPool();
  }

  private setupActivityTracking(): void {
    if (typeof window === "undefined") return;

    // Track user activity
    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];

    activityEvents.forEach((event) => {
      window.addEventListener(event, this.handleActivity);
    });
  }

  private cleanupActivityTracking(): void {
    if (typeof window === "undefined") return;

    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];

    activityEvents.forEach((event) => {
      window.removeEventListener(event, this.handleActivity);
    });
  }

  private handleActivity = (): void => {
    // Debounce activity tracking
    if (this.state.activityTimer) {
      clearTimeout(this.state.activityTimer);
    }

    // Check if waking from idle BEFORE updating lastActivity
    const wasIdle = this.isUserIdle();

    this.state.activityTimer = setTimeout(() => {
      this.state.lastActivity = Date.now();

      if (wasIdle) {
        console.log("[SessionManager] Activity detected after idle — running idle-wake recovery");
        this.state.needsRefreshOnNextMutation = true;
        // Same-tab idle-end recovery. visibilitychange wouldn't fire here
        // because the tab was never hidden, so without this the FIRST upload
        // after a long same-tab idle is the one that gets poisoned-pool'd.
        // recoverFromIdleWake is deduped, so racing with the visibility path
        // is safe.
        void this.recoverFromIdleWake();
      }
    }, ACTIVITY_DEBOUNCE);
  };

  private dispatchRefreshFailedEvent(errorMessage: string): void {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("session-refresh-failed", {
          detail: { error: errorMessage },
        })
      );
    }
  }

  private dispatchSessionRestoredEvent(): void {
    if (typeof window !== "undefined") {
      console.log("[SessionManager] Dispatching session-restored-after-idle event");
      window.dispatchEvent(new CustomEvent("session-restored-after-idle"));
    }
  }
}

// Singleton instance
const sessionManager = new SessionManager();

export default sessionManager;

// Named exports for convenience
export const initializeSessionManager = () => sessionManager.initialize();
export const stopSessionManager = () => sessionManager.stop();
export const refreshSession = () => sessionManager.refreshSession();
export const refreshSessionDeduped = () => sessionManager.refreshSessionDeduped();
export const setSessionManagerQueryClient = (qc: QueryClient) => sessionManager.setQueryClient(qc);
export const healConnectionPoolNow = () => sessionManager.healConnectionPoolNow();
export const ensureFreshSession = () => sessionManager.ensureFreshSession();
// Lightweight, non-destructive recovery for the "session may have refreshed"
// banner's Refresh button: cycle the connection pool and refresh the token in
// place — NO page reload, so in-progress form data is preserved.
export const softRecoverSession = async (): Promise<void> => {
  await healConnectionPoolNow();
  await refreshSessionDeduped();
};
export const isUserIdle = () => sessionManager.isUserIdle();
export const getLastActivity = () => sessionManager.getLastActivity();
