"use client";

import React, { useMemo } from "react";
import { Box, Paper, Skeleton, Typography } from "@mui/material";
import type { ExpenseTradeSummaryRow } from "@/hooks/queries/useExpensesData";
import type { Trade } from "@/types/trade.types";
import { getTradeColor } from "@/theme/tradeColors";

// Reuse the same formatter pattern from ExpensesGroupedByTrade / ExpensesSummaryBand
function formatINR(n: number): string {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function formatCompact(n: number): string {
  if (n >= 1_00_000) {
    return "₹" + (n / 1_00_000).toFixed(2) + "L";
  }
  if (n >= 1_000) {
    return "₹" + (n / 1_000).toFixed(1) + "K";
  }
  return formatINR(n);
}

interface TradeMetricCardsProps {
  tradeSummary: ExpenseTradeSummaryRow[];
  siteTrades: Trade[] | undefined;
  onCardClick: (tradeCategoryId: string | null) => void; // null = site-wide
  isLoading?: boolean;
}

const SITE_WIDE_COLOR = "#546e7a";

interface CardDef {
  key: string;
  tradeCategoryId: string | null;
  tradeName: string;
  color: string;
  totalAmount: number;
  recordCount: number;
  dailyAmount: number;
  contractAmount: number;
  materialAmount: number;
  machineryAmount: number;
  isSiteWide: boolean;
}

export function TradeMetricCards({
  tradeSummary,
  siteTrades,
  onCardClick,
  isLoading,
}: TradeMetricCardsProps) {
  const cards = useMemo<CardDef[]>(() => {
    if (!siteTrades) return [];

    // Index summary rows by trade_category_id (null → site-wide sentinel)
    const summaryByTradeId = new Map<string | null, ExpenseTradeSummaryRow>();
    for (const row of tradeSummary) {
      summaryByTradeId.set(row.trade_category_id, row);
    }

    const out: CardDef[] = [];
    let siteWideCard: CardDef | null = null;

    // Build card for each trade in siteTrades
    // Civil first — find it by isSystemSeed or name
    const civilTrade = siteTrades.find(
      (t) => t.category.isSystemSeed || t.category.name === "Civil"
    );
    const otherTrades = siteTrades
      .filter((t) => t !== civilTrade)
      .sort((a, b) => a.category.name.localeCompare(b.category.name));

    const orderedTrades = civilTrade
      ? [civilTrade, ...otherTrades]
      : otherTrades;

    for (const trade of orderedTrades) {
      const summary = summaryByTradeId.get(trade.category.id);
      const color = getTradeColor(trade.category.name).main;
      out.push({
        key: trade.category.id,
        tradeCategoryId: trade.category.id,
        tradeName: trade.category.name,
        color,
        totalAmount: summary?.total_amount ?? 0,
        recordCount: summary?.record_count ?? 0,
        dailyAmount: summary?.daily_amount ?? 0,
        contractAmount: summary?.contract_amount ?? 0,
        materialAmount: summary?.material_amount ?? 0,
        machineryAmount: summary?.machinery_amount ?? 0,
        isSiteWide: false,
      });
    }

    // Site-wide card — always last
    const siteWideSummary = summaryByTradeId.get(null);
    siteWideCard = {
      key: "__site_wide__",
      tradeCategoryId: null,
      tradeName: "Site-wide",
      color: SITE_WIDE_COLOR,
      totalAmount: siteWideSummary?.total_amount ?? 0,
      recordCount: siteWideSummary?.record_count ?? 0,
      dailyAmount: siteWideSummary?.daily_amount ?? 0,
      contractAmount: siteWideSummary?.contract_amount ?? 0,
      materialAmount: siteWideSummary?.material_amount ?? 0,
      machineryAmount: siteWideSummary?.machinery_amount ?? 0,
      isSiteWide: true,
    };
    out.push(siteWideCard);

    return out;
  }, [siteTrades, tradeSummary]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 2,
          overflowX: "auto",
          pb: 1,
          mb: 2,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" width={160} height={120} sx={{ flexShrink: 0 }} />
        ))}
      </Box>
    );
  }

  if (cards.length === 0) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: 2,
        overflowX: "auto",
        pb: 1,
        mb: 2,
      }}
    >
      {cards.map((card) => (
        <TradeCard key={card.key} card={card} onCardClick={onCardClick} />
      ))}
    </Box>
  );
}

function TradeCard({
  card,
  onCardClick,
}: {
  card: CardDef;
  onCardClick: (tradeCategoryId: string | null) => void;
}) {
  const hasDaily = card.dailyAmount > 0;
  const hasContract = card.contractAmount > 0;
  const hasMaterial = card.materialAmount > 0;
  const hasMachinery = card.machineryAmount > 0;

  const showSubRows = card.isSiteWide
    ? hasMaterial || hasMachinery
    : hasDaily || hasContract;

  return (
    <Paper
      variant="outlined"
      elevation={0}
      onClick={() => onCardClick(card.tradeCategoryId)}
      sx={{
        minWidth: 160,
        flexShrink: 0,
        cursor: "pointer",
        borderLeft: "4px solid",
        borderLeftColor: card.color,
        p: 2,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      {/* Trade name */}
      <Typography
        variant="caption"
        fontWeight="bold"
        color="text.secondary"
        textTransform="uppercase"
        display="block"
        noWrap
      >
        {card.tradeName}
      </Typography>

      {/* Total amount */}
      <Typography
        variant="h6"
        fontWeight="bold"
        sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}
      >
        {card.totalAmount > 0 ? formatINR(card.totalAmount) : "—"}
      </Typography>

      {/* Record count */}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        {card.recordCount} {card.recordCount === 1 ? "record" : "records"}
      </Typography>

      {/* Divider */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", my: 1 }} />

      {/* Sub-breakdown rows */}
      {showSubRows ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {card.isSiteWide ? (
            <>
              {hasMaterial && (
                <SubRow label="Mat" amount={card.materialAmount} />
              )}
              {hasMachinery && (
                <SubRow label="Mach" amount={card.machineryAmount} />
              )}
            </>
          ) : (
            <>
              {hasDaily && (
                <SubRow label="Daily" amount={card.dailyAmount} />
              )}
              {hasContract && (
                <SubRow label="Contract" amount={card.contractAmount} />
              )}
            </>
          )}
        </Box>
      ) : (
        <Typography variant="caption" color="text.disabled">
          No breakdown
        </Typography>
      )}
    </Paper>
  );
}

function SubRow({ label, amount }: { label: string; amount: number }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
      >
        {formatCompact(amount)}
      </Typography>
    </Box>
  );
}
