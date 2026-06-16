"use client";

import React from "react";
import { Chip, Stack } from "@mui/material";
import { formatPayerSource } from "@/lib/settlement/payerSource";
import type { PayerSourceSplitRow } from "@/types/settlement.types";

interface Props {
  row: {
    payer_source: string | null;
    payer_name: string | null;
    payer_source_split: PayerSourceSplitRow[] | null;
  };
  size?: "small" | "medium";
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
// The unfunded portion an engineer fronted before deposits covered it.
const isPending = (label: string) => label === "Pending";

/**
 * Renders a wallet/expense payment source. Single source -> one chip; a
 * multi-source spend -> an inline per-source breakdown ("Amma Money ₹150 ·
 * Trust Account ₹30"); any not-yet-funded portion shows as an amber "Pending"
 * chip. Source values come from FIFO wallet allocations (walletAllocation.ts).
 */
export default function PayerSourceChip({ row, size = "small" }: Props) {
  const out = formatPayerSource(row);

  if (out.kind === "single") {
    return (
      <Chip
        label={out.label}
        size={size}
        variant="outlined"
        color={isPending(out.label) ? "warning" : "default"}
      />
    );
  }

  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
      {out.rows.map((r, i) => (
        <Chip
          key={i}
          size={size}
          variant="outlined"
          color={isPending(r.label) ? "warning" : "default"}
          label={`${r.label} ${inr(r.amount)}`}
        />
      ))}
    </Stack>
  );
}
