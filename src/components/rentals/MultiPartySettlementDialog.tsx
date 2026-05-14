"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import { useCreateRentalSettlementParty } from "@/hooks/queries/useRentals";
import {
  RENTAL_SETTLEMENT_PARTY_LABELS,
  type RentalOrderWithDetails,
  type RentalSettlementPartyType,
} from "@/types/rental.types";
import { calculateSpentToDate } from "@/lib/utils/rentalCostUtils";

interface MultiPartySettlementDialogProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails;
}

interface PartyState {
  skipped: boolean;
  payer_source: string;
  payment_mode: string;
  party_name: string;
  amount: number;
}

const PAYER_SOURCES = ["Company Account", "Site Cash", "Engineer Wallet"];
const PAYMENT_MODES = ["Cash", "Bank Transfer", "UPI", "Cheque"];

export function MultiPartySettlementDialog({ open, onClose, order }: MultiPartySettlementDialogProps) {
  const settleParty = useCreateRentalSettlementParty();

  const totalAdvances = (order.advances ?? []).reduce((s, a) => s + (a.amount ?? 0), 0);
  // For completed orders use actual_total (set at creation); recalculate for ongoing ones.
  const rentalAmount =
    order.status === "completed" && order.actual_total != null
      ? order.actual_total
      : calculateSpentToDate(
          order.items as any ?? [],
          order.returns ?? [],
          order.start_date ?? order.order_date
        );
  const transportAmount =
    (order.transport_cost_outward ?? 0) + (order.transport_cost_return ?? 0);
  const loadingAmount =
    (order.loading_cost_outward ?? 0) +
    (order.unloading_cost_outward ?? 0) +
    ((order as any).loading_cost_return ?? 0) +
    ((order as any).unloading_cost_return ?? 0);

  const alreadySettled = new Set((order.settlements ?? []).map((s) => s.party_type));

  const [parties, setParties] = useState<Record<RentalSettlementPartyType, PartyState>>({
    vendor: {
      skipped: false,
      payer_source: "Company Account",
      payment_mode: "Bank Transfer",
      party_name: order.vendor?.name ?? "",
      amount: Math.max(0, rentalAmount - totalAdvances),
    },
    transport: {
      skipped: transportAmount === 0,
      payer_source: "Site Cash",
      payment_mode: "Cash",
      party_name: "",
      amount: transportAmount,
    },
    loading_unloading: {
      skipped: true,
      payer_source: "Engineer Wallet",
      payment_mode: "Cash",
      party_name: "Site Laborers",
      amount: loadingAmount,
    },
  });

  const updateParty = (type: RentalSettlementPartyType, patch: Partial<PartyState>) =>
    setParties((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const handleSettle = async (partyType: RentalSettlementPartyType) => {
    const p = parties[partyType];
    await settleParty.mutateAsync({
      rental_order_id: order.id,
      party_type: partyType,
      party_name: p.party_name || null,
      settlement_date: new Date().toISOString().split("T")[0],
      total_rental_amount: partyType === "vendor" ? rentalAmount : 0,
      total_transport_amount: partyType === "transport" ? transportAmount : 0,
      total_damage_amount: 0,
      negotiated_final_amount: p.amount,
      total_advance_paid: partyType === "vendor" ? totalAdvances : 0,
      balance_amount: p.amount,
      payment_mode: p.payment_mode,
      payment_channel: p.payment_mode,
      payer_source: p.payer_source,
      payer_name: p.party_name,
    });
  };

  const partyTypes: RentalSettlementPartyType[] = ["vendor", "transport", "loading_unloading"];
  const partyColors: Record<RentalSettlementPartyType, "success" | "info" | "warning"> = {
    vendor: "success",
    transport: "info",
    loading_unloading: "warning",
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settlement — {order.rental_order_number}</DialogTitle>

      <Box sx={{ px: 2.5, pb: 1 }}>
        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 1, bgcolor: "success.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>
              RENTAL
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              ₹{rentalAmount.toLocaleString("en-IN")}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, bgcolor: "info.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>
              TRANSPORT
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              ₹{transportAmount.toLocaleString("en-IN")}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, bgcolor: "warning.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>
              LOADING
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              ₹{loadingAmount.toLocaleString("en-IN")}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <DialogContent sx={{ pt: 1 }}>
        {partyTypes.map((partyType) => {
          const p = parties[partyType];
          const isSettled = alreadySettled.has(partyType);
          const color = partyColors[partyType];

          return (
            <Box
              key={partyType}
              sx={{
                border: "1px solid",
                borderColor: `${color}.main`,
                borderRadius: 2,
                p: 1.5,
                mb: 1.5,
                opacity: p.skipped ? 0.5 : 1,
              }}
            >
              <Box
                sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}
              >
                <Box>
                  <Typography variant="caption" color={`${color}.dark`} fontWeight={700}>
                    {RENTAL_SETTLEMENT_PARTY_LABELS[partyType].toUpperCase()}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {p.party_name || "—"}
                  </Typography>
                </Box>
                {isSettled ? (
                  <Chip icon={<CheckCircleIcon />} label="Settled" size="small" color="success" />
                ) : p.skipped ? (
                  <Chip icon={<SkipNextIcon />} label="Skipped" size="small" color="default" />
                ) : null}
              </Box>

              {!isSettled && !p.skipped && (
                <>
                  {partyType !== "vendor" && (
                    <TextField
                      label="Person name"
                      size="small"
                      fullWidth
                      value={p.party_name}
                      onChange={(e) => updateParty(partyType, { party_name: e.target.value })}
                      sx={{ mb: 1 }}
                    />
                  )}
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField
                      label="Amount (₹)"
                      type="number"
                      size="small"
                      value={p.amount}
                      onChange={(e) =>
                        updateParty(partyType, { amount: parseFloat(e.target.value) || 0 })
                      }
                      sx={{ flex: 1 }}
                    />
                    <Select
                      size="small"
                      value={p.payer_source}
                      onChange={(e) => updateParty(partyType, { payer_source: e.target.value })}
                      sx={{ flex: 1 }}
                    >
                      {PAYER_SOURCES.map((s) => (
                        <MenuItem key={s} value={s}>
                          {s}
                        </MenuItem>
                      ))}
                    </Select>
                  </Stack>
                  <Select
                    size="small"
                    fullWidth
                    value={p.payment_mode}
                    onChange={(e) => updateParty(partyType, { payment_mode: e.target.value })}
                    sx={{ mb: 1 }}
                  >
                    {PAYMENT_MODES.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                  {partyType === "vendor" && totalAdvances > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mb: 1, display: "block" }}
                    >
                      Advances paid: ₹{totalAdvances.toLocaleString("en-IN")} (deducted from
                      balance)
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color={color}
                      size="small"
                      onClick={() => handleSettle(partyType)}
                      disabled={settleParty.isPending}
                      sx={{ flex: 1 }}
                    >
                      Settle ₹{p.amount.toLocaleString("en-IN")}
                    </Button>
                    {partyType !== "vendor" && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => updateParty(partyType, { skipped: true })}
                        sx={{ fontSize: 10 }}
                      >
                        {partyType === "loading_unloading"
                          ? "Skip — our laborers"
                          : "Skip — vendor included"}
                      </Button>
                    )}
                  </Stack>
                </>
              )}
            </Box>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}
