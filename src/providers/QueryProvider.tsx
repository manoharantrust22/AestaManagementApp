"use client";

import { QueryClient, QueryCache, keepPreviousData } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, useEffect, useRef } from "react";
import { createIDBPersister } from "@/lib/cache/persistor";
import { shouldPersistQuery } from "@/lib/cache/keys";
import { initBackgroundSync, stopBackgroundSync } from "@/lib/cache/sync";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useTab } from "@/providers/TabProvider";
import { SessionExpiredError } from "@/lib/supabase/client";
import {
  refreshSessionDeduped,
  setSessionManagerQueryClient,
} from "@/lib/auth/sessionManager";
import { isAbortOrTimeoutError } from "@/lib/utils/timeout";

/**
 * Checks if an error is a session/auth related error that should redirect to login.
 * Be precise - only catch actual auth failures, not network timeouts or generic errors.
 */
function isSessionError(error: unknown): boolean {
  if (error instanceof SessionExpiredError) {
    return true;
  }

  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    // Check for Supabase auth error codes and HTTP status codes
    if (err.code === "PGRST301" || err.status === 401 || err.status === 403) {
      return true;
    }
    // Be more specific about auth-related error messages
    // Avoid matching generic "session" or "token" strings which may appear in other contexts
    const message = String(err.message || "").toLowerCase();
    if (
      message.includes("jwt expired") ||
      message.includes("invalid jwt") ||
      message.includes("not authenticated") ||
      message.includes("session expired") ||
      message.includes("invalid refresh token") ||
      message.includes("refresh token not found")
    ) {
      return true;
    }
    // Supabase Auth's /auth/v1/token endpoint returns 400 (not 401) when the
    // refresh token has been rotated or used. Without recognizing this, the app
    // gets stuck after long idle periods because retry handlers blanket-skip 400.
    if (err.status === 400) {
      const code = String(
        (err as { code?: unknown; error?: unknown }).code ||
          (err as { error?: unknown }).error ||
          ""
      ).toLowerCase();
      if (
        code === "invalid_grant" ||
        message.includes("invalid grant") ||
        message.includes("invalid_grant") ||
        message.includes("already been used") ||
        message.includes("already used")
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Redirects to login page with session expired flag.
 */
function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.href = "/login?session_expired=true";
  }
}

/**
 * Detects errors thrown by the wrapQueryFn timeout race — message shape is
 * "<operationName> timed out after <ms>ms" (or the bare "Query timed out
 * after <ms>ms" when no operationName was supplied).
 */
function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "");
  return /timed out after \d+ms/i.test(message);
}

