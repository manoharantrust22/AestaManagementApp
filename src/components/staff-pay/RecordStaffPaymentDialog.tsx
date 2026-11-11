"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSitesData } from "@/contexts/SiteContext";
import { useRecordStaffPayment } from "@/hooks/queries/useStaffPay";
import { formatCurrencyFull } from "@/lib/formatters";
import { pctsAreValid, splitStaffPayment } from "@/lib/staff-pay/split";
import {
  PAYMENT_TYPE_LABEL,
  type StaffMember,
  type StaffPaymentMode,
  type StaffPaymentType,
} from "@/types/staff-pay.types";

interface Props {
  open: boolean;
  onClose: () => void;
  staff: StaffMember[];
  defaultStaffId?: string | null;
  defaultAmount?: number | null;
}

export default function RecordStaffPaymentDialog({ open, onClose, staff, defaultStaffId, defaultAmount }: Props) {
  const isMobile = useIsMobile("md");
  const { sites } = useSitesData();
  const record = useRecordStaffPayment();

  const [staffId, setStaffId] = useState("");
  const [type, setType] = useState<StaffPaymentType>("salary");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(dayjs().format("YYYY-MM-DD"));
  const [periodMonth, setPeriodMonth] = useState(dayjs().subtract(dayjs().date() < 15 ? 1 : 0, "month").format("YYYY-MM"));
  const [mode, setMode] = useState<StaffPaymentMode>("upi");
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState(false);
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStaffId(defaultStaffId ?? "");
    setType("salary");
    setAmount(defaultAmount ? String(defaultAmount) : "");
    setPaidOn(dayjs().format("YYYY-MM-DD"));
    setNotes("");
    setCustom(false);
    setPcts({});
    setError(null);
    record.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const member = staff.find((s) => s.id === staffId) ?? null;
  const assignedSites = useMemo(
    () => (member?.assigned_sites ?? []).map((id) => sites.find((s) => s.id === id)).filter(Boolean) as Array<{ id: string; name: string }>,
    [member, sites]
  );
  const allocSites = custom ? sites : assignedSites;
  const amt = Number(amount);

  const customRows = Object.entries(pcts)
    .map(([siteId, v]) => ({ siteId, pct: Number(v) }))
    .filter((r) => r.pct > 0);

  const preview = custom
    ? splitStaffPayment(amt, customRows)
    : splitStaffPayment(amt, assignedSites.map((s) => ({ siteId: s.id })));

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "Site";

  const submit = async () => {
    setError(null);
    if (!member) return setError("Choose the staff member");
    if (!(amt > 0)) return setError("Enter the amount");
    if (custom && !pctsAreValid(customRows.map((r) => r.pct))) return setError("Site percentages must add up to 100");
    try {
      await record.mutateAsync({
        staff_user_id: member.id,
        payment_type: type,
        amount: amt,
        paid_on: paidOn,
        period_month: type === "salary" ? `${periodMonth}-01` : null,
        payment_mode: mode,
        notes: notes.trim() || null,
        allocation: custom ? customRows.map((r) => ({ site_id: r.siteId, pct: r.pct })) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Could not save");
    }
  };

  return (
    <Dialog open={open} onClose={record.isPending ? undefined : onClose} fullScreen={isMobile} fullWidth maxWidth="sm">
      <DialogTitle>Record staff payment</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField select label="Paid to" value={staffId} onChange={(e) => setStaffId(e.target.value)} fullWidth required>
            {staff.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>

          <ToggleButtonGroup exclusive fullWidth size="small" value={type} onChange={(_, v) => v && setType(v)} color="primary">
            {(Object.keys(PAYMENT_TYPE_LABEL) as StaffPaymentType[]).map((t) => (
              <ToggleButton key={t} value={t}>
                {PAYMENT_TYPE_LABEL[t]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Amount (₹)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              required
              inputProps={{ min: 0, step: "1", inputMode: "decimal" }}
            />
            <TextField select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as StaffPaymentMode)} sx={{ minWidth: 110 }}>
              <MenuItem value="upi">UPI</MenuItem>
              <MenuItem value="bank">Bank</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
            </TextField>
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            {type === "salary" && (
              <TextField label="Salary for month" type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            )}
          </Stack>

          <TextField
            label="Note (optional)"
            placeholder={type === "bonus" ? "e.g. Diwali bonus" : ""}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
          />

          <Box>
            <FormControlLabel
              control={<Switch checked={custom} onChange={(e) => setCustom(e.target.checked)} />}
              label="Choose site split myself"
            />
            {!custom && (
              <Typography variant="caption" color="text.secondary" component="div">
                {assignedSites.length
                  ? `Split equally across ${member?.name ?? "their"}'s ${assignedSites.length} assigned site(s).`
                  : member
                    ? "No sites assigned — recorded as company overhead (not charged to a site)."
                    : "Charged to the sites this person is assigned to."}
              </Typography>
            )}
            {custom && (
              <Stack spacing={1} sx={{ mt: 1 }}>
                {allocSites.map((s) => (
                  <Stack key={s.id} direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                      {s.name}
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      placeholder="%"
                      value={pcts[s.id] ?? ""}
                      onChange={(e) => setPcts((p) => ({ ...p, [s.id]: e.target.value }))}
                      sx={{ width: 90 }}
                      inputProps={{ min: 0, max: 100 }}
                    />
                  </Stack>
                ))}
              </Stack>
            )}
            {preview.length > 0 && (
              <Box sx={{ mt: 1, p: 1, borderRadius: 1, bgcolor: "action.hover" }}>
                {preview.map((p) => (
                  <Stack key={p.siteId} direction="row" justifyContent="space-between">
                    <Typography variant="caption">{siteName(p.siteId)}</Typography>
                    <Typography variant="caption">{formatCurrencyFull(p.amount)}</Typography>
                  </Stack>
                ))}
              </Box>
            )}
          </Box>

          <Alert severity="info" variant="outlined">
            Private: only admins and {member?.name ?? "the staff member"} can see this. It is not shown in site expenses.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={record.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={record.isPending}>
          {record.isPending ? "Saving…" : "Save payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
