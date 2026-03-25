"use client";

import { QueryClient, QueryCache } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, useEffect, useRef } from "react";
import { createIDBPersister } from "@/lib/cache/persistor";
import { shouldPersistQuery } from "@/lib/cache/keys";
import { initBackgroundSync, stopBackgroundSync } from "@/lib/cache/sync";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useTab } from "@/providers/TabProvider";
import { SessionExpiredError, createClient } from "@/lib/supabase/client";

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

// Module-level dedup flag for token refresh from QueryCache.onError
let _isRefreshingToken = false;
let _refreshTokenPromise: Promise<boolean> | null = null;

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => {
    // Late-binding ref so QueryCache.onError can reference the QueryClient
    const clientRef: { current: QueryClient | null } = { current: null };

    // Global query error handler: catches auth errors from ANY query,
    // refreshes the session, and retries the specific failed query.
    // This is the TanStack Query v5 replacement for defaultOptions.queries.onError.
    const queryCache = new QueryCache({
      onError: async (error: any, query) => {
        if (!isSessionError(error)) return;

        console.warn(
          "[QueryCache] Auth error on query:",
          JSON.stringify(query.queryKey).substring(0, 100),
          "- attempting session refresh"
        );

        // Deduplicate: if a refresh is already in progress, wait for it
        if (!_isRefreshingToken) {
          _isRefreshingToken = true;
          _refreshTokenPromise = (async () => {
            try {
              const supabase = createClient();
              const { error: refreshError } =
                await supabase.auth.refreshSession();
              if (refreshError) {
                console.error(
                  "[QueryCache] Session refresh failed:",
                  refreshError
                );
                // Permanent failure - redirect to login
                const msg = refreshError.message?.toLowerCase() || "";
                if (
                  msg.includes("invalid refresh token") ||
                  msg.includes("refresh token not found") ||
                  msg.includes("expired")
                ) {
                  redirectToLogin();
                }
                return false;
              }
              console.log(
                "[QueryCache] Session refreshed successfully after query auth error"
              );
              return true;
            } catch (err) {
              console.error("[QueryCache] Session refresh threw:", err);
              return false;
            } finally {
              _isRefreshingToken = false;
              _refreshTokenPromise = null;
            }
          })();
        }

        const refreshed = await _refreshTokenPromise;

        if (refreshed && clientRef.current) {
          // Re-trigger just this failed query after token is ready
          setTimeout(() => {
            clientRef.current!.invalidateQueries({
              queryKey: query.queryKey,
              refetchType: "active",
            });
          }, 500);
        }
      },
    });

    const client = new QueryClient({
      queryCache,
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh (increased to reduce refetches)
          gcTime: 30 * 60 * 1000, // 30 minutes - cache garbage collection
          retry: (failureCount, error: any) => {
            // Don't retry on 400 Bad Request - these are programming errors
            if (error?.status === 400 || error?.message?.includes("400")) {
              console.error(
                "[QueryClient] 400 Bad Request - not retrying:",
                error
              );
              return false;
            }
            // Allow ONE retry on 401/403 - session may have been refreshed
            // by SessionManager's idle-recovery or QueryCache.onError handler.
            // If retry also fails, QueryCache.onError handles the final attempt.
            if (error?.status === 401 || error?.status === 403) {
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
            if (error?.status === 401 || error?.status === 403) {
              return 2000; // 2 seconds - enough time for token refresh
            }
            return Math.min(1000 * 2 ** attemptIndex, 30000); // Exponential backoff
          },
          // Smart window focus refetch: only refetch if data is older than default staleTime
          // This prevents refetch cascade on tab focus while still refreshing stale data
          refetchOnWindowFocus: (query) => {
            const age = Date.now() - (query.state.dataUpdatedAt || 0);
            const defaultStaleTime = 5 * 60 * 1000; // 5 minutes
            return age > defaultStaleTime;
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
            const status = error?.status || error?.code;
            // Don't retry on client errors that won't succeed on retry
            // 400 = Bad Request (invalid data)
            // 409 = Conflict (unique constraint violation, already exists)
            // 422 = Validation error
            if (status === 400 || status === 409 || status === 422) {
              console.warn(
                `[QueryClient] Mutation failed with ${status} - not retrying`
              );
              return false;
            }
            // Allow ONE retry on 401/403 - session may have been refreshed
            // by SessionManager or QueryCache.onError handler during the delay.
            // This matches the query retry behavior (lines 148-158 above).
            if (status === 401 || status === 403) {
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
            if (status === 401 || status === 403) {
              return 2500; // 2.5 seconds - enough for token refresh
            }
            return 1000;
          },
          networkMode: "always",
          onError: async (error) => {
            if (!isSessionError(error)) return;

            // Try to refresh session first before redirecting
            // This gives the retry mechanism a fresh token to work with
            if (!_isRefreshingToken) {
              _isRefreshingToken = true;
              _refreshTokenPromise = (async () => {
                try {
                  const supabase = createClient();
                  const { error: refreshError } =
                    await supabase.auth.refreshSession();
                  if (refreshError) {
                    console.error(
                      "[QueryClient] Mutation session refresh failed:",
                      refreshError
                    );
                    const msg = refreshError.message?.toLowerCase() || "";
                    if (
                      msg.includes("invalid refresh token") ||
                      msg.includes("refresh token not found") ||
                      msg.includes("expired")
                    ) {
                      redirectToLogin();
                    }
                    return false;
                  }
                  console.log(
                    "[QueryClient] Session refreshed after mutation auth error"
                  );
                  return true;
                } catch (err) {
                  console.error("[QueryClient] Session refresh threw:", err);
                  return false;
                } finally {
                  _isRefreshingToken = false;
                  _refreshTokenPromise = null;
                }
              })();
            }

            const refreshed = await _refreshTokenPromise;
            if (!refreshed) {
              // Only redirect if refresh completely failed
              // (retry mechanism will use the refreshed token if available)
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

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours max age for persisted data
        buster: "v2", // Change this to invalidate all persisted cache
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return shouldPersistQuery(query.queryKey);
          },
        },
      }}
      onSuccess={() => {
        // After cache restoration, invalidate queries that are past the default staleTime
        // This ensures stale data gets refreshed while still showing cached data immediately
        const defaultStaleTime = 5 * 60 * 1000; // 5 minutes
        queryClient.invalidateQueries({
          predicate: (query) => {
            const age = Date.now() - (query.state.dataUpdatedAt || 0);
            // Only invalidate if data exists and is stale
            return query.state.data !== undefined && age > defaultStaleTime;
          },
          refetchType: "active", // Only refetch queries currently being observed
        });
      }}
    >
      <SyncInitializer queryClient={queryClient} />
      <IdleRecoveryHandler queryClient={queryClient} />
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

    // Clear old site's cached queries when switching between sites
    // Only clear when switching from one valid site to another (not on initial load)
    // This prevents stale data from appearing when navigating between sites
    if (currentSiteId && previousSiteId && previousSiteId !== currentSiteId) {
      console.log(
        `Site changed from ${previousSiteId} to ${currentSiteId}, clearing site-specific cache`
      );

      // Cancel any in-flight queries first
      queryClient.cancelQueries();

      // Remove all queries EXCEPT preserved ones (user, auth, sites, etc.)
      queryClient.removeQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          if (!Array.isArray(queryKey) || queryKey.length === 0) {
            return false; // Don't remove malformed keys
          }

          const firstKey = String(queryKey[0]);

          // Keep preserved queries (user profile, auth, sites list)
          if (
            PRESERVED_QUERY_PREFIXES.some((prefix) =>
              firstKey.startsWith(prefix)
            )
          ) {
            return false;
          }

          // Remove all other queries (they are site-specific)
          return true;
        },
      });

      // Reset query cache state for removed queries to ensure fresh fetches
      queryClient.resetQueries({
        predicate: (query) => {
          const queryKey = query.queryKey;
          if (!Array.isArray(queryKey) || queryKey.length === 0) {
            return false;
          }
          const firstKey = String(queryKey[0]);
          return !PRESERVED_QUERY_PREFIXES.some((prefix) =>
            firstKey.startsWith(prefix)
          );
        },
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
