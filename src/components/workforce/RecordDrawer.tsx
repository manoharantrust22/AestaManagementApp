"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import Groups from "@mui/icons-material/Groups";
import HowToReg from "@mui/icons-material/HowToReg";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ArrowBack from "@mui/icons-material/ArrowBack";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { computeExposure } from "@/lib/workforce/exposure";
import { useUpdateSubcontractProgress } from "@/hooks/queries/useSubcontractProgress";
import { useEngineerWalletBalance } from "@/hooks/queries/useEngineerWalletV2";
import { recordSubcontractPayment } from "@/lib/services/subcontractService";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import WalletBalancePreview from "@/components/wallet-v2/WalletBalancePreview";
import { HeadcountEntryInline } from "@/components/trades/HeadcountEntryInline";
import type { PayerSource } from "@/types/settlement.types";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { severityMeta, wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import { ResponsiveSheet } from "./ResponsiveSheet";
import { BalanceMeter } from "./BalanceMeter";

type RecordView = "menu" | "payment" | "progress" | "count";

const QUICK_ADDS = [10000, 25000, 50000];
const PAYMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "weekly_advance", label: "Advance" },
  { value: "part_payment", label: "Part payment" },
  { value: "final_settlement", label: "Final settlement" },
];
const MODES: Array<{ value: "cash" | "upi" | "bank_transfer"; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank" },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The single "Record" surface for a contract / section / task. Opens to a menu of the
 * actions that make sense for this node's tracking mode, then drills into:
 *  - Record a payment (all modes) — full: type, mode, payer source OR engineer wallet, proof.
 *  - Update progress (all modes) — the work-done slider.
 *  - Log today's count (headcount) — the per-role inline entry.
 *  - Log attendance / Settle salary (detailed) — deep-link to the per-laborer pages.
 *
 * Replaces the old scattered buttons (Update progress, Record payment) + bottom action
 * tiles (Log attendance, Settle salary) + the inline headcount panel.
 */
export function RecordDrawer({
  open,
  onClose,
  task,
  siteId,
  notify,
  onLogAttendance,
  onSettleSalary,
}: {
  open: boolean;
  onClose: () => void;
  task: WorkspaceTask;
  siteId: string;
  notify: (msg: string, severity?: "success" | "error") => void;
  onLogAttendance: () => void;
  onSettleSalary: () => void;
}) {
  const [view, setView] = useState<RecordView>("menu");
  useEffect(() => {
    if (open) setView("menu");
  }, [open]);

  const isDetailed = task.mode === "detailed";
  const isHeadcount = task.mode === "headcount";

  const subtitle = `${task.who} · ${task.title}`;

  // ── Menu ───────────────────────────────────────────────────────────────
  if (view === "menu") {
    const items: Array<{
      key: string;
      icon: React.ReactNode;
      label: string;
      sub: string;
      onClick: () => void;
    }> = [
      {
        key: "payment",
        icon: <PaymentsRounded sx={{ fontSize: 20, color: wsColors.primary }} />,
        label: "Record a payment",
        sub: "Advance, part payment or final settlement",
        onClick: () => setView("payment"),
      },
    ];
    if (isHeadcount) {
      items.push({
        key: "count",
        icon: <Groups sx={{ fontSize: 20, color: wsColors.primary }} />,
        label: "Log today's count",
        sub: "How many came, by role",
        onClick: () => setView("count"),
      });
    }
    if (isDetailed) {
      items.push({
        key: "attendance",
        icon: <HowToReg sx={{ fontSize: 20, color: wsColors.primary }} />,
        label: "Log attendance",
        sub: "Per-laborer day — opens the attendance screen",
        onClick: () => {
          onClose();
          onLogAttendance();
        },
      });
      items.push({
        key: "settle",
        icon: <ReceiptLongRounded sx={{ fontSize: 20, color: wsColors.primary }} />,
        label: "Settle salary",
        sub: "Open this contract's salary settlement",
        onClick: () => {
          onClose();
          onSettleSalary();
        },
      });
    }
    items.push({
      key: "progress",
      icon: <TuneRounded sx={{ fontSize: 20, color: wsColors.primary }} />,
      label: "Update progress",
      sub: "How much of the work is done",
      onClick: () => setView("progress"),
    });

    return (
      <ResponsiveSheet open={open} onClose={onClose} title="Record" subtitle={subtitle}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, py: 1 }}>
          {items.map((it) => (
            <Box
              key={it.key}
              onClick={it.onClick}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                px: 1.5,
                py: 1.25,
                borderRadius: `${wsRadius.card}px`,
                border: `1px solid ${wsColors.hairline}`,
                bgcolor: wsColors.surface,
                cursor: "pointer",
                "&:hover": { borderColor: "#d3e0fb", bgcolor: wsColors.primaryTint },
              }}
            >
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: `${wsRadius.avatar}px`,
                  bgcolor: "#eaf0fc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {it.icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: wsColors.ink }}>
                  {it.label}
                </Typography>
                <Typography noWrap sx={{ fontSize: 12, color: wsColors.muted }}>
                  {it.sub}
                </Typography>
              </Box>
              <ChevronRight sx={{ fontSize: 20, color: wsColors.muted }} />
            </Box>
          ))}
        </Box>
      </ResponsiveSheet>
    );
  }

  if (view === "payment") {
    return (
      <PaymentView
        open={open}
        onClose={onClose}
        onBack={() => setView("menu")}
        task={task}
        siteId={siteId}
        subtitle={subtitle}
        notify={notify}
      />
    );
  }

  if (view === "progress") {
    return (
      <ProgressView
        open={open}
        onClose={onClose}
        onBack={() => setView("menu")}
        task={task}
        siteId={siteId}
        subtitle={subtitle}
        notify={notify}
      />
    );
  }

  // view === "count"
  return (
    <ResponsiveSheet open={open} onClose={onClose} title="Log today's count" subtitle={subtitle}>
      <Box sx={{ py: 1 }}>
        <BackRow onBack={() => setView("menu")} />
        <HeadcountEntryInline siteId={siteId} contractId={task.id} />
      </Box>
    </ResponsiveSheet>
  );
}

