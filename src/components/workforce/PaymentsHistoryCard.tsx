"use client";

import { useState } from "react";
import { Box, IconButton, Tooltip, Typography, Skeleton } from "@mui/material";
import Payments from "@mui/icons-material/Payments";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import {
  useContractPayments,
  type ContractLedgerEntry,
  type LedgerSource,
} from "@/hooks/queries/useContractPayments";
import { useDeleteSubcontractPayment } from "@/hooks/queries/useSubcontractPayments";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull, formatDateDDMMMYY } from "@/lib/formatters";
import {
  RemoveContractPaymentDialog,
  type RemoveContractPaymentTarget,
} from "./RemoveContractPaymentDialog";

const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank",
  cheque: "Cheque",
  other: "Other",
};

/**
 * Source chip meta. This card is the single read-only money ledger for a contract:
 * money entered on the contract page ("Contract"), money settled through the workspace
 * Salary Settlements ("Salary"), and allocated extras ("category name"). Keeping all
 * three visible here is what interconnects the contract page and the workspace — a
 * payment recorded in either place surfaces on both.
 */
function chipMeta(entry: ContractLedgerEntry): { label: string; color: string; bg: string } {
  const source: LedgerSource = entry.source;
  if (source === "settlement") return { label: "Salary", color: wsColors.green, bg: wsColors.greenBg };
  if (source === "extra")
    return { label: entry.paymentType || "Extra", color: wsColors.amber, bg: wsColors.amberBg };
  return { label: "Contract", color: wsColors.ink2, bg: "#eef1f6" };
}

/**
 * Only a `direct` row (subcontract_payments) can be removed here. A `settlement`
 * row is reversed from Salary Settlements and an `extra` row is cancelled from
 * /site/expenses — each has an owner screen that handles its own side effects,
 * so this card deliberately stays read-only for those.
 */
function isRemovable(entry: ContractLedgerEntry): boolean {
  return entry.source === "direct";
}

/** Strip the `sp:` prefix useContractPayments adds to keep ids unique across sources. */
function bareId(entry: ContractLedgerEntry): string {
  return entry.id.replace(/^sp:/, "");
}

export function PaymentsHistoryCard({
  contractId,
  canEdit = false,
}: {
  contractId: string;
  /** Absent/false hides every row action — the parent owns the permission call. */
  canEdit?: boolean;
}) {
  const { data: payments, isLoading } = useContractPayments(contractId);
  const removeMut = useDeleteSubcontractPayment();
  const [pendingRemove, setPendingRemove] =
    useState<RemoveContractPaymentTarget | null>(null);

  const confirmRemove = (reason: string) => {
    if (!pendingRemove) return;
    removeMut.mutate(
      { paymentId: pendingRemove.paymentId, contractId, reason },
      { onSuccess: () => setPendingRemove(null) }
    );
  };

  const closeRemove = () => {
    setPendingRemove(null);
    removeMut.reset();
  };

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
          {payments.map((p) => {
            const chip = chipMeta(p);
            return (
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
                <Box
                  component="span"
                  sx={{
                    flexShrink: 0,
                    px: 0.85,
                    py: 0.25,
                    borderRadius: `${wsRadius.pill}px`,
                    bgcolor: chip.bg,
                    color: chip.color,
                    fontSize: 10.5,
                    fontWeight: 700,
                    maxWidth: 110,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chip.label}
                </Box>
                {canEdit && isRemovable(p) && (
                  <Tooltip title="Remove this payment">
                    <IconButton
                      size="small"
                      aria-label={`Remove the ${formatCurrencyFull(p.amount)} contract payment from ${formatDateDDMMMYY(p.paymentDate)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingRemove({
                          paymentId: bareId(p),
                          amount: p.amount,
                          paymentDate: p.paymentDate,
                          paymentChannel: p.paymentChannel,
                        });
                      }}
                      sx={{ flexShrink: 0, color: wsColors.muted, p: 0.5 }}
                    >
                      <DeleteOutline sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <RemoveContractPaymentDialog
        target={pendingRemove}
        isRemoving={removeMut.isPending}
        errorMessage={removeMut.error?.message ?? null}
        onCancel={closeRemove}
        onConfirm={confirmRemove}
      />
    </Box>
  );
}