// Module-level debounce for the timeout-recovery path. When a Cloudflare-proxy
// stall fires one timeout, several other in-flight queries on the same page
// will also time out within a few seconds — but they all share the same dead
// connection-pool root cause, so we only want ONE recovery to run for that
// burst. 10s window is long enough to coalesce a burst, short enough to not
// suppress a genuinely separate stall later in the session.
let _lastTimeoutRecoveryAt = 0;
const TIMEOUT_RECOVERY_DEBOUNCE_MS = 10_000;

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => {
    // Late-binding ref so QueryCache.onError can reference the QueryClient
    const clientRef: { current: QueryClient | null } = { current: null };

    // Global query error handler: catches auth errors from ANY query,
    // refreshes the session, and retries the specific failed query. Also
    // catches wrapQueryFn timeouts and runs a connection-pool recovery so a
    // stuck tab self-heals on the first timeout instead of needing the user
    // to hard-refresh the browser. TanStack Query v5 replacement for
    // defaultOptions.queries.onError.
    const queryCache = new QueryCache({
      onError: async (error: any, query) => {
        if (isSessionError(error)) {
          console.warn(
            "[QueryCache] Auth error on query:",
            JSON.stringify(query.queryKey).substring(0, 100),
            "- attempting session refresh"
          );

          // Single deduped refresh shared with SessionManager + every other handler.
          // Concurrent calls return the same in-flight promise, preventing the
          // refresh-token-rotation race that surfaces as 400 invalid_grant.
          const refreshed = await refreshSessionDeduped();

          if (!refreshed) {
            // Hard failure (invalid_grant / expired refresh token). Redirect.
            redirectToLogin();
            return;
          }

          if (refreshed && clientRef.current) {
            // Re-trigger just this failed query after token is ready
            setTimeout(() => {
              clientRef.current!.invalidateQueries({
                queryKey: query.queryKey,
                refetchType: "active",
              });
            }, 500);
          }
          return;
        }

        // Timeout-error path. Why this exists:
        //   The Cloudflare proxy + browser per-host connection-pool can land
        //   in a state where 6 sockets to aestabuilders.workers.dev are all
        //   in CLOSE_WAIT / half-open after a network hiccup. New REST/RPC
        //   queries queue behind those dead sockets and time out at 30s
        //   (wrapQueryFn). Hard refresh tears down the pool — that's why
        //   "browser refresh fixes it" was the only known recovery. This
        //   handler reproduces that recovery in-place: cancel the in-flight
        //   queries (so the dead sockets are released), then invalidate the
        //   active queries so RQ kicks off fresh fetches that open NEW
        //   sockets. Debounced so a burst of simultaneous timeouts on the
        //   same dashboard only runs recovery once.
        if (isTimeoutError(error) && clientRef.current) {
          const now = Date.now();
          if (now - _lastTimeoutRecoveryAt < TIMEOUT_RECOVERY_DEBOUNCE_MS) {
            return;
          }
          _lastTimeoutRecoveryAt = now;

          console.warn(
            "[QueryCache] Query timeout detected on",
            JSON.stringify(query.queryKey).substring(0, 100),
            "— triggering connection-pool recovery"
          );

          try {
            await clientRef.current.cancelQueries();
          } catch (err) {
            console.warn("[QueryCache] cancelQueries threw during recovery:", err);
          }
          // Small delay so cancellation propagates before refetch fires.
          setTimeout(() => {
            clientRef.current?.invalidateQueries({ refetchType: "active" });
          }, 500);
        }
      },
    });

    const client = new QueryClient({
      queryCache,
      defaultOptions: {
        queries: {
          // Global default staleTime — the floor for "how long is cached data fresh
          // enough that a refetch on mount is unnecessary". Hooks may raise this
          // (longer is fine) but should rarely lower it. 60s is the sweet spot:
          // long enough to avoid skeleton-flash on every navigation, short enough
          // that returning to a page after a quick detour shows current data.
          staleTime: 60 * 1000,
          gcTime: 30 * 60 * 1000, // 30 minutes - cache garbage collection
          // Show the previous query's data while a refetch is in-flight, instead of
          // wiping it back to undefined and forcing the consumer to render skeletons.
          // Per-hook overrides (e.g. paginated hooks already importing keepPreviousData)
          // continue to work normally.
          placeholderData: keepPreviousData,
          retry: (failureCount, error: any) => {
            // 400 from /auth/v1/token is a session error — let the auth-retry
            // path below handle it. Other 400s are genuine programming errors.
            if (error?.status === 400 || error?.message?.includes("400")) {
              if (!isSessionError(error)) {
                console.error(
                  "[QueryClient] 400 Bad Request - not retrying:",
                  error
                );
                return false;
              }
            }
            // Allow ONE retry on 401/403 (or 400 invalid_grant) - session may
            // have been refreshed by SessionManager's idle-recovery or
            // QueryCache.onError handler. If retry also fails, QueryCache.onError
            // handles the final attempt.
            if (
              error?.status === 401 ||
              error?.status === 403 ||
              (error?.status === 400 && isSessionError(error))
            ) {
              if (failureCount < 1) {
                console.warn(
                  "[QueryClient] Auth error - will retry once after delay"
                );
                return true;
              }
              return false;
            }
            return failureCount < 3;
          },
          retryDelay: (attemptIndex, error: any) => {
            // For auth errors, use a longer delay to allow session refresh to complete
            if (
              error?.status === 401 ||
              error?.status === 403 ||
              (error?.status === 400 && isSessionError(error))
            ) {
              return 2000; // 2 seconds - enough time for token refresh
            }
            return Math.min(1000 * 2 ** attemptIndex, 30000); // Exponential backoff
          },
          // Smart window focus refetch: only refetch when truly stale.
          // Uses 5min as the focus threshold even though staleTime is 60s — focus
          // refetch is more disruptive than mount refetch, so we tolerate slightly
          // older data on tab return. Mount refetch handles the 60s case quietly
          // via placeholderData.
          refetchOnWindowFocus: (query) => {
            const age = Date.now() - (query.state.dataUpdatedAt || 0);
            const focusRefetchThreshold = 5 * 60 * 1000; // 5 minutes
            return age > focusRefetchThreshold;
          },
          refetchOnReconnect: true, // Refetch when network reconnects
          refetchOnMount: true, // Refetch if data is stale
          // "always" mode - queries execute regardless of navigator.onLine status.
          // Previous "online" mode caused queries to silently pause after browser sleep/idle
          // when navigator.onLine transiently returned false. Site-switching stale data
          // prevention is handled by SyncInitializer's cache clearing logic below.
          networkMode: "always",
        },
        mutations: {
          retry: (failureCount, error: any) => {
            // Don't retry on timeouts/aborts. The user already waited the
            // full 25s (timeoutFetch) or wrapMutationFn ceiling once —
            // retrying just makes them wait again on the same poisoned
            // socket pool. Surface the timeout error to the dialog so the
            // user can decide whether to retry manually. The connection-
            // pool recovery handler still runs for the next attempt.
            if (isAbortOrTimeoutError(error)) {
              console.warn(
                "[QueryClient] Mutation timed out/aborted — not retrying",
              );
              return false;
            }
            const status = error?.status || error?.code;
            // Don't retry on client errors that won't succeed on retry
            // 400 = Bad Request (invalid data)
            // 409 = Conflict (unique constraint violation, already exists)
            // 422 = Validation error
            if (status === 400 || status === 409 || status === 422) {
              // Session-error 400s (e.g. /auth/v1/token invalid_grant) fall
              // through to the 401/403 retry path below.
              if (status === 400 && isSessionError(error)) {
                // fall through
              } else {
                console.warn(
                  `[QueryClient] Mutation failed with ${status} - not retrying`
                );
                return false;
              }
            }
            // Allow ONE retry on 401/403 (or 400 invalid_grant) - session may
            // have been refreshed by SessionManager or QueryCache.onError handler
            // during the delay. Matches the query retry behavior above.
            if (
              status === 401 ||
              status === 403 ||
              (status === 400 && isSessionError(error))
            ) {
              if (failureCount < 1) {
                console.warn(
                  "[QueryClient] Mutation auth error - will retry once after session refresh"
                );
                return true;
              }
              return false;
            }
            // Retry server errors (5xx) and network errors once
            return failureCount < 1;
          },
          retryDelay: (attemptIndex, error: any) => {
            const status = error?.status || error?.code;
            // For auth errors, wait longer to allow session refresh to complete
            if (
              status === 401 ||
              status === 403 ||
              (status === 400 && isSessionError(error))
            ) {
              return 2500; // 2.5 seconds - enough for token refresh
            }
            return 1000;
          },
          networkMode: "always",
          onError: async (error) => {
            // Mutation timeout: same pool-recovery dance as the query side
            // (cancel in-flight + invalidate active), so the user's NEXT
            // attempt opens fresh sockets instead of queuing behind the
            // dead ones that just timed out. Debounced via the same
            // _lastTimeoutRecoveryAt window as query timeouts so a burst
            // of mutation+query timeouts only runs recovery once.
            if (isAbortOrTimeoutError(error) && clientRef.current) {
              const now = Date.now();
              if (now - _lastTimeoutRecoveryAt >= TIMEOUT_RECOVERY_DEBOUNCE_MS) {
                _lastTimeoutRecoveryAt = now;
                console.warn(
                  "[QueryClient] Mutation timeout — triggering connection-pool recovery",
                );
                try {
                  await clientRef.current.cancelQueries();
                } catch (err) {
                  console.warn(
                    "[QueryClient] cancelQueries threw during mutation-timeout recovery:",
                    err,
                  );
                }
                setTimeout(() => {
                  clientRef.current?.invalidateQueries({ refetchType: "active" });
                }, 500);
              }
              return;
            }

            if (!isSessionError(error)) return;

            // Single deduped refresh — shared with QueryCache.onError, SessionManager,
            // and NetworkRecoveryHandler. Eliminates the concurrent-refresh race that
            // produces 400 invalid_grant from /auth/v1/token.
            const refreshed = await refreshSessionDeduped();
            if (!refreshed) {
              console.warn(
                "[QueryClient] Session refresh failed after mutation error - redirecting to login"
              );
              redirectToLogin();
            }
          },
        },
      },
    });

    clientRef.current = client;
    return client;
  });

  const [persister] = useState(() => createIDBPersister());

  // Hand the QueryClient to SessionManager so its visibility-wake recovery can
  // cancelQueries() before the deduped refresh, preventing zombie fetches with
  // stale tokens from racing the refresh.
  useEffect(() => {
    setSessionManagerQueryClient(queryClient);
  }, [queryClient]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours max age for persisted data
        buster: "v3", // Bumped after Cloudflare proxy migration to invalidate old cache
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return shouldPersistQuery(query.queryKey);
          },
        },
      }}
      onSuccess={() => {
        // After cache restoration, only invalidate queries that are well past their
        // useful lifetime. The previous 5-min threshold caused every restored page
        // older than 5 minutes to flip back to skeletons while the slow Cloudflare
        // proxy refetched — defeating the purpose of having IDB persistence.
        // 15min is generous enough that cached data is still meaningful, while
        // older data still gets refreshed. Normal staleTime + refetchOnMount handle
        // the 60s-15min window quietly (placeholderData keeps the UI populated).
        const restoreInvalidateThreshold = 15 * 60 * 1000;
        queryClient.invalidateQueries({
          predicate: (query) => {
            const age = Date.now() - (query.state.dataUpdatedAt || 0);
            return (
              query.state.data !== undefined && age > restoreInvalidateThreshold
            );
          },
          refetchType: "active",
        });
      }}
    >
      <SyncInitializer queryClient={queryClient} />
      <IdleRecoveryHandler queryClient={queryClient} />
      <NetworkRecoveryHandler queryClient={queryClient} />
      {children}
    </PersistQueryClientProvider>
  );
}

