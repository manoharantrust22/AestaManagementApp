"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";

export default function DevLoginPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState("Checking session...");
  const [error, setError] = useState("");

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true") {
      setError("Dev login is not available in production.");
      return;
    }

    if (authLoading) return;

    if (user) {
      setStatus("Already authenticated. Redirecting...");
      router.push("/site/dashboard");
      return;
    }

    let cancelled = false;

    async function autoLogin() {
      try {
        // The API route reads the dev account from server env, sets its
        // password via the admin SDK and signs in on the server, returning
        // the session as cookies. No credentials live in this bundle.
        setStatus("Signing in...");
        const res = await fetch("/api/dev-ensure-password", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to prepare dev session");
        }

        if (!cancelled) {
          setStatus("Authenticated! Redirecting...");
          // Full navigation so AuthContext boots from the new cookies.
          window.location.href = "/site/dashboard";
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Auto-login failed");
        }
      }
    }

    autoLogin();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      {error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <>
          <CircularProgress size={32} />
          <Typography color="text.secondary">{status}</Typography>
        </>
      )}
    </Box>
  );
}
