"use client";

/**
 * SpotPurchaseAllocatorDialog — office-facing finalize dialog for a single
 * spot-purchase batch. Loads the provisional split (Task D hooks), lets the
 * user adjust per-site percentages, validates that they sum to 100 (±0.01),
 * and calls `finalize_spot_purchase_allocation` via
 * `useFinalizeSpotPurchaseAllocation`. Used from the /site/spot-purchase
 * Allocations tab (Task I) and from the office reconciliation surface (Task M).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

import {
  useBatchAllocations,
  useFinalizeSpotPurchaseAllocation,
} from "@/hooks/queries/useSpotPurchases";
import { useSiteGroupSites } from "@/hooks/queries/useSiteGroups";

interface AllocationRow {
  site_id: string;
  percentage: number;
}

interface SpotPurchaseAllocatorDialogProps {
  open: boolean;
  onClose: () => void;
  batchId: string | null;
  siteGroupId: string | null;
  /** Optional context shown in the header */
  refCode?: string | null;
  totalAmount?: number | null;
}

export function SpotPurchaseAllocatorDialog({
  open,
  onClose,
  batchId,
  siteGroupId,
  refCode,
  totalAmount,
}: SpotPurchaseAllocatorDialogProps) {
  const { data: allocations = [], isLoading: allocLoading } =
    useBatchAllocations(batchId);
  const { data: groupSites = [], isLoading: sitesLoading } = useSiteGroupSites(
    siteGroupId ?? undefined,
  );
  const finalize = useFinalizeSpotPurchaseAllocation();

  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Seed the rows from the provisional allocations (preferred) or fall back to
  // an equal split across the group's sites. Re-seed any time the dialog opens
  // for a new batch.
  useEffect(() => {
    if (!open || !batchId) return;
    if (allocLoading || sitesLoading) return;

    if (allocations.length > 0) {
      setRows(
        allocations.map((a) => ({
          site_id: a.site_id,
          percentage: Number(a.percentage),
        })),
      );
      return;
    }

    if (groupSites.length > 0) {
      const equal = Math.floor(10000 / groupSites.length) / 100;
      const seeded: AllocationRow[] = (
        groupSites as Array<{ id: string }>
      ).map((s) => ({ site_id: s.id, percentage: equal }));
      const sum = seeded.reduce((acc, r) => acc + r.percentage, 0);
      if (seeded.length > 0) {
        seeded[seeded.length - 1].percentage =
          Math.round((seeded[seeded.length - 1].percentage + (100 - sum)) * 100) /
          100;
      }
      setRows(seeded);
    } else {
      setRows([]);
    }
  }, [open, batchId, allocLoading, sitesLoading, allocations, groupSites]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.percentage) || 0), 0),
    [rows],
  );
  const isHundred = Math.abs(total - 100) < 0.01;

  const siteName = (siteId: string): string => {
    const match = (groupSites as Array<{ id: string; name?: string }>).find(
      (s) => s.id === siteId,
    );
    return match?.name ?? siteId;
  };

  function updateRow(siteId: string, percentage: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.site_id === siteId ? { ...r, percentage } : r,
      ),
    );
  }

  function distributeEvenly() {
    if (rows.length === 0) return;
    const equal = Math.floor(10000 / rows.length) / 100;
    const next = rows.map((r) => ({ ...r, percentage: equal }));
    const sum = next.reduce((acc, r) => acc + r.percentage, 0);
    next[next.length - 1].percentage =
      Math.round((next[next.length - 1].percentage + (100 - sum)) * 100) / 100;
    setRows(next);
  }

  async function handleFinalize() {
    if (!batchId || !isHundred) return;
    setSubmitError(null);
    try {
      await finalize.mutateAsync({
        batchId,
        allocations: rows.map((r) => ({
          site_id: r.site_id,
          percentage: Number(r.percentage),
        })),
      });
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not finalize allocation",
      );
    }
  }

  const canSubmit = !!batchId && isHundred && rows.length > 0 && !finalize.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        Finalize allocation
        {refCode && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {refCode}
            {totalAmount != null ? ` · ₹${Number(totalAmount).toFixed(2)}` : ""}
          </Typography>
        )}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {allocLoading || sitesLoading ? (
          <Typography variant="body2" color="text.secondary">
            Loading provisional split…
          </Typography>
        ) : rows.length === 0 ? (
          <Alert severity="warning">
            No sites available for this group. Cannot finalize allocation.
          </Alert>
        ) : (
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Split percentages across sites. Must sum to 100.
              </Typography>
              <Button size="small" onClick={distributeEvenly}>
                Distribute evenly
              </Button>
            </Stack>
            <Stack spacing={1}>
              {rows.map((row) => (
                <Stack
                  key={row.site_id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                >
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                    {siteName(row.site_id)}
                  </Typography>
                  <TextField
                    size="small"
                    type="number"
                    value={row.percentage}
                    onChange={(e) =>
                      updateRow(row.site_id, Number(e.target.value))
                    }
                    sx={{ width: 120 }}
                    InputProps={{
                      endAdornment: (
                        <Typography variant="caption">%</Typography>
                      ),
                    }}
                  />
                </Stack>
              ))}
            </Stack>
            <Divider />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Total
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600 }}
                color={isHundred ? "success.main" : "error.main"}
              >
                {total.toFixed(2)}% {isHundred ? "OK" : "(must be 100)"}
              </Typography>
            </Stack>
            {submitError && <Alert severity="error">{submitError}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={finalize.isPending}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={handleFinalize}
        >
          {finalize.isPending ? "Finalizing…" : "Finalize"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SpotPurchaseAllocatorDialog;