/** A small "← Back to actions" affordance for the drill-in views. */
function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <Button
      onClick={onBack}
      startIcon={<ArrowBack sx={{ fontSize: 18 }} />}
      sx={{ textTransform: "none", color: wsColors.muted, mb: 1, ml: -0.5 }}
      size="small"
    >
      Back to actions
    </Button>
  );
}

/** Enriched contract payment — type / mode / payer source OR engineer wallet / proof. */
function PaymentView({
  open,
  onClose,
  onBack,
  task,
  siteId,
  subtitle,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  task: WorkspaceTask;
  siteId: string;
  subtitle: string;
  notify: (msg: string, severity?: "success" | "error") => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const isSiteEngineer = userProfile?.role === "site_engineer";
  const balanceQuery = useEngineerWalletBalance(
    isSiteEngineer ? userProfile?.id : undefined,
    siteId
  );

  const [paymentType, setPaymentType] = useState("weekly_advance");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "bank_transfer">("cash");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [payerName, setPayerName] = useState("");
  const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel = isSiteEngineer ? "engineer_wallet" : "direct";
  const amountNum = Number(amount || "0");
  const valid = amount !== "" && !Number.isNaN(amountNum) && amountNum > 0;
  const isCash = paymentMode === "cash";
  const isUpi = paymentMode === "upi";

  const preview = useMemo(
    () =>
      computeExposure({
        quoted: task.quoted,
        paid: task.paid + (valid ? amountNum : 0),
        work: task.work,
      }),
    [task.quoted, task.paid, task.work, amountNum, valid]
  );
  const meta = severityMeta[preview.severity];
  const PreviewIcon = meta.icon;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await recordSubcontractPayment(supabase, {
        contractId: task.id,
        siteId,
        contractTitle: task.title,
        paymentType,
        amount: amountNum,
        paymentDate,
        paymentMode,
        paymentChannel: channel,
        payer:
          channel === "direct"
            ? { mode: "single", source: payerSource, name: payerName }
            : null,
        engineerId: channel === "engineer_wallet" ? userProfile?.id ?? null : null,
        proofUrl: screenshot?.url ?? null,
        notes: notes.trim() || null,
        userId: userProfile?.id ?? "",
        userName: userProfile?.name ?? "",
      });
      if (!res.success) throw new Error(res.error || "Failed to record the payment.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subcontract-payments", task.id] }),
        qc.invalidateQueries({ queryKey: ["contract-payments", task.id] }),
        qc.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] }),
        qc.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] }),
        qc.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, contractId: task.id, kind: "payment", at: Date.now() });
        bc.close();
      }
      notify(`Paid ${formatCurrencyFull(amountNum)} recorded`);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Record a payment"
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onBack} disabled={submitting} sx={{ textTransform: "none", color: wsColors.ink2 }}>
            Back
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={handleSubmit}
            disabled={!valid || submitting}
            startIcon={submitting ? <CircularProgress size={16} /> : null}
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: wsColors.primary, borderRadius: `${wsRadius.input}px`, "&:hover": { bgcolor: "#2a60d6" } }}
          >
            {submitting ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, py: 1 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Type</InputLabel>
          <Select value={paymentType} label="Type" onChange={(e) => setPaymentType(e.target.value)}>
            {PAYMENT_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          autoFocus
          fullWidth
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
        />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {QUICK_ADDS.map((q) => (
            <Button
              key={q}
              size="small"
              variant="outlined"
              onClick={() => setAmount(String((Number(amount || "0") || 0) + q))}
              sx={{ textTransform: "none", borderColor: wsColors.hairline, color: wsColors.ink2, borderRadius: `${wsRadius.input}px` }}
            >
              +{formatCurrencyFull(q)}
            </Button>
          ))}
        </Box>

        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: wsColors.muted, mb: 0.75 }}>Method</Typography>
          <ToggleButtonGroup
            value={paymentMode}
            exclusive
            onChange={(_, v) => {
              if (!v) return;
              setPaymentMode(v);
              if (v === "cash") setScreenshot(null);
            }}
            size="small"
          >
            {MODES.map((m) => (
              <ToggleButton key={m.value} value={m.value} sx={{ textTransform: "none", px: 2 }}>
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <TextField
          label="Date"
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Site engineers pay from their own wallet (balance preview); admins/office
            pick a payer source and pay company-direct. */}
        {isSiteEngineer ? (
          <WalletBalancePreview
            engineerName={userProfile?.name || "You"}
            siteName={selectedSite?.name ?? ""}
            currentBalance={balanceQuery.data?.balance ?? 0}
            amount={valid ? amountNum : 0}
            isLoading={balanceQuery.isLoading}
          />
        ) : (
          <PayerSourceSelector
            value={payerSource}
            customName={payerName}
            onChange={setPayerSource}
            onCustomNameChange={setPayerName}
            siteId={siteId}
          />
        )}

        {/* Proof — required-feel for UPI, optional for bank; cash has none. */}
        {!isCash && (
          <ReceiptCapture
            label={isUpi ? "UPI screenshot" : "Payment screenshot (optional)"}
            value={screenshot}
            onChange={setScreenshot}
            folder="subcontract-receipts"
            bucket="settlement-proofs"
          />
        )}

        <TextField
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          size="small"
          multiline
          rows={2}
        />

        {/* Live exposure preview */}
        {valid && preview.tracked && preview.exposure !== null && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              bgcolor: meta.bg,
              borderRadius: `${wsRadius.input}px`,
              px: 1.5,
              py: 1.25,
            }}
          >
            <PreviewIcon sx={{ color: meta.color, fontSize: 22 }} />
            <Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: meta.color }}>
                After this: {meta.label}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: wsColors.ink2 }}>
                {preview.exposure >= 0
                  ? `${formatCurrencyFull(Math.abs(Math.round(preview.exposure)))} paid ahead of work`
                  : `${formatCurrencyFull(Math.abs(Math.round(preview.exposure)))} still held back`}
              </Typography>
            </Box>
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </Box>
    </ResponsiveSheet>
  );
}

