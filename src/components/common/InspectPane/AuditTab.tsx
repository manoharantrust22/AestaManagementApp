"use client";

import React from "react";
import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import dayjs from "dayjs";
import { entitySettlementRef, type InspectEntity } from "./types";
import { useSettlementAudit } from "@/hooks/useSettlementAudit";
import { useSalaryWaterfall } from "@/hooks/queries/useSalaryWaterfall";
import { usePaymentsLedger } from "@/hooks/queries/usePaymentsLedger";

export default function AuditTab({ entity }: { entity: InspectEntity }) {
  // weekly-aggregate / daily-market-weekly have no single ref; render
  // one audit section per ref discovered for the week.
  if (entity.kind === "weekly-aggregate") {
    return <WeeklyAggregateAudit entity={entity} />;
  }
  if (entity.kind === "daily-market-weekly") {
    return <DailyMarketWeeklyAudit entity={entity} />;
  }
  return <SingleRefAudit entity={entity} />;
}

function SingleRefAudit({ entity }: { entity: InspectEntity }) {
  const theme = useTheme();
  const settlementRef = entitySettlementRef(entity);
  const { data, isLoading } = useSettlementAudit(settlementRef);

  if (!settlementRef) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No audit history — this entry has no settlement yet.
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={64} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" width="100%" height={64} />
      </Box>
    );
  }

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No audit events.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={1}>
        {events.map((e, i) => (
          <AuditEvent key={i} event={e} />
        ))}
      </Stack>
    </Box>
  );
}

interface AuditEventModel {
  timestamp: string;
  action: string;
  actorName: string;
  note?: string | null;
}

function AuditEvent({ event }: { event: AuditEventModel }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 1,
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 0.25 }}
      >
        {dayjs(event.timestamp).format("DD MMM YYYY, hh:mm A")}
      </Typography>
      <Typography variant="body2">
        <Box component="strong" sx={{ fontWeight: 700 }}>
          {event.action.toUpperCase()}
        </Box>{" "}
        by {event.actorName}
      </Typography>
      {event.note && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.5, whiteSpace: "pre-wrap" }}
        >
          {event.note}
        </Typography>
      )}
    </Box>
  );
}

function WeeklyAggregateAudit({
  entity,
}: {
  entity: Extract<InspectEntity, { kind: "weekly-aggregate" }>;
}) {
  const theme = useTheme();
  // Use the page's scope so audit history matches the page row (the waterfall
  // is order-dependent — see SettlementTab.tsx for the longer note).
  const { data: weeks, isLoading } = useSalaryWaterfall({
    siteId: entity.siteId,
    subcontractId: entity.subcontractId,
    dateFrom: entity.scopeFrom,
    dateTo: entity.scopeTo,
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={64} />
      </Box>
    );
  }

  const week = weeks?.find((w) => w.weekStart === entity.weekStart);
  const refs = week?.filledBy ?? [];

  if (refs.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No settlements have touched this week yet — nothing to audit.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
          mb: 1,
        }}
      >
        Audit history · {refs.length} settlement{refs.length === 1 ? "" : "s"}
      </Typography>
      <Stack spacing={2}>
        {refs.map((f, i) => (
          <RefAuditSection
            key={`${f.ref}-${i}`}
            settlementRef={f.ref}
            amount={f.amount}
          />
        ))}
      </Stack>
    </Box>
  );
}

function DailyMarketWeeklyAudit({
  entity,
}: {
  entity: Extract<InspectEntity, { kind: "daily-market-weekly" }>;
}) {
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
        <Skeleton variant="rounded" width="100%" height={64} />
      </Box>
    );
  }

  // Aggregate amount per distinct settlement_ref so each audit section
  // shows a meaningful "₹X allocated".
  const refTotals = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.settlementRef) continue;
    refTotals.set(r.settlementRef, (refTotals.get(r.settlementRef) ?? 0) + r.amount);
  }
  const refs = Array.from(refTotals.entries()).sort((a, b) =>
    a[0] < b[0] ? -1 : 1
  );

  if (refs.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No settlements have touched this week yet — nothing to audit.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
          mb: 1,
        }}
      >
        Audit history · {refs.length} settlement{refs.length === 1 ? "" : "s"}
      </Typography>
      <Stack spacing={2}>
        {refs.map(([ref, amount]) => (
          <RefAuditSection key={ref} settlementRef={ref} amount={amount} />
        ))}
      </Stack>
    </Box>
  );
}

function RefAuditSection({
  settlementRef,
  amount,
}: {
  settlementRef: string;
  amount: number;
}) {
  const { data, isLoading } = useSettlementAudit(settlementRef);
  const events = data ?? [];

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 0.75,
          gap: 1,
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}
        >
          {settlementRef}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          ₹{amount.toLocaleString("en-IN")} allocated
        </Typography>
      </Box>
      {isLoading ? (
        <Skeleton variant="rounded" width="100%" height={48} />
      ) : events.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No audit events for this ref.
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {events.map((e, i) => (
            <AuditEvent key={i} event={e} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
