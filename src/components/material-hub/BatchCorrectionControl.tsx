"use client";

/**
 * Per-batch Delete / Edit control for the Material Hub expanded thread's
 * "Delivery & Quality" card. One instance renders inline on each Batch 1/2/3
 * GRN row, so correcting a wrongly-recorded installment is discoverable right
 * where the batches are listed (the section-level "Correct" kebab is easy to
 * miss, and its old reverse path refused on multi-delivery group POs).
 *
 * Self-contained — manages its own confirm + re-record dialog state and
 * invalidates Hub keys on close, exactly like ThreadCorrectionMenu and
 * RecordDeliveryButton. That's the only pattern that works both inline (desktop)
 * and inside MaterialThreadDetailSheet (mobile), which renders
 * MaterialThreadExpanded with no onAction callback.
 *
 *   Delete → reverse_delivery (rolls back this GRN's stock + PO qty).
 *   Edit   → reverse, then reopen RecordAndVerifyDeliveryDialog pre-filled so
 *            the user re-enters the correct date/qty (reverse & re-record).
 *
 * Both go through reverse_delivery, which still refuses (with a clear message)
 * when the batch has usage logged or an inter-site settlement — the user clears
 * those first.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Tooltip,
  Backdrop,
  CircularProgress,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { hubTokens } from "@/lib/material-hub/tokens";
import { useAuth } from "@/contexts/AuthContext";
import { useReverseDelivery, usePurchaseOrder } from "@/hooks/queries/usePurchaseOrders";
import RecordAndVerifyDeliveryDialog from "@/components/materials/RecordAndVerifyDeliveryDialog";
import type { MaterialThread, ThreadDeliveryBatch } from "@/lib/material-hub/threadTypes";

export interface BatchCorrectionControlProps {
  thread: MaterialThread;
  batch: ThreadDeliveryBatch;
  /** "Batch 1" etc. — for the confirm copy so the user knows which one. */
  batchLabel: string;
  /** Mirrors MaterialThreadExpanded's canEdit (!is_mirror && hasEditPermission). */
  canEdit: boolean;
  /** Viewer's selected site — used for the reverse + the re-record dialog. */
  siteId: string;
}

type Mode = "delete" | "edit";

export default function BatchCorrectionControl({
  thread: t,
  batch: b,
  batchLabel,
  canEdit,
  siteId,
}: BatchCorrectionControlProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const reverseDelivery = useReverseDelivery();

  const [mode, setMode] = useState<Mode | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After an Edit-reverse succeeds we re-open the record dialog on a freshly
  // fetched PO (qty has changed). Lazy fetch stays disabled until then.
  const [reRecord, setReRecord] = useState(false);
  const poId = t.po?.id ?? null;
  const fullPO = usePurchaseOrder(reRecord && poId ? poId : undefined);

  // Batches only exist for standard POs the viewer can edit.
  if (!canEdit || t.is_mirror || t.purchase_type === "spot") return null;

  const unit = t.material_unit ?? "";
  const qty = b.accepted_qty || b.received_qty;

  const refreshHub = () => {
    const keys = [
      ["material-requests"],
      ["purchase-orders"],
      ["spot-purchases"],
      ["deliveries"],
      ["stock-inventory"],
      ["material-settlements"],
      ["batch-usage-summary"],
      ["material-purchases"],
    ];
    keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
  };

  const closeConfirm = () => {
    if (running) return;
    setMode(null);
    setError(null);
  };

  const runConfirm = async () => {
    setRunning(true);
    setError(null);
    try {
      // reverse_delivery rolls back stock + PO qty (and refuses, throwing, if
      // usage/settlement exists). useReverseDelivery throws on { success:false }.
      await reverseDelivery.mutateAsync({
        deliveryId: b.id,
        siteId,
        reason: mode === "edit" ? "Edited from Hub (reverse & re-record)" : "Deleted from Hub",
        actorId: user?.id,
      });

      if (mode === "edit") {
        // Reverse done — reopen the record dialog on the now-lighter PO.
        setMode(null);
        setReRecord(true);
      } else {
        setMode(null);
        refreshHub();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reverse this delivery.");
    } finally {
      setRunning(false);
    }
  };

  const poReady = !!fullPO.data;

  return (
    <>
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "1px" }}>
        <Tooltip title="Edit (reverse & re-record)" disableInteractive>
          <Box
            component="button"
            aria-label={`Edit ${batchLabel}`}
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
              setMode("edit");
            }}
            sx={iconBtnSx}
          >
            <EditOutlinedIcon sx={{ fontSize: 13 }} />
          </Box>
        </Tooltip>
        <Tooltip title="Delete this batch" disableInteractive>
          <Box
            component="button"
            aria-label={`Delete ${batchLabel}`}
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
              setMode("delete");
            }}
            sx={{ ...iconBtnSx, "&:hover": { color: hubTokens.danger, background: hubTokens.chip } }}
          >
            <DeleteOutlineIcon sx={{ fontSize: 13 }} />
          </Box>
        </Tooltip>
      </Box>

      {/* Confirm dialog (shared by Delete + Edit) */}
      <Dialog open={mode !== null} onClose={closeConfirm} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>
          {mode === "edit" ? "Edit this delivery?" : "Delete this delivery?"}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ fontSize: 13.5, color: hubTokens.text }}>
            {mode === "edit" ? (
              <>
                This reverses <b>{batchLabel}</b> (GRN {b.grn_number}, {qty} {unit},{" "}
                {b.delivery_date}) — rolling back the stock it added — and reopens the delivery form
                so you can re-enter it correctly.
              </>
            ) : (
              <>
                This permanently removes <b>{batchLabel}</b> (GRN {b.grn_number}, {qty} {unit},{" "}
                {b.delivery_date}) and rolls back the stock it added. The received quantity on the
                PO is recomputed.
              </>
            )}
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.subtle, mt: 1 }}>
            If usage was logged or the batch was settled, clear those first — the reversal will
            refuse otherwise.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirm} disabled={running} size="small">
            Cancel
          </Button>
          <Button
            onClick={runConfirm}
            disabled={running}
            size="small"
            variant="contained"
            color={mode === "edit" ? "primary" : "error"}
          >
            {running ? "Working…" : mode === "edit" ? "Reverse & re-record" : "Delete batch"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit step 2: re-record on the freshly-fetched PO */}
      <RecordAndVerifyDeliveryDialog
        open={reRecord && poReady}
        onClose={() => {
          setReRecord(false);
          refreshHub();
        }}
        siteId={siteId}
        purchaseOrder={fullPO.data ?? null}
      />

      <Backdrop
        open={reRecord && fullPO.isLoading}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1, color: "#fff" }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
    </>
  );
}

const iconBtnSx = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  padding: 0,
  border: "none",
  borderRadius: "4px",
  background: "transparent",
  color: hubTokens.subtle,
  cursor: "pointer",
  transition: "color .12s, background .12s",
  "&:hover": { color: hubTokens.text, background: hubTokens.chip },
} as const;
