"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * Global listener for session-related errors.
 * Handles cases where RSC requests fail due to session expiry (401 responses).
 * Works in conjunction with middleware that returns 401 for RSC requests.
 */
export function SessionErrorHandler({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use window.location.pathname at call time instead of closing over
  // usePathname(), so this callback is stable and doesn't cause the
  // useEffect to re-run on every navigation.
  const handleSessionExpired = useCallback(() => {
    if (window.location.pathname === "/login") {
      return;
    }
    console.warn("[SessionErrorHandler] Session expired - redirecting to login");
    window.location.href = "/login?session_expired=true";
  }, []);

  // Use a ref to ensure we only install the fetch wrapper once
  const fetchWrappedRef = useRef(false);

  useEffect(() => {
    const handleSessionRefreshFailed = (
      event: CustomEvent<{ error: string }>
    ) => {
      console.warn(
        "[SessionErrorHandler] Session refresh failed:",
        event.detail.error
      );
      if (
        event.detail.error?.includes("expired") ||
        event.detail.error?.includes("invalid") ||
        event.detail.error?.includes("Invalid Refresh Token")
      ) {
        handleSessionExpired();
      }
    };

    // Only install the fetch wrapper once to prevent wrapper chaining
    let originalFetch: typeof window.fetch | null = null;
    if (!fetchWrappedRef.current) {
      fetchWrappedRef.current = true;
      originalFetch = window.fetch;
      window.fetch = async (...args) => {
        // Skip interception for Next.js internal requests — these are
        // static chunks, HMR updates, etc. that should never be intercepted.
        const url =
          typeof args[0] === "string"
            ? args[0]
            : (args[0] as Request)?.url || "";
        if (url.includes("/_next/") || url.includes("/api/auth/")) {
          return originalFetch!(...args);
        }

        try {
          const response = await originalFetch!(...args);

          if (
            response.status === 401 &&
            response.headers.get("X-Session-Expired") === "true"
          ) {
            handleSessionExpired();
          }

          return response;
        } catch (error) {
          throw error;
        }
      };
    }

    window.addEventListener(
      "session-refresh-failed",
      handleSessionRefreshFailed as EventListener
    );

    return () => {
      window.removeEventListener(
        "session-refresh-failed",
        handleSessionRefreshFailed as EventListener
      );
      if (originalFetch) {
        window.fetch = originalFetch;
        fetchWrappedRef.current = false;
      }
    };
  }, [handleSessionExpired]);

  return <>{children}</>;
}