/**
 * Queries that should be preserved across site changes
 * (user profile, auth, sites list, etc.)
 */
const PRESERVED_QUERY_PREFIXES = [
  "user",
  "auth",
  "sites",
  "profile",
  "notifications",
];

/**
 * Component to initialize background sync
 * Separated to access SiteContext and TabProvider
 * Waits for tab coordination to be ready before initializing
 */
function SyncInitializer({ queryClient }: { queryClient: QueryClient }) {
  const { selectedSite } = useSelectedSite();
  const { isReady: isTabReady, isLeader } = useTab();
  const previousSiteIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Wait for tab coordination to be ready
    if (!isTabReady) {
      return;
    }

    const currentSiteId = selectedSite?.id;
    const previousSiteId = previousSiteIdRef.current;

    // On site switch, mark site-specific queries stale instead of evicting them.
    // Eviction (removeQueries + resetQueries) caused returning to a previously-
    // visited site to show skeletons everywhere because the cache was wiped, even
    // though IDB still held the data. With invalidateQueries({ refetchType: "none" })
    // the next visit to Site A finds its cached data, renders instantly, and
    // refetches in the background via the normal refetchOnMount path.
    if (currentSiteId && previousSiteId && previousSiteId !== currentSiteId) {
      console.log(
        `Site changed from ${previousSiteId} to ${currentSiteId}, marking site-specific queries stale`
      );

      // Cancel in-flight queries from the old site so they don't land into the new
      // site's view with stale-site data. Scoped to fetchStatus:'fetching' so
      // new-site queries that are still pending are not cancelled.
      queryClient.cancelQueries({ fetchStatus: "fetching" });

      const isSiteSpecific = (queryKey: readonly unknown[]) => {
        if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
        const firstKey = String(queryKey[0]);
        return !PRESERVED_QUERY_PREFIXES.some((prefix) =>
          firstKey.startsWith(prefix)
        );
      };

      queryClient.invalidateQueries({
        predicate: (query) => isSiteSpecific(query.queryKey),
        refetchType: "none",
      });
    }

    // Update the ref for next comparison
    previousSiteIdRef.current = currentSiteId;

    // Initialize/re-initialize background sync for current site
    // The sync module will handle leader/follower behavior internally
    initBackgroundSync(queryClient, currentSiteId);

    console.log(
      `[SyncInitializer] Initialized - isLeader: ${isLeader}, siteId: ${currentSiteId}`
    );

    // Cleanup on unmount
    return () => {
      stopBackgroundSync();
    };
  }, [queryClient, selectedSite?.id, isTabReady, isLeader]);

  return null;
}

