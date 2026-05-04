"use client";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from "@mui/material";
import { CheckCircleOutline } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSiteActions } from "@/contexts/SiteContext";

interface ReconcileDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  cutoffDate: string;
  /** Optional pre-flight info — total wages owed and paid in the legacy band. */
  legacyWagesOwed?: number;
  legacyPaid?: number;
  legacyWeeksPending?: number;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Slice-2 minimum: status-flip-only Reconcile dialog. Confirms with the user,
 * then UPDATEs sites.legacy_status to 'reconciled' (Mode A — keep granular
 * history). Slice 4 will extend this with a Mode A vs Mode B picker and the
 * roll-up-to-opening-balance path.
 */
export default function ReconcileDialog({
  open,
  onClose,
  siteId,
  siteName,
  cutoffDate,
  legacyWagesOwed,
  legacyPaid,
  legacyWeeksPending,
}: ReconcileDialogProps) {
  const queryClient = useQueryClient();
  const { refreshSites } = useSiteActions();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const difference =
    typeof legacyWagesOwed === "number" && typeof legacyPaid === "number"
      ? legacyWagesOwed - legacyPaid
      : null;

  const handleReconcile = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await (supabase as any)
        .from("sites")
        .update({ legacy_status: "reconciled" })
        .eq("id", siteId);
      if (updateError) throw updateError;
      // Refresh the site context so isAuditing flips to false and the bands
      // disappear; invalidate queries so the waterfall re-fetches without
      // period gating.
      await Promise.all([
        refreshSites(),
        queryClient.invalidateQueries(),
      ]);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to reconcile site");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Reconcile {siteName}?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This closes the audit on legacy data dated before{" "}
          <Box component="span" sx={{ fontWeight: 600 }}>{formatDate(cutoffDate)}</Box>.
          The Legacy band will disappear and all weeks return to a single timeline.
          Cross-period allocation gating in the waterfall RPC lifts.
        </DialogContentText>

        {(typeof legacyWagesOwed === "number" || typeof legacyWeeksPending === "number") && (
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 1,
              bgcolor: "action.hover",
              fontSize: 13,
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "text.secondary", mb: 0.5 }}>
              Pre-flight
            </Typography>
            {typeof legacyWeeksPending === "number" && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <span>Weeks reviewed</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {legacyWeeksPending > 0 ? `⚠️ ${legacyWeeksPending} unfilled` : "✓ all reviewed"}
                </span>
              </Box>
            )}
            {typeof legacyWagesOwed === "number" && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <span>Wages owed (legacy)</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatINR(legacyWagesOwed)}</span>
              </Box>
            )}
            {typeof legacyPaid === "number" && (
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <span>Paid (legacy)</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatINR(legacyPaid)}</span>
              </Box>
            )}
            {difference !== null && difference !== 0 && (
              <Box sx={{ display: "flex", justifyContent: "space-between", color: "warning.dark", fontWeight: 600 }}>
                <span>Difference</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatINR(Math.abs(difference))} {difference > 0 ? "underpaid" : "overpaid"}
                </span>
              </Box>
            )}
          </Box>
        )}

        <Alert severity="info" sx={{ mb: 1, fontSize: 12.5 }}>
          Slice 2 ships the keep-granular-history path only. Roll-up to opening
          balance comes in Slice 4. You can reopen the audit later via SQL if needed.
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleReconcile}
          disabled={submitting}
          variant="contained"
          color="success"
          startIcon={<CheckCircleOutline />}
        >
          {submitting ? "Reconciling…" : "Reconcile site"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
