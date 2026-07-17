"use client";

import { useState } from "react";
import { Box, Button, Chip, Collapse, Typography } from "@mui/material";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import WaterDropRounded from "@mui/icons-material/WaterDropRounded";
import type { CrewLedgerRow, CrewLedgerWeek } from "@/lib/payments/crewLedger";
import { formatWeekRange } from "@/lib/workforce/ledgerWeeks";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

const num = { fontVariantNumeric: "tabular-nums" as const };
const INITIAL_WEEKS = 4;

/**
 * Every Sun–Sat week of the Civil slice, newest first. Post-cutover weeks carry
 * live Pay buttons per laborer (net of the mesthri's commission); pre-cutover
 * weeks are read-only — their money went through the waterfall and is shown as
 * "Paid via waterfall" per laborer. The mesthri row is tinted; his money is
 * managed from the strip above, so his row never gets a Pay button here.
 */
export default function CrewWeekList({
  weeks,
  canPay,
  onPay,
}: {
  weeks: CrewLedgerWeek[];
  canPay: boolean;
  onPay: (row: CrewLedgerRow, week: CrewLedgerWeek) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shown, setShown] = useState(INITIAL_WEEKS);

  // Newest week open by default, without fighting the user's later choices.
  const openWeek = expanded ?? weeks[0]?.weekStart ?? null;

  if (weeks.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
          No company laborer attendance in this slice yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {weeks.slice(0, shown).map((w) => {
        const isOpen = openWeek === w.weekStart;
        const weekSettled = w.weekPaid >= w.wagesDue - 0.5;
        return (
          <Box key={w.weekStart} sx={{ borderRadius: `${wsRadius.row}px`, border: `1px solid ${wsColors.hairline}`, overflow: "hidden" }}>
            <Box
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
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
                  {formatWeekRange(w.weekStart)}
                </Typography>
                {!w.isPostCutover && (
                  <Chip
                    icon={<WaterDropRounded sx={{ fontSize: 12 }} />}
                    label="Waterfall"
                    size="small"
                    sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: wsColors.primaryTint, color: wsColors.muted }}
                  />
                )}
              </Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: weekSettled ? wsColors.green : wsColors.ink, flexShrink: 0, ...num }}>
                {formatCurrencyFull(w.weekPaid)}
                <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: wsColors.muted }}>
                  {" "}of {formatCurrencyFull(w.wagesDue)}
                </Box>
              </Typography>
            </Box>

            <Collapse in={isOpen} unmountOnExit>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, px: 1, pb: 1, pt: 0.25 }}>
                {w.rows.map((r) => {
                  const settled = r.unpaid <= 0.5 && r.earned > 0;
                  const viaWaterfall =
                    r.paymentState === "considered_paid_waterfall" ||
                    r.paymentState === "partial_waterfall";
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
                          {r.name}
                          {r.isMesthri && (
                            <Box component="span" sx={{ fontSize: 10.5, fontWeight: 700, color: wsColors.muted }}> · MESTHRI</Box>
                          )}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: wsColors.muted, ...num }} noWrap>
                          {r.role ?? "—"} · {r.days} day{r.days === 1 ? "" : "s"} ·{" "}
                          {r.isMesthri
                            ? <>own {formatCurrencyFull(r.gross)} + comm {formatCurrencyFull(w.commissionTotal)}</>
                            : r.commission > 0
                              ? <>{formatCurrencyFull(r.gross)} − ₹{Math.round(r.commission)} comm = {formatCurrencyFull(r.net)}</>
                              : <>earned {formatCurrencyFull(r.net)}</>}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                        {!w.isPostCutover ? (
                          <Chip
                            size="small"
                            icon={viaWaterfall && r.paymentState === "considered_paid_waterfall"
                              ? <CheckCircleRounded sx={{ fontSize: 14 }} />
                              : undefined}
                            label={
                              r.paymentState === "considered_paid_waterfall"
                                ? "Paid via waterfall"
                                : r.paymentState === "partial_waterfall"
                                  ? `Partly via waterfall · ${formatCurrencyFull(r.unpaid)} short`
                                  : r.paymentState === "paid_direct"
                                    ? "Paid directly"
                                    : "Not covered"
                            }
                            sx={{
                              height: 22, fontSize: 10.5, fontWeight: 700, ...num,
                              bgcolor: r.paymentState === "considered_paid_waterfall" ? wsColors.greenBg : "#f4f4f4",
                              color: r.paymentState === "considered_paid_waterfall" ? wsColors.green : wsColors.muted,
                            }}
                          />
                        ) : (
                          <>
                            <Box sx={{ textAlign: "right" }}>
                              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: settled ? wsColors.green : wsColors.ink, ...num }}>
                                {settled ? formatCurrencyFull(r.paid) : formatCurrencyFull(r.unpaid)}
                              </Typography>
                              <Typography sx={{ fontSize: 10.5, color: wsColors.muted, ...num }}>
                                {settled ? "paid" : r.paid > 0 ? `owed · ${formatCurrencyFull(r.paid)} paid` : "owed this week"}
                              </Typography>
                            </Box>
                            {settled ? (
                              <CheckCircleRounded sx={{ fontSize: 18, color: wsColors.green }} />
                            ) : canPay && !r.isMesthri ? (
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => onPay(r, w)}
                                sx={{ textTransform: "none", fontWeight: 700, py: 0.15, minWidth: 0, px: 1 }}
                              >
                                Pay
                              </Button>
                            ) : null}
                          </>
                        )}
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
