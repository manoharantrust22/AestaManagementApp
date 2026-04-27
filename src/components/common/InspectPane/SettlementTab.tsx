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
  // weekly-aggregate has no single settlement_ref; render a different
  // sub-component so each component's hook order stays stable.
  if (entity.kind === "weekly-aggregate") {
    return (
      <WeeklyAggregateSettlement entity={entity} onSettleClick={onSettleClick} />
    );
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
            {week.filledBy.map((f, i) => (
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
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 80,
                    textAlign: "right",
                  }}
                >
                  {formatINR(f.amount)}
                </Typography>
              </Box>
            ))}
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
