"use client";

import React, { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import type { ExpenseRow } from "@/hooks/queries/useExpensesData";
import type { Trade } from "@/types/trade.types";
import { getTradeColor } from "@/theme/tradeColors";
import ExpensesTable from "./ExpensesTable";

interface ExpensesGroupedByTradeProps {
  rows: ExpenseRow[];
  siteTrades: Trade[] | undefined;
  isLoading: boolean;
  canEdit: boolean;
  onRefClick: (row: ExpenseRow) => void;
  onEdit: (row: ExpenseRow) => void;
  onDelete: (row: ExpenseRow) => void;
  /** Optional site ID — used to persist collapse state to localStorage */
  siteId?: string;
  /** Optional refs map for scroll anchoring; keys are band keys */
  sectionRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

interface Band {
  key: string;
  label: string;
  color: string;
  rows: ExpenseRow[];
  total: number;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Groups expense rows by trade for /site/expenses "All" mode.
 *
 * Banding rules:
 *   - Each row whose contract_id maps to a known subcontract goes to that
 *     contract's trade band (Civil / Painting / Plumbing / etc.).
 *   - Rows without contract_id (materials, misc, tea-shop, untied daily
 *     salary) all go to a single "Site-wide" band at the bottom.
 *   - Bands with 0 rows are skipped.
 *   - Order: Civil first → non-civil trades alphabetical → Site-wide last.
 */
export function ExpensesGroupedByTrade({
  rows,
  siteTrades,
  isLoading,
  canEdit,
  onRefClick,
  onEdit,
  onDelete,
  siteId,
  sectionRefs,
}: ExpensesGroupedByTradeProps) {
  const bands = useMemo<Band[]>(() => {
    if (!siteTrades) return [];
    // Map contract_id → trade category name
    const contractToTrade = new Map<string, string>();
    for (const t of siteTrades) {
      for (const c of t.contracts) contractToTrade.set(c.id, t.category.name);
    }

    // Bucket by trade name
    const bucket = new Map<string, ExpenseRow[]>();
    const SITE_WIDE = "__site_wide__";
    for (const r of rows) {
      const tradeName = r.contract_id
        ? contractToTrade.get(r.contract_id) ?? SITE_WIDE
        : SITE_WIDE;
      const arr = bucket.get(tradeName) ?? [];
      arr.push(r);
      bucket.set(tradeName, arr);
    }

    const out: Band[] = [];

    // Civil first
    if (bucket.has("Civil")) {
      const rs = bucket.get("Civil")!;
      out.push({
        key: "Civil",
        label: "Civil contracts",
        color: getTradeColor("Civil").main,
        rows: rs,
        total: rs.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      });
      bucket.delete("Civil");
    }

    // Non-civil trades, alphabetical (excluding site-wide)
    const tradeKeys = Array.from(bucket.keys())
      .filter((k) => k !== SITE_WIDE)
      .sort();
    for (const k of tradeKeys) {
      const rs = bucket.get(k)!;
      out.push({
        key: k,
        label: `${k} contracts`,
        color: getTradeColor(k).main,
        rows: rs,
        total: rs.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      });
    }

    // Site-wide last
    if (bucket.has(SITE_WIDE)) {
      const rs = bucket.get(SITE_WIDE)!;
      out.push({
        key: SITE_WIDE,
        label: "Site-wide (materials, misc, untied daily wages)",
        color: "#546e7a",
        rows: rs,
        total: rs.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      });
    }

    return out;
  }, [rows, siteTrades]);

  // Change B: persist collapse state to localStorage keyed by siteId
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (!siteId) return new Set<string>();
    try {
      const stored = localStorage.getItem(`expenses-collapsed-${siteId}`);
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const handleToggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (siteId) {
        try {
          localStorage.setItem(
            `expenses-collapsed-${siteId}`,
            JSON.stringify([...next])
          );
        } catch {}
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Loading expenses…
        </Typography>
      </Box>
    );
  }

  if (bands.length === 0) {
    return (
      <Box sx={{ px: { xs: 2, md: 2.5 }, py: 4 }}>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          No expenses in this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 1, md: 1.5 }, pb: 4 }}>
      {bands.map((band) => {
        const isOpen = !collapsed.has(band.key);
        const SITE_WIDE = "__site_wide__";

        // Change C: compute per-section summary tiles
        let summaryTiles: React.ReactNode = null;
        if (band.key === SITE_WIDE) {
          // Site-wide: 4 buckets — always show even if ₹0
          const siteWideBuckets = [
            { label: "Material", type: "Material" },
            { label: "Machinery", type: "Machinery" },
            { label: "General", type: "General" },
            { label: "Misc", type: "Miscellaneous" },
          ];
          summaryTiles = (
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 1,
                mb: 2,
                px: 1,
                pt: 1.5,
              }}
            >
              {siteWideBuckets.map((bucket) => {
                const bucketRows = band.rows.filter(
                  (r) => r.expense_type === bucket.type
                );
                const bucketTotal = bucketRows.reduce(
                  (s, r) => s + Number(r.amount ?? 0),
                  0
                );
                return (
                  <Paper
                    key={bucket.type}
                    variant="outlined"
                    elevation={0}
                    sx={{ minWidth: 120, p: 1.5 }}
                  >
                    <Typography
                      variant="caption"
                      fontWeight="bold"
                      color="text.secondary"
                      textTransform="uppercase"
                      display="block"
                    >
                      {bucket.label}
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      ₹{formatINR(bucketTotal)}
                    </Typography>
                  </Paper>
                );
              })}
            </Box>
          );
        } else {
          // Labor trade bands: Daily Salary + Contract Salary tiles
          const dailyRows = band.rows.filter(
            (r) => r.expense_type === "Daily Salary"
          );
          const contractRows = band.rows.filter(
            (r) => r.expense_type === "Contract Salary"
          );
          const laborTiles = [
            { label: "Daily Salary", rows: dailyRows },
            { label: "Contract Salary", rows: contractRows },
          ].filter((t) => t.rows.length > 0);

          if (laborTiles.length > 0) {
            summaryTiles = (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 1,
                  mb: 2,
                  px: 1,
                  pt: 1.5,
                }}
              >
                {laborTiles.map((tile) => {
                  const tileTotal = tile.rows.reduce(
                    (s, r) => s + Number(r.amount ?? 0),
                    0
                  );
                  return (
                    <Paper
                      key={tile.label}
                      variant="outlined"
                      elevation={0}
                      sx={{ minWidth: 120, p: 1.5 }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight="bold"
                        color="text.secondary"
                        textTransform="uppercase"
                        display="block"
                      >
                        {tile.label}
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        ₹{formatINR(tileTotal)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {tile.rows.length}{" "}
                        {tile.rows.length === 1 ? "row" : "rows"}
                      </Typography>
                    </Paper>
                  );
                })}
              </Box>
            );
          }
        }

        return (
          // Change A: attach sectionRefs on the outermost element of each band
          <Box
            key={band.key}
            ref={(el: HTMLDivElement | null) => {
              if (sectionRefs?.current) {
                sectionRefs.current[band.key] = el;
              }
            }}
          >
            <Accordion
              expanded={isOpen}
              onChange={() => handleToggle(band.key)}
              sx={{
                mb: 1,
                "&:before": { display: "none" },
                borderLeft: 4,
                borderColor: band.color,
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ width: "100%", flexWrap: "wrap" }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>
                    {band.label}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Chip
                    size="small"
                    label={`₹${formatINR(band.total)}`}
                    sx={{
                      fontWeight: 700,
                      bgcolor: band.color,
                      color: "#fff",
                    }}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${band.rows.length} ${band.rows.length === 1 ? "row" : "rows"}`}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {summaryTiles}
                <ExpensesTable
                  rows={band.rows}
                  isLoading={false}
                  canEdit={canEdit}
                  onRefClick={onRefClick}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </AccordionDetails>
            </Accordion>
          </Box>
        );
      })}
    </Box>
  );
}
