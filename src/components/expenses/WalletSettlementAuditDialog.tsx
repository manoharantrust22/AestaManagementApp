"use client";

import React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import {
  Close,
  AccountBalanceWallet as WalletIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { MiscExpenseWithDetails } from "@/types/misc-expense.types";
import { useWalletSettlementAudit } from "@/hooks/queries/useWalletSettlementAudit";
import { buildFundedByRows } from "@/lib/wallet/walletSettlementAudit";

const inr = (n: number) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n))
  )}`;

const fmtDate = (d: string | null | undefined) =>
  d ? dayjs(d).format("DD MMM YYYY") : "";

interface Props {
  open: boolean;
  onClose: () => void;
  expense: MiscExpenseWithDetails | null;
}

/**
 * Read-only audit of a wallet-funded misc settlement: how the engineer's wallet
 * funded it (which deposit sources, in FIFO order, with their dates), who
 * recorded it and when, any edit, and the linked settlement reference. Opened
 * from the violet wallet icon on the Miscellaneous list.
 */
export default function WalletSettlementAuditDialog({ open, onClose, expense }: Props) {
  const spendId = expense?.engineer_transaction_id ?? null;
  const { data, isLoading } = useWalletSettlementAudit(open ? spendId : null);

  if (!expense) return null;

  const engineer = expense.site_engineer_name?.trim();
  const fundedBy = data ? buildFundedByRows(data.allocations) : [];
  const spend = data?.spend;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <WalletIcon sx={{ color: "#6366f1" }} fontSize="small" />
          <span>Wallet settlement audit</span>
        </Stack>
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
          aria-label="close"
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary">
          Settled via {engineer ? `${engineer}'s` : "the engineer's"} wallet
        </Typography>
        <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.5 }}>
          <Typography variant="h6" color="primary">
            {inr(expense.amount)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {fmtDate(expense.date)} · {expense.reference_number}
          </Typography>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}
        >
          Funded by
        </Typography>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        ) : fundedBy.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", mt: 1 }}>
            No wallet allocation found for this settlement.
          </Typography>
        ) : (
          <Stack spacing={0.75} sx={{ mt: 1 }}>
            {fundedBy.map((r, i) => (
              <Stack
                key={i}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Chip
                  size="small"
                  variant="outlined"
                  color={r.isPending ? "warning" : "default"}
                  label={r.label}
                />
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {inr(r.amount)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.isPending
                      ? "not yet funded by a deposit"
                      : r.depositDate
                      ? `from deposit on ${fmtDate(r.depositDate)}`
                      : "from a deposit"}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        )}

        {spend && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Recorded by{" "}
                <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                  {spend.recorded_by || "—"}
                </Box>{" "}
                on {fmtDate(spend.created_at)}
                {spend.payment_mode ? ` · ${spend.payment_mode}` : ""}
              </Typography>
              {spend.edited_at && (
                <Typography variant="body2" color="text.secondary">
                  Edited by{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                    {spend.edited_by || "—"}
                  </Box>{" "}
                  on {fmtDate(spend.edited_at)}
                  {spend.edit_reason ? `: ${spend.edit_reason}` : ""}
                </Typography>
              )}
              {spend.settlement_group_id && spend.settlement_reference && (
                <Typography variant="body2" color="text.secondary">
                  Part of settlement{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                    {spend.settlement_reference}
                  </Box>
                </Typography>
              )}
            </Stack>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
