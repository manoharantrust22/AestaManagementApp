"use client";

import { useEffect, useState } from "react";
import { Alert, Button } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { usePushSubscription } from "@/hooks/usePushSubscription";

const DISMISS_KEY = "aesta.pushCardDismissed";

/** Nudge to turn on phone notifications. Renders nothing once enabled. */
export default function EnablePushCard() {
  const { state, error, subscribe } = usePushSubscription();
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (dismissed || state === "loading" || state === "subscribed" || state === "unsupported") return null;

  if (state === "ios-needs-install") {
    return (
      <Alert severity="info" onClose={dismiss}>
        To get task alerts on iPhone: tap <b>Share</b> → <b>Add to Home Screen</b>, then open Aesta from the home screen.
      </Alert>
    );
  }

  if (state === "denied") {
    return (
      <Alert severity="warning" onClose={dismiss}>
        Notifications are blocked. Allow them for this site in your browser settings to get task alerts.
      </Alert>
    );
  }

  return (
    <Alert
      severity="info"
      icon={<NotificationsActiveIcon />}
      onClose={dismiss}
      action={
        <Button
          color="inherit"
          size="small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await subscribe();
            setBusy(false);
          }}
        >
          Turn on
        </Button>
      }
    >
      Get a phone alert when a task is assigned or someone is blocked.
      {error ? ` (${error})` : ""}
    </Alert>
  );
}
