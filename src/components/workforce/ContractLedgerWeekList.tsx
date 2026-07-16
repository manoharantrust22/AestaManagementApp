"use client";

import { useMemo, useState } from "react";
import { Box, Typography, Skeleton, Button, Collapse } from "@mui/material";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import { useContractLaborLedgerWeekly } from "@/hooks/queries/useContractLaborLedgerWeekly";
import { groupRowsByWeek, type WeeklyLedgerRow } from "@/lib/workforce/ledgerWeeks";
import type { ContractLedgerKind } from "@/hooks/queries/useContractLaborLedger";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

const num = { fontVariantNumeric: "tabular-nums" as const };
const INITIAL_WEEKS = 4;

/**
 * Every week the crew worked this contract, newest first — wages are paid weekly, so
 * each past week is its own event.
 *
 * A week shows what was EARNED in it. Remaining is project-scoped (payments are never
 * recorded against a week) and is captioned "owed in total" so it cannot be misread.
 */
export default function ContractLedgerWeekList({
  kind,
  refId,
  canPay,
  onPay,
}: {
  kind: ContractLedgerKind;
  refId: string;
  canPay: boolean;
  onPay: (row: WeeklyLedgerRow) => void;
}) {
  const { data, isLoading } = useContractLaborLedgerWeekly(kind, refId);
  const weeks = useMemo(() => groupRowsByWeek(data ?? []), [data]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shown, setShown] = useState(INITIAL_WEEKS);

  // Newest week open by default, without fighting the user's later choices.
  const openWeek = expanded ?? weeks[0]?.weekStart ?? null;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={52} />)}
      </Box>
    );
  }

  if (weeks.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
          No company laborers on this contract yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {weeks.slice(0, shown).map((w) => {
        const isOpen = openWeek === w.weekStart;
        return (
          <Box key={w.weekStart} sx={{ borderRadius: `${wsRadius.row}px`, border: `1px solid ${wsColors.hairline}`, overflow: "hidden" }}>
            <Box
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(isOpen ? "" : w.weekStart)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(isOpen ? "" : w.weekStart); }}
              sx={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 1, px: 1.25, py: 0.9, cursor: "pointer", bgcolor: wsColors.surface,
                "&:hover": { bgcolor: wsColors.primaryTint },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                <ExpandMoreRounded
                  sx={{ fontSize: 18, color: wsColors.muted, transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }}
                />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink }} noWrap>
                  {w.label}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: wsColors.ink, flexShrink: 0, ...num }}>
                {formatCurrencyFull(w.totalNet)}{" "}
                <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: wsColors.muted }}>earned</Box>
              </Typography>
            </Box>

            <Collapse in={isOpen} unmountOnExit>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, px: 1, pb: 1, pt: 0.25 }}>
                {w.rows.map((r) => {
                  const settled = r.netUnpaid <= 0.5 && r.netTotal > 0;
                  return (
                    <Box
                      key={r.laborerId}
                      sx={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 1, px: 1, py: 0.75, borderRadius: `${wsRadius.row}px`,
                        bgcolor: r.isMesthri ? wsColors.primaryTint : "transparent",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink }} noWrap>
                          {r.laborerName}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: wsColors.muted, ...num }} noWrap>
                          {r.roleName} · {r.manDays} day{r.manDays === 1 ? "" : "s"} · earned {formatCurrencyFull(r.net)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: settled ? wsColors.green : wsColors.ink, ...num }}>
                            {settled ? formatCurrencyFull(r.netTotal) : formatCurrencyFull(r.netUnpaid)}
                          </Typography>
                          <Typography sx={{ fontSize: 10.5, color: wsColors.muted, ...num }}>
                            {settled ? "paid in total" : "owed in total"}
                          </Typography>
                        </Box>
                        {canPay && (settled ? (
                          <CheckCircleRounded sx={{ fontSize: 18, color: wsColors.green }} />
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => onPay(r)}
                            sx={{ textTransform: "none", fontWeight: 700, py: 0.15, minWidth: 0, px: 1 }}
                          >
                            Pay
                          </Button>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {weeks.length > shown && (
        <Button
          size="small"
          onClick={() => setShown((n) => n + INITIAL_WEEKS)}
          sx={{ textTransform: "none", fontWeight: 700, color: wsColors.primary, alignSelf: "center", mt: 0.5 }}
        >
          Load earlier weeks
        </Button>
      )}
    </Box>
  );
}
