"use client";

import { useMemo, useState } from "react";
import { Box, Typography, ToggleButton, ToggleButtonGroup, Chip, Skeleton, Button } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import dayjs from "dayjs";
import {
  useContractLaborLedger,
  type ContractLedgerKind,
  type ContractLaborLedgerRow,
} from "@/hooks/queries/useContractLaborLedger";
import { weekStartStr, weekEndStr } from "@/lib/utils/weekUtils";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import ContractLaborerPayDialog from "./ContractLaborerPayDialog";
import MesthriPayStrip from "./MesthriPayStrip";
import ContractLedgerWeekList from "./ContractLedgerWeekList";
import type { WeeklyLedgerRow } from "@/lib/workforce/ledgerWeeks";

type Period = "day" | "week" | "project";

/** Compute the [from, to] window for a period. Project = whole lifetime (null bounds). */
function windowFor(period: Period): { from: string | null; to: string | null } {
  if (period === "project") return { from: null, to: null };
  if (period === "day") {
    const d = dayjs().format("YYYY-MM-DD");
    return { from: d, to: d };
  }
  return { from: weekStartStr(dayjs()), to: weekEndStr(dayjs()) };
}

const num = { fontVariantNumeric: "tabular-nums" as const };

/**
 * Per-company-laborer earnings + mesthri-commission ledger for one contract
 * (task-work package or subcontract). In DIRECT-pay mode each laborer row can be paid
 * their net directly (owed → paid → remaining) and the maistry gets his own wages +
 * commission from the strip. In lump mode it's a read-only earnings view.
 */
