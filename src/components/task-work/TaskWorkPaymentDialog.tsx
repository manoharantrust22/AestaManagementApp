"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import { useCreateTaskWorkPayment } from "@/hooks/queries/useTaskWorkPayments";
import type { PayerSource } from "@/types/settlement.types";
import {
  TASK_WORK_PAYMENT_TYPE_LABEL,
  type TaskWorkPackageWithMeta,
  type TaskWorkPaymentChannel,
  type TaskWorkPaymentMode,
  type TaskWorkPaymentType,
} from "@/types/taskWork.types";

interface Props {
  open: boolean;
  onClose: () => void;
  pkg: TaskWorkPackageWithMeta;
  balanceDue: number;
  defaultType?: TaskWorkPaymentType;
  onSaved?: () => void;
}

function useSiteEngineers() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["task-work", "site-engineers"],
    staleTime: 5 * 60 * 1000,
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await supabase
          .from("users")
          .select("id, name, role")
          .in("role", ["site_engineer", "admin", "office"])
          .order("name");
        if (error) throw error;
        return (data ?? []) as { id: string; name: string; role: string }[];
      },
      { operationName: "useSiteEngineers" }
    ),
  });
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function TaskWorkPaymentDialog({
  open,
  onClose,
  pkg,
  balanceDue,
  defaultType = "advance",
  onSaved,
}: Props) {
  const { data: engineers = [] } = useSiteEngineers();
  const createMut = useCreateTaskWorkPayment();

  const [paymentType, setPaymentType] = useState<TaskWorkPaymentType>(defaultType);
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentMode, setPaymentMode] = useState<TaskWorkPaymentMode>("cash");
  const [channel, setChannel] = useState<TaskWorkPaymentChannel>("direct");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [payerName, setPayerName] = useState("");
  const [engineerId, setEngineerId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPaymentType(defaultType);
    setAmount(defaultType === "final_settlement" ? Math.max(balanceDue, 0) : 0);
    setPaymentDate(dayjs().format("YYYY-MM-DD"));
    setPaymentMode("cash");
    setChannel("direct");
    setPayerSource("own_money");
    setPayerName("");
    setEngineerId("");
    setNotes("");
    setError("");
  }, [open, defaultType, balanceDue]);

  const balanceAfter = useMemo(
    () => Math.round((balanceDue - amount) * 100) / 100,
    [balanceDue, amount]
  );

  const handleSubmit = async () => {
    if (!(amount > 0)) {
      setError("Enter a valid amount.");
      return;
    }
    if (channel === "engineer_wallet" && !engineerId) {
      setError("Select which engineer paid from their wallet.");
      return;
    }
    try {
      await createMut.mutateAsync({
        packageId: pkg.id,
        siteId: pkg.site_id,
        packageNumber: pkg.package_number,
        packageTitle: pkg.title,
        paymentType,
        amount,
        paymentDate,
        paymentMode,
        paymentChannel: channel,
        payer:
          channel === "direct"
            ? { mode: "single", source: payerSource, name: payerName }
            : null,
        engineerId: channel === "engineer_wallet" ? engineerId : null,
        balanceAfterPayment: balanceAfter,
        notes: notes.trim() || null,
      });
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to record the payment.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record payment — {pkg.title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            Price {inr(pkg.total_value)} · Balance due {inr(balanceDue)}
          </Alert>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={paymentType}
                  label="Type"
                  onChange={(e) =>
                    setPaymentType(e.target.value as TaskWorkPaymentType)
                  }
                >
                  {(
                    [
                      "advance",
                      "part_payment",
                      "final_settlement",
                      "retention_release",
                    ] as TaskWorkPaymentType[]
                  ).map((t) => (
                    <MenuItem key={t} value={t}>
                      {TASK_WORK_PAYMENT_TYPE_LABEL[t]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                slotProps={{ input: { startAdornment: "₹" } }}
              />
            </Grid>
          </Grid>

          {amount > balanceDue && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              This is more than the balance due — make sure you&apos;re not paying
              ahead of work done.
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Mode</InputLabel>
                <Select
                  value={paymentMode}
                  label="Mode"
                  onChange={(e) =>
                    setPaymentMode(e.target.value as TaskWorkPaymentMode)
                  }
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="upi">UPI</MenuItem>
                  <MenuItem value="bank_transfer">Bank transfer</MenuItem>
                  <MenuItem value="cheque">Cheque</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <ToggleButtonGroup
            value={channel}
            exclusive
            fullWidth
            size="small"
            onChange={(_e, v: TaskWorkPaymentChannel | null) => v && setChannel(v)}
          >
            <ToggleButton value="direct" sx={{ textTransform: "none" }}>
              Paid directly
            </ToggleButton>
            <ToggleButton value="engineer_wallet" sx={{ textTransform: "none" }}>
              From engineer wallet
            </ToggleButton>
          </ToggleButtonGroup>

          {channel === "direct" ? (
            <PayerSourceSelector
              value={payerSource}
              customName={payerName}
              onChange={setPayerSource}
              onCustomNameChange={setPayerName}
              siteId={pkg.site_id}
            />
          ) : (
            <FormControl fullWidth>
              <InputLabel>Engineer (wallet)</InputLabel>
              <Select
                value={engineerId}
                label="Engineer (wallet)"
                onChange={(e) => setEngineerId(e.target.value)}
              >
                {engineers.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            fullWidth
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
          />

          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={createMut.isPending}
        >
          Record
        </Button>
      </DialogActions>
    </Dialog>
  );
}
