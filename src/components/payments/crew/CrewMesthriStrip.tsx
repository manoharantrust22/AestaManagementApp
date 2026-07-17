"use client";

import { useMemo, useState } from "react";
import { Box, Button, Chip, LinearProgress, Tooltip, Typography } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import SouthEastRounded from "@mui/icons-material/SouthEastRounded";
import CommissionPayoutDialog from "@/components/workforce/CommissionPayoutDialog";
import CrewLaborerPayDialog, { type CrewOwedWeek } from "./CrewLaborerPayDialog";
import { computeCrewStripView, type CrewLedger } from "@/lib/payments/crewLedger";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

const num = { fontVariantNumeric: "tabular-nums" as const };

/**
 * The mesthri's pay console for the Civil salary slice (crew-pay mode) —
 * remaining-first like the contract pane's MesthriPayStrip, plus the signature
 * "excess applied" chip: untargeted pool money (old lumps / carried excess)
 * absorbed into his own wages + commission by the mesthri-first fill rule.
 */
export default function CrewMesthriStrip({
  ledger,
  siteId,
  canPay,
}: {
  ledger: CrewLedger;
  siteId: string;
  canPay: boolean;
}) {
  const [payOwnOpen, setPayOwnOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);

  const view = computeCrewStripView(ledger.mesthri);
  const name = ledger.config.mesthriName;

  // The mesthri's owed post-cutover weeks (for the own-wages dialog).
  const ownOwedWeeks = useMemo<CrewOwedWeek[]>(
    () =>
      ledger.weeks
        .filter((w) => w.isPostCutover)
        .flatMap((w) => {
          const row = w.rows.find((r) => r.isMesthri);
          // row.unpaid mixes own wages + commission; cap at the week's own net —
          // the server clamp (own remaining after pool absorption) is authoritative.
          const ownUnpaid = row ? Math.min(row.unpaid, Math.max(row.net, 0)) : 0;
          return ownUnpaid > 0
            ? [{ weekStart: w.weekStart, weekEnd: w.weekEnd, unpaid: ownUnpaid }]
            : [];
        }),
    [ledger.weeks],
  );

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: `${wsRadius.input}px`,
        bgcolor: view.isSettled ? wsColors.greenBg : wsColors.primaryTint,
        border: `1px solid ${view.isSettled ? wsColors.green : wsColors.primary}22`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
          Mesthri {name} · own wages + commission
        </Typography>
        {view.poolAbsorbed > 0 && (
          <Tooltip
            title={`Money paid earlier without a laborer (lumps / excess) counts toward ${name} first — ${formatCurrencyFull(view.poolAbsorbed)} already absorbed into his wages and commission.`}
          >
            <Chip
              icon={<SouthEastRounded sx={{ fontSize: 14 }} />}
              label={`${formatCurrencyFull(view.poolAbsorbed)} excess applied`}
              size="small"
              sx={{ bgcolor: "#fff", fontWeight: 700, fontSize: 11, ...num }}
            />
          </Tooltip>
        )}
      </Box>

      {view.isSettled ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
          <CheckCircleRounded sx={{ fontSize: 20, color: wsColors.green }} />
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: wsColors.green, ...num }}>
            All settled · {formatCurrencyFull(view.totalEarned)} counted
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, mt: 0.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Still to pay
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 900, color: wsColors.ink, ...num }}>
              {formatCurrencyFull(view.stillToPay)}
            </Typography>
          </Box>

          <Typography sx={{ fontSize: 12, color: wsColors.ink2, ...num }}>
            Own wages {formatCurrencyFull(view.ownRemaining)} · Commission {formatCurrencyFull(view.commissionRemaining)}
          </Typography>

          <LinearProgress
            variant="determinate"
            value={view.pctPaid}
            sx={{
              mt: 0.75, height: 5, borderRadius: 3, bgcolor: "#ffffff",
              "& .MuiLinearProgress-bar": { bgcolor: wsColors.primary, borderRadius: 3 },
            }}
          />
          <Typography sx={{ fontSize: 11, color: wsColors.muted, mt: 0.4, ...num }}>
            {formatCurrencyFull(view.totalPaid)} counted of {formatCurrencyFull(view.totalEarned)} earned
            (₹{Math.round(ledger.mesthri.commissionAccrued)} commission from crew days)
          </Typography>
        </>
      )}

      {canPay && !view.isSettled && (
        <Box sx={{ display: "flex", gap: 1, mt: 0.75, flexWrap: "wrap" }}>
          {ownOwedWeeks.length > 0 && view.ownRemaining > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setPayOwnOpen(true)}
              sx={{ textTransform: "none", fontWeight: 700, py: 0.25 }}
            >
              Pay own wages {formatCurrencyFull(view.ownRemaining)}
            </Button>
          )}
          {view.commissionRemaining > 0 && (
            <Button
              size="small"
              variant="text"
              onClick={() => setPayoutOpen(true)}
              sx={{ textTransform: "none", fontWeight: 700, color: wsColors.primary, py: 0.25 }}
            >
              Pay commission {formatCurrencyFull(view.commissionRemaining)}
            </Button>
          )}
        </Box>
      )}

      {payoutOpen && (
        <CommissionPayoutDialog
          open={payoutOpen}
          onClose={() => setPayoutOpen(false)}
          siteId={siteId}
          collectorLaborerId={ledger.config.mesthriId}
          collectorName={name}
          contractRefKind="subcontract"
          contractRefId={ledger.config.subcontractId}
          defaultAmount={view.commissionRemaining}
        />
      )}

      {payOwnOpen && (
        <CrewLaborerPayDialog
          open={payOwnOpen}
          onClose={() => setPayOwnOpen(false)}
          siteId={siteId}
          crewSubcontractId={ledger.config.subcontractId}
          laborerId={ledger.config.mesthriId}
          laborerName={name}
          weeks={ownOwedWeeks}
        />
      )}
    </Box>
  );
}
