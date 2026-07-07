"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  AccountBalanceWallet,
  Add,
  CheckCircle,
  CheckCircleOutline,
  Delete,
  OpenInNew,
  ReceiptLong,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import {
  useContractPaymentHistory,
  type ContractPaymentRow,
} from "@/hooks/queries/useContractPaymentHistory";
import { useDeleteTaskWorkPayment } from "@/hooks/queries/useTaskWorkPayments";
import { useReverseSettlement } from "@/hooks/mutations/useReverseSettlement";
import { formatPayerSource } from "@/lib/settlement/payerSource";
import { type TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import ConfirmDialog from "@/components/common/ConfirmDialog";

interface Props {
  pkg: TaskWorkPackageWithMeta;
  canEdit: boolean;
  /** Open the "Record payment" dialog (owned by the parent pane / drawer). */
  onRecordPayment: () => void;
  /** Open the completion dialog. Hidden when absent or the package is closed. */
  onMarkComplete?: () => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const modeLabel = (m: string | null) =>
  m ? m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Cash";

export default function TaskWorkPaymentsPanel({
  pkg,
  canEdit,
  onRecordPayment,
  onMarkComplete,
}: Props) {
  const { data: history = [], isLoading } = useContractPaymentHistory(
    "task_work",
    pkg.id,
  );
  const deleteMut = useDeleteTaskWorkPayment();
  const reverseMut = useReverseSettlement();
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<ContractPaymentRow | null>(
    null,
  );

  const isClosed = pkg.status === "completed" || pkg.status === "cancelled";
  // Direct-pay mode: crew are paid per-laborer in the ledger; the maistry lump/package
  // payment path is off (blocked server-side too), so the "Record payment" button hides.
  const directMode = Boolean(pkg.mesthri_commission_enabled);
  const hasPackagePayment = history.some((h) => h.source === "package_payment");

  const confirmRemove = () => {
    const row = pendingDelete;
    if (!row) return;
    if (row.source === "package_payment") {
      deleteMut.mutate(
        {
          paymentId: row.refId,
          packageId: pkg.id,
          siteId: pkg.site_id,
          reason: "Removed by user",
        },
        { onSuccess: () => setPendingDelete(null) },
      );
    } else {
      reverseMut.mutate(
        { settlementGroupId: row.refId, reason: "Removed by user" },
        { onSuccess: () => setPendingDelete(null) },
      );
    }
  };

  return (
    <Box>
      {hasPackagePayment && (
        <Box sx={{ mb: 1 }}>
          <Button
            size="small"
            color="success"
            startIcon={<CheckCircle />}
            endIcon={<OpenInNew />}
            sx={{ textTransform: "none" }}
            onClick={() =>
              router.push(
                `/site/expenses?ref=${encodeURIComponent(pkg.package_number)}`,
              )
            }
          >
            On record in Site Expenses · {pkg.package_number}
          </Button>
        </Box>
      )}

      {canEdit && !isClosed && (
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
          {!directMode && (
            <Button
              fullWidth
              size="small"
              variant="contained"
              startIcon={<Add />}
              onClick={onRecordPayment}
            >
              Record payment
            </Button>
          )}
          {onMarkComplete && (
            <Button
              fullWidth
              size="small"
              variant="outlined"
              color="success"
              startIcon={<CheckCircleOutline />}
              onClick={onMarkComplete}
            >
              Mark complete
            </Button>
          )}
        </Box>
      )}

      {directMode && !isClosed && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
        >
          Company laborers are paid directly from the crew ledger above (net of the
          maistry&apos;s commission). Lump payments to the maistry are off for this
          contract.
        </Typography>
      )}

      <Divider />

      {isLoading ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading…
        </Typography>
      ) : history.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {directMode
            ? "No payments yet. Pay each laborer their net (and the maistry his wages + commission) from the crew ledger above."
            : "No payments recorded yet. You can record payments even without a day log — handy for historical back-fill."}
        </Typography>
      ) : (
        <List dense disablePadding>
          {history.map((h) => {
            const src = formatPayerSource({
              payer_source: h.payerSource,
              payer_name: h.payerName,
              payer_source_split: null,
            });
            return (
              <ListItem
                key={`${h.source}:${h.refId}`}
                disableGutters
                secondaryAction={
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    {h.proofUrl && (
                      <IconButton
                        size="small"
                        component="a"
                        href={h.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View payment screenshot"
                      >
                        <ReceiptLong fontSize="small" />
                      </IconButton>
                    )}
                    {canEdit && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setPendingDelete(h)}
                        title={
                          h.source === "package_payment"
                            ? "Delete payment"
                            : "Reverse payment"
                        }
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
                      component="span"
                    >
                      <Typography variant="body2" fontWeight={700} component="span">
                        {inr(h.amount)}
                      </Typography>
                      <Chip size="small" variant="outlined" label={h.payeeName} />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="span"
                      >
                        {h.detail}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        flexWrap: "wrap",
                        mt: 0.25,
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="span"
                      >
                        {h.paymentDate
                          ? dayjs(h.paymentDate).format("DD MMM YYYY")
                          : ""}{" "}
                        · {modeLabel(h.paymentMode)}
                      </Typography>
                      {h.isWallet ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          color="primary"
                          icon={<AccountBalanceWallet sx={{ fontSize: "0.95rem" }} />}
                          label="My wallet"
                          title="Paid from the engineer's own wallet"
                          sx={{
                            height: 20,
                            "& .MuiChip-label": {
                              px: 0.75,
                              fontSize: "0.7rem",
                              fontWeight: 600,
                            },
                          }}
                        />
                      ) : h.payerSource ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="span"
                        >
                          · {src.kind === "single" ? src.label : src.summary}
                        </Typography>
                      ) : null}
                      {h.reference && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="span"
                          sx={{ fontFamily: "monospace" }}
                        >
                          · {h.reference}
                        </Typography>
                      )}
                    </Box>
                  }
                  secondaryTypographyProps={{ component: "div" }}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={
          pendingDelete?.source === "package_payment"
            ? "Delete payment?"
            : "Reverse payment?"
        }
        message={
          pendingDelete
            ? pendingDelete.source === "package_payment"
              ? `This will remove the ${inr(pendingDelete.amount)} payment. This cannot be undone.`
              : `This will reverse the ${inr(pendingDelete.amount)} paid to ${pendingDelete.payeeName} — the days become unpaid again and any wallet debit is refunded.`
            : ""
        }
        confirmText={
          pendingDelete?.source === "package_payment" ? "Delete" : "Reverse"
        }
        confirmColor="error"
        isLoading={deleteMut.isPending || reverseMut.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
      />
    </Box>
  );
}
