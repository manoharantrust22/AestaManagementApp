"use client";

import React from "react";
import {
  Box,
  Button,
  Skeleton,
  Stack,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import dayjs from "dayjs";
import { useState } from "react";
import { entitySettlementRef, type InspectEntity } from "./types";
import { useSettlementDetails } from "@/hooks/queries/useSettlementDetails";
import { useSalaryWaterfall } from "@/hooks/queries/useSalaryWaterfall";
import { usePaymentsLedger } from "@/hooks/queries/usePaymentsLedger";
import SettlementRefDetailDialog from "@/components/payments/SettlementRefDetailDialog";

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        py: 0.75,
        gap: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right" }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function SettlementTab({
  entity,
  onSettleClick,
}: {
  entity: InspectEntity;
  onSettleClick?: (entity: InspectEntity) => void;
}) {
  // weekly-aggregate / daily-market-weekly have no single settlement_ref;
  // render dedicated sub-components so each component's hook order
  // stays stable.
  if (entity.kind === "weekly-aggregate") {
    return (
      <WeeklyAggregateSettlement entity={entity} onSettleClick={onSettleClick} />
    );
  }
  if (entity.kind === "daily-market-weekly") {
    return <DailyMarketWeeklySettlement entity={entity} />;
  }
  return <SingleRefSettlement entity={entity} onSettleClick={onSettleClick} />;
}

