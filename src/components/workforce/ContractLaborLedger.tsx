"use client";

import { useMemo, useState } from "react";
import { Box, Typography, ToggleButton, ToggleButtonGroup, Chip, Skeleton, Button } from "@mui/material";
import dayjs from "dayjs";
import {
  useContractLaborLedger,
  type ContractLedgerKind,
} from "@/hooks/queries/useContractLaborLedger";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import CommissionPayoutDialog from "./CommissionPayoutDialog";

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
 * (task-work package or subcontract). Shows each company laborer's gross → −commission
 * → net over a Day / Week / Project window, plus a mesthri summary (own labour +
 * commission collected = total). Read-only.
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
  /** The contract's mesthri_commission_enabled flag (from the package/subcontract). */
  commissionEnabled: boolean;
  /** Optional: inline affordance to turn commission on (opens the edit dialog). */
  onEnableCommission?: () => void;
  defaultPeriod?: Period;
  /** Site + contract mesthri — when all present + commission on, enables "Record commission paid". */
  siteId?: string;
  mesthriLaborerId?: string | null;
  mesthriName?: string | null;
}) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const canPayout =
    commissionEnabled && Boolean(siteId) && Boolean(mesthriLaborerId);
  const { from, to } = useMemo(() => windowFor(period), [period]);
  const { data, isLoading } = useContractLaborLedger(kind, refId, from, to);

  const rows = data?.rows ?? [];
  const totalCommission = data?.totalCommission ?? 0;
  const mesthriOwn = data?.mesthriOwnLabour ?? 0;
  // Prefer the contract's mesthri (prop) for the header; fall back to whoever the
  // ledger flagged as mesthri from attendance.
  const displayMesthriName = mesthriName ?? data?.mesthriName ?? null;
  const mesthriTotal = mesthriOwn + totalCommission;

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
            label={onEnableCommission ? "Commission off · Enable" : "Commission off"}
            onClick={onEnableCommission}
            clickable={Boolean(onEnableCommission)}
            sx={{ fontSize: 11, fontWeight: 700, color: wsColors.muted, bgcolor: "#f0f2f6" }}
          />
        )}
      </Box>

      {/* Mesthri summary — own labour + commission collected = total */}
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
          {canPayout && (
            <Button
              size="small"
              variant="text"
              onClick={() => setPayoutOpen(true)}
              sx={{ mt: 0.5, ml: -0.5, textTransform: "none", fontWeight: 700, color: wsColors.primary }}
            >
              Record commission paid…
            </Button>
          )}
        </Box>
      )}

      {canPayout && siteId && mesthriLaborerId && (
        <CommissionPayoutDialog
          open={payoutOpen}
          onClose={() => setPayoutOpen(false)}
          siteId={siteId}
          collectorLaborerId={mesthriLaborerId}
          collectorName={displayMesthriName || "Mesthri"}
        />
      )}

      {/* Rows */}
      {isLoading ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={52} />
          ))}
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ py: 3, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
            No company laborers on this contract{period === "day" ? " today" : period === "week" ? " this week" : " yet"}.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {rows.map((r) => (
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
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: wsColors.ink, ...num }}>
                  {formatCurrencyFull(r.net)}
                </Typography>
                {commissionEnabled && r.commission > 0 ? (
                  <Typography sx={{ fontSize: 11, color: wsColors.muted, ...num }}>
                    {formatCurrencyFull(r.gross)} <Box component="span" sx={{ color: wsColors.amber, fontWeight: 700 }}>−{formatCurrencyFull(r.commission)}</Box>
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: 11, color: wsColors.muted }}>gross</Typography>
                )}
              </Box>
            </Box>
          ))}

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
              Total {commissionEnabled ? "to laborers (net)" : "earned"}
            </Typography>
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontSize: 15, fontWeight: 900, color: wsColors.ink, ...num }}>
                {formatCurrencyFull(data?.totalNet ?? 0)}
              </Typography>
              {commissionEnabled && totalCommission > 0 && (
                <Typography sx={{ fontSize: 11, color: wsColors.muted, ...num }}>
                  gross {formatCurrencyFull(data?.totalGross ?? 0)} · commission {formatCurrencyFull(totalCommission)}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
