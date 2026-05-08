"use client";

import React from "react";
import { Box, Stack, Chip, Typography, Skeleton } from "@mui/material";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import type { TradeContract } from "@/types/trade.types";
import { getTradeColor } from "@/theme/tradeColors";

/**
 * Slice E — controlled trade chip filter at the top of /site/attendance.
 *
 * Civil chip = the existing per-laborer civil attendance flow renders below
 * (parent decides). Non-civil chips = parent renders TradeAttendanceView
 * scoped to the trade's selected contract. Auto-selects the only contract
 * if a trade has just one; sub-picker chips appear when a trade has 2+.
 *
 * Self-hides when no non-civil contracts exist on this site, so civil-only
 * sites stay clutter-free.
 */
export type TradeChipSelection =
  | { kind: "civil" }
  | { kind: "trade"; categoryId: string; tradeName: string; contractId: string };

interface TradeChipFilterProps {
  siteId: string | undefined;
  selected: TradeChipSelection;
  onChange: (next: TradeChipSelection) => void;
}

const CIVIL_SENTINEL = "__civil__";

export function TradeChipFilter({
  siteId,
  selected,
  onChange,
}: TradeChipFilterProps) {
  const { data: trades, isLoading } = useSiteTrades(siteId);

  if (!siteId) return null;

  if (isLoading) {
    return (
      <Box sx={{ mb: 2 }}>
        <Skeleton variant="rectangular" height={36} />
      </Box>
    );
  }

  // Civil + non-civil trades that have at least one active contract
  const visibleTrades = (trades ?? []).filter((t) => {
    if (t.category.name === "Civil") return true;
    return t.contracts.length > 0;
  });

  const hasNonCivil = visibleTrades.some(
    (t) => t.category.name !== "Civil" && t.contracts.length > 0
  );
  if (!hasNonCivil) return null;

  // Resolve sub-picker visibility: when the selected trade has >1 active
  // contract, render a second chip row to switch contractor.
  const selectedTradeContracts: TradeContract[] | null =
    selected.kind === "trade"
      ? (trades ?? []).find((t) => t.category.id === selected.categoryId)
          ?.contracts ?? null
      : null;
  const showSubPicker =
    selectedTradeContracts !== null && selectedTradeContracts.length > 1;

  const handleTradeChipClick = (
    categoryId: string,
    tradeName: string,
    contracts: TradeContract[]
  ) => {
    if (contracts.length === 0) return;
    onChange({
      kind: "trade",
      categoryId,
      tradeName,
      // Auto-select first contract; user can switch via sub-picker if >1.
      contractId: contracts[0].id,
    });
  };

  const helperText =
    selected.kind === "civil"
      ? "Civil work uses this page. Tap any other trade to record headcount / photos / payments here."
      : `${selected.tradeName} attendance — same page, transformed for this trade. Tap Civil to return.`;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
        Recording attendance for
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {visibleTrades.map((trade) => {
          const isCivil = trade.category.name === "Civil";
          const isSelected = isCivil
            ? selected.kind === "civil"
            : selected.kind === "trade" && selected.categoryId === trade.category.id;
          const chipColor = getTradeColor(trade.category.name);
          const selectedSx = isSelected
            ? {
                bgcolor: chipColor.main,
                color: chipColor.contrastText,
                "&:hover": { bgcolor: chipColor.dark },
              }
            : {
                color: chipColor.main,
                borderColor: chipColor.main,
              };
          return (
            <Chip
              key={trade.category.id}
              label={
                isCivil ? "Civil" : `${trade.category.name} (${trade.contracts.length})`
              }
              variant={isSelected ? "filled" : "outlined"}
              onClick={
                isCivil
                  ? () => onChange({ kind: "civil" })
                  : () =>
                      handleTradeChipClick(
                        trade.category.id,
                        trade.category.name,
                        trade.contracts
                      )
              }
              sx={{ cursor: "pointer", ...selectedSx }}
              data-testid={isCivil ? "trade-chip-civil" : `trade-chip-${trade.category.name.toLowerCase()}`}
            />
          );
        })}
      </Stack>

      {showSubPicker && selected.kind === "trade" && (() => {
        const subColor = getTradeColor(selected.tradeName);
        return (
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 1, pl: 1.5, borderLeft: "2px solid", borderColor: subColor.light }}
          >
            <Typography variant="caption" sx={{ alignSelf: "center", mr: 0.5 }}>
              Contract:
            </Typography>
            {(selectedTradeContracts ?? []).map((c) => {
              const label = c.isInHouse
                ? "In-house"
                : c.mesthriOrSpecialistName ?? c.title;
              const isPicked = selected.contractId === c.id;
              return (
                <Chip
                  key={c.id}
                  label={label}
                  size="small"
                  variant={isPicked ? "filled" : "outlined"}
                  onClick={() =>
                    onChange({
                      kind: "trade",
                      categoryId: selected.categoryId,
                      tradeName: selected.tradeName,
                      contractId: c.id,
                    })
                  }
                  sx={{
                    cursor: "pointer",
                    ...(isPicked
                      ? {
                          bgcolor: subColor.main,
                          color: subColor.contrastText,
                          "&:hover": { bgcolor: subColor.dark },
                        }
                      : {
                          color: subColor.main,
                          borderColor: subColor.main,
                        }),
                  }}
                />
              );
            })}
          </Stack>
        );
      })()}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
        {helperText}
      </Typography>
    </Box>
  );
}
