"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { Snackbar, Alert, Button } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

/**
 * Global listener for session-related errors.
 * Handles cases where RSC requests fail due to session expiry (401 responses).
 * Shows a visible banner when session needs refresh, instead of silently failing.
 */
export function SessionErrorHandler({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);

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
      const errorMsg = event.detail.error || "";
      if (
        errorMsg.includes("expired") ||
        errorMsg.includes("invalid") ||
        errorMsg.includes("Invalid Refresh Token")
      ) {
        handleSessionExpired();
      } else {
        // Show warning banner for non-permanent failures (network issues, slow refresh)
        setSessionWarning(
          "Session refresh failed. Your changes may not save. Click refresh if issues persist."
        );
      }
    };

    // Listen for post-idle session timeout (from ensureFreshSession)
    const handleSessionTimeout = () => {
      setSessionWarning(
        "Your session may have expired after being idle. Please refresh if you experience issues."
      );
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
    window.addEventListener(
      "session-check-timeout",
      handleSessionTimeout as EventListener
    );

    return () => {
      window.removeEventListener(
        "session-refresh-failed",
        handleSessionRefreshFailed as EventListener
      );
      window.removeEventListener(
        "session-check-timeout",
        handleSessionTimeout as EventListener
      );
      if (originalFetch) {
        window.fetch = originalFetch;
        fetchWrappedRef.current = false;
      }
    };
  }, [handleSessionExpired]);

  return (
    <>
      {children}
      <Snackbar
        open={!!sessionWarning}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        onClose={() => setSessionWarning(null)}
      >
        <Alert
          severity="warning"
          variant="filled"
          onClose={() => setSessionWarning(null)}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          }
          sx={{ width: "100%", maxWidth: 500 }}
        >
          {sessionWarning}
        </Alert>
      </Snackbar>
    </>
  );
}
