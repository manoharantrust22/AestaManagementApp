"use client";

import { useState } from "react";
import { Box, Typography, Button, LinearProgress } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import { useContractLaborLedger, type ContractLedgerKind } from "@/hooks/queries/useContractLaborLedger";
import { useMesthriCommissionPayable } from "@/hooks/queries/useMesthriCommissionPayable";
import { computeMesthriStrip } from "@/lib/workforce/mesthriStripMath";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import CommissionPayoutDialog from "./CommissionPayoutDialog";
import ContractLaborerPayDialog from "./ContractLaborerPayDialog";

const num = { fontVariantNumeric: "tabular-nums" as const };

/**
 * The mesthri's pay console for ONE contract: what is still owed (own wages +
 * commission) leading, the lifetime total demoted to a caption.
 *
 * Always PROJECT-scoped regardless of the panel's Day/Week/Project tab — payments only
 * ever have a project scope, so it asks for the unwindowed ledger itself. On the Project
 * tab that key matches the container's query and React Query dedupes it.
 */
export default function MesthriPayStrip({
  kind,
  refId,
  siteId,
  mesthriLaborerId,
  mesthriName,
  commissionApplies,
  canPay,
}: {
  kind: ContractLedgerKind;
  refId: string;
  siteId?: string;
  mesthriLaborerId?: string | null;
  mesthriName?: string | null;
  commissionApplies: boolean;
  canPay: boolean;
}) {
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payOwnOpen, setPayOwnOpen] = useState(false);

  // Project-scoped on purpose (null window).
  const { data: project } = useContractLaborLedger(kind, refId, null, null);
  const mesthriRow = project?.rows.find((r) => r.isMesthri) ?? null;
  const effectiveMesthriId = mesthriLaborerId ?? mesthriRow?.laborerId ?? null;
  const displayName = mesthriName ?? project?.mesthriName ?? null;

  const { data: payableRows } = useMesthriCommissionPayable(
    siteId ?? null,
    effectiveMesthriId,
    null,
    null,
    kind,
    refId,
  );
  const payable = payableRows?.[0];

  if (!displayName) return null;

  const view = computeMesthriStrip({
    ownNet: mesthriRow?.netTotal ?? 0,
    ownPaid: mesthriRow?.netPaid ?? 0,
    commissionAccrued: payable?.accrued ?? 0,
    commissionPaid: payable?.paid ?? 0,
    untaggedCommissionPaid: payable?.untaggedPaid ?? 0,
    commissionApplies,
  });

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
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
        Mesthri {displayName} · this contract
      </Typography>

      {view.isSettled ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
          <CheckCircleRounded sx={{ fontSize: 20, color: wsColors.green }} />
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: wsColors.green, ...num }}>
            All settled · {formatCurrencyFull(view.totalEarned)} paid
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
            Own wages {formatCurrencyFull(view.ownRemaining)}
            {commissionApplies ? <> · Commission {formatCurrencyFull(view.commissionRemaining)}</> : null}
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
            {formatCurrencyFull(view.totalPaid)} paid of {formatCurrencyFull(view.totalEarned)}
          </Typography>
        </>
      )}

      {view.untaggedNote > 0 && (
        <Typography sx={{ fontSize: 11, color: "#8a5a00", bgcolor: "#fff3d6", borderRadius: 1, px: 0.75, py: 0.5, mt: 0.75 }}>
          ⚠ {formatCurrencyFull(view.untaggedNote)} commission paid to {displayName} site-wide
          earlier, not tagged to a contract — not counted above.
        </Typography>
      )}

      {canPay && !view.isSettled && (
        <Box sx={{ display: "flex", gap: 1, mt: 0.75, flexWrap: "wrap" }}>
          {mesthriRow && view.ownRemaining > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setPayOwnOpen(true)}
              sx={{ textTransform: "none", fontWeight: 700, py: 0.25 }}
            >
              Pay own wages {formatCurrencyFull(view.ownRemaining)}
            </Button>
          )}
          {effectiveMesthriId && commissionApplies && view.commissionRemaining > 0 && (
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

      {payoutOpen && siteId && effectiveMesthriId && (
        <CommissionPayoutDialog
          open={payoutOpen}
          onClose={() => setPayoutOpen(false)}
          siteId={siteId}
          collectorLaborerId={effectiveMesthriId}
          collectorName={displayName}
          contractRefKind={kind}
          contractRefId={refId}
        />
      )}

      {payOwnOpen && siteId && mesthriRow && (
        <ContractLaborerPayDialog
          open={payOwnOpen}
          onClose={() => setPayOwnOpen(false)}
          siteId={siteId}
          kind={kind}
          refId={refId}
          laborerId={mesthriRow.laborerId}
          laborerName={mesthriRow.laborerName}
          amountOwed={view.ownRemaining}
          dateFrom={null}
          dateTo={null}
          windowLabel="in total"
        />
      )}
    </Box>
  );
}
