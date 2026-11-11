"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import Close from "@mui/icons-material/Close";
import ArrowForward from "@mui/icons-material/ArrowForward";
import dayjs from "dayjs";
import type { ContractNode } from "@/lib/workforce/workspaceModel";
import { CLOSURE_REASON_LABEL, planEarlyClosure } from "@/lib/workforce/earlyClosure";
import { useEndContractEarly, type EndContractEarlyResult } from "@/hooks/queries/useContractClosure";
import type { ContractClosureReason } from "@/types/trade.types";
import { formatCurrencyFull } from "@/lib/formatters";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";

const STEPS = ["Why & when", "Money", "Unfinished work"];
const REASONS: ContractClosureReason[] = ["contractor_left", "terminated", "mutual", "other"];

/**
 * "End contract early" — for a contractor who leaves (or is let go) before finishing.
 * Three steps, each answering one question the owner actually has:
 *   1. Why & when did it end?
 *   2. What happens to the money? (paid stays as history; the unpaid balance is written off)
 *   3. Who finishes the leftover work? (hand unfinished sections to the trade's In-house crew)
 * Everything shown is a preview from `planEarlyClosure`, which mirrors the server RPC.
 */
export function EndContractDialog({
  open,
  onClose,
  siteId,
  node,
  tradeName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  node: ContractNode;
  tradeName: string;
  onDone?: (result: EndContractEarlyResult) => void;
}) {
  const fullScreen = useMediaQuery("(max-width:600px)");
  const plan = useMemo(() => planEarlyClosure(node), [node]);
  const endEarly = useEndContractEarly(siteId);

  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<ContractClosureReason>("contractor_left");
  const [endDate, setEndDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [note, setNote] = useState("");
  const [handover, setHandover] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  // Fresh state each time it opens; every unfinished part is handed over by default.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setReason("contractor_left");
    setEndDate(dayjs().format("YYYY-MM-DD"));
    setNote("");
    setError("");
    setHandover(Object.fromEntries(plan.candidates.map((c) => [c.id, true])));
    // plan.candidates is derived from node; re-seed only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const who = node.task.who;
  const inHouseName = `${tradeName} — In-house`;
  const chosen = plan.candidates.filter((c) => handover[c.id]);
  const handedTotal = chosen.reduce((s, c) => s + c.left, 0);
  const dateInvalid = !endDate || dayjs(endDate).isAfter(dayjs(), "day");
  const busy = endEarly.isPending;

  const submit = async () => {
    setError("");
    try {
      const res = await endEarly.mutateAsync({
        contractId: node.task.id,
        endDate,
        reason,
        note,
        handoverIds: chosen.map((c) => c.id),
      });
      onDone?.(res);
      onClose();
    } catch (e) {
      setError((e as Error)?.message || "Could not end the contract.");
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="div" sx={{ fontSize: 17, fontWeight: 800 }} noWrap>
            End contract early
          </Typography>
          <Typography component="div" sx={{ fontSize: 12.5, color: wsColors.muted }} noWrap>
            {node.task.title} · {who}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} disabled={busy} aria-label="Close">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 2.5 }}>
          {STEPS.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>Why did it end?</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {REASONS.map((r) => (
                  <Chip
                    key={r}
                    label={r === "other" ? "Other" : CLOSURE_REASON_LABEL[r]}
                    onClick={() => setReason(r)}
                    color={reason === r ? "primary" : "default"}
                    variant={reason === r ? "filled" : "outlined"}
                  />
                ))}
              </Box>
            </Box>
            <TextField
              label={`${who}'s last working day`}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              error={dateInvalid}
              helperText={
                dateInvalid
                  ? "Pick a date that isn't in the future."
                  : "Attendance after this day can no longer be linked to this contract."
              }
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dayjs().format("YYYY-MM-DD") } }}
              fullWidth
            />
            <TextField
              label="Note (optional)"
              placeholder="e.g. Left after 1st floor slab, did not return calls"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Box>
        )}

        {step === 1 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr auto 1fr" },
                alignItems: "center",
                gap: 1.25,
                p: 1.75,
                borderRadius: `${wsRadius.card}px`,
                border: `1px solid ${wsColors.hairline}`,
                bgcolor: wsColors.canvas,
              }}
            >
              <Figure label="Agreed value" value={plan.originalValue} strike />
              <ArrowForward sx={{ color: wsColors.muted, display: { xs: "none", sm: "block" } }} />
              <Figure label="Final value (= paid)" value={plan.finalValue} strong />
            </Box>
            <Bullet>
              <strong>{formatCurrencyFull(plan.paid)}</strong> already paid stays on {who}&apos;s contract as
              history. Expenses keep showing it under {tradeName}.
            </Bullet>
            <Bullet>
              The unpaid <strong>{formatCurrencyFull(plan.writtenOff)}</strong> is written off. Nothing is owed to{" "}
              {who}, and nothing is recovered from them.
            </Bullet>
            {plan.openPackages.length > 0 && (
              <Alert severity="info" sx={{ fontSize: 12.5 }}>
                {plan.openPackages.length} fixed-price package{plan.openPackages.length === 1 ? "" : "s"} under this
                contract ({plan.openPackages.map((p) => p.title).join(", ")}) {plan.openPackages.length === 1 ? "is a" : "are"}{" "}
                separate deal{plan.openPackages.length === 1 ? "" : "s"} and stay open. Complete {plan.openPackages.length === 1 ? "it" : "them"} from the package itself.
              </Alert>
            )}
          </Box>
        )}

        {step === 2 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {plan.candidates.length === 0 ? (
              <Alert severity="success">Nothing unfinished to hand over. Every section is paid up or completed.</Alert>
            ) : (
              <>
                <Typography sx={{ fontSize: 13, color: wsColors.ink2 }}>
                  Tick what the daily-labour crew will finish. Each ticked item becomes a section under{" "}
                  <strong>{inHouseName}</strong>, worth the unfinished amount, so the new spend is tracked
                  against it.
                </Typography>
                <Box sx={{ border: `1px solid ${wsColors.hairline}`, borderRadius: `${wsRadius.card}px`, overflow: "hidden" }}>
                  {plan.candidates.map((c, i) => (
                    <Box
                      key={c.id}
                      sx={{ px: 1.25, py: 0.75, borderTop: i === 0 ? "none" : `1px solid ${wsColors.hairline2}` }}
                    >
                      <FormControlLabel
                        sx={{ m: 0, width: "100%", alignItems: "flex-start" }}
                        control={
                          <Checkbox
                            checked={!!handover[c.id]}
                            onChange={(e) => setHandover((h) => ({ ...h, [c.id]: e.target.checked }))}
                            sx={{ mt: -0.5 }}
                          />
                        }
                        label={
                          <Box component="span" sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <Box component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: wsColors.ink }}>
                              {c.title}
                            </Box>
                            <Box component="span" sx={{ fontSize: 12, color: wsColors.muted }}>
                              {formatCurrencyFull(c.originalValue)} agreed · {formatCurrencyFull(c.paid)} paid to {who} ·{" "}
                              <Box component="span" sx={{ color: wsColors.ink, fontWeight: 700 }}>
                                {formatCurrencyFull(c.left)} unfinished
                              </Box>
                            </Box>
                          </Box>
                        }
                      />
                    </Box>
                  ))}
                </Box>
                <Typography sx={{ fontSize: 12.5, color: wsColors.ink2 }}>
                  {chosen.length > 0 ? (
                    <>
                      <strong>{formatCurrencyFull(handedTotal)}</strong> of work moves to {inHouseName}.
                    </>
                  ) : (
                    <>Nothing handed over. Daily-labour spend will show at trade level only.</>
                  )}
                </Typography>
              </>
            )}
            <Alert severity="warning" sx={{ fontSize: 12.5 }}>
              {node.task.title} moves to <strong>Completed</strong> marked &ldquo;Ended early&rdquo;, valued at{" "}
              {formatCurrencyFull(plan.finalValue)}. You can reopen it later if no work has been logged on the
              handed-over sections yet.
            </Alert>
            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        {step > 0 ? (
          <Button onClick={() => setStep((s) => s - 1)} disabled={busy}>
            Back
          </Button>
        ) : (
          <Button onClick={onClose}>Cancel</Button>
        )}
        <Box sx={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <Button variant="contained" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && dateInvalid}>
            Next
          </Button>
        ) : (
          <Button variant="contained" color="error" onClick={submit} disabled={busy || dateInvalid}>
            {busy ? "Ending…" : "End contract"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function Figure({ label, value, strike, strong }: { label: string; value: number; strike?: boolean; strong?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: wsColors.muted }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: strong ? 20 : 17,
          fontWeight: 800,
          color: strong ? wsColors.ink : wsColors.muted,
          textDecoration: strike ? "line-through" : "none",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatCurrencyFull(value)}
      </Typography>
    </Box>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: wsColors.primary, mt: 0.9, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 13, color: wsColors.ink2 }}>{children}</Typography>
    </Box>
  );
}
