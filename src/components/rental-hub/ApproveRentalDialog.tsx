"use client";

/**
 * ApproveRentalDialog — fresh v2 modal for approving (or rejecting) a rental
 * request.
 *
 * Spec (docs/RentalHub_V2_redesign/README.md lines 324-329): 520px, summary
 * block + Approve / Reject. Folds the prototype's "Approve · Confirm PO"
 * single-button behavior — clicking Approve flips status straight to
 * `confirmed`, skipping the intermediate `approved` state. Reject opens an
 * inline reason field and dispatches CancelRentalOrder.
 */

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContactPhoneIcon from "@mui/icons-material/ContactPhone";
import StorefrontIcon from "@mui/icons-material/Storefront";
import {
  useCancelRentalOrder,
  useUpdateRentalOrderStatus,
} from "@/hooks/queries/useRentals";
import { inr, fmtDateShort } from "@/lib/rental-hub/formatters";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { RentalOrderWithDetails } from "@/types/rental.types";

export interface ApproveRentalDialogProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails | null;
}

export default function ApproveRentalDialog({
  open,
  onClose,
  order,
}: ApproveRentalDialogProps) {
  const updateStatus = useUpdateRentalOrderStatus();
  const cancel = useCancelRentalOrder();

  const [mode, setMode] = useState<"summary" | "reject">("summary");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("summary");
      setReason("");
      setError(null);
    }
  }, [open]);

  if (!order) return null;

  const handleApprove = async () => {
    setError(null);
    try {
      // Fold "Approve" + "Confirm PO" — go straight to confirmed.
      await updateStatus.mutateAsync({ id: order.id, status: "confirmed" });
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to approve rental");
    }
  };

  const handleReject = async () => {
    setError(null);
    if (reason.trim().length < 5) {
      setError("Please enter a reason (at least 5 characters)");
      return;
    }
    try {
      await cancel.mutateAsync({ id: order.id, reason: reason.trim() });
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to reject rental");
    }
  };

  const busy = updateStatus.isPending || cancel.isPending;
  const isApprovalForward =
    order.status === "pending" || order.status === "approved" || order.status === "draft";

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px", maxWidth: 520 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1.5,
          borderBottom: `1px solid ${hubTokens.border}`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {mode === "reject" ? "Reject rental request" : "Approve & confirm rental"}
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            {order.rental_order_number}
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={busy} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {!isApprovalForward && mode === "summary" && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This order is already past the approval stage. Use the row&apos;s
            next-action button instead.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {mode === "summary" ? (
          <Stack spacing={1.5}>
            <Box
              sx={{
                background: hubTokens.bg,
                borderRadius: "10px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <StorefrontIcon sx={{ fontSize: 16, color: hubTokens.muted }} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                  {order.vendor?.name ?? "—"}
                </Typography>
              </Box>
              {order.vendor?.phone && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    color: hubTokens.muted,
                    fontSize: 12,
                  }}
                >
                  <ContactPhoneIcon sx={{ fontSize: 14 }} />
                  {order.vendor.phone}
                </Box>
              )}
              <Box sx={{ fontSize: 12, color: hubTokens.muted }}>
                {fmtDateShort(order.start_date)}
                {order.expected_return_date
                  ? ` → ${fmtDateShort(order.expected_return_date)}`
                  : " (no return date)"}
              </Box>
            </Box>

            <Typography sx={{ fontSize: 12, fontWeight: 700, color: hubTokens.muted, mt: 0.5 }}>
              Line items
            </Typography>
            <Stack spacing={0.75}>
              {(order.items ?? []).map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: `1px solid ${hubTokens.border}`,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                      {item.quantity} {item.rental_item?.unit ?? ""} ·{" "}
                      {item.rental_item?.name ?? "(item)"}
                      {item.size_label_snapshot ? ` (${item.size_label_snapshot})` : ""}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
                      {inr(item.daily_rate_actual)}/
                      {item.rate_type === "hourly" ? "hr" : "day"}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Stack>

            {order.estimated_total > 0 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  fontWeight: 700,
                  pt: 1,
                  borderTop: `1px solid ${hubTokens.hairline}`,
                }}
              >
                <span>Estimated total</span>
                <Box component="span" sx={{ fontFamily: hubTokens.mono }}>
                  {inr(order.estimated_total)}
                </Box>
              </Box>
            )}

            {order.notes && (
              <Box
                sx={{
                  background: hubTokens.bg,
                  borderRadius: "8px",
                  padding: "8px 10px",
                  fontSize: 12,
                  color: hubTokens.muted,
                }}
              >
                {order.notes}
              </Box>
            )}
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Alert severity="warning">
              Rejecting cancels this rental request. The vendor will not be
              notified automatically.
            </Alert>
            <TextField
              autoFocus
              multiline
              minRows={3}
              label="Reason for rejection"
              placeholder="e.g. rate too high, not needed for this phase…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          py: 1.25,
          px: 2.5,
          borderTop: `1px solid ${hubTokens.border}`,
          background: hubTokens.bg,
          justifyContent: mode === "reject" ? "space-between" : "flex-end",
        }}
      >
        {mode === "summary" ? (
          <>
            <Button
              onClick={() => setMode("reject")}
              disabled={busy || !isApprovalForward}
              sx={{
                color: hubTokens.danger,
                fontWeight: 600,
                textTransform: "none",
                mr: "auto",
              }}
            >
              Reject
            </Button>
            <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleApprove}
              disabled={busy || !isApprovalForward}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Approve · Confirm PO
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => {
                setMode("summary");
                setReason("");
                setError(null);
              }}
              disabled={busy}
              sx={{ textTransform: "none" }}
            >
              Back
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleReject}
              disabled={busy || reason.trim().length < 5}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Reject rental
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
