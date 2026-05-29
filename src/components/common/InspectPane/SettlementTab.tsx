"use client";

import React from "react";
import {
  Box,
  Button,
  Chip,
  Skeleton,
  Stack,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import dayjs from "dayjs";
import { useState } from "react";
import { entitySettlementRef, type InspectEntity } from "./types";
import { useSettlementFullDetails } from "@/hooks/queries/useSettlementFullDetails";
import ScreenshotViewer from "@/components/common/ScreenshotViewer";
import type { SettlementDetails } from "@/components/payments/SettlementRefDetailDialog";
import { useSalaryWaterfall } from "@/hooks/queries/useSalaryWaterfall";
import { usePaymentsLedger } from "@/hooks/queries/usePaymentsLedger";
import InspectPaneError from "./InspectPaneError";
import SettlementRefDetailDialog from "@/components/payments/SettlementRefDetailDialog";
import { useSettlementProofFlags } from "@/hooks/queries/useSettlementProofFlags";
import {
  Image as ImageIcon,
  ImageNotSupported as ImageNotSupportedIcon,
  StickyNote2 as NotesIcon,
} from "@mui/icons-material";

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function paymentModeLabel(mode: string | null | undefined): string | null {
  if (!mode) return null;
  switch (mode) {
    case "upi": return "UPI";
    case "cash": return "Cash";
    case "net_banking": return "Net Banking";
    case "company_direct_online": return "Direct (Online)";
    case "via_site_engineer": return "Via Engineer";
    default: return mode;
  }
}
function paymentChannelLabel(channel: string | null | undefined): string | null {
  if (!channel) return null;
  switch (channel) {
    case "direct": return "Direct Payment";
    case "engineer_wallet": return "Via Engineer Wallet";
    default: return channel;
  }
}
function payerLabel(d: SettlementDetails): string {
  if (d.payerSourceSplit && d.payerSourceSplit.length > 0) return "Split";
  const source = d.payerSource;
  const name = d.payerName;
  if (!source) return name ?? "—";
  switch (source) {
    case "own_money": return "Own Money";
    case "amma_money":
    case "mothers_money": return "Amma Money";
    case "client_money": return "Client Money";
    case "trust_account": return "Trust Account";
    case "other_site_money": return name || "Other Site Money";
    case "custom": return name || "Custom";
    default: return name || source;
  }
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

function ProofFlagIcons({
  flag,
}: {
  flag: { hasProof: boolean; hasNotes: boolean } | undefined;
}) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, ml: 0.5 }}>
      {flag?.hasProof ? (
        <Box component="span" role="img" aria-label="Screenshot attached" sx={{ display: "inline-flex", alignItems: "center" }}>
          <ImageIcon sx={{ fontSize: 14 }} color="action" />
        </Box>
      ) : (
        <Box component="span" role="img" aria-label="No screenshot" sx={{ display: "inline-flex", alignItems: "center" }}>
          <ImageNotSupportedIcon sx={{ fontSize: 14 }} color="warning" />
        </Box>
      )}
      {flag?.hasNotes && (
        <Box component="span" role="img" aria-label="Has notes" sx={{ display: "inline-flex", alignItems: "center" }}>
          <NotesIcon sx={{ fontSize: 14 }} color="disabled" />
        </Box>
      )}
    </Box>
  );
}

export default function SettlementTab({
  entity,
  onSettleClick,
  canEditSettlement,
  onEditSettlement,
  onDeleteSettlement,
  paneZIndex,
}: {
  entity: InspectEntity;
  onSettleClick?: (entity: InspectEntity) => void;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  onDeleteSettlement?: (details: SettlementDetails) => void;
  paneZIndex?: number;
}) {
  if (entity.kind === "weekly-aggregate") {
    return (
      <WeeklyAggregateSettlement
        entity={entity}
        onSettleClick={onSettleClick}
        canEditSettlement={canEditSettlement}
        onEditSettlement={onEditSettlement}
        onDeleteSettlement={onDeleteSettlement}
      />
    );
  }
  if (entity.kind === "daily-market-weekly") {
    return (
      <DailyMarketWeeklySettlement
        entity={entity}
        canEditSettlement={canEditSettlement}
        onEditSettlement={onEditSettlement}
        onDeleteSettlement={onDeleteSettlement}
      />
    );
  }
  return (
    <SingleRefSettlement
      entity={entity}
      onSettleClick={onSettleClick}
      canEditSettlement={canEditSettlement}
      onEditSettlement={onEditSettlement}
      paneZIndex={paneZIndex}
    />
  );
}

