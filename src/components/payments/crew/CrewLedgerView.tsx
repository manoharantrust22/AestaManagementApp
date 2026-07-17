"use client";

import { useMemo, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useSalaryCrewLedger } from "@/hooks/queries/useSalaryCrewLedger";
import type { CrewLedgerRow, CrewLedgerWeek } from "@/lib/payments/crewLedger";
import CrewMesthriStrip from "./CrewMesthriStrip";
import CrewWeekList from "./CrewWeekList";
import CrewLaborerPayDialog, { type CrewOwedWeek } from "./CrewLaborerPayDialog";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

const num = { fontVariantNumeric: "tabular-nums" as const };

/**
 * The Salary Settlements "By laborer" view (crew-pay mode): the mesthri strip
 * (own wages + commission + excess absorption), every Sun–Sat week with
 * per-laborer net earnings and Pay buttons (post-cutover), and project totals.
 */
export default function CrewLedgerView({
  siteId,
  subcontractId,
  canPay,
}: {
  siteId: string;
  subcontractId: string | null;
  canPay: boolean;
}) {
  const { data, isLoading } = useSalaryCrewLedger({ siteId, subcontractId });
  const [payTarget, setPayTarget] = useState<{
    laborerId: string;
    laborerName: string;
    weeks: CrewOwedWeek[];
  } | null>(null);

  const ledger = data && data.enabled ? data : null;

  // Every owed post-cutover week per laborer — a Pay tap offers the laborer's
  // full owed amount (oldest week fills first; the server clamps each week).
  const owedWeeksByLaborer = useMemo(() => {
    const map = new Map<string, CrewOwedWeek[]>();
    if (!ledger) return map;
    for (const w of ledger.weeks) {
      if (!w.isPostCutover) continue;
      for (const r of w.rows) {
        if (r.isMesthri || r.unpaid <= 0) continue;
        const list = map.get(r.laborerId) ?? [];
        list.push({ weekStart: w.weekStart, weekEnd: w.weekEnd, unpaid: r.unpaid });
        map.set(r.laborerId, list);
      }
    }
    return map;
  }, [ledger]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5 }}>
        <Skeleton variant="rounded" height={120} />
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={52} />)}
      </Box>
    );
  }

  if (!ledger) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
          Crew weekly pay is off for this site. Turn it on for the Civil contract to
          pay laborers individually here.
        </Typography>
      </Box>
    );
  }

  const handlePay = (row: CrewLedgerRow, _week: CrewLedgerWeek) => {
    const weeks = owedWeeksByLaborer.get(row.laborerId) ?? [];
    if (weeks.length === 0) return;
    setPayTarget({ laborerId: row.laborerId, laborerName: row.name, weeks });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: 1.5 }}>
      <CrewMesthriStrip ledger={ledger} siteId={siteId} canPay={canPay} />

      <Typography sx={{ fontSize: 11.5, color: wsColors.muted }}>
        Laborers are paid NET of the mesthri&apos;s per-day commission. Weeks before{" "}
        {dayjs(ledger.config.effectiveFrom).format("D MMM YYYY")} were paid through the
        waterfall and are shown for the record.
      </Typography>

      <CrewWeekList weeks={ledger.weeks} canPay={canPay} onPay={handlePay} />

      {/* Project totals — the footer the Saturday close works against. */}
      <Box
        sx={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: 1, px: 1.25, py: 1,
          borderRadius: `${wsRadius.input}px`,
          border: `1px solid ${wsColors.hairline}`,
          bgcolor: wsColors.surface,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
            Still owed to laborers in total
          </Typography>
          <Typography sx={{ fontSize: 11, color: wsColors.muted, ...num }}>
            {formatCurrencyFull(ledger.totals.laborersNet)} net earned across{" "}
            {ledger.totals.weeksCount} week{ledger.totals.weeksCount === 1 ? "" : "s"} ·{" "}
            {formatCurrencyFull(ledger.totals.commission)} commission to {ledger.config.mesthriName}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 18, fontWeight: 900, color: ledger.totals.laborersUnpaid > 0.5 ? wsColors.ink : wsColors.green, ...num }}>
          {formatCurrencyFull(ledger.totals.laborersUnpaid)}
        </Typography>
      </Box>

      {payTarget && (
        <CrewLaborerPayDialog
          open
          onClose={() => setPayTarget(null)}
          siteId={siteId}
          crewSubcontractId={ledger.config.subcontractId}
          laborerId={payTarget.laborerId}
          laborerName={payTarget.laborerName}
          weeks={payTarget.weeks}
        />
      )}
    </Box>
  );
}
