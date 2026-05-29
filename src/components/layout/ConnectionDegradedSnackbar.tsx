"use client";

import { useEffect, useState } from "react";
import { Snackbar, Alert, Button } from "@mui/material";

/**
 * Listens for the global "connection-degraded" event dispatched when the
 * connection-pool recovery gives up — either by SessionManager.healConnectionPool
 * (canary still failing after a realtime reconnect + REST warm-up) or by
 * QueryProvider's timeout circuit-breaker after MAX_TIMEOUT_RECOVERY_CYCLES.
 *
 * Both cases mean the proxy origin is effectively unreachable and the in-app
 * recovery cannot fix it (only a full reload tears down the browser's poisoned
 * per-host socket pool). Rather than leave the user staring at a frozen
 * skeleton, we surface a persistent banner with a one-tap Reload.
 *
 * Mounted once at the layout root so every page gets it for free.
 */
export default function ConnectionDegradedSnackbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("connection-degraded", handler);
    return () => window.removeEventListener("connection-degraded", handler);
  }, []);

  return (
    <Snackbar
      open={open}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        severity="warning"
        variant="filled"
        onClose={() => setOpen(false)}
        sx={{ width: "100%", alignItems: "center" }}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        }
      >
        Connection lost. Reload to reconnect.
      </Alert>
    </Snackbar>
  );
}