/**
 * Listens for session restoration after idle periods.
 * When SessionManager detects wake-from-idle and successfully refreshes the token,
 * it dispatches a "session-restored-after-idle" event. This component catches it
 * and invalidates all active queries so they refetch with the fresh token.
 */
function IdleRecoveryHandler({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    const handleSessionRestored = () => {
      console.log(
        "[IdleRecoveryHandler] Session restored after idle - invalidating active queries"
      );
      // Delay to ensure the refreshed JWT has propagated to the Supabase client singleton
      setTimeout(() => {
        queryClient.invalidateQueries({
          refetchType: "active", // Only refetch queries currently being observed by components
        });
      }, 1000);
    };

    window.addEventListener(
      "session-restored-after-idle",
      handleSessionRestored
    );

    return () => {
      window.removeEventListener(
        "session-restored-after-idle",
        handleSessionRestored
      );
    };
  }, [queryClient]);

  return null;
}

// RouteChangeHandler REMOVED - was causing refetch cascade on every navigation
// React Query's built-in staleTime handles data freshness automatically

/**
 * Recovers the supabase client + React Query state after the network changes
 * underneath us (Wi-Fi swap, VPN toggle, mobile→Wi-Fi handover, BFCache restore,
 * laptop wake on a different network). The browser surfaces these as
 * `net::ERR_NETWORK_CHANGED` on in-flight requests; the supabase auth-refresh
 * promise can hang mid-flight, the realtime WebSocket dies, and subsequent
 * postgrest queries stall behind a poisoned connection pool. Hard refresh is
 * the user's only recovery today — this handler reproduces that recovery in-place.
 *
 * Why React Query's `refetchOnReconnect` isn't enough:
 * - It only fires on `online` events, which depend on `navigator.onLine` flipping.
 * - On Wi-Fi-to-Wi-Fi or VPN-on/off, `onLine` stays true the whole time.
 *
 * Recovery sequence:
 *  1. cancelQueries — drop zombie fetches waiting on dead sockets.
 *  2. supabase.auth.refreshSession with a 5s race — replaces a possibly-hung
 *     refresh promise; on timeout we still proceed to step 3 and let the
 *     QueryCache.onError 401-retry path handle re-auth.
 *  3. invalidateQueries({ refetchType: "active" }) — refetch visible data
 *     with whatever auth state we have now.
 *
 * Listeners:
 * - window "online" — covers true offline→online transitions.
 * - navigator.connection "change" filtered by effectiveType — catches network
 *   swaps where onLine stays true. We ignore rtt/downlink jitter to avoid
 *   thrashing on flaky mobile networks.
 * - window "pageshow" with persisted=true — BFCache restoration.
 *
 * 3-second debounce coalesces rapid event bursts (network change can fire
 * multiple events in close succession).
 */
