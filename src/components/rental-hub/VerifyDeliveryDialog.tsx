"use client";

/**
 * VerifyDeliveryDialog — fresh v2 modal for confirming a rental delivery.
 *
 * Spec (docs/RentalHub_V2_redesign/README.md lines 331-334): 460px, warning
 * panel at top ("Cost meter starts ticking from today. Make sure the
 * equipment is on site and counted before confirming."), read-only items list,
 * single "Mark active · start cost meter" primary action.
 *
 * Flips status `confirmed → active`, sets start_date = today and writes the
 * (unchanged) per-item quantities. For full received-qty editing, the v1
 * DeliveryVerificationForm remains available — but this dialog is the
 * one-click happy path.
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
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import { useConfirmRentalDelivery } from "@/hooks/queries/useRentals";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/rental-hub/formatters";
import type { RentalOrderWithDetails } from "@/types/rental.types";
import dayjs from "dayjs";

export interface VerifyDeliveryDialogProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails | null;
}

export default function VerifyDeliveryDialog({
  open,
  onClose,
  order,
}: VerifyDeliveryDialogProps) {
  const confirm = useConfirmRentalDelivery();
  const [deliveryDate, setDeliveryDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [transportCost, setTransportCost] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && order) {
      setDeliveryDate(dayjs().format("YYYY-MM-DD"));
      setTransportCost(
        (order.transport_cost_outward ?? 0).toString(),
      );
      setError(null);
    }
  }, [open, order]);

  if (!order) return null;

  const itemsReceived = (order.items ?? []).map((item) => ({
    order_item_id: item.id,
    qty_received: item.quantity,
  }));

  const handleConfirm = async () => {
    setError(null);
    if (!deliveryDate) {
      setError("Pick a delivery date");
      return;
    }
    const cost = Number(transportCost);
    if (Number.isNaN(cost) || cost < 0) {
      setError("Transport cost must be a non-negative number");
      return;
    }
    try {
      await confirm.mutateAsync({
        orderId: order.id,
        deliveryDate,
        actualTransportCost: cost,
        itemsReceived,
      });
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to confirm delivery");
    }
  };

  const busy = confirm.isPending;
  const isVerifiable = order.status === "confirmed";

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px", maxWidth: 460 } }}
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
            Verify delivery
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            {order.rental_order_number} · {order.vendor?.name ?? "—"}
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={busy} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {!isVerifiable && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This order isn&apos;t at the &quot;Confirmed&quot; stage anymore. Use
            the row&apos;s next-action button instead.
          </Alert>
        )}

        <Alert
          severity="warning"
          icon={<LocalShippingIcon sx={{ fontSize: 18 }} />}
          sx={{ mb: 2, alignItems: "center" }}
        >
          Cost meter starts ticking from the delivery date. Make sure the
          equipment is on site and counted before confirming.
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5}>
            <TextField
              type="date"
              label="Delivery date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="number"
              label="Actual transport cost (₹)"
              value={transportCost}
              onChange={(e) => setTransportCost(e.target.value)}
              fullWidth
              inputProps={{ min: 0, step: 1 }}
            />
          </Stack>

          <Box>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                color: hubTokens.muted,
                mb: 0.75,
              }}
            >
              Items being delivered
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
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          py: 1.25,
          px: 2.5,
          borderTop: `1px solid ${hubTokens.border}`,
          background: hubTokens.bg,
        }}
      >
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={busy || !isVerifiable}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Mark active · start cost meter
        </Button>
      </DialogActions>
    </Dialog>
  );
}
