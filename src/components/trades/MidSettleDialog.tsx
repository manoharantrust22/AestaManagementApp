"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Today as TodayIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { weekStartOf, weekEndOf } from "@/lib/utils/weekUtils";
import { useContractMidEntries } from "@/hooks/queries/useContractMidEntries";
import type {
  ContractPaymentType,
  PaymentChannel,
  PaymentMode,
} from "@/hooks/queries/useContractPayments";

interface MidSettleDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  siteId: string;
  contractId: string;
  contractTitle: string;
  /** Optional pre-anchored week (Sun-Sat). Defaults to current week. */
  initialWeekStart?: string;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

interface DayBreakdown {
  date: string;
  presentCount: number;
  earned: number;
  workDone: number;
  note: string | null;
}

/**
 * Settle a mid-mode contract for one Sun-Sat week.
 *
 * Earned for the week  = sum of subcontract_mid_entries.day_total_amount
 *                        for dates in [weekStart, weekEnd]
 * Already paid for week = sum of subcontract_payments.amount where
 *                         period_from_date == weekStart (rough proxy —
 *                         matches the weekly settle convention)
 * Suggested settlement  = max(0, earned − alreadyPaid)
 *
 * Engineer can override the amount and the result is INSERTed into
 * subcontract_payments with payment_type='weekly_advance' and
 * period_from_date / period_to_date set to the week boundaries.
 */