export default function ContractLaborLedger({
  kind,
  refId,
  commissionEnabled,
  commissionApplies = true,
  onEnableCommission,
  defaultPeriod = "project",
  siteId,
  mesthriLaborerId,
  mesthriName,
}: {
  kind: ContractLedgerKind;
  refId: string;
  /** The contract's mesthri_commission_enabled flag = "pay laborers directly" mode. */
  commissionEnabled: boolean;
  /** The contract's mesthri_commission_applies flag. false + direct-pay = laborers
   * paid their full wage with no commission to the maistry. Defaults true. */
  commissionApplies?: boolean;
  /** Optional: inline affordance to switch to direct-pay (opens the edit dialog). */
  onEnableCommission?: () => void;
  defaultPeriod?: Period;
  /** Site + contract mesthri — when present + direct mode, enables in-pane payments. */
  siteId?: string;
  mesthriLaborerId?: string | null;
  mesthriName?: string | null;
}) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [payLaborer, setPayLaborer] = useState<ContractLaborLedgerRow | null>(null);
  const { from, to } = useMemo(() => windowFor(period), [period]);
  const { data, isLoading } = useContractLaborLedger(kind, refId, from, to, period !== "week");

  const rows = data?.rows ?? [];

  // Direct-pay mode enables per-laborer settlement inside the pane.
  const canPay = commissionEnabled && Boolean(siteId);
  // In direct mode the maistry is handled entirely in the strip; the rows list is crew.
  const crewRows = commissionEnabled ? rows.filter((r) => !r.isMesthri) : rows;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {/* Period toggle */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={period}
          onChange={(_, v) => v && setPeriod(v)}
          sx={{
            "& .MuiToggleButton-root": {
              px: 1.4,
              py: 0.35,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "none",
              color: wsColors.muted,
              border: `1px solid ${wsColors.hairline}`,
            },
            "& .Mui-selected": {
              color: `${wsColors.primary} !important`,
              bgcolor: `${wsColors.primaryTint} !important`,
            },
          }}
        >
          <ToggleButton value="day">Day</ToggleButton>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="project">Project</ToggleButton>
        </ToggleButtonGroup>
        {!commissionEnabled && (
          <Chip
            size="small"
            label={onEnableCommission ? "Paid via maistry · Switch" : "Paid via maistry"}
            onClick={onEnableCommission}
            clickable={Boolean(onEnableCommission)}
            sx={{ fontSize: 11, fontWeight: 700, color: wsColors.muted, bgcolor: "#f0f2f6" }}
          />
        )}
        {commissionEnabled && !commissionApplies && (
          <Chip
            size="small"
            label="No commission · full wage"
            sx={{ fontSize: 11, fontWeight: 700, color: "#8a5a00", bgcolor: "#fff3d6" }}
          />
        )}
      </Box>

      {commissionEnabled && siteId && (
        <MesthriPayStrip
          kind={kind}
          refId={refId}
          siteId={siteId}
          mesthriLaborerId={mesthriLaborerId}
          mesthriName={mesthriName}
          commissionApplies={commissionApplies}
          canPay={canPay}
        />
      )}

      {payLaborer && siteId && (
        <ContractLaborerPayDialog
          open={Boolean(payLaborer)}
          onClose={() => setPayLaborer(null)}
          siteId={siteId}
          kind={kind}
          refId={refId}
          laborerId={payLaborer.laborerId}
          laborerName={payLaborer.laborerName}
          amountOwed={payLaborer.netUnpaid}
          dateFrom={null}
          dateTo={null}
          windowLabel="in total"
        />
      )}

      {/* Rows */}
      {period === "week" ? (
        <ContractLedgerWeekList
          kind={kind}
          refId={refId}
          canPay={canPay}
          onPay={(r: WeeklyLedgerRow) =>
            setPayLaborer({
              laborerId: r.laborerId, laborerName: r.laborerName, roleName: r.roleName,
              manDays: r.manDays, dayCount: r.dayCount, gross: r.gross,
              commission: r.commission, net: r.net, netTotal: r.netTotal,
              netPaid: r.netPaid, netUnpaid: r.netUnpaid, isMesthri: r.isMesthri,
            })
          }
        />
      ) : isLoading ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={52} />
          ))}
        </Box>
      ) : crewRows.length === 0 ? (
        <Box sx={{ py: 3, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
            No company laborers on this contract{period === "day" ? " today" : " yet"}.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {crewRows.map((r) => {
            const paid = r.netUnpaid <= 0.5 && r.netTotal > 0;
            return (
              <Box
                key={r.laborerId}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  px: 1.25,
                  py: 0.9,
                  borderRadius: `${wsRadius.row}px`,
                  border: `1px solid ${wsColors.hairline}`,
                  bgcolor: r.isMesthri ? wsColors.primaryTint : wsColors.surface,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: wsColors.ink }} noWrap>
                      {r.laborerName}
                    </Typography>
                    {r.isMesthri && (
                      <Chip
                        size="small"
                        label="Mesthri"
                        sx={{ height: 18, fontSize: 10, fontWeight: 800, color: wsColors.primary, bgcolor: "#fff" }}
                      />
                    )}
                  </Box>
                  <Typography sx={{ fontSize: 11.5, color: wsColors.muted, ...num }} noWrap>
                    {r.roleName} · {r.manDays} day{r.manDays === 1 ? "" : "s"}
                    {commissionEnabled && r.commission > 0 ? (
                      <> · {formatCurrencyFull(r.gross)} <Box component="span" sx={{ color: wsColors.amber, fontWeight: 700 }}>−{formatCurrencyFull(r.commission)}</Box></>
                    ) : null}
                  </Typography>
                </Box>

                {/* Right side: lump mode = net earned; direct mode = remaining + Pay */}
                {commissionEnabled ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 800, color: paid ? wsColors.green : wsColors.ink, ...num }}>
                        {paid ? formatCurrencyFull(r.netTotal) : formatCurrencyFull(r.netUnpaid)}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: wsColors.muted, ...num }}>
                        {paid
                          ? "paid in total"
                          : r.netPaid > 0
                            ? `${formatCurrencyFull(r.netPaid)} paid of ${formatCurrencyFull(r.netTotal)}`
                            : "owed in total"}
                      </Typography>
                    </Box>
                    {canPay && (
                      paid ? (
                        <CheckCircleRounded sx={{ fontSize: 20, color: wsColors.green }} />
                      ) : (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => setPayLaborer(r)}
                          sx={{ textTransform: "none", fontWeight: 700, py: 0.25, minWidth: 0, px: 1.25 }}
                        >
                          Pay
                        </Button>
                      )
                    )}
                  </Box>
                ) : (
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: wsColors.ink, ...num }}>
                      {formatCurrencyFull(r.net)}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: wsColors.muted }}>earned</Typography>
                  </Box>
                )}
              </Box>
            );
          })}

          {/* Totals footer */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 1.25,
              pt: 1,
              mt: 0.25,
              borderTop: `1px solid ${wsColors.hairline}`,
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
              {commissionEnabled ? "Still owed to laborers in total" : "Total earned"}
            </Typography>
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontSize: 15, fontWeight: 900, color: wsColors.ink, ...num }}>
                {commissionEnabled
                  ? formatCurrencyFull(data?.totalNetUnpaid ?? 0)
                  : formatCurrencyFull(data?.totalNet ?? 0)}
              </Typography>
              {commissionEnabled && (data?.totalNetPaid ?? 0) > 0 && (
                <Typography sx={{ fontSize: 11, color: wsColors.muted, ...num }}>
                  {formatCurrencyFull(data?.totalNetPaid ?? 0)} paid of {formatCurrencyFull(data?.totalNetTotal ?? 0)}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
