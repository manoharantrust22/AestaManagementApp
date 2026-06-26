"use client";

import { useEffect, useState } from "react";
import { Button } from "@mui/material";
import RestoreIcon from "@mui/icons-material/Restore";
import { hasStoredDraft } from "@/hooks/formDraftStorage";

export interface ResumeDraftButtonProps {
  /** The draft key used by the form's useFormDraft/useDraftSnapshot */
  draftKey: string;
  /** Entity id for edit-mode drafts (omit for "new entry" drafts) */
  entityId?: string | null;
  /** Reopen the form (which then auto-restores the draft) */
  onResume: () => void;
  label?: string;
  /** Re-check storage whenever this value changes (e.g. pass the dialog's open state) */
  watch?: unknown;
  size?: "small" | "medium" | "large";
  variant?: "text" | "outlined" | "contained";
  sx?: object;
}

/**
 * A subtle "Resume draft" affordance for a form's entry page. It renders ONLY
 * when an unsaved draft for `draftKey` exists in storage, so after a refresh
 * closes the dialog the user can still find and reopen their in-progress work.
 *
 * Deliberately worded "Resume draft" (warning color) to stay distinct from the
 * DB `is_draft` "Drafts (N)" office-review chip on some pages.
 */
export default function ResumeDraftButton({
  draftKey,
  entityId,
  onResume,
  label = "Resume draft",
  watch,
  size = "small",
  variant = "outlined",
  sx,
}: ResumeDraftButtonProps) {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    const check = () => setPresent(hasStoredDraft(draftKey, entityId));
    check();
    // localStorage isn't reactive; re-check when the user returns to the page
    // (e.g. after closing the dialog) or another tab changes it.
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("storage", check);
    };
  }, [draftKey, entityId, watch]);

  if (!present) return null;
  return (
    <Button
      size={size}
      variant={variant}
      color="warning"
      startIcon={<RestoreIcon />}
      onClick={onResume}
      sx={sx}
    >
      {label}
    </Button>
  );
}