function SingleRefSettlement({
  entity,
  onSettleClick,
}: {
  entity: Exclude<InspectEntity, { kind: "weekly-aggregate" }>;
  onSettleClick?: (entity: InspectEntity) => void;
}) {
  const theme = useTheme();
  const settlementRef = entitySettlementRef(entity);
  const isPending = !settlementRef;

  const { data, isLoading } = useSettlementDetails(
    settlementRef,
    entity.siteId
  );

  if (isLoading && !isPending) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={120} />
      </Box>
    );
  }

  if (isPending) {
    return (
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.warning.main, 0.12),
            border: `1px solid ${theme.palette.warning.main}`,
            mb: 1.5,
          }}
        >
          <Typography variant="body2" fontWeight={600} color="warning.dark">
            Not yet settled
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click below to settle this{" "}
            {entity.kind === "daily-date" ? "date" : "week"} now.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="success"
          fullWidth
          onClick={() => onSettleClick?.(entity)}
          disabled={!onSettleClick}
        >
          Settle now
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack
        divider={
          <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />
        }
      >
        <Row
          label="Reference"
          value={
            <Typography
              variant="body2"
              component="span"
              sx={{ fontFamily: "ui-monospace, monospace" }}
            >
              {settlementRef ?? "—"}
            </Typography>
          }
        />
        <Row
          label="Settled on"
          value={
            data?.settledOn
              ? dayjs(data.settledOn).format("DD MMM YYYY")
              : "—"
          }
        />
        <Row label="Payer" value={data?.payerName ?? "—"} />
        <Row label="Payment mode" value={data?.paymentMode ?? "—"} />
        <Row label="Channel" value={data?.channel ?? "—"} />
        <Row label="Recorded by" value={data?.recordedByName ?? "—"} />
      </Stack>

      {data?.linkedExpenseRef && (
        <Box
          sx={{
            mt: 2,
            p: 1.25,
            bgcolor: "background.paper",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Linked expense
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontFamily: "ui-monospace, monospace" }}
          >
            {data.linkedExpenseRef}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ----------------------------------------------------------------
// Weekly-aggregate Settlement: shows the waterfall allocations that
// touched this week (filled_by refs) and a settle CTA when underpaid.
// ----------------------------------------------------------------

function WeeklyAggregateSettlement({
  entity,
  onSettleClick,
}: {
  entity: Extract<InspectEntity, { kind: "weekly-aggregate" }>;
  onSettleClick?: (entity: InspectEntity) => void;
}) {
  const theme = useTheme();
  const [refDetail, setRefDetail] = useState<string | null>(null);
  // Use the page's scope (scopeFrom/scopeTo) — not the week's own range.
  // The waterfall is order-dependent: settlements made AFTER this week can
  // legitimately fill earlier weeks. Re-running with just (weekStart..weekEnd)
  // sees only that week's settlements and produces wrong allocations.
  const { data: weeks, isLoading } = useSalaryWaterfall({
    siteId: entity.siteId,
    subcontractId: entity.subcontractId,
    dateFrom: entity.scopeFrom,
    dateTo: entity.scopeTo,
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={120} />
      </Box>
    );
  }

  const week = weeks?.find((w) => w.weekStart === entity.weekStart);

  if (!week) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No contract attendance for this week — nothing to settle.
        </Typography>
      </Box>
    );
  }

  const due = week.wagesDue - week.paid;
  const isFullySettled = week.status === "settled";
  const isPartial = week.status === "underpaid";
  const isUntouched = week.status === "pending";

  return (
    <Box sx={{ p: 2 }}>
      {/* Status banner */}
      <Box
        sx={{
          p: 1.5,
          borderRadius: 1,
          bgcolor: isFullySettled
            ? alpha(theme.palette.success.main, 0.12)
            : isPartial
              ? alpha(theme.palette.warning.main, 0.12)
              : alpha(theme.palette.grey[500], 0.12),
          border: `1px solid ${
            isFullySettled
              ? theme.palette.success.main
              : isPartial
                ? theme.palette.warning.main
                : theme.palette.grey[500]
          }`,
          mb: 1.5,
        }}
      >
        <Typography
          variant="body2"
          fontWeight={700}
          color={
            isFullySettled
              ? "success.dark"
              : isPartial
                ? "warning.dark"
                : "text.secondary"
          }
        >
          {isFullySettled
            ? `✓ Settled · ${formatINR(week.paid)} paid`
            : isPartial
              ? `⚠ Underpaid · ${formatINR(due)} still owed`
              : "Not yet settled"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Wages due {formatINR(week.wagesDue)} · Paid (waterfall){" "}
          {formatINR(week.paid)}
        </Typography>
      </Box>

      {/* filled_by allocations */}
      {week.filledBy.length > 0 && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              mb: 0.75,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                fontWeight: 600,
              }}
            >
              Allocations from waterfall ({week.filledBy.length})
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10, fontStyle: "italic" }}
            >
              tap a ref to see full settlement details
            </Typography>
          </Box>
          <Stack
            spacing={0.5}
            divider={
              <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />
            }
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              p: 1,
              bgcolor: "background.paper",
              mb: 1.5,
            }}
          >
            {week.filledBy.map((f, i) => {
              const isPartialAllocation = f.grossAmount > f.amount + 0.5;
              return (
                <Box
                  key={`${f.ref}-${i}`}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: 1,
                    py: 0.5,
                  }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setRefDetail(f.ref)}
                    sx={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 11,
                      color: "primary.main",
                      background: "transparent",
                      border: "none",
                      p: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: 600,
                      "&:hover": { textDecoration: "underline" },
                      "&:focus-visible": {
                        outline: `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    {f.ref}
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: 11 }}
                  >
                    {dayjs(f.settledAt).format("DD MMM")}
                  </Typography>
                  <Box sx={{ textAlign: "right", minWidth: 96 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.2,
                      }}
                    >
                      {formatINR(f.amount)}
                      {isPartialAllocation && (
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 400, fontSize: 10, ml: 0.5 }}
                        >
                          to this week
                        </Typography>
                      )}
                    </Typography>
                    {isPartialAllocation && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: "block",
                          fontSize: 10,
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: 1.2,
                        }}
                      >
                        of {formatINR(f.grossAmount)} paid
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
            {/* Total row at bottom — verifies the sum of allocations to this week */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 1,
                pt: 0.5,
                mt: 0.5,
                borderTop: `1px dashed ${theme.palette.divider}`,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  fontSize: 10,
                }}
              >
                Total allocated to this week
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 80,
                  textAlign: "right",
                  color: "success.dark",
                }}
              >
                {formatINR(
                  week.filledBy.reduce((sum, f) => sum + f.amount, 0)
                )}
              </Typography>
            </Box>
          </Stack>
        </>
      )}

      {/* Full settlement details popup — opens when a ref chip is tapped */}
      <SettlementRefDetailDialog
        open={refDetail !== null}
        settlementReference={refDetail}
        onClose={() => setRefDetail(null)}
      />

      {/* Settle CTA when underpaid or untouched */}
      {(isPartial || isUntouched) && (
        <Button
          variant="contained"
          color="success"
          fullWidth
          onClick={() => onSettleClick?.(entity)}
          disabled={!onSettleClick}
        >
          {isPartial
            ? `Add settlement to fill ${formatINR(due)}`
            : "Record settlement for this week"}
        </Button>
      )}
    </Box>
  );
}

// ----------------------------------------------------------------
// Daily-Market-Weekly Settlement: lists each date in the week with
// its settlement_ref (or "pending"). Daily + Market settles per-date,
// not per-week, so this view shows the per-date settlement granularity
// — distinct from WeeklyAggregateSettlement which shows waterfall
// allocations to the week as a whole.
// ----------------------------------------------------------------

function DailyMarketWeeklySettlement({
  entity,
}: {
  entity: Extract<InspectEntity, { kind: "daily-market-weekly" }>;
}) {
  const theme = useTheme();
  const [refDetail, setRefDetail] = useState<string | null>(null);
  const { data: rows, isLoading } = usePaymentsLedger({
    siteId: entity.siteId,
    dateFrom: entity.weekStart,
    dateTo: entity.weekEnd,
    type: "daily-market",
    status: "all",
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={120} />
      </Box>
    );
  }

  const all = rows ?? [];
  if (all.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No daily or market wage entries in this week.
        </Typography>
      </Box>
    );
  }

  // Group rows by date. A date can have multiple rows (e.g. one daily
  // and one market entry, or several pending daily entries).
  const byDate = new Map<
    string,
    {
      date: string;
      total: number;
      paidTotal: number;
      pendingTotal: number;
      refs: Set<string>;
    }
  >();
  for (const r of all) {
    const e =
      byDate.get(r.date) ?? {
        date: r.date,
        total: 0,
        paidTotal: 0,
        pendingTotal: 0,
        refs: new Set<string>(),
      };
    e.total += r.amount;
    if (r.isPaid) e.paidTotal += r.amount;
    if (r.isPending) e.pendingTotal += r.amount;
    if (r.settlementRef) e.refs.add(r.settlementRef);
    byDate.set(r.date, e);
  }
  const dates = Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1
  );
  const weekTotal = dates.reduce((s, d) => s + d.total, 0);
  const weekPaid = dates.reduce((s, d) => s + d.paidTotal, 0);
  const weekPending = dates.reduce((s, d) => s + d.pendingTotal, 0);
  const allSettled = weekPending === 0;

  return (
    <Box sx={{ p: 2 }}>
      {/* Status banner */}
      <Box
        sx={{
          p: 1.5,
          borderRadius: 1,
          bgcolor: allSettled
            ? alpha(theme.palette.success.main, 0.12)
            : alpha(theme.palette.warning.main, 0.12),
          border: `1px solid ${
            allSettled ? theme.palette.success.main : theme.palette.warning.main
          }`,
          mb: 1.5,
        }}
      >
        <Typography
          variant="body2"
          fontWeight={700}
          color={allSettled ? "success.dark" : "warning.dark"}
        >
          {allSettled
            ? `✓ All dates settled · ${formatINR(weekPaid)} paid`
            : `⚠ ${formatINR(weekPending)} still pending across ${dates.filter((d) => d.pendingTotal > 0).length} date(s)`}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Week total {formatINR(weekTotal)} · Paid {formatINR(weekPaid)}
        </Typography>
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          mb: 0.75,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
        }}
      >
        Per-date settlements ({dates.length})
      </Typography>

      <Stack
        spacing={0.5}
        divider={
          <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }} />
        }
        sx={{
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
          p: 1,
          bgcolor: "background.paper",
        }}
      >
        {dates.map((d) => {
          const refs = Array.from(d.refs);
          const isPending = d.pendingTotal > 0;
          return (
            <Box
              key={d.date}
              sx={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 1,
                py: 0.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  minWidth: 64,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {dayjs(d.date).format("ddd, DD MMM")}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0.5,
                  minWidth: 0,
                }}
              >
                {refs.length > 0 ? (
                  refs.map((ref) => (
                    <Box
                      key={ref}
                      component="button"
                      type="button"
                      onClick={() => setRefDetail(ref)}
                      sx={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 10.5,
                        color: "primary.main",
                        background: "transparent",
                        border: "none",
                        p: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: 600,
                        "&:hover": { textDecoration: "underline" },
                        "&:focus-visible": {
                          outline: `2px solid ${theme.palette.primary.main}`,
                          outlineOffset: 2,
                        },
                      }}
                    >
                      {ref}
                    </Box>
                  ))
                ) : (
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: 10.5,
                      color: "warning.dark",
                      fontStyle: "italic",
                    }}
                  >
                    pending
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: "right", minWidth: 80 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 12.5,
                    color: isPending ? "warning.dark" : "success.dark",
                  }}
                >
                  {formatINR(d.total)}
                </Typography>
                {isPending && d.paidTotal > 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: 9.5 }}
                  >
                    {formatINR(d.paidTotal)} paid
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>

      <SettlementRefDetailDialog
        open={refDetail !== null}
        settlementReference={refDetail}
        onClose={() => setRefDetail(null)}
      />
    </Box>
  );
}
