"use client";

import { Alert, Button } from "@mui/material";

/** Human "n minutes/hours/days ago" for a draft timestamp. */
function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

export interface DraftRestoreBannerProps {
  /** Whether a draft was restored (typically `hasRestoredDraft`) */
  show: boolean;
  /** Timestamp of the restored draft, for "from {time} ago" */
  restoredAt?: number | null;
  /** Discard the draft and start fresh */
  onDiscard: () => void;
  sx?: object;
}

/**
 * Consistent "we brought back your unsaved work" banner shown at the top of any
 * draft-enabled form. The data is already restored into the form; this just
 * tells the user and offers a one-tap way to start over.
 */
export default function DraftRestoreBanner({
  show,
  restoredAt,
  onDiscard,
  sx,
}: DraftRestoreBannerProps) {
  if (!show) return null;
  const when = timeAgo(restoredAt ?? null);
  return (
    <Alert
      severity="info"
      sx={{ mb: 2, ...sx }}
      action={
        <Button size="small" color="inherit" onClick={onDiscard}>
          Start fresh
        </Button>
      }
    >
      Restored your unsaved draft{when ? ` from ${when}` : ""}.
    </Alert>
  );
}
