"use client";

import React from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { ContractMoneySummary } from "@/lib/workforce/tradeContractSummary";
import { wsColors, severityMeta } from "@/lib/workforce/workspaceTokens";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/** Stat block: label + value, used for agreed / spent / left. */
function Cell({ label, value, color = wsColors.ink }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".04em",
          color: wsColors.muted,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 800,
          color,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.15,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Compact money strip shown under the trade chips on /site/attendance, scoped to
 * the contract being recorded against. Two states:
 *  - agreed amount set → agreed / spent / left + the exposure verdict;
 *  - ₹0 agreed → amber "Daily-wage only" with spent-so-far + "Set agreed ₹".
 * Reuse-only: the Set-agreed action deep-links to the existing contract editor.
 */
export function ContractMoneyStrip({
  summary,
  onOpenContract,
}: {
  summary: ContractMoneySummary | null;
  onOpenContract: (contractId: string) => void;
}) {
  if (!summary) return null;

  if (!summary.hasAgreedAmount) {
    return (
      <Box
        data-testid="contract-money-strip"
        sx={{
          mb: 2,
          px: 1.75,
          py: 1.25,
          borderRadius: 2,
          bgcolor: wsColors.amberBg,
          border: `1px solid ${wsColors.amber}33`,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          flexWrap="wrap"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, color: wsColors.amber, fontSize: 14 }}>
              Daily-wage only — no agreed amount
            </Typography>
            <Typography sx={{ fontSize: 13, color: wsColors.ink2 }}>
              {inr(summary.spent)} paid so far on daily wage.
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={() => onOpenContract(summary.contractId)}>
            Set agreed ₹
          </Button>
        </Stack>
      </Box>
    );
  }

  const meta = severityMeta[summary.severity];
  return (
    <Box
      data-testid="contract-money-strip"
      role="button"
      tabIndex={0}
      onClick={() => onOpenContract(summary.contractId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenContract(summary.contractId);
      }}
      sx={{
        mb: 2,
        px: 1.75,
        py: 1.25,
        borderRadius: 2,
        cursor: "pointer",
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography sx={{ fontWeight: 700, color: wsColors.ink, fontSize: 14, minWidth: 0 }} noWrap>
          {summary.title} · {summary.tradeName}
        </Typography>
        <Chip
          data-testid="contract-money-strip-verdict"
          size="small"
          label={meta.label}
          sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700 }}
        />
      </Stack>
      <Stack direction="row" spacing={3}>
        <Cell label="Agreed" value={inr(summary.agreed)} />
        <Cell label="Spent" value={inr(summary.spent)} color={wsColors.primary} />
        {summary.overpaid ? (
          <Cell label="Overpaid" value={inr(Math.abs(summary.remaining))} color={wsColors.red} />
        ) : (
          <Cell label="Left" value={inr(summary.remaining)} color={wsColors.green} />
        )}
      </Stack>
    </Box>
  );
}
