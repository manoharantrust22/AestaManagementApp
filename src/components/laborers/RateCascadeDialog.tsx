"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import {
  previewLaborerRateCascade,
  updateLaborerRateCascade,
  type LaborerRateCascadeResult,
} from "@/lib/services/laborerService";

interface RateCascadeDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: (result: LaborerRateCascadeResult) => void;
  laborerId: string;
  laborerName: string;
  oldRate: number;
  newRate: number;
}

const formatRupees = (n: number): string =>
  `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const signed = (n: number): string => {
  if (n === 0) return formatRupees(0);
  return `${n > 0 ? "+" : "−"}${formatRupees(n)}`;
};

export default function RateCascadeDialog({
  open,
  onClose,
  onApplied,
  laborerId,
  laborerName,
  oldRate,
  newRate,
}: RateCascadeDialogProps) {
  const [preview, setPreview] = useState<LaborerRateCascadeResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  // Scope of the rewrite: "all" recalculates every recorded day (legacy
  // behaviour); "from" only recalculates attendance on/after effectiveFrom,
  // leaving earlier days at their old snapshotted rate.
  const [scope, setScope] = useState<"all" | "from">("all");
  const [effectiveFrom, setEffectiveFrom] = useState("");

  // The date passed to the RPCs: null = whole history.
  const effDate = scope === "from" && effectiveFrom ? effectiveFrom : null;
  // In "from" mode we wait for a date before previewing / allowing apply.
  const awaitingDate = scope === "from" && !effectiveFrom;

  // Reset scope + date whenever the dialog (re)opens for a laborer.
  useEffect(() => {
    if (open) {
      setScope("all");
      setEffectiveFrom("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (awaitingDate) {
      // No date chosen yet — clear any stale preview and wait.
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setPreviewLoading(true);
    previewLaborerRateCascade(laborerId, newRate, effDate)
      .then((r) => {
        if (!cancelled) setPreview(r);
      })
      .catch((err: any) => {
        if (!cancelled) setPreviewError(err?.message ?? String(err));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, laborerId, newRate, effDate, awaitingDate]);

  async function handleApply() {
    setApplying(true);
    setApplyError(null);
    try {
      const result = await updateLaborerRateCascade(laborerId, newRate, effDate);
      onApplied(result);
    } catch (err: any) {
      setApplyError(err?.message ?? String(err));
    } finally {
      setApplying(false);
    }
  }

  const delta = preview?.total_delta ?? 0;
  const deltaIsNegative = delta < 0;
  const deltaIsZero = delta === 0;

  return (
    <Dialog open={open} onClose={applying ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Apply rate change to history?
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={applying}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            You changed <strong>{laborerName}</strong>&apos;s daily rate from{" "}
            <strong>{formatRupees(oldRate)}</strong> to{" "}
            <strong>{formatRupees(newRate)}</strong>.
          </Typography>

          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}
            >
              Apply the new rate to
            </Typography>
            <ToggleButtonGroup
              value={scope}
              exclusive
              size="small"
              fullWidth
              onChange={(_e, v) => {
                if (v) setScope(v);
              }}
              disabled={applying}
              sx={{ mt: 0.5 }}
            >
              <ToggleButton value="all">All recorded days</ToggleButton>
              <ToggleButton value="from">Only from a date</ToggleButton>
            </ToggleButtonGroup>

            {scope === "from" && (
              <TextField
                type="date"
                label="Effective from"
                size="small"
                fullWidth
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                disabled={applying}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={`Days before this date keep the old rate (${formatRupees(
                  oldRate
                )}); this date and later become ${formatRupees(newRate)}.`}
                sx={{ mt: 1.5 }}
              />
            )}
          </Box>

          {awaitingDate && (
            <Alert severity="info">
              Pick an effective date to preview the impact.
            </Alert>
          )}

          {previewLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          )}

          {previewError && (
            <Alert severity="error">
              <AlertTitle>Could not preview impact</AlertTitle>
              {previewError}
            </Alert>
          )}

          {preview && !previewLoading && !previewError && (
            <>
              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 2,
                  bgcolor: "background.default",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}
                >
                  Cascade impact
                </Typography>

                <Stack spacing={1} sx={{ mt: 1 }}>
                  <Row
                    label="Attendance days to be recalculated"
                    value={preview.affected_attendance.toLocaleString("en-IN")}
                  />
                  <Row
                    label="Settlements to be re-totalled"
                    value={preview.affected_settlements.toLocaleString("en-IN")}
                  />
                  {preview.overridden_skipped > 0 && (
                    <Row
                      label="Days with manual overrides (preserved)"
                      value={preview.overridden_skipped.toLocaleString("en-IN")}
                      muted
                    />
                  )}
                  {preview.cancelled_skipped > 0 && (
                    <Row
                      label="Cancelled settlements (skipped)"
                      value={preview.cancelled_skipped.toLocaleString("en-IN")}
                      muted
                    />
                  )}

                  <Divider />

                  <Row
                    label="Net change to total wages"
                    value={signed(delta)}
                    emphasis={
                      deltaIsZero
                        ? undefined
                        : deltaIsNegative
                          ? "negative"
                          : "positive"
                    }
                  />
                </Stack>
              </Box>

              {effDate && preview.affected_attendance > 0 && (
                <Alert severity="info">
                  Only attendance on or after {effDate} is recalculated; earlier days
                  keep their old rate.
                </Alert>
              )}

              {preview.affected_attendance === 0 && preview.affected_settlements === 0 && (
                <Alert severity="info">
                  {effDate
                    ? `No recorded attendance on or after ${effDate} — the new rate will apply to future entries only.`
                    : "No historical attendance for this laborer — the new rate will apply to future entries only."}
                </Alert>
              )}

              {preview.affected_settlements > 0 && (
                <Alert severity="warning">
                  Existing settlement totals will be re-totalled to match the new rate.
                  Make sure cash already paid out has been reconciled before applying.
                </Alert>
              )}
            </>
          )}

          {applyError && (
            <Alert severity="error">
              <AlertTitle>Could not apply cascade</AlertTitle>
              {applyError}
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={applying} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          disabled={
            previewLoading ||
            Boolean(previewError) ||
            applying ||
            awaitingDate
          }
          variant="contained"
          color="primary"
        >
          {applying ? "Applying…" : "Apply Cascade Update"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: "positive" | "negative";
  muted?: boolean;
}) {
  const valueColor =
    emphasis === "positive"
      ? "success.main"
      : emphasis === "negative"
        ? "error.main"
        : "text.primary";
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        opacity: muted ? 0.7 : 1,
      }}
    >
      <Typography variant="body2" color={muted ? "text.secondary" : "text.primary"}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={emphasis ? 700 : 500}
        color={valueColor}
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Typography>
    </Box>
  );
}
