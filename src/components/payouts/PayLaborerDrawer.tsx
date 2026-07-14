"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import dayjs from "dayjs";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import { usePayLaborerPayout } from "@/hooks/mutations/usePayLaborerPayout";
import { allocateTotal, bucketKey, compareBuckets } from "@/lib/payouts/allocation";
import { blurOnWheel } from "@/lib/utils/numberInput";
import { formatCurrencyFull } from "@/lib/formatters";
import { requiresPayerName, type PayerSource } from "@/types/settlement.types";
import type {
  PayBucketInput,
  PayLaborerPayoutResult,
  PayoutBucket,
  PayoutLaborer,
} from "@/types/payout.types";

const money = { fontVariantNumeric: "tabular-nums" } as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "net_banking", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

interface SitePayerState {
  source: PayerSource;
  name: string;
}

/**
 * The payday action: one total for the laborer, fanned out across site × bucket
 * settlement rows. Editing the grand total auto-allocates (arrears first,
 * company before contracts); each bucket stays individually editable. One payer
 * source per involved site — every site's books use their own money.
 */
export default function PayLaborerDrawer({
  open,
  laborer,
  weekStart,
  weekEnd,
  onClose,
}: {
  open: boolean;
  laborer: PayoutLaborer | null;
  weekStart: string;
  weekEnd: string;
  onClose: () => void;
}) {
  const payMut = usePayLaborerPayout();

  const payable = useMemo(
    () =>
      (laborer?.buckets ?? [])
        .filter((b) => b.totalUnpaid > 0.005)
        .sort(compareBuckets),
    [laborer]
  );

  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [payerBySite, setPayerBySite] = useState<Record<string, SitePayerState>>({});
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentMode, setPaymentMode] = useState("cash");
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PayLaborerPayoutResult | null>(null);

  useEffect(() => {
    if (!open || !laborer) return;
    const full: Record<string, number> = {};
    for (const b of payable) full[bucketKey(b)] = round2(b.totalUnpaid);
    setAmounts(full);
    setPayerBySite({});
    setPaymentDate(dayjs().format("YYYY-MM-DD"));
    setPaymentMode("cash");
    setNotes("");
    setScreenshot(null);
    setError("");
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, laborer?.laborerId]);

  const total = useMemo(
    () => round2(payable.reduce((s, b) => s + (amounts[bucketKey(b)] ?? 0), 0)),
    [payable, amounts]
  );
  const grandUnpaid = useMemo(
    () => round2(payable.reduce((s, b) => s + b.totalUnpaid, 0)),
    [payable]
  );

  const involvedSites = useMemo(() => {
    const map = new Map<string, { siteName: string; subtotal: number }>();
    for (const b of payable) {
      const amt = amounts[bucketKey(b)] ?? 0;
      if (amt <= 0) continue;
      const prev = map.get(b.siteId);
      map.set(b.siteId, {
        siteName: b.siteName,
        subtotal: round2((prev?.subtotal ?? 0) + amt),
      });
    }
    return [...map.entries()].map(([siteId, v]) => ({ siteId, ...v }));
  }, [payable, amounts]);

  const handleTotalChange = (value: number) => {
    const allocs = allocateTotal(payable, value);
    setAmounts(Object.fromEntries(allocs.map((a) => [a.key, a.amount])));
  };

  const handleBucketChange = (b: PayoutBucket, value: number) => {
    const clamped = round2(Math.min(Math.max(0, value), b.totalUnpaid));
    setAmounts((prev) => ({ ...prev, [bucketKey(b)]: clamped }));
  };

  const payerFor = (siteId: string): SitePayerState =>
    payerBySite[siteId] ?? { source: "own_money", name: "" };

  const handleSubmit = async () => {
    if (!laborer) return;
    if (total <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    for (const s of involvedSites) {
      const payer = payerFor(s.siteId);
      if (requiresPayerName(payer.source) && !payer.name.trim()) {
        setError(`Name the payer for ${s.siteName}.`);
        return;
      }
    }
    setError("");

    const buckets: PayBucketInput[] = payable
      .filter((b) => (amounts[bucketKey(b)] ?? 0) > 0)
      .map((b) => {
        const payer = payerFor(b.siteId);
        return {
          siteId: b.siteId,
          kind: b.kind,
          contractRefKind: b.kind === "contract" ? b.refKind ?? undefined : undefined,
          contractRefId: b.kind === "contract" ? b.refId ?? undefined : undefined,
          amount: amounts[bucketKey(b)] ?? 0,
          payerSource: payer.source,
          payerName: payer.name.trim() || null,
        };
      });

    try {
      const res = await payMut.mutateAsync({
        laborerId: laborer.laborerId,
        weekStart,
        weekEnd,
        paymentDate,
        paymentMode,
        notes: notes.trim() || null,
        proofUrls: screenshot?.url ? [screenshot.url] : null,
        buckets,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to record the payout.");
    }
  };

  const clampedBuckets = (result?.buckets ?? []).filter(
    (b) => b.recorded < b.requested - 0.005
  );

  const weekLabel = `${dayjs(weekStart).format("DD MMM")} – ${dayjs(weekEnd).format("DD MMM")}`;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={payMut.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 } } }}
    >
      <Box sx={{ p: 2, display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Pay {laborer?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Week {weekLabel} · owed {formatCurrencyFull(grandUnpaid)}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" disabled={payMut.isPending}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />

      {result ? (
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          <Alert icon={<CheckCircleIcon />} severity="success">
            Recorded {formatCurrencyFull(result.total_recorded)} across{" "}
            {result.buckets.length} settlement{result.buckets.length === 1 ? "" : "s"}.
          </Alert>
          {clampedBuckets.length > 0 && (
            <Alert severity="warning">
              {clampedBuckets.length} bucket{clampedBuckets.length === 1 ? " was" : "s were"}{" "}
              clamped to what the ledger still allowed (
              {formatCurrencyFull(result.total_requested - result.total_recorded)} less than
              entered). Verify the cash handed over.
            </Alert>
          )}
          <Stack spacing={1}>
            {result.buckets.map((b) => (
              <Box
                key={b.settlement_group_id}
                sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}
              >
                <Chip label={b.settlement_reference} size="small" variant="outlined" />
                <Typography variant="body2" sx={{ fontWeight: 600, ...money }}>
                  {formatCurrencyFull(b.recorded)}
                </Typography>
              </Box>
            ))}
          </Stack>
          <Button variant="contained" onClick={onClose} fullWidth>
            Done
          </Button>
        </Box>
      ) : (
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          <TextField
            label="Total to pay"
            type="number"
            value={total || ""}
            onChange={(e) => handleTotalChange(Number(e.target.value))}
            onWheel={blurOnWheel}
            slotProps={{ input: { startAdornment: "₹" } }}
            helperText={
              total < grandUnpaid && total > 0
                ? `Partial — ${formatCurrencyFull(grandUnpaid - total)} will still be owed. Oldest dues fill first.`
                : undefined
            }
            fullWidth
          />

          <Box>
            <Typography variant="overline" color="text.secondary">
              Where it lands
            </Typography>
            <Stack spacing={1}>
              {payable.map((b) => (
                <Box
                  key={bucketKey(b)}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {b.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {b.siteName} · owed {formatCurrencyFull(b.totalUnpaid)}
                    </Typography>
                  </Box>
                  <TextField
                    type="number"
                    size="small"
                    value={amounts[bucketKey(b)] || ""}
                    onChange={(e) => handleBucketChange(b, Number(e.target.value))}
                    onWheel={blurOnWheel}
                    slotProps={{ input: { startAdornment: "₹" } }}
                    sx={{ width: 130 }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>

          {involvedSites.length > 0 && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              {involvedSites
                .map((s) => `${s.siteName}: ${formatCurrencyFull(s.subtotal)}`)
                .join(" · ")}
            </Alert>
          )}

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Paid on"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Mode</InputLabel>
              <Select
                value={paymentMode}
                label="Mode"
                onChange={(e) => {
                  setPaymentMode(e.target.value);
                  if (e.target.value === "cash") setScreenshot(null);
                }}
              >
                {PAYMENT_MODES.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {involvedSites.map((s) => {
            const payer = payerFor(s.siteId);
            return (
              <Box key={s.siteId}>
                <Typography variant="overline" color="text.secondary">
                  {s.siteName} money · {formatCurrencyFull(s.subtotal)}
                </Typography>
                <PayerSourceSelector
                  value={payer.source}
                  customName={payer.name}
                  onChange={(source) =>
                    setPayerBySite((prev) => ({
                      ...prev,
                      [s.siteId]: { ...payerFor(s.siteId), source },
                    }))
                  }
                  onCustomNameChange={(name) =>
                    setPayerBySite((prev) => ({
                      ...prev,
                      [s.siteId]: { ...payerFor(s.siteId), name },
                    }))
                  }
                  siteId={s.siteId}
                  compact
                />
              </Box>
            );
          })}

          {paymentMode !== "cash" && (
            <ReceiptCapture
              label={paymentMode === "upi" ? "UPI screenshot" : "Payment screenshot (optional)"}
              value={screenshot}
              onChange={setScreenshot}
              folder="weekly-payout-receipts"
              bucket="settlement-proofs"
            />
          )}

          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />

          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          <Button
            variant="contained"
            size="large"
            onClick={handleSubmit}
            disabled={payMut.isPending || total <= 0}
          >
            {payMut.isPending
              ? "Recording…"
              : `Pay ${formatCurrencyFull(total)} → ${involvedSites.length} site${involvedSites.length === 1 ? "" : "s"}`}
          </Button>
        </Box>
      )}
    </Drawer>
  );
}