function NetworkRecoveryHandler({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastRecoveryAt = 0;
    let lastEffectiveType: string | undefined;
    const RECOVERY_DEBOUNCE_MS = 3000;
    const REFRESH_RACE_MS = 5000;

    const recover = async (reason: string) => {
      const now = Date.now();
      if (now - lastRecoveryAt < RECOVERY_DEBOUNCE_MS) return;
      lastRecoveryAt = now;

      console.warn(`[NetworkRecovery] Recovering due to: ${reason}`);

      try {
        await queryClient.cancelQueries();
      } catch (err) {
        console.warn("[NetworkRecovery] cancelQueries threw:", err);
      }

      try {
        await Promise.race([
          refreshSessionDeduped(),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), REFRESH_RACE_MS),
          ),
        ]);
      } catch (err) {
        console.warn("[NetworkRecovery] refreshSession threw:", err);
      }

      queryClient.invalidateQueries({ refetchType: "active" });
    };

    const handleOnline = () => {
      void recover("online event");
    };

    type NetworkInformation = {
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
      effectiveType?: string;
    };
    const connection = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;
    lastEffectiveType = connection?.effectiveType;

    const handleConnectionChange = () => {
      const newType = connection?.effectiveType;
      // Only recover on actual connection-type change (4g→wifi, wifi→3g),
      // not on every rtt/downlink jitter while on the same network.
      if (lastEffectiveType !== undefined && lastEffectiveType !== newType) {
        void recover(
          `connection change ${lastEffectiveType} → ${newType ?? "unknown"}`,
        );
      }
      lastEffectiveType = newType;
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void recover("BFCache restore");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("pageshow", handlePageShow);
    connection?.addEventListener?.("change", handleConnectionChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pageshow", handlePageShow);
      connection?.removeEventListener?.("change", handleConnectionChange);
    };
  }, [queryClient]);

  return null;
}
