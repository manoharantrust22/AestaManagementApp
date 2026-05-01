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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setPreviewLoading(true);
    previewLaborerRateCascade(laborerId, newRate)
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
  }, [open, laborerId, newRate]);

  async function handleApply() {
    setApplying(true);
    setApplyError(null);
    try {
      const result = await updateLaborerRateCascade(laborerId, newRate);
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

              {preview.affected_attendance === 0 && preview.affected_settlements === 0 && (
                <Alert severity="info">
                  No historical attendance for this laborer — the new rate will apply to
                  future entries only.
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
          disabled={previewLoading || Boolean(previewError) || applying}
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
