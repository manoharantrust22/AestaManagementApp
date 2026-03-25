import { createClient } from "@/lib/supabase/client";

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
const SESSION_CHECK_TIMEOUT_POST_IDLE = 8000; // 8 seconds - longer after idle for slow mobile networks

type SessionManagerState = {
  isInitialized: boolean;
  lastActivity: number;
  lastSessionCheckTime: number;
  needsRefreshOnNextMutation: boolean; // Set on idle wake, cleared after refresh
  // refreshTimer: ReturnType<typeof setInterval> | null; // REMOVED
  proactiveRefreshTimer: ReturnType<typeof setInterval> | null;
  activityTimer: ReturnType<typeof setTimeout> | null;
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
  };

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
   * Manually refresh session
   * Returns true if successful, false otherwise
   */
  async refreshSession(): Promise<boolean> {
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
        // Dispatch event so UI can show warning
        this.dispatchRefreshFailedEvent(error.message);
        return false;
      }

      console.log("[SessionManager] Session refreshed successfully");
      return true;
    } catch (err) {
      console.error("[SessionManager] Refresh error:", err);
      return false;
    }
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
      console.log("[SessionManager] Performing post-idle session refresh");
      // Clear the flag immediately to prevent duplicate refreshes from concurrent mutations
      this.state.needsRefreshOnNextMutation = false;
    }

    const sessionCheckPromise = async (): Promise<void> => {
      const supabase = createClient();

      // After idle wake: force a full token refresh (not just cached getSession)
      if (needsRefresh) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error("[SessionManager] Post-idle refresh failed:", refreshError);
          throw new Error("Session expired. Please log in again.");
        }
        console.log("[SessionManager] Post-idle session refresh successful");
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
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.error("[SessionManager] Session refresh failed:", refreshError);
            throw new Error("Session expired. Please log in again.");
          }
          console.log("[SessionManager] Session refreshed before mutation");
        }
      }

      // Mark successful check
      this.state.lastSessionCheckTime = Date.now();
    };

    // Timeout behavior depends on context:
    // - Normal check: resolve (let mutation proceed, Supabase 401 triggers retry)
    // - Post-idle check: reject (token is definitely stale, fail fast with clear error)
    const timeoutPromise = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (needsRefresh) {
          // Post-idle: token is likely expired, don't let mutation proceed with stale token
          console.warn(`[SessionManager] Post-idle session refresh timed out (${timeout / 1000}s) - session may be expired`);
          // Notify UI so user sees a warning banner
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("session-check-timeout"));
          }
          reject(new Error("Session refresh timed out. Please try again."));
        } else {
          // Normal: proceed anyway, mutation retry will handle 401 if needed
          console.warn(`[SessionManager] ensureFreshSession check slow (${timeout / 1000}s) - proceeding anyway`);
          this.state.lastSessionCheckTime = Date.now();
          resolve();
        }
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
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            console.error("[SessionManager] Proactive refresh failed:", error);
            this.dispatchRefreshFailedEvent(error.message);
          } else {
            console.log("[SessionManager] Proactive refresh successful");
          }
        }
      }
    } catch (err) {
      console.error("[SessionManager] Proactive refresh error:", err);
    }
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

      // Instead of refreshing immediately (which causes race conditions with ensureFreshSession),
      // just set a flag. The next ensureFreshSession call will handle the refresh.
      if (wasIdle) {
        console.log("[SessionManager] Activity detected after idle - flagging for refresh on next mutation");
        this.state.needsRefreshOnNextMutation = true;
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
export const ensureFreshSession = () => sessionManager.ensureFreshSession();
export const isUserIdle = () => sessionManager.isUserIdle();
export const getLastActivity = () => sessionManager.getLastActivity();
