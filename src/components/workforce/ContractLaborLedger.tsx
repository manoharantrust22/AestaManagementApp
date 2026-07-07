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
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import CommissionPayoutDialog from "./CommissionPayoutDialog";
import ContractLaborerPayDialog from "./ContractLaborerPayDialog";

type Period = "day" | "week" | "project";

/** Compute the [from, to] date window for a period. Weeks bucket Sun→Sat to match
 * the salary waterfall (`date - dow`). Project = whole lifetime (null bounds). */
function windowFor(period: Period): { from: string | null; to: string | null } {
  if (period === "project") return { from: null, to: null };
  const today = dayjs();
  if (period === "day") {
    const d = today.format("YYYY-MM-DD");
    return { from: d, to: d };
  }
  const start = today.subtract(today.day(), "day"); // day()=0 on Sunday
  return { from: start.format("YYYY-MM-DD"), to: start.add(6, "day").format("YYYY-MM-DD") };
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
  onEnableCommission,
  defaultPeriod = "week",
  siteId,
  mesthriLaborerId,
  mesthriName,
}: {
  kind: ContractLedgerKind;
  refId: string;
  /** The contract's mesthri_commission_enabled flag = "pay laborers directly" mode. */
  commissionEnabled: boolean;
  /** Optional: inline affordance to switch to direct-pay (opens the edit dialog). */
  onEnableCommission?: () => void;
  defaultPeriod?: Period;
  /** Site + contract mesthri — when present + direct mode, enables in-pane payments. */
  siteId?: string;
  mesthriLaborerId?: string | null;
  mesthriName?: string | null;
}) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payLaborer, setPayLaborer] = useState<ContractLaborLedgerRow | null>(null);
  const { from, to } = useMemo(() => windowFor(period), [period]);
  const { data, isLoading } = useContractLaborLedger(kind, refId, from, to);

  const rows = data?.rows ?? [];
  const totalCommission = data?.totalCommission ?? 0;
  const mesthriOwn = data?.mesthriOwnLabour ?? 0;
  const displayMesthriName = mesthriName ?? data?.mesthriName ?? null;
  const mesthriTotal = mesthriOwn + totalCommission;

  // Direct-pay mode enables per-laborer settlement inside the pane.
  const canPay = commissionEnabled && Boolean(siteId);
  const mesthriRow = rows.find((r) => r.isMesthri) ?? null;
  // The collector's laborer id: prefer the explicit prop (package maistry); otherwise
  // derive it from the ledger's own is_mesthri row (subcontracts don't thread it in).
  const effectiveMesthriId = mesthriLaborerId ?? mesthriRow?.laborerId ?? null;
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
      </Box>

      {/* Mesthri console — own wages + commission collected = total, with pay actions */}
      {commissionEnabled && displayMesthriName && (
        <Box
          sx={{
            px: 1.5,
            py: 1.1,
            borderRadius: `${wsRadius.input}px`,
            bgcolor: wsColors.primaryTint,
            border: `1px solid ${wsColors.primary}22`,
          }}
        >
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
            Mesthri {displayMesthriName}
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: wsColors.ink2, mt: 0.25, ...num }}>
            Own labour {formatCurrencyFull(mesthriOwn)} + commission{" "}
            <Box component="span" sx={{ fontWeight: 800, color: wsColors.primary }}>
              {formatCurrencyFull(totalCommission)}
            </Box>{" "}
            ={" "}
            <Box component="span" sx={{ fontWeight: 800, color: wsColors.ink }}>
              {formatCurrencyFull(mesthriTotal)}
            </Box>
          </Typography>
          {canPay && (
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              {mesthriRow && mesthriRow.netUnpaid > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setPayLaborer(mesthriRow)}
                  sx={{ textTransform: "none", fontWeight: 700, py: 0.25 }}
                >
                  Pay own wages ({formatCurrencyFull(mesthriRow.netUnpaid)})
                </Button>
              )}
              {effectiveMesthriId && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setPayoutOpen(true)}
                  sx={{ textTransform: "none", fontWeight: 700, color: wsColors.primary, py: 0.25 }}
                >
                  Pay commission…
                </Button>
              )}
            </Box>
          )}
        </Box>
      )}

      {payoutOpen && siteId && effectiveMesthriId && (
        <CommissionPayoutDialog
          open={payoutOpen}
          onClose={() => setPayoutOpen(false)}
          siteId={siteId}
          collectorLaborerId={effectiveMesthriId}
          collectorName={displayMesthriName || "Mesthri"}
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
      {isLoading ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={52} />
          ))}
        </Box>
      ) : crewRows.length === 0 ? (
        <Box sx={{ py: 3, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
            No company laborers on this contract{period === "day" ? " today" : period === "week" ? " this week" : " yet"}.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {crewRows.map((r) => {
            const paid = r.netUnpaid <= 0.5 && r.net > 0;
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
                        {paid ? formatCurrencyFull(r.net) : formatCurrencyFull(r.netUnpaid)}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: wsColors.muted, ...num }}>
                        {paid
                          ? "paid"
                          : r.netPaid > 0
                            ? `${formatCurrencyFull(r.netPaid)} paid of ${formatCurrencyFull(r.net)}`
                            : "owed"}
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
              {commissionEnabled ? "Still owed to laborers" : "Total earned"}
            </Typography>
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontSize: 15, fontWeight: 900, color: wsColors.ink, ...num }}>
                {commissionEnabled
                  ? formatCurrencyFull(data?.totalNetUnpaid ?? 0)
                  : formatCurrencyFull(data?.totalNet ?? 0)}
              </Typography>
              {commissionEnabled && (data?.totalNetPaid ?? 0) > 0 && (
                <Typography sx={{ fontSize: 11, color: wsColors.muted, ...num }}>
                  {formatCurrencyFull(data?.totalNetPaid ?? 0)} paid of {formatCurrencyFull(data?.totalNet ?? 0)}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
