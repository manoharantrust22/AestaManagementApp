"use client";

import React from "react";
import { Chip, Tooltip, Stack, Typography } from "@mui/material";
import { CallSplit as SplitIcon } from "@mui/icons-material";
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

export default function PayerSourceChip({ row, size = "small" }: Props) {
  const out = formatPayerSource(row);
  if (out.kind === "single") {
    return <Chip label={out.label} size={size} />;
  }
  const tooltip = (
    <Stack spacing={0.5}>
      {out.rows.map((r, i) => (
        <Typography key={i} variant="caption">
          {r.label}: ₹{Math.round(r.amount).toLocaleString("en-IN")}
        </Typography>
      ))}
    </Stack>
  );
  return (
    <Tooltip title={tooltip} arrow>
      <Chip
        icon={<SplitIcon fontSize="small" />}
        label={`Split (${out.rows.length})`}
        size={size}
      />
    </Tooltip>
  );
}
