"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Box, Stack, Chip, Typography, Skeleton } from "@mui/material";
import { useSiteTrades } from "@/hooks/queries/useTrades";

interface TradeChipFilterProps {
  siteId: string | undefined;
}

/**
 * Slice C — trade chip filter at the top of /site/attendance.
 *
 * Default: "Civil" chip is selected and the existing per-laborer civil
 * attendance flow renders below unchanged. Tapping a non-civil chip
 * navigates to `/site/trades` where every contract has its own richer
 * entry experience (work updates, headcount, extras, settle) — the
 * supervisor's natural per-trade surface lives there.
 *
 * Only chips for trade categories that have at least one active contract
 * on the current site are shown, plus Civil (always). This keeps the
 * filter focused on what's actually happening on this site today.
 */
export function TradeChipFilter({ siteId }: TradeChipFilterProps) {
  const router = useRouter();
  const { data: trades, isLoading } = useSiteTrades(siteId);

  if (!siteId) return null;

  if (isLoading) {
    return (
      <Box sx={{ mb: 2 }}>
        <Skeleton variant="rectangular" height={36} />
      </Box>
    );
  }

  // Show Civil + any non-civil trade with active contracts. In-house Civil is
  // always represented by the Civil chip; non-civil chips only appear if
  // there's actually work to do for that trade on this site.
  const visibleTrades = (trades ?? []).filter((t) => {
    if (t.category.name === "Civil") return true;
    return t.contracts.length > 0;
  });

  // If there are no non-civil trades active, hide the chip bar entirely —
  // the page is purely civil-shaped and the chip would be noise.
  const hasNonCivil = visibleTrades.some((t) => t.category.name !== "Civil");
  if (!hasNonCivil) return null;

  const handleNonCivilClick = (tradeName: string) => {
    // Pass the trade name as a focus hint so /site/trades can scroll to /
    // expand the right card (Slice C polish — the page reads ?focus=…).
    const slug = tradeName.toLowerCase();
    router.push(`/site/trades?focus=${encodeURIComponent(slug)}`);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
        Recording attendance for
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {visibleTrades.map((trade) => {
          const isCivil = trade.category.name === "Civil";
          return (
            <Chip
              key={trade.category.id}
              label={
                isCivil
                  ? "Civil"
                  : `${trade.category.name} (${trade.contracts.length})`
              }
              color={isCivil ? "primary" : "default"}
              variant={isCivil ? "filled" : "outlined"}
              onClick={
                isCivil ? undefined : () => handleNonCivilClick(trade.category.name)
              }
              sx={{ cursor: isCivil ? "default" : "pointer" }}
            />
          );
        })}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
        Civil work uses this page. Tap any other trade to record headcount /
        photos / payments in its dedicated workspace.
      </Typography>
    </Box>
  );
}
