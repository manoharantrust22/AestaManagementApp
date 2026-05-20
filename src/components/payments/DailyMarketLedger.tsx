"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Chip,
  Divider,
  Skeleton,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import { AccountBalanceWallet as AccountBalanceWalletIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";
import { useAttendanceForDate } from "@/hooks/queries/useAttendanceForDate";
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
      <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 0.5 }}>
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
        {row.paymentChannel === "engineer_wallet" && (
          <AccountBalanceWalletIcon
            sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }}
            titleAccess="via wallet"
          />
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
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: 0.75,
            rowGap: 0.25,
            fontSize: 12.5,
          }}
        >
          <Typography component="span" sx={{ fontSize: 12.5 }}>
            {dayjs(row.date).format("DD MMM")}
          </Typography>
          <LaborerChipList row={row} />
        </Box>
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

// ---------------------------------------------------------------------------
// Chip list rendered per row: shows up to 3 chips (daily / contract / market)
// with non-zero counts only. Each chip's hover tooltip fetches per-laborer
// detail lazily via useAttendanceForDate so the list doesn't pre-fetch.
// ---------------------------------------------------------------------------
function LaborerChipList({ row }: { row: PaymentsLedgerRow }) {
  const theme = useTheme();
  const chips: Array<{ kind: "daily" | "contract" | "market"; count: number }> = [];
  if (row.dailyCnt > 0) chips.push({ kind: "daily", count: row.dailyCnt });
  if (row.contractCnt > 0) chips.push({ kind: "contract", count: row.contractCnt });
  if (row.mktCnt > 0) chips.push({ kind: "market", count: row.mktCnt });

  if (chips.length === 0) {
    // Fallback for older rows or unexpected shapes — keep the legacy text so
    // we never render a blank cell.
    return (
      <Typography
        component="span"
        sx={{ color: theme.palette.text.secondary, fontSize: 12 }}
      >
        · {row.forLabel}
      </Typography>
    );
  }

  return (
    <>
      <Typography component="span" sx={{ color: theme.palette.text.secondary, fontSize: 12 }}>
        ·
      </Typography>
      {chips.map((c, idx) => (
        <React.Fragment key={c.kind}>
          {idx > 0 && (
            <Typography
              component="span"
              sx={{ color: theme.palette.text.disabled, fontSize: 12 }}
            >
              ·
            </Typography>
          )}
          <LaborerChip
            kind={c.kind}
            count={c.count}
            siteId={row.siteId}
            date={row.date}
            rowAmount={row.amount}
          />
        </React.Fragment>
      ))}
    </>
  );
}

function LaborerChip({
  kind,
  count,
  siteId,
  date,
  rowAmount,
}: {
  kind: "daily" | "contract" | "market";
  count: number;
  siteId: string;
  date: string;
  rowAmount: number;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      arrow
      placement="top"
      enterDelay={250}
      leaveDelay={80}
      title={
        open ? (
          <LaborerTooltipBody
            kind={kind}
            siteId={siteId}
            date={date}
            rowAmount={rowAmount}
          />
        ) : (
          ""
        )
      }
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: theme.shadows[4],
            maxWidth: 360,
            p: 0,
          },
        },
        arrow: { sx: { color: theme.palette.background.paper, "&::before": { border: `1px solid ${theme.palette.divider}` } } },
      }}
    >
      <Box
        component="span"
        onClick={(e) => e.stopPropagation()}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          color: theme.palette.text.secondary,
          fontSize: 12,
          cursor: "help",
          textDecoration: "underline dotted",
          textDecorationColor: alpha(theme.palette.text.secondary, 0.35),
          textUnderlineOffset: 3,
        }}
      >
        {count} {kind === "contract" ? "con" : kind === "market" ? "mkt" : "daily"}
      </Box>
    </Tooltip>
  );
}

function LaborerTooltipBody({
  kind,
  siteId,
  date,
  rowAmount,
}: {
  kind: "daily" | "contract" | "market";
  siteId: string;
  date: string;
  rowAmount: number;
}) {
  const theme = useTheme();
  const { data, isLoading } = useAttendanceForDate(siteId, date, { enabled: true });

  const title = kind === "daily" ? "Daily" : kind === "contract" ? "Contract" : "Market";

  if (isLoading || !data) {
    return (
      <Box sx={{ p: 1.25, minWidth: 220 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="text" width="50%" />
      </Box>
    );
  }

  if (kind === "market") {
    const list = data.marketLaborers;
    return (
      <Box sx={{ p: 1.25, minWidth: 240 }}>
        <Typography
          sx={{ fontWeight: 700, fontSize: 12, mb: 0.75 }}
        >
          {title}
        </Typography>
        {list.length === 0 && (
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            No market laborers on this date.
          </Typography>
        )}
        {list.map((m) => (
          <Box
            key={m.id}
            sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, fontSize: 12, py: 0.25 }}
          >
            <span>
              {m.role} × {m.count}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              ₹{m.amount.toLocaleString("en-IN")}
            </span>
          </Box>
        ))}
        <Divider sx={{ my: 0.75 }} />
        <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
          <span>Total</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            ₹{data.marketTotal.toLocaleString("en-IN")}
          </span>
        </Box>
      </Box>
    );
  }

  const list =
    kind === "daily"
      ? data.dailyLaborersByType?.daily ?? []
      : data.dailyLaborersByType?.contract ?? [];
  const total = list.reduce((s, l) => s + l.amount, 0);
  const showInline = list.slice(0, 5);
  const overflow = list.length - showInline.length;

  return (
    <Box sx={{ p: 1.25, minWidth: 240 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 12, mb: 0.75 }}>
        {title}
      </Typography>
      {list.length === 0 && (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          None recorded for this date.
        </Typography>
      )}
      {showInline.map((l) => (
        <Box
          key={l.id}
          sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, fontSize: 12, py: 0.25 }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {l.name} · {l.role} · {l.fullDay ? "Full" : "Half"} day
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            ₹{l.amount.toLocaleString("en-IN")}
          </span>
        </Box>
      ))}
      {overflow > 0 && (
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 0.25 }}>
          …{overflow} more
        </Typography>
      )}
      <Divider sx={{ my: 0.75 }} />
      <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
        <span>Total</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          ₹{total.toLocaleString("en-IN")}
        </span>
      </Box>
      {kind === "contract" && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.75,
            fontStyle: "italic",
            color: theme.palette.text.secondary,
            fontSize: 11,
          }}
        >
          Excluded from DAILY tile in the drawer — included in row total
          {" "}₹{rowAmount.toLocaleString("en-IN")}.
        </Typography>
      )}
    </Box>
  );
}