/** Work-done slider (mirrors UpdateProgressSheet). */
function ProgressView({
  open,
  onClose,
  onBack,
  task,
  siteId,
  subtitle,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  task: WorkspaceTask;
  siteId: string;
  subtitle: string;
  notify: (msg: string, severity?: "success" | "error") => void;
}) {
  const update = useUpdateSubcontractProgress(siteId);
  const [pct, setPct] = useState<number>(task.workPercent ?? 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPct(task.workPercent ?? 0);
      setError(null);
    }
  }, [open, task.workPercent]);

  const preview = useMemo(
    () => computeExposure({ quoted: task.quoted, paid: task.paid, work: pct / 100 }),
    [task.quoted, task.paid, pct]
  );

  const save = async (value: number | null) => {
    setError(null);
    try {
      await update.mutateAsync({ contractId: task.id, percent: value });
      notify(value == null ? "Progress tracking cleared" : `Progress set to ${value}%`);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title="Update progress"
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onBack} disabled={update.isPending} sx={{ textTransform: "none", color: wsColors.ink2 }}>
            Back
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={() => save(pct)}
            disabled={update.isPending}
            startIcon={update.isPending ? <CircularProgress size={16} /> : null}
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: wsColors.primary, borderRadius: `${wsRadius.input}px`, "&:hover": { bgcolor: "#2a60d6" } }}
          >
            {update.isPending ? "Saving…" : "Save progress"}
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, py: 1 }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: 40, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {pct}%
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: wsColors.muted }}>of the work is done</Typography>
        </Box>
        <Slider
          value={pct}
          onChange={(_, v) => setPct(v as number)}
          step={5}
          min={0}
          max={100}
          marks={[
            { value: 0, label: "0%" },
            { value: 50, label: "50%" },
            { value: 100, label: "100%" },
          ]}
          sx={{ color: wsColors.primary, mx: 1 }}
        />
        <BalanceMeter exposure={preview} />
        {task.workPercent != null && (
          <Button
            size="small"
            onClick={() => save(null)}
            disabled={update.isPending}
            sx={{ textTransform: "none", color: wsColors.muted, alignSelf: "flex-start" }}
          >
            Clear tracking
          </Button>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Box>
    </ResponsiveSheet>
  );
}