function SingleRefSettlement({
  entity,
  onSettleClick,
  canEditSettlement,
  onEditSettlement,
  paneZIndex,
}: {
  entity: Exclude<InspectEntity, { kind: "weekly-aggregate" }>;
  onSettleClick?: (entity: InspectEntity) => void;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  paneZIndex?: number;
}) {
  const theme = useTheme();
  const settlementRef = entitySettlementRef(entity);
  const isPending = !settlementRef;
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  const { data, isLoading, isError, refetch } = useSettlementFullDetails(
    settlementRef,
    entity.siteId
  );

  if (isError && !isPending) {
    return <InspectPaneError onRetry={() => refetch()} />;
  }

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

  const proofUrls = data?.proofUrls ?? [];
  const isCancelled = Boolean(data?.isCancelled);

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
          label="Amount"
          value={
            data?.totalAmount != null ? (
              <Typography
                variant="body2"
                component="span"
                sx={{
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "success.dark",
                }}
              >
                {formatINR(data.totalAmount)}
              </Typography>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Settled on"
          value={
            data?.settlementDate
              ? dayjs(data.settlementDate).format("DD MMM YYYY")
              : "—"
          }
        />
        <Row label="Payer" value={data ? payerLabel(data) : "—"} />
        <Row
          label="Payment mode"
          value={paymentModeLabel(data?.paymentMode) ?? "—"}
        />
        <Row
          label="Channel"
          value={paymentChannelLabel(data?.paymentChannel) ?? "—"}
        />
        <Row label="Recorded by" value={data?.createdByName ?? "—"} />
      </Stack>

      {/* Screenshot / proof */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.75 }}
        >
          Payment screenshot
        </Typography>
        {proofUrls.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {proofUrls.map((url, i) => (
              <Box
                key={url}
                component="img"
                src={url}
                alt={`Payment proof ${i + 1}`}
                onClick={() => setViewer({ open: true, index: i })}
                sx={{
                  width: 64,
                  height: 64,
                  objectFit: "cover",
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.divider}`,
                  cursor: "pointer",
                  "&:hover": { borderColor: theme.palette.primary.main },
                }}
              />
            ))}
          </Box>
        ) : isCancelled ? (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        ) : (
          <Box
            sx={{
              p: 1.25,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.warning.main, 0.12),
              border: `1px solid ${theme.palette.warning.main}`,
            }}
          >
            <Typography variant="body2" fontWeight={600} color="warning.dark">
              No screenshot uploaded
            </Typography>
          </Box>
        )}
      </Box>

      {/* Notes */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          Notes
        </Typography>
        {data?.notes ? (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {data.notes}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No notes
          </Typography>
        )}
      </Box>

      {data?.subcontractId && (
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
            Linked subcontract
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {data.subcontractTitle ?? "—"}
          </Typography>
        </Box>
      )}

      {/* Edit / cancelled footer */}
      <Box sx={{ mt: 2 }}>
        {isCancelled ? (
          <Chip label="Cancelled" color="default" size="small" />
        ) : canEditSettlement && data ? (
          <Button
            variant="outlined"
            fullWidth
            onClick={() => onEditSettlement?.(data)}
            disabled={!onEditSettlement}
          >
            Edit settlement
          </Button>
        ) : null}
      </Box>

      <ScreenshotViewer
        open={viewer.open}
        onClose={() => setViewer((v) => ({ ...v, open: false }))}
        images={proofUrls}
        initialIndex={viewer.index}
        title="Payment Proof"
        zIndex={paneZIndex !== undefined ? paneZIndex + 100 : undefined}
      />
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
  canEditSettlement,
  onEditSettlement,
  onDeleteSettlement,
}: {
  entity: Extract<InspectEntity, { kind: "weekly-aggregate" }>;
  onSettleClick?: (entity: InspectEntity) => void;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  onDeleteSettlement?: (details: SettlementDetails) => void;
}) {
  const theme = useTheme();
  const [refDetail, setRefDetail] = useState<string | null>(null);
  // Use the page's scope (scopeFrom/scopeTo) — not the week's own range.
  // The waterfall is order-dependent: settlements made AFTER this week can
  // legitimately fill earlier weeks. Re-running with just (weekStart..weekEnd)
  // sees only that week's settlements and produces wrong allocations.
  const {
    data: weeks,
    isLoading,
    isError,
    refetch,
  } = useSalaryWaterfall({
    siteId: entity.siteId,
    subcontractId: entity.subcontractId,
    dateFrom: entity.scopeFrom,
    dateTo: entity.scopeTo,
  });

  // Hook must be called unconditionally before any early returns.
  const refList =
    (weeks?.find((w) => w.weekStart === entity.weekStart)?.filledBy ?? []).map(
      (f) => f.ref
    );
  const { data: proofFlags } = useSettlementProofFlags(refList, entity.siteId);

  if (isError) {
    return <InspectPaneError onRetry={() => refetch()} />;
  }

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
                  <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
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
                    <ProofFlagIcons flag={proofFlags?.get(f.ref)} />
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
        canEdit={canEditSettlement}
        onEdit={(d) => {
          setRefDetail(null);
          onEditSettlement?.(d);
        }}
        onDelete={(d) => {
          setRefDetail(null);
          onDeleteSettlement?.(d);
        }}
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
  canEditSettlement,
  onEditSettlement,
  onDeleteSettlement,
}: {
  entity: Extract<InspectEntity, { kind: "daily-market-weekly" }>;
  canEditSettlement?: boolean;
  onEditSettlement?: (details: SettlementDetails) => void;
  onDeleteSettlement?: (details: SettlementDetails) => void;
}) {
  const theme = useTheme();
  const [refDetail, setRefDetail] = useState<string | null>(null);
  const {
    data: rows,
    isLoading,
    isError,
    refetch,
  } = usePaymentsLedger({
    siteId: entity.siteId,
    dateFrom: entity.weekStart,
    dateTo: entity.weekEnd,
    type: "daily-market",
    status: "all",
  });

  // Hook must be called unconditionally before any early returns.
  const allRefs = Array.from(
    new Set((rows ?? []).map((r) => r.settlementRef).filter(Boolean) as string[])
  );
  const { data: proofFlags } = useSettlementProofFlags(allRefs, entity.siteId);

  if (isError) {
    return <InspectPaneError onRetry={() => refetch()} />;
  }

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
                      sx={{ display: "inline-flex", alignItems: "center" }}
                    >
                      <Box
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
                      <ProofFlagIcons flag={proofFlags?.get(ref)} />
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
        canEdit={canEditSettlement}
        onEdit={(d) => {
          setRefDetail(null);
          onEditSettlement?.(d);
        }}
        onDelete={(d) => {
          setRefDetail(null);
          onDeleteSettlement?.(d);
        }}
      />
    </Box>
  );
}
