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
  | { kind: "all" }
  | { kind: "civil" }
  | { kind: "trade"; categoryId: string; tradeName: string; contractId: string };

interface TradeChipFilterProps {
  siteId: string | undefined;
  selected: TradeChipSelection;
  onChange: (next: TradeChipSelection) => void;
  /**
   * When true, an "All" chip is rendered first. Used on /site/expenses where
   * the supervisor wants to see every trade's rows grouped together. The
   * attendance and payments pages keep this off (Civil is the natural
   * default and "All" doesn't apply to those workflows).
   */
  allowAllChip?: boolean;
  /**
   * When true, hides the "Recording attendance for" header caption and the
   * helper text underneath the chip row, and tightens vertical margins. Used
   * on /site/payments where vertical space is at a premium so the table can
   * surface as much data as possible without scrolling.
   */
  compact?: boolean;
}

const CIVIL_SENTINEL = "__civil__";

export function TradeChipFilter({
  siteId,
  selected,
  onChange,
  allowAllChip = false,
  compact = false,
}: TradeChipFilterProps) {
  const { data: trades, isLoading } = useSiteTrades(siteId);

  if (!siteId) return null;

  if (isLoading) {
    return (
      <Box sx={{ mb: compact ? 0 : 2 }}>
        <Skeleton variant="rectangular" height={compact ? 28 : 36} />
      </Box>
    );
  }

  // A contract is a "tracked workspace" when its labor tracking mode records
  // attendance (anything other than mesthri-only, which is lump payments with
  // no attendance/salary). Opted-out (mesthri-only) contracts don't belong on
  // the attendance / salary screens, so we drop them from the chips — they're
  // paid from the Workforce workspace's Record-payment action instead.
  const isTracked = (c: TradeContract) => c.laborTrackingMode !== "mesthri_only";

  // Civil + non-civil trades that have at least one tracked contract.
  const visibleTrades = (trades ?? [])
    .map((t) => ({ ...t, contracts: t.contracts.filter(isTracked) }))
    .filter((t) => {
      if (t.category.name === "Civil") return true;
      return t.contracts.length > 0;
    });

  const hasNonCivil = visibleTrades.some(
    (t) => t.category.name !== "Civil" && t.contracts.length > 0
  );
  if (!hasNonCivil) return null;

  // Resolve sub-picker visibility: when the selected trade has >1 tracked
  // contract, render a second chip row to switch contractor.
  const selectedTradeContracts: TradeContract[] | null =
    selected.kind === "trade"
      ? visibleTrades.find((t) => t.category.id === selected.categoryId)
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
    selected.kind === "all"
      ? "All trades — rows grouped by trade with subtotals. Tap a chip to scope down."
      : selected.kind === "civil"
      ? "Civil work uses this page. Tap any other trade to record headcount / photos / payments here."
      : `${selected.tradeName} attendance — same page, transformed for this trade. Tap Civil to return.`;

  return (
    <Box sx={{ mb: compact ? 0 : 2 }}>
      {!compact && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
          Recording attendance for
        </Typography>
      )}
      <Stack direction="row" spacing={compact ? 0.75 : 1} flexWrap="wrap" useFlexGap>
        {allowAllChip && (
          <Chip
            key="all"
            label="All"
            variant={selected.kind === "all" ? "filled" : "outlined"}
            color={selected.kind === "all" ? "primary" : "default"}
            onClick={() => onChange({ kind: "all" })}
            sx={{ cursor: "pointer" }}
            data-testid="trade-chip-all"
          />
        )}
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
              size={compact ? "small" : "medium"}
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

      {!compact && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
