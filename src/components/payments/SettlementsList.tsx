"use client";

import React from "react";
import { Box, Chip, Skeleton, Stack, Typography, alpha, useTheme } from "@mui/material";
import dayjs from "dayjs";
import type { SettlementListRow } from "@/hooks/queries/useSettlementsList";

interface SettlementsListProps {
  rows: SettlementListRow[];
  isLoading: boolean;
  onRowClick: (row: SettlementListRow) => void;
  /** Empty-state message tailored to the active filter. */
  emptyMessage?: string;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function getPaymentModeLabel(mode: string | null): string {
  if (!mode) return "—";
  switch (mode) {
    case "upi": return "UPI";
    case "cash": return "Cash";
    case "net_banking": return "Bank";
    case "cheque": return "Cheque";
    default: return mode;
  }
}

function getPayerSourceLabel(source: string | null): string {
  if (!source) return "";
  switch (source) {
    case "client_money": return "Client";
    case "site_cash": return "Site cash";
    case "company": return "Company";
    case "engineer_own": return "Engineer";
    case "own_money": return "Own";
    case "amma_money":
    case "mothers_money": return "Amma";
    case "trust_account": return "Trust";
    case "other_site_money": return "Other site";
    default: return source;
  }
}

export function SettlementsList({
  rows,
  isLoading,
  onRowClick,
  emptyMessage,
}: SettlementsListProps) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {emptyMessage ?? "No settlements recorded for this period."}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Stack divider={<Box sx={{ height: 1, bgcolor: "divider" }} />}>
        {rows.map((r) => (
          <Box
            key={r.id}
            onClick={() => onRowClick(r)}
            sx={{
              px: { xs: 1.25, sm: 1.75 },
              py: 1.25,
              cursor: "pointer",
              opacity: r.isCancelled ? 0.55 : 1,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr auto", md: "150px 170px 1fr 110px 100px" },
                gap: { xs: 1, md: 1.5 },
                alignItems: "center",
              }}
            >
              {/* Date column */}
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>
                  {dayjs(r.settlementDate).format("DD MMM YYYY")}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                  }}
                >
                  {dayjs(r.settlementDate).format("ddd")}
                  {r.actualPaymentDate &&
                    r.actualPaymentDate !== r.settlementDate &&
                    ` · paid ${dayjs(r.actualPaymentDate).format("DD MMM")}`}
                </Typography>
              </Box>

              {/* Settlement reference */}
              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Box
                  component="span"
                  sx={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    bgcolor: "background.paper",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 0.5,
                    px: 0.75,
                    py: 0.25,
                    color: "primary.main",
                  }}
                >
                  {r.ref}
                </Box>
                {r.isCancelled && (
                  <Chip
                    size="small"
                    label="Cancelled"
                    color="error"
                    sx={{ ml: 0.5, height: 18, fontSize: 9.5, fontWeight: 700 }}
                  />
                )}
              </Box>

              {/* Notes / preview */}
              <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    color: "text.secondary",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={r.notes ?? undefined}
                >
                  {r.notes
                    ? r.notes
                    : `${r.laborerCount} laborer${r.laborerCount === 1 ? "" : "s"}${
                        r.paymentType && r.paymentType !== "salary"
                          ? ` · ${r.paymentType}`
                          : ""
                      }`}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.25, flexWrap: "wrap" }}>
                  <Chip
                    size="small"
                    label={getPaymentModeLabel(r.paymentMode)}
                    sx={{
                      height: 16,
                      fontSize: 9.5,
                      fontWeight: 600,
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      color: "primary.dark",
                    }}
                  />
                  {r.payerSource && (
                    <Chip
                      size="small"
                      label={getPayerSourceLabel(r.payerSource)}
                      variant="outlined"
                      sx={{ height: 16, fontSize: 9.5, fontWeight: 600 }}
                    />
                  )}
                  {r.hasProof && (
                    <Chip
                      size="small"
                      label="📎 Proof"
                      sx={{
                        height: 16,
                        fontSize: 9.5,
                        fontWeight: 600,
                        bgcolor: alpha(theme.palette.success.main, 0.12),
                        color: "success.dark",
                      }}
                    />
                  )}
                  {!r.subcontractId && !r.isCancelled && (
                    <Chip
                      size="small"
                      label="⚠ Unlinked"
                      sx={{
                        height: 16,
                        fontSize: 9.5,
                        fontWeight: 700,
                        bgcolor: alpha(theme.palette.warning.main, 0.16),
                        color: theme.palette.warning.dark,
                      }}
                    />
                  )}
                </Box>
              </Box>

              {/* Type chip */}
              <Box sx={{ display: { xs: "none", md: "block" }, justifySelf: "start" }}>
                {r.isContract ? (
                  <Chip
                    size="small"
                    label="💼 Contract"
                    sx={{
                      height: 20,
                      fontSize: 10.5,
                      fontWeight: 700,
                      bgcolor: alpha(theme.palette.warning.main, 0.14),
                      color: theme.palette.warning.dark,
                    }}
                  />
                ) : (
                  <Chip
                    size="small"
                    label="📅 Daily/Market"
                    sx={{
                      height: 20,
                      fontSize: 10.5,
                      fontWeight: 700,
                      bgcolor: alpha(theme.palette.info.main, 0.14),
                      color: theme.palette.info.dark,
                    }}
                  />
                )}
              </Box>

              {/* Amount */}
              <Box sx={{ justifySelf: "end" }}>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: 14,
                    fontVariantNumeric: "tabular-nums",
                    color: r.isCancelled ? "text.disabled" : "success.dark",
                    textDecoration: r.isCancelled ? "line-through" : "none",
                  }}
                >
                  {formatINR(r.totalAmount)}
                </Typography>
              </Box>

              {/* Mobile-only: ref + chips line */}
              <Box
                sx={{
                  display: { xs: "flex", md: "none" },
                  gridColumn: "1 / -1",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: 0.5,
                  gap: 0.75,
                  flexWrap: "wrap",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "primary.main",
                  }}
                >
                  {r.ref}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <Chip
                    size="small"
                    label={getPaymentModeLabel(r.paymentMode)}
                    sx={{ height: 16, fontSize: 9.5 }}
                  />
                  {r.isContract ? (
                    <Chip
                      size="small"
                      label="Contract"
                      sx={{ height: 16, fontSize: 9.5 }}
                    />
                  ) : (
                    <Chip
                      size="small"
                      label="Daily"
                      sx={{ height: 16, fontSize: 9.5 }}
                    />
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
