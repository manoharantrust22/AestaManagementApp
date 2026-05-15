"use client";

import React, { useMemo } from "react";
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSettleRental,
  useRentalCostCalculation,
} from "@/hooks/queries/useRentals";
import { recordSpend } from "@/lib/services/engineerWalletV2";
import SettleViaWalletDialog from "@/components/payments/SettleViaWalletDialog";
import type { RentalOrderWithDetails } from "@/types/rental.types";

interface RentalSettleViaWalletProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  order: RentalOrderWithDetails;
  engineerId: string;
}

/**
 * Wallet-only finalization path for a rental order. Owns rental cost
 * calculation + advance lookup, wires `useSettleRental` for the
 * `rental_settlements` row, then calls `recordSpend` to debit the
 * engineer wallet.
 *
 * Sequencing is not atomic: if the wallet debit step fails after the
 * rental row insert, the dialog surfaces the error and the rental stays
 * marked as completed. A future cleanup pass should mirror the Phase 4
 * material approach (wallet debit inside the mutation, with rollback on
 * WLT01).
 *
 * Refund mode (balanceAmount <= 0) is filtered out at the caller — this
 * dialog is only opened when there's a positive balance to settle.
 */
export default function RentalSettleViaWallet({
  open,
  onClose,
  onSuccess,
  order,
  engineerId,
}: RentalSettleViaWalletProps) {
  const { userProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const settleRental = useSettleRental();
  const costCalc = useRentalCostCalculation(order.id);

  const totalRentalAmount = costCalc?.subtotal ?? 0;
  const totalTransportAmount = costCalc?.totalTransportCost ?? 0;
  const totalDamageAmount = costCalc?.damagesCost ?? 0;
  const discountAmount = costCalc?.discountAmount ?? 0;
  const grossTotal = costCalc?.grossTotal ?? 0;
  const totalAdvancePaid = costCalc?.advancesPaid ?? 0;
  const balance = Math.max(0, grossTotal - totalAdvancePaid);

  const summary = useMemo(() => {
    const vendor = order.vendor?.shop_name || order.vendor?.name || "Vendor";
    const days = costCalc?.daysElapsed ?? 0;
    return `${vendor} · ${days} days`;
  }, [order.vendor?.shop_name, order.vendor?.name, costCalc?.daysElapsed]);

  const renderSummary = () => (
    <Box
      sx={{
        p: 1.5,
        bgcolor: "action.hover",
        borderRadius: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip
          size="small"
          variant="outlined"
          label={`Order #${order.rental_order_number}`}
        />
      </Stack>
      <Box display="flex" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          Rental
        </Typography>
        <Typography variant="caption">
          ₹{totalRentalAmount.toLocaleString("en-IN")}
        </Typography>
      </Box>
      {discountAmount > 0 && (
        <Box display="flex" justifyContent="space-between">
          <Typography variant="caption" color="success.main">
            Discount
          </Typography>
          <Typography variant="caption" color="success.main">
            -₹{discountAmount.toLocaleString("en-IN")}
          </Typography>
        </Box>
      )}
      {totalTransportAmount > 0 && (
        <Box display="flex" justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">
            Transport
          </Typography>
          <Typography variant="caption">
            ₹{totalTransportAmount.toLocaleString("en-IN")}
          </Typography>
        </Box>
      )}
      {totalDamageAmount > 0 && (
        <Box display="flex" justifyContent="space-between">
          <Typography variant="caption" color="error.main">
            Damages
          </Typography>
          <Typography variant="caption" color="error.main">
            ₹{totalDamageAmount.toLocaleString("en-IN")}
          </Typography>
        </Box>
      )}
      {totalAdvancePaid > 0 && (
        <Box display="flex" justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">
            Advances paid
          </Typography>
          <Typography variant="caption">
            -₹{totalAdvancePaid.toLocaleString("en-IN")}
          </Typography>
        </Box>
      )}
      <Divider sx={{ my: 0.25 }} />
      <Box display="flex" justifyContent="space-between">
        <Typography variant="caption" fontWeight={700}>
          Balance to pay
        </Typography>
        <Typography variant="caption" fontWeight={700}>
          ₹{balance.toLocaleString("en-IN")}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <SettleViaWalletDialog
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
      siteId={order.site_id}
      engineerId={engineerId}
      amount={balance}
      editableAmount
      maxAmount={grossTotal}
      summary={summary}
      renderSummary={renderSummary}
      enableSubcontractLink
      onConfirm={async (payload) => {
        if (!userProfile) throw new Error("Not signed in");
        const negotiated =
          payload.amount + totalAdvancePaid !== grossTotal
            ? payload.amount + totalAdvancePaid
            : undefined;

        await settleRental.mutateAsync({
          rental_order_id: order.id,
          party_type: "vendor",
          settlement_date: payload.paymentDate,
          total_rental_amount: totalRentalAmount,
          total_transport_amount: totalTransportAmount,
          total_damage_amount: totalDamageAmount,
          negotiated_final_amount: negotiated,
          total_advance_paid: totalAdvancePaid,
          balance_amount: payload.amount,
          payment_mode: "cash",
          payment_channel: "engineer_wallet",
          payer_source: payload.payerSource,
          payer_name: payload.customPayerName,
          subcontract_id: payload.subcontractId || undefined,
          notes: payload.notes,
        });

        await recordSpend(supabase, {
          engineer_id: engineerId,
          site_id: order.site_id,
          amount: payload.amount,
          payment_mode: "cash",
          transaction_date: payload.paymentDate,
          notes: payload.notes ?? null,
          description: `Rental settlement: ${order.rental_order_number}`,
          recorded_by: userProfile.name || userProfile.email || "Engineer",
          recorded_by_user_id: userProfile.id,
        });
      }}
    />
  );
}