export function MidSettleDialog({
  open,
  onClose,
  onSaved,
  siteId,
  contractId,
  contractTitle,
  initialWeekStart,
}: MidSettleDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [anchor, setAnchor] = useState<string>(
    initialWeekStart ?? dayjs().format("YYYY-MM-DD")
  );
  const weekStart = weekStartOf(anchor);
  const weekEnd = weekEndOf(anchor);
  const weekStartStr = weekStart.format("YYYY-MM-DD");
  const weekEndStr = weekEnd.format("YYYY-MM-DD");

  const [amountOverride, setAmountOverride] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [paymentChannel, setPaymentChannel] =
    useState<PaymentChannel>("via_site_engineer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState<number>(0);

  const { data: midEntries, isLoading } = useContractMidEntries(
    open ? contractId : undefined
  );

  // Fetch payments already made for THIS week so we suggest only the balance.
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const sb = supabase as any;
      const { data, error: e } = await sb
        .from("subcontract_payments")
        .select("amount")
        .eq("contract_id", contractId)
        .eq("period_from_date", weekStartStr)
        .eq("is_deleted", false);
      if (e) {
        setAlreadyPaid(0);
        return;
      }
      const total = (data ?? []).reduce(
        (s: number, r: any) => s + Number(r.amount ?? 0),
        0
      );
      setAlreadyPaid(total);
    })();
  }, [open, contractId, weekStartStr, supabase]);

  useEffect(() => {
    if (!open) return;
    setAnchor(initialWeekStart ?? dayjs().format("YYYY-MM-DD"));
    setAmountOverride("");
    setPaymentMode("cash");
    setPaymentChannel("via_site_engineer");
    setReference("");
    setNote("");
    setError(null);
  }, [open, contractId, initialWeekStart]);

  const { breakdown, weekEarned } = useMemo(() => {
    if (!midEntries) return { breakdown: [] as DayBreakdown[], weekEarned: 0 };
    const byDate = new Map<string, (typeof midEntries)[number]>();
    for (const e of midEntries) {
      if (e.attendanceDate < weekStartStr || e.attendanceDate > weekEndStr) {
        continue;
      }
      byDate.set(e.attendanceDate, e);
    }
    const days: DayBreakdown[] = [];
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const day = weekStart.add(i, "day").format("YYYY-MM-DD");
      const e = byDate.get(day);
      const earned = e?.dayTotalAmount ?? 0;
      total += earned;
      days.push({
        date: day,
        presentCount: e?.laborerIds.length ?? 0,
        earned,
        workDone: e?.workDoneUnits ?? 0,
        note: e?.note ?? null,
      });
    }
    return { breakdown: days, weekEarned: total };
  }, [midEntries, weekStart, weekStartStr, weekEndStr]);

  const balance = Math.max(0, weekEarned - alreadyPaid);
  const proposedAmount = balance;
  const overrideNum = Number(amountOverride || "0");
  const finalAmount =
    amountOverride !== "" && !Number.isNaN(overrideNum) && overrideNum > 0
      ? overrideNum
      : proposedAmount;

  const canSubmit =
    !submitting && finalAmount > 0 && !Number.isNaN(finalAmount);

  const handleShiftWeek = (deltaDays: number) => {
    setAnchor((cur) => dayjs(cur).add(deltaDays, "day").format("YYYY-MM-DD"));
  };
  const handleThisWeek = () => setAnchor(dayjs().format("YYYY-MM-DD"));

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const sb = supabase as any;
      const insertRes = await sb
        .from("subcontract_payments")
        .insert({
          contract_id: contractId,
          amount: finalAmount,
          payment_date: weekEndStr,
          payment_type: "weekly_advance" as ContractPaymentType,
          payment_mode: paymentMode,
          payment_channel: paymentChannel,
          reference_number: reference.trim() || null,
          comments:
            note.trim() ||
            `Mid-mode weekly settlement ${weekStartStr} to ${weekEndStr} (earned ₹${formatINR(weekEarned)}, prior payments ₹${formatINR(alreadyPaid)}, settling ₹${formatINR(finalAmount)})`,
          period_from_date: weekStartStr,
          period_to_date: weekEndStr,
          is_deleted: false,
        })
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["contract-payments", contractId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-reconciliations", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-activity", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-attendance-summary", contractId],
        }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, contractId, kind: "mid_settle", at: Date.now() });
        bc.close();
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const isCurrentWeek =
    weekStartStr === weekStartOf(dayjs()).format("YYYY-MM-DD");

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>
        Settle Mid-mode week
        <Typography variant="caption" color="text.secondary" component="div">
          {contractTitle}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Week selector */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Tooltip title="Previous week">
                <IconButton size="small" onClick={() => handleShiftWeek(-7)}>
                  <PrevIcon />
                </IconButton>
              </Tooltip>
              <Typography variant="subtitle2">
                {weekStart.format("D MMM")} — {weekEnd.format("D MMM YYYY")}
                {isCurrentWeek && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="primary.main"
                    sx={{ ml: 1 }}
                  >
                    · this week
                  </Typography>
                )}
              </Typography>
              <Tooltip title="Next week">
                <IconButton size="small" onClick={() => handleShiftWeek(7)}>
                  <NextIcon />
                </IconButton>
              </Tooltip>
            </Stack>
            {!isCurrentWeek && (
              <Button
                size="small"
                startIcon={<TodayIcon />}
                onClick={handleThisWeek}
              >
                This week
              </Button>
            )}
          </Stack>

          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              {/* Per-day breakdown */}
              <Paper variant="outlined" sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Crew · work</TableCell>
                      <TableCell align="right">Earned</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {breakdown.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell>
                          <Typography variant="body2">
                            {dayjs(day.date).format("ddd D")}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {day.presentCount === 0 && day.earned === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                              —
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              {day.presentCount} came
                              {day.workDone > 0 && ` · ${day.workDone} day(s) of work`}
                              {day.note && ` · ${day.note}`}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={day.earned > 0 ? "text.primary" : "text.secondary"}
                          >
                            {day.earned > 0 ? `₹${formatINR(day.earned)}` : "—"}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ "& td": { borderBottom: "none", fontWeight: 600 } }}>
                      <TableCell colSpan={2}>Week earned</TableCell>
                      <TableCell align="right">
                        ₹{formatINR(weekEarned)}
                      </TableCell>
                    </TableRow>
                    <TableRow sx={{ "& td": { borderBottom: "none", color: "text.secondary" } }}>
                      <TableCell colSpan={2}>− Already paid this week</TableCell>
                      <TableCell align="right">
                        ₹{formatINR(alreadyPaid)}
                      </TableCell>
                    </TableRow>
                    <TableRow sx={{ "& td": { borderBottom: "none", fontWeight: 700, color: "success.main" } }}>
                      <TableCell colSpan={2}>= Suggested settlement</TableCell>
                      <TableCell align="right">
                        ₹{formatINR(balance)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Paper>

              <Divider />

              {/* Override + payment metadata */}
              <Stack spacing={1.5}>
                <TextField
                  label={`Amount to pay (default = ₹${formatINR(proposedAmount)})`}
                  value={amountOverride}
                  onChange={(e) =>
                    setAmountOverride(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  size="small"
                  placeholder={String(proposedAmount)}
                  helperText={
                    amountOverride === ""
                      ? "Leave blank to settle the suggested amount"
                      : finalAmount !== proposedAmount
                      ? `Will pay ₹${formatINR(finalAmount)} (${
                          finalAmount > proposedAmount ? "+" : ""
                        }${formatINR(finalAmount - proposedAmount)} vs suggested)`
                      : "Matches suggested amount"
                  }
                />

                <Box>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Payment mode
                  </Typography>
                  <ToggleButtonGroup
                    value={paymentMode}
                    exclusive
                    onChange={(_, v) => v && setPaymentMode(v)}
                    size="small"
                    fullWidth
                  >
                    <ToggleButton value="cash">Cash</ToggleButton>
                    <ToggleButton value="upi">UPI</ToggleButton>
                    <ToggleButton value="bank_transfer">Transfer</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary" component="div">
                    Paid via
                  </Typography>
                  <ToggleButtonGroup
                    value={paymentChannel}
                    exclusive
                    onChange={(_, v) => v && setPaymentChannel(v)}
                    size="small"
                    fullWidth
                  >
                    <ToggleButton value="via_site_engineer">Site engineer</ToggleButton>
                    <ToggleButton value="mesthri_at_office">Office cash</ToggleButton>
                    <ToggleButton value="company_direct_online">Company online</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                <TextField
                  label="Reference (optional)"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  size="small"
                  placeholder="e.g. UPI txn id"
                />

                <TextField
                  label="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  size="small"
                  multiline
                  minRows={2}
                />
              </Stack>
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={14} /> : null}
        >
          {submitting
            ? "Settling…"
            : `Settle ₹${formatINR(finalAmount)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
