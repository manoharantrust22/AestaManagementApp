"use client";

import React, { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
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

  // Open all bands by default; user can collapse individually.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
        return (
          <Accordion
            key={band.key}
            expanded={isOpen}
            onChange={() => {
              setCollapsed((curr) => {
                const next = new Set(curr);
                if (next.has(band.key)) next.delete(band.key);
                else next.add(band.key);
                return next;
              });
            }}
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
        );
      })}
    </Box>
  );
}
