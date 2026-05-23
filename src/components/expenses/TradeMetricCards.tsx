"use client";

import React, { useMemo } from "react";
import { Add } from "@mui/icons-material";
import { Box, Paper, Skeleton, Typography } from "@mui/material";
import type { ExpenseTradeSummaryRow } from "@/hooks/queries/useExpensesData";
import type { Trade } from "@/types/trade.types";
import { getTradeColor } from "@/theme/tradeColors";

function formatINR(n: number): string {
  return (
    "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)
  );
}

function formatCompact(n: number): string {
  if (n >= 1_00_000) return "₹" + (n / 1_00_000).toFixed(2) + "L";
  if (n >= 1_000) return "₹" + (n / 1_000).toFixed(1) + "K";
  return formatINR(n);
}

interface TradeMetricCardsProps {
  tradeSummary: ExpenseTradeSummaryRow[];
  siteTrades: Trade[] | undefined;
  /** Called when a trade card is clicked. null = site-wide. */
  onCardClick: (tradeCategoryId: string | null) => void;
  /** Called when an empty card's + icon is clicked. */
  onEmptyCardClick?: (tradeCategoryId: string) => void;
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
  isEmpty: boolean;
}

export function TradeMetricCards({
  tradeSummary,
  siteTrades,
  onCardClick,
  onEmptyCardClick,
  isLoading,
}: TradeMetricCardsProps) {
  const { activeCards, emptyCards, totalActive, totalTrades } = useMemo(() => {
    if (!siteTrades) return { activeCards: [], emptyCards: [], totalActive: 0, totalTrades: 0 };

    const summaryByTradeId = new Map<string | null, ExpenseTradeSummaryRow>();
    for (const row of tradeSummary) {
      summaryByTradeId.set(row.trade_category_id, row);
    }

    const civTrade = siteTrades.find(
      (t) => t.category.isSystemSeed || t.category.name === "Civil",
    );
    const others = siteTrades
      .filter((t) => t !== civTrade)
      .sort((a, b) => a.category.name.localeCompare(b.category.name));
    const ordered = civTrade ? [civTrade, ...others] : others;

    const cards: CardDef[] = ordered.map((trade) => {
      const s = summaryByTradeId.get(trade.category.id);
      return {
        key: trade.category.id,
        tradeCategoryId: trade.category.id,
        tradeName: trade.category.name,
        color: getTradeColor(trade.category.name).main,
        totalAmount: s?.total_amount ?? 0,
        recordCount: s?.record_count ?? 0,
        dailyAmount: s?.daily_amount ?? 0,
        contractAmount: s?.contract_amount ?? 0,
        materialAmount: s?.material_amount ?? 0,
        machineryAmount: s?.machinery_amount ?? 0,
        isSiteWide: false,
        isEmpty: !s || s.total_amount === 0,
      };
    });

    // Site-wide (always at end)
    const sw = summaryByTradeId.get(null);
    const siteWideCard: CardDef = {
      key: "__site_wide__",
      tradeCategoryId: null,
      tradeName: "Site-wide",
      color: SITE_WIDE_COLOR,
      totalAmount: sw?.total_amount ?? 0,
      recordCount: sw?.record_count ?? 0,
      dailyAmount: sw?.daily_amount ?? 0,
      contractAmount: sw?.contract_amount ?? 0,
      materialAmount: sw?.material_amount ?? 0,
      machineryAmount: sw?.machinery_amount ?? 0,
      isSiteWide: true,
      isEmpty: !sw || sw.total_amount === 0,
    };
    if (!siteWideCard.isEmpty) cards.push(siteWideCard);

    const active = cards.filter((c) => !c.isEmpty);
    const empty = cards.filter((c) => c.isEmpty);

    return {
      activeCards: active,
      emptyCards: empty,
      totalActive: active.length,
      totalTrades: cards.length + (siteWideCard.isEmpty ? 0 : 1),
    };
  }, [siteTrades, tradeSummary]);

  if (isLoading) {
    return (
      <Box sx={{ mb: 2 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 1.5,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={130} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      </Box>
    );
  }

  if (activeCards.length === 0 && emptyCards.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      {/* Section header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Typography
          variant="caption"
          fontWeight={700}
          color="text.secondary"
          textTransform="uppercase"
          letterSpacing={0.5}
        >
          By Trade
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totalActive} of {siteTrades?.length ?? 0} active
        </Typography>
      </Box>

      {/* Grid on desktop, horizontal scroll-snap strip on mobile */}
      <Box
        sx={{
          display: { xs: "flex", md: "grid" },
          gridTemplateColumns: { md: "repeat(auto-fill, minmax(200px, 1fr))" },
          gap: 1.5,
          // Mobile: horizontal scroll-snap
          overflowX: { xs: "auto", md: "visible" },
          scrollSnapType: { xs: "x mandatory", md: "none" },
          pb: { xs: 1, md: 0 },
          px: { xs: 0.5, md: 0 },
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none",
        }}
      >
        {activeCards.map((card) => (
          <Box
            key={card.key}
            sx={{
              minWidth: { xs: "70vw", md: "auto" },
              flex: { xs: "0 0 auto", md: "initial" },
              scrollSnapAlign: { xs: "start", md: "none" },
            }}
          >
            <ActiveTradeCard card={card} onCardClick={onCardClick} />
          </Box>
        ))}
        {emptyCards.map((card) => (
          <Box
            key={card.key}
            sx={{
              minWidth: { xs: "70vw", md: "auto" },
              flex: { xs: "0 0 auto", md: "initial" },
              scrollSnapAlign: { xs: "start", md: "none" },
            }}
          >
            <EmptyTradeCard
              card={card}
              onCardClick={onCardClick}
              onAdd={
                card.tradeCategoryId
                  ? () => onEmptyCardClick?.(card.tradeCategoryId!)
                  : undefined
              }
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ActiveTradeCard({
  card,
  onCardClick,
}: {
  card: CardDef;
  onCardClick: (id: string | null) => void;
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
      onClick={() => onCardClick(card.tradeCategoryId)}
      sx={{
        cursor: "pointer",
        borderLeft: "3px solid",
        borderLeftColor: card.color,
        borderRadius: 2,
        p: 1.75,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "0 6px 16px rgba(0,0,0,.07)",
        },
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Typography
          variant="caption"
          fontWeight={700}
          color="text.secondary"
          textTransform="uppercase"
          letterSpacing={0.5}
          noWrap
          sx={{ flex: 1, mr: 0.5 }}
        >
          {card.tradeName}
        </Typography>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
        >
          {card.recordCount} rec
        </Typography>
      </Box>

      {/* Amount */}
      <Typography
        variant="h6"
        fontWeight={700}
        sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums", letterSpacing: -0.2, lineHeight: 1.2 }}
      >
        {formatINR(card.totalAmount)}
      </Typography>

      {/* Sub rows */}
      {showSubRows && (
        <>
          <Box sx={{ borderBottom: 1, borderColor: "divider", my: 1 }} />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {card.isSiteWide ? (
              <>
                {hasMaterial && <SubRow label="Material" amount={card.materialAmount} />}
                {hasMachinery && <SubRow label="Machinery" amount={card.machineryAmount} />}
              </>
            ) : (
              <>
                {hasDaily && <SubRow label="Daily" amount={card.dailyAmount} />}
                {hasContract && <SubRow label="Contract" amount={card.contractAmount} />}
              </>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
}

function EmptyTradeCard({
  card,
  onCardClick,
  onAdd,
}: {
  card: CardDef;
  onCardClick: (id: string | null) => void;
  onAdd?: () => void;
}) {
  return (
    <Paper
      variant="outlined"
      onClick={() => onCardClick(card.tradeCategoryId)}
      sx={{
        cursor: "pointer",
        borderRadius: 2,
        p: 1.75,
        borderStyle: "dashed",
        bgcolor: "transparent",
        position: "relative",
        transition: "background-color 0.15s ease, border-color 0.15s ease",
        "&:hover": {
          bgcolor: "action.hover",
          borderColor: "text.disabled",
        },
      }}
    >
      {/* + icon */}
      {onAdd && (
        <Box
          component="span"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            "&:hover": { bgcolor: "action.selected" },
          }}
        >
          <Add sx={{ fontSize: 12, color: "text.disabled" }} />
        </Box>
      )}
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.disabled"
        textTransform="uppercase"
        letterSpacing={0.5}
        noWrap
        display="block"
      >
        {card.tradeName}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
        No expenses yet
      </Typography>
    </Paper>
  );
}

function SubRow({ label, amount }: { label: string; amount: number }) {
  return (
    <Box
      sx={{
        display: "flex",
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
