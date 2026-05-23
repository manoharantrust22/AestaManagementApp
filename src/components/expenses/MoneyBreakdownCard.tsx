"use client";

import React, { useMemo } from "react";
import { Box, Button, Paper, Typography, useTheme } from "@mui/material";
import { Description as ContractIcon, ChevronRight } from "@mui/icons-material";
import type { BreakdownEntry } from "@/hooks/queries/useExpensesData";
import type { SubcontractTotals } from "@/lib/services/subcontractService";

// Color map for expense types — aligned to MUI theme palette
const TYPE_COLORS: Record<string, string> = {
  "Daily Salary": "#1976d2",      // primary blue
  "Contract Salary": "#7b1fa2",   // purple
  Advance: "#0288d1",             // info
  "Tea & Snacks": "#2e7d32",      // success green
  "Direct Payment": "#00695c",    // teal
  Excess: "#d32f2f",              // error red
  "Unlinked Salary": "#f57c00",   // warning orange
  Material: "#0097a7",            // cyan
  Machinery: "#ed6c02",           // amber
  General: "#546e7a",             // blue-grey
  Miscellaneous: "#8d6e63",       // brown
};

function getTypeColor(type: string, fallback: string): string {
  return TYPE_COLORS[type] ?? fallback;
}

function formatCompact(n: number): string {
  if (n >= 1_00_000) return "₹" + (n / 1_00_000).toFixed(2) + "L";
  if (n >= 1_000) return "₹" + (n / 1_000).toFixed(1) + "k";
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function formatINR(n: number): string {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

interface BreakdownItem {
  type: string;
  amount: number;
  count: number;
  color: string;
  pct: number;
}

export interface MoneyBreakdownCardProps {
  total: number;
  totalCount: number;
  breakdown: Record<string, BreakdownEntry>;
  onOpenSubcontracts?: () => void;
  /** Optional — when provided, the mobile-collapsed row shows Paid / Bal totals. */
  subcontracts?: SubcontractTotals[] | null;
}

export function MoneyBreakdownCard({
  total,
  totalCount,
  breakdown,
  onOpenSubcontracts,
  subcontracts,
}: MoneyBreakdownCardProps) {
  const theme = useTheme();

  const items = useMemo<BreakdownItem[]>(() => {
    if (total <= 0) return [];

    // Labor types first, then building
    const LABOR_ORDER = [
      "Daily Salary", "Contract Salary", "Advance", "Tea & Snacks",
      "Direct Payment", "Excess", "Unlinked Salary",
    ];
    const BUILDING_ORDER = ["Material", "Machinery", "General", "Miscellaneous"];
    const ORDER = [...LABOR_ORDER, ...BUILDING_ORDER];

    const fallbackColors = [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.info.main,
      theme.palette.warning.main,
      theme.palette.success.main,
    ];

    const result: BreakdownItem[] = [];

    const allTypes = new Set([...Object.keys(breakdown), ...ORDER]);
    const sorted = [...allTypes].sort(
      (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)
    );

    let fallbackIdx = 0;
    for (const type of sorted) {
      const entry = breakdown[type];
      if (!entry || entry.amount <= 0) continue;
      result.push({
        type,
        amount: entry.amount,
        count: entry.count,
        color: getTypeColor(type, fallbackColors[fallbackIdx++ % fallbackColors.length]),
        pct: Math.round((entry.amount / total) * 100),
      });
    }

    return result;
  }, [breakdown, total, theme]);

  const subcontractTotals = useMemo(() => {
    if (!subcontracts || subcontracts.length === 0) return null;
    return subcontracts.reduce(
      (acc, sc) => {
        acc.totalPaid += sc.totalPaid;
        acc.totalBalance += sc.balance;
        return acc;
      },
      { totalPaid: 0, totalBalance: 0 }
    );
  }, [subcontracts]);

  const kinds = useMemo(() => {
    const laborTypes = new Set([
      "Daily Salary", "Contract Salary", "Advance", "Tea & Snacks",
      "Direct Payment", "Excess", "Unlinked Salary",
    ]);
    const kindSet = new Set<string>();
    for (const item of items) {
      kindSet.add(laborTypes.has(item.type) ? "Labor" : "Building");
    }
    return kindSet.size;
  }, [items]);

  if (!total || items.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
      {/* Header row */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
        <Box>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            textTransform="uppercase"
            letterSpacing={0.5}
          >
            Where the Money Went
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: 0.25 }}>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}
            >
              {formatINR(total)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {totalCount} records · {kinds} kind{kinds !== 1 ? "s" : ""}
            </Typography>
          </Box>
        </Box>
        {onOpenSubcontracts && (
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={onOpenSubcontracts}
            sx={{ color: "text.secondary", minWidth: 0, display: { xs: "none", md: "inline-flex" } }}
          >
            Subcontracts
          </Button>
        )}
      </Box>

      {/* Stacked bar */}
      <Box
        sx={{
          display: "flex",
          height: 14,
          borderRadius: 99,
          overflow: "hidden",
          gap: "1.5px",
          bgcolor: "action.hover",
        }}
      >
        {items.map((item, idx) => (
          <Box
            key={item.type}
            sx={{
              flex: item.amount,
              bgcolor: item.color,
              borderRadius:
                idx === 0
                  ? "99px 0 0 99px"
                  : idx === items.length - 1
                  ? "0 99px 99px 0"
                  : 0,
              minWidth: item.pct >= 1 ? 4 : 0,
            }}
          />
        ))}
      </Box>

      {/* Legend */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 1, md: 1.5 }, mt: 1.5 }}>
        {items.map((item) => (
          <Box key={item.type} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: item.color,
                flexShrink: 0,
              }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: "nowrap", fontSize: { xs: 11, md: 12 } }}
            >
              {item.type}
            </Typography>
            <Typography
              variant="caption"
              fontWeight={600}
              sx={{
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                fontSize: { xs: 11, md: 12 },
              }}
            >
              {formatCompact(item.amount)}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: { xs: 11, md: 12 } }}>
              {item.pct}%
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Mobile collapsed Subcontracts row */}
      {onOpenSubcontracts && (
        <Box
          sx={{
            display: { xs: "flex", md: "none" },
            alignItems: "center",
            justifyContent: "space-between",
            mt: 1.5,
            mx: -2,
            mb: -2,
            py: 1,
            px: 2,
            borderTop: 1,
            borderColor: "divider",
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
          onClick={onOpenSubcontracts}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenSubcontracts();
            }
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ContractIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Subcontracts
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {subcontractTotals ? (
              <>
                <Typography variant="caption" color="success.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  Paid {formatCompact(subcontractTotals.totalPaid)}
                </Typography>
                <Typography variant="caption" color="warning.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  Bal {formatCompact(subcontractTotals.totalBalance)}
                </Typography>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                View summary
              </Typography>
            )}
            <ChevronRight sx={{ fontSize: 18, color: "text.secondary" }} />
          </Box>
        </Box>
      )}
    </Paper>
  );
}
