"use client";

import { useState, useEffect, useCallback } from "react";
import {
  IconButton,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import { manualRefresh, getLastSyncTime } from "@/lib/cache/sync";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type RefreshState = "idle" | "loading" | "success" | "error";

export default function ManualRefreshButton() {
  const [state, setState] = useState<RefreshState>("idle");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const queryClient = useQueryClient();

  // Update last sync timestamp
  useEffect(() => {
    const updateTimestamp = () => {
      const timestamp = getLastSyncTime();
      setLastSync(timestamp);
    };

    // Initial update
    updateTimestamp();

    // Update every 10 seconds to keep "X seconds ago" fresh
    const interval = setInterval(updateTimestamp, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (state === "loading") return;

    setState("loading");

    try {
      // Primary: refetch every query that is actually mounted on the current
      // page. This is what a "refresh" should do — reload whatever the user is
      // looking at. The old behaviour only re-validated a hardcoded set of
      // queries (sites/dashboard/reference), so on most pages tapping refresh
      // did nothing visible.
      await queryClient.refetchQueries({ type: "active" });

      // Best-effort: also nudge the background sync orchestrator so it can
      // broadcast cache invalidation to other tabs and refresh its
      // reference/dashboard tiers. This MUST never surface its
      // "Sync orchestrator not initialized" throw to the user — that fires on
      // follower tabs and before the app finishes loading, and the active
      // refetch above has already covered the visible page.
      try {
        await manualRefresh();
      } catch {
        /* orchestrator not ready (follower tab / still loading) — ignore */
      }

      setState("success");
      const now = Date.now();
      setLastSync(now);
      try {
        localStorage.setItem("sync_last", now.toString());
      } catch {
        /* localStorage unavailable (private mode) — non-fatal */
      }
      setSnackbarOpen(true);

      // Reset to idle after animation
      setTimeout(() => {
        setState("idle");
      }, 2000);
    } catch (error) {
      console.error("Manual refresh failed:", error);
      setState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to refresh data. Please check your connection."
      );
      setSnackbarOpen(true);

      setTimeout(() => {
        setState("idle");
      }, 3000);
    }
  }, [state, queryClient]);

  // Keyboard shortcut: Ctrl/Cmd + R
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        handleRefresh();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRefresh]);

  const getTooltipText = () => {
    if (state === "loading") return "Refreshing...";
    if (state === "success") return "Data refreshed!";
    if (state === "error") return "Refresh failed";

    if (lastSync) {
      const timeAgo = dayjs(lastSync).fromNow();
      return `Last synced ${timeAgo}\nClick to refresh (Ctrl/Cmd + R)`;
    }

    return "Refresh data (Ctrl/Cmd + R)";
  };

  const getButtonColor = () => {
    if (state === "success") return "success";
    if (state === "error") return "error";
    return "default";
  };

  return (
    <>
      <Tooltip title={getTooltipText()} arrow>
        {/* span wrapper: the IconButton is disabled while loading, and a
            disabled element doesn't fire the events the Tooltip listens for —
            MUI warns unless we wrap it. */}
        <span style={{ display: "inline-flex" }}>
          <IconButton
            onClick={handleRefresh}
            disabled={state === "loading"}
            color={getButtonColor()}
            size="small"
            sx={{
              transition: "transform 0.3s ease",
              transform: state === "loading" ? "rotate(360deg)" : "rotate(0deg)",
              "&:hover": {
                transform: state === "loading" ? "rotate(360deg)" : "rotate(180deg)",
              },
            }}
          >
            {state === "loading" ? (
              <CircularProgress size={20} />
            ) : (
              <RefreshIcon />
            )}
          </IconButton>
        </span>
      </Tooltip>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={state === "success" ? 2000 : 4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={state === "success" ? "success" : "error"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {state === "success"
            ? "Data refreshed successfully!"
            : errorMessage}
        </Alert>
      </Snackbar>
    </>
  );
}
