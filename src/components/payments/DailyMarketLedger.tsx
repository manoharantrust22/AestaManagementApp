"use client";

import React, { useMemo } from "react";
import { Box, Chip, Skeleton, Typography, useTheme, alpha } from "@mui/material";
import dayjs from "dayjs";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";
import type { PaymentsLedgerRow } from "./PaymentsLedger";

interface DailyMarketLedgerProps {
  rows: PaymentsLedgerRow[];
  isLoading: boolean;
  onRowClick: (row: PaymentsLedgerRow) => void;
  onSettleClick: (row: PaymentsLedgerRow) => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

interface WeekGroup {
  weekStart: string;
  weekEnd: string;
  rows: PaymentsLedgerRow[];
  total: number;
}

function groupByWeek(rows: PaymentsLedgerRow[]): {
  pending: PaymentsLedgerRow[];
  weeks: WeekGroup[];
} {
  const pending = rows.filter((r) => r.isPending);
  const paid = rows.filter((r) => r.isPaid);
  const groupMap = new Map<string, WeekGroup>();
  for (const r of paid) {
    const ws = weekStartStr(r.date);
    const we = weekEndStr(r.date);
    const g = groupMap.get(ws) ?? {
      weekStart: ws,
      weekEnd: we,
      rows: [],
      total: 0,
    };
    g.rows.push(r);
    g.total += r.amount;
    groupMap.set(ws, g);
  }
  const weeks = Array.from(groupMap.values()).sort((a, b) =>
    a.weekStart < b.weekStart ? 1 : -1
  );
  return { pending, weeks };
}

export function DailyMarketLedger({
  rows,
  isLoading,
  onRowClick,
  onSettleClick,
}: DailyMarketLedgerProps) {
  const theme = useTheme();
  const { pending, weeks } = useMemo(() => groupByWeek(rows), [rows]);
  const pendingTotal = pending.reduce((s, r) => s + r.amount, 0);

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={48} sx={{ mb: 0.75 }} />
        ))}
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No daily or market wage entries in this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {pending.length > 0 && (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "20px 1fr auto",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 1,
              bgcolor: alpha(theme.palette.warning.main, 0.12),
              borderBottom: `1px solid ${theme.palette.warning.main}`,
              fontSize: 11.5,
            }}
          >
            <span style={{ color: theme.palette.warning.main }}>⚠</span>
            <Typography sx={{ fontWeight: 700, color: "warning.dark" }}>
              Pending · {pending.length} dates
            </Typography>
            <Typography
              sx={{
                fontWeight: 700,
                color: "warning.dark",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatINR(pendingTotal)}
            </Typography>
          </Box>
          {pending.map((r) => (
            <LedgerRow
              key={r.id}
              row={r}
              onClick={onRowClick}
              onSettle={onSettleClick}
              pending
            />
          ))}
        </>
      )}

      {weeks.map((g, idx) => (
        <React.Fragment key={g.weekStart}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "16px 1fr auto",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 1,
              bgcolor: theme.palette.action.hover,
              borderTop:
                idx === 0 ? `1px solid ${theme.palette.divider}` : "none",
              borderBottom: `1px solid ${theme.palette.divider}`,
              fontSize: 11.5,
            }}
          >
            <span style={{ color: theme.palette.text.secondary }}>▾</span>
            <Typography sx={{ fontWeight: 700 }}>
              Week {dayjs(g.weekStart).format("D MMM")}–
              {dayjs(g.weekEnd).format("D MMM")}
              <span
                style={{
                  color: theme.palette.text.secondary,
                  fontWeight: 500,
                  marginLeft: 6,
                }}
              >
                · {g.rows.length} settled days
              </span>
            </Typography>
            <Typography
              sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
            >
              {formatINR(g.total)}
            </Typography>
          </Box>
          {g.rows.map((r) => (
            <LedgerRow
              key={r.id}
              row={r}
              onClick={onRowClick}
              onSettle={onSettleClick}
            />
          ))}
        </React.Fragment>
      ))}
    </Box>
  );
}

interface LedgerRowProps {
  row: PaymentsLedgerRow;
  pending?: boolean;
  onClick: (row: PaymentsLedgerRow) => void;
  onSettle: (row: PaymentsLedgerRow) => void;
}

function LedgerRow({ row, pending, onClick, onSettle }: LedgerRowProps) {
  const theme = useTheme();
  return (
    <Box
      onClick={() => onClick(row)}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 90px", sm: "100px 110px 1fr 90px 90px" },
        gap: 1,
        alignItems: "center",
        px: 1.5,
        py: 0.875,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: pending
          ? alpha(theme.palette.warning.main, 0.06)
          : "transparent",
        cursor: "pointer",
        "&:hover": {
          bgcolor: pending
            ? alpha(theme.palette.warning.main, 0.1)
            : "action.hover",
        },
      }}
    >
      <Box sx={{ display: { xs: "none", sm: "block" } }}>
        {row.settlementRef ? (
          <Box
            component="span"
            sx={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 10.5,
              fontWeight: 600,
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: 0.5,
              px: 0.75,
              py: 0.25,
            }}
          >
            {row.settlementRef}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
            —
          </Typography>
        )}
      </Box>
      <Box sx={{ display: { xs: "none", sm: "block" } }}>
        <Chip
          size="small"
          label={pending ? "Pending" : "Daily+Mkt"}
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 600,
            bgcolor: pending
              ? alpha(theme.palette.warning.main, 0.18)
              : alpha(theme.palette.success.main, 0.15),
            color: pending
              ? theme.palette.warning.dark
              : theme.palette.success.dark,
          }}
        />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 12.5 }}>
          {dayjs(row.date).format("DD MMM")}
          <span
            style={{
              color: theme.palette.text.secondary,
              marginLeft: 8,
            }}
          >
            · {row.forLabel}
          </span>
        </Typography>
      </Box>
      <Typography
        sx={{
          textAlign: "right",
          fontWeight: 600,
          fontSize: 12.5,
          fontVariantNumeric: "tabular-nums",
          color: pending ? "warning.dark" : "text.primary",
        }}
      >
        {formatINR(row.amount)}
      </Typography>
      {pending && (
        <Box
          sx={{ display: { xs: "none", sm: "block" }, justifySelf: "end" }}
          onClick={(e) => {
            e.stopPropagation();
            onSettle(row);
          }}
        >
          <Chip
            size="small"
            color="success"
            label="Settle"
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          />
        </Box>
      )}
    </Box>
  );
}
