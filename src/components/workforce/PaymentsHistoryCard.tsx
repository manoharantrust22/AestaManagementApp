"use client";

import { Box, Typography, Skeleton } from "@mui/material";
import Payments from "@mui/icons-material/Payments";
import { useSubcontractPayments } from "@/hooks/queries/useSubcontractPayments";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull, formatDateDDMMMYY } from "@/lib/formatters";

const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank",
  cheque: "Cheque",
  other: "Other",
};

export function PaymentsHistoryCard({ contractId }: { contractId: string }) {
  const { data: payments, isLoading } = useSubcontractPayments(contractId);

  return (
    <Box
      sx={{
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.card}px`,
        boxShadow: wsShadow.card,
        p: 1.75,
        flex: 1,
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: wsColors.ink, mb: 1 }}>
        Payments
      </Typography>

      {isLoading ? (
        <Skeleton variant="rounded" height={56} />
      ) : !payments || payments.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: wsColors.muted }}>No payments yet.</Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {payments.map((p) => (
            <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: `${wsRadius.input}px`,
                  bgcolor: wsColors.primaryTint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Payments sx={{ fontSize: 17, color: wsColors.primary }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: wsColors.ink, fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrencyFull(p.amount)}
                </Typography>
                <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
                  {formatDateDDMMMYY(p.paymentDate)}
                  {p.paymentMode ? ` · ${MODE_LABEL[p.paymentMode] ?? p.paymentMode}` : ""}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
