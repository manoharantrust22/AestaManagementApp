"use client";

/**
 * The 4-state money block on the right of a thread row.
 *
 * State selection per spec (lines 206-235):
 *   - Active / partially_returned → live cost meter with LIVE pulse
 *   - Completed (returns done, not settled) → accrued + advance + balance estimate
 *   - Settled (effective_status) → settled amount + "saved ₹X" line
 *   - Pending / confirmed (no cost yet) → "Cost meter starts on delivery" stub
 *
 * Hourly lines contribute via thread.accruedCost (already summed across both
 * daily and hourly in useRentalOrders). We surface dailyBurn separately for
 * the live subline since hourly lines don't tick per day.
 */

import { Box, Typography } from "@mui/material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/rental-hub/formatters";
import {
  balanceDue,
  dailyBurn,
  vendorSavings,
} from "@/lib/rental-hub/costMeter";
import RentalLiveCostBadge from "./RentalLiveCostBadge";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

export interface RentalMoneyBlockProps {
  thread: RentalThread;
}

export default function RentalMoneyBlock({ thread }: RentalMoneyBlockProps) {
  const vendor = thread.vendor?.name ?? "—";
  const isActive =
    thread.status === "active" || thread.status === "partially_returned";
  const isCompletedUnsettled =
    thread.status === "completed" && thread.effective_status !== "settled";
  const isSettled = thread.effective_status === "settled";
  const isPreActive =
    thread.status === "pending" ||
    thread.status === "approved" ||
    thread.status === "draft" ||
    thread.status === "confirmed";

  // ────────────────────────────────────────────────────────────
  // Pre-active (cost meter hasn't started yet)
  // ────────────────────────────────────────────────────────────
  if (isPreActive) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: hubTokens.mono,
            color: hubTokens.subtle,
          }}
        >
          —
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: hubTokens.muted, fontStyle: "italic" }}>
          Cost meter starts on delivery
        </Typography>
        <VendorLine name={vendor} />
      </Box>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Active (live cost meter)
  // ────────────────────────────────────────────────────────────
  if (isActive) {
    const perDay = dailyBurn(thread);
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Typography
            sx={{
              fontSize: 13.5,
              fontWeight: 700,
              fontFamily: hubTokens.mono,
              color: thread.isOverdue ? hubTokens.danger : hubTokens.text,
            }}
          >
            {inr(thread.accruedCost)}
          </Typography>
          <RentalLiveCostBadge />
        </Box>
        <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
          +<Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 600 }}>{inr(perDay)}</Box>/day
          {thread.totalAdvancePaid > 0 && (
            <>
              {" · advance "}
              <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 600 }}>
                {inr(thread.totalAdvancePaid)}
              </Box>
            </>
          )}
        </Typography>
        <VendorLine name={vendor} />
      </Box>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Completed (returned, awaiting settlement)
  // ────────────────────────────────────────────────────────────
  if (isCompletedUnsettled) {
    const balance = balanceDue(thread);
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: hubTokens.mono,
            color: hubTokens.text,
          }}
        >
          {inr(thread.accruedCost)}
        </Typography>
        <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
          Accrued
          {thread.totalAdvancePaid > 0 && (
            <>
              {" · advance "}
              <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 600 }}>
                {inr(thread.totalAdvancePaid)}
              </Box>
            </>
          )}
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: hubTokens.warn, fontWeight: 700 }}>
          ~{inr(balance)} after negotiation
        </Typography>
        <VendorLine name={vendor} />
      </Box>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Settled
  // ────────────────────────────────────────────────────────────
  if (isSettled) {
    const savings = vendorSavings(thread);
    const finalAmount =
      thread.settlements.vendor?.negotiatedFinalAmount ?? thread.accruedCost;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: hubTokens.mono,
            color: hubTokens.text,
          }}
        >
          {inr(finalAmount)}
        </Typography>
        <Typography sx={{ fontSize: 11, color: hubTokens.success, fontWeight: 600 }}>
          Settled
          {savings > 0 && (
            <>
              {" · saved "}
              <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 700 }}>
                {inr(savings)}
              </Box>
            </>
          )}
        </Typography>
        <VendorLine name={vendor} />
      </Box>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Cancelled / unknown
  // ────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
      <Typography
        sx={{ fontSize: 11.5, color: hubTokens.subtle, fontStyle: "italic" }}
      >
        {thread.isCancelled ? "Cancelled" : "—"}
      </Typography>
      <VendorLine name={vendor} />
    </Box>
  );
}

function VendorLine({ name }: { name: string }) {
  return (
    <Box
      sx={{
        fontSize: 11.5,
        color: hubTokens.muted,
        display: "flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      <PersonOutlineIcon sx={{ fontSize: 12, color: hubTokens.subtle }} />
      <Box
        component="span"
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </Box>
    </Box>
  );
}
