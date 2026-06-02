"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  MenuItem,
  Chip,
  LinearProgress,
  Paper,
  Divider,
  Tooltip,
} from "@mui/material";
import {
  Close as CloseIcon,
  Inventory2 as BatchIcon,
  Replay as ResetIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useGroupMaterialPurchases } from "@/hooks/queries/useMaterialPurchases";
import {
  useGroupBatchUsageRecords,
  useRecordBatchUsageWaterfall,
} from "@/hooks/queries/useBatchUsage";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import type { MaterialPurchaseExpenseWithDetails } from "@/types/material.types";

interface WaterfallUsageDialogProps {
  open: boolean;
  onClose: () => void;
  /** The site currently being viewed — default consuming site. */
  siteId: string;
  /** Cluster id — needed to gather sibling batches. */
  siteGroupId?: string | null;
  /** REQUIRED — the material to waterfall usage across. */
  materialId: string;
  /** Narrows to one variant when known. `undefined` = let the user pick. */
  brandId?: string | null;
  /** Highlight a specific batch row when opened from its card/thread. */
  preselectedBatchRefCode?: string;
  materialName?: string;
  materialUnit?: string;
}

const NO_BRAND = "__none__";
const QTY_EPS = 1e-6;

function brandKey(brandId: string | null | undefined): string {
  return brandId == null || brandId === "" ? NO_BRAND : brandId;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface BatchRowState {
  refCode: string;
  purchaseDate: string;
  payingSiteId: string | null;
  payingSiteName: string | null;
  unit: string;
  /** product unit price (pre-transport) */
  unitCost: number;
  /** landed unit cost incl. proportional transport — matches the RPC */
  landedUnitCost: number;
  hasTransport: boolean;
  remaining: number;
  assigned: number;
  locked: boolean;
}

/**
 * Distribute `total` across `rows` oldest→newest (rows must already be sorted
 * ascending by purchase date), filling each unlocked batch up to its remaining
 * before moving to the next. Locked rows keep their assigned value; the pool is
 * `total − Σ(locked)`. Returns a new array (does not mutate).
 */
function distributeWaterfall(rows: BatchRowState[], total: number): BatchRowState[] {
  const lockedSum = rows.reduce((s, r) => (r.locked ? s + r.assigned : s), 0);
  let pool = Math.max(0, total - lockedSum);
  return rows.map((r) => {
    if (r.locked) return r;
    const give = Math.max(0, Math.min(pool, r.remaining));
    pool = round3(pool - give);
    return { ...r, assigned: round3(give) };
  });
}

/** Landed-cost ratio for a batch: amount actually paid / Σ item line totals. */
function batchLanded(batch: MaterialPurchaseExpenseWithDetails): {
  ratio: number;
  hasTransport: boolean;
} {
  const items = ((batch as any).items ?? []) as Array<any>;
  const itemsTotal = items.reduce((sum, it) => {
    const tp =
      it?.total_price != null
        ? Number(it.total_price)
        : Number(it?.quantity ?? 0) * Number(it?.unit_price ?? 0);
    return sum + (Number.isFinite(tp) ? tp : 0);
  }, 0);
  const finalPayment =
    Number((batch as any).amount_paid ?? batch.total_amount ?? 0) || 0;
  if (itemsTotal <= 0 || finalPayment <= 0) {
    return { ratio: 1, hasTransport: false };
  }
  const ratio = finalPayment / itemsTotal;
  return { ratio, hasTransport: Math.abs(ratio - 1) > 0.0001 };
}

export default function WaterfallUsageDialog({
  open,
  onClose,
  siteId,
  siteGroupId,
  materialId,
  brandId,
  preselectedBatchRefCode,
  materialName,
  materialUnit,
}: WaterfallUsageDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const { data: groupMembership } = useSiteGroupMembership(siteId);
  const groupId = groupMembership?.groupId ?? siteGroupId ?? undefined;

  const { data: batches = [] } = useGroupMaterialPurchases(groupId);
  const { data: usageRecords = [] } = useGroupBatchUsageRecords(groupId);

  const recordWaterfall = useRecordBatchUsageWaterfall();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [consumingSiteId, setConsumingSiteId] = useState<string>(siteId);
  const [selectedBrandKey, setSelectedBrandKey] = useState<string>("");
  const [totalQty, setTotalQty] = useState<number>(0);
  const [usageDate, setUsageDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [workDescription, setWorkDescription] = useState<string>("");
  const [rows, setRows] = useState<BatchRowState[]>([]);
  const [error, setError] = useState<string>("");

  // Only open, non-converted group batches are candidates.
  const activeBatches = useMemo(
    () =>
      batches.filter(
        (b) => b.status !== "completed" && b.status !== "converted"
      ),
    [batches]
  );

  // Σ usage per (batch, variant) for THIS material — to derive per-variant remaining.
  const usedByBatchVariant = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of usageRecords as Array<any>) {
      if (r.material_id !== materialId) continue;
      const k = `${r.batch_ref_code}::${brandKey(r.brand_id)}`;
      m.set(k, (m.get(k) ?? 0) + Number(r.quantity || 0));
    }
    return m;
  }, [usageRecords, materialId]);

  // Distinct variants (by brand) of this material across the candidate batches.
  const variants = useMemo(() => {
    const map = new Map<
      string,
      { brandId: string | null; brandName: string | null; unit: string }
    >();
    for (const b of activeBatches) {
      for (const it of ((b as any).items ?? []) as Array<any>) {
        const mId = it.material_id ?? it.material?.id;
        if (mId !== materialId) continue;
        const bId = it.brand_id ?? it.brand?.id ?? null;
        const k = brandKey(bId);
        if (!map.has(k)) {
          map.set(k, {
            brandId: bId,
            brandName: it.brand?.brand_name ?? null,
            unit: it.material?.unit ?? materialUnit ?? "nos",
          });
        }
      }
    }
    return Array.from(map.values());
  }, [activeBatches, materialId, materialUnit]);

  // The candidate batch rows for the selected variant, oldest→newest, remaining>0.
  const candidateRows = useMemo<BatchRowState[]>(() => {
    if (!selectedBrandKey) return [];
    const out: BatchRowState[] = [];
    for (const b of activeBatches) {
      const landed = batchLanded(b);
      for (const it of ((b as any).items ?? []) as Array<any>) {
        const mId = it.material_id ?? it.material?.id;
        const bId = it.brand_id ?? it.brand?.id ?? null;
        if (mId !== materialId) continue;
        if (brandKey(bId) !== selectedBrandKey) continue;
        const original = Number(it.quantity) || 0;
        const used = usedByBatchVariant.get(`${b.ref_code}::${selectedBrandKey}`) ?? 0;
        const remaining = round3(Math.max(0, original - used));
        if (remaining <= 0) continue;
        const unitCost = Number(it.unit_price) || 0;
        out.push({
          refCode: b.ref_code,
          purchaseDate: (b as any).purchase_date ?? "",
          payingSiteId: (b as any).paying_site_id ?? null,
          payingSiteName:
            (b as any).paying_site?.name ?? (b as any).site?.name ?? null,
          unit: it.material?.unit ?? materialUnit ?? "nos",
          unitCost,
          landedUnitCost: unitCost * landed.ratio,
          hasTransport: landed.hasTransport,
          remaining,
          assigned: 0,
          locked: false,
        });
      }
    }
    out.sort((a, b) => (a.purchaseDate || "").localeCompare(b.purchaseDate || ""));
    return out;
  }, [activeBatches, materialId, selectedBrandKey, usedByBatchVariant, materialUnit]);

  // Stable signature so we only rebuild editable rows when the candidate set
  // (or any batch's remaining) actually changes — not on every render.
  const candidateSig = useMemo(
    () => candidateRows.map((r) => `${r.refCode}:${r.remaining}`).join("|"),
    [candidateRows]
  );

  const totalAvailable = useMemo(
    () => round3(candidateRows.reduce((s, r) => s + r.remaining, 0)),
    [candidateRows]
  );

  // ── Initialise on open / variant resolution ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (variants.length === 0) return;
    // Prefer the caller-specified brand; else the single variant; else first.
    let initial: string;
    if (brandId !== undefined) {
      initial = brandKey(brandId);
      // Fall back to the first variant if the requested one has no stock left.
      if (!variants.some((v) => brandKey(v.brandId) === initial)) {
        initial = brandKey(variants[0].brandId);
      }
    } else {
      initial = brandKey(variants[0].brandId);
    }
    setSelectedBrandKey((prev) => (prev ? prev : initial));
  }, [open, variants, brandId]);

  // Rebuild editable rows whenever the candidate set changes, then re-apply the
  // current total via the waterfall.
  useEffect(() => {
    setRows(distributeWaterfall(candidateRows, totalQty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateSig]);

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (open) return;
    setConsumingSiteId(siteId);
    setSelectedBrandKey("");
    setTotalQty(0);
    setUsageDate(new Date().toISOString().split("T")[0]);
    setWorkDescription("");
    setRows([]);
    setError("");
  }, [open, siteId]);

  // ── Interactions ───────────────────────────────────────────────────────────
  const applyTotal = useCallback(
    (next: number) => {
      const t = Number.isFinite(next) && next > 0 ? round3(next) : 0;
      setTotalQty(t);
      setRows((rs) => distributeWaterfall(rs, t));
    },
    []
  );

  const onRowChange = useCallback(
    (refCode: string, value: number) => {
      setRows((rs) => {
        const next = rs.map((r) =>
          r.refCode === refCode
            ? {
                ...r,
                assigned: round3(Math.max(0, Math.min(value, r.remaining))),
                locked: true,
              }
            : r
        );
        return distributeWaterfall(next, totalQty);
      });
    },
    [totalQty]
  );

  const onResetRow = useCallback(
    (refCode: string) => {
      setRows((rs) => {
        const next = rs.map((r) =>
          r.refCode === refCode ? { ...r, locked: false } : r
        );
        return distributeWaterfall(next, totalQty);
      });
    },
    [totalQty]
  );

  // ── Derived / reconciliation ───────────────────────────────────────────────
  const allocated = useMemo(
    () => round3(rows.reduce((s, r) => s + r.assigned, 0)),
    [rows]
  );
  const leftToAssign = round3(totalQty - allocated);
  const isBalanced = Math.abs(leftToAssign) < QTY_EPS && totalQty > 0;
  const overLocked =
    rows.reduce((s, r) => (r.locked ? s + r.assigned : s), 0) - totalQty > QTY_EPS;

  const unit = variants.find((v) => brandKey(v.brandId) === selectedBrandKey)?.unit ??
    materialUnit ?? "nos";

  const costSummary = useMemo(() => {
    let selfUse = 0;
    let interSite = 0;
    const owedSites = new Set<string>();
    for (const r of rows) {
      if (r.assigned <= 0) continue;
      const cost = r.assigned * r.landedUnitCost;
      if (r.payingSiteId && r.payingSiteId === consumingSiteId) {
        selfUse += cost;
      } else {
        interSite += cost;
        if (r.payingSiteName) owedSites.add(r.payingSiteName);
      }
    }
    return { selfUse, interSite, owedCount: owedSites.size };
  }, [rows, consumingSiteId]);

  const selectedBrandName = variants.find(
    (v) => brandKey(v.brandId) === selectedBrandKey
  )?.brandName;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!materialId) {
      setError("Missing material");
      return;
    }
    if (!consumingSiteId) {
      setError("Select which site used the material");
      return;
    }
    if (totalQty <= 0) {
      setError("Enter the total quantity to record");
      return;
    }
    if (overLocked) {
      setError("Pinned rows already exceed the total — lower a pinned batch or raise the total");
      return;
    }
    if (!isBalanced) {
      setError(
        leftToAssign > 0
          ? `${leftToAssign} ${unit} still unassigned (only ${totalAvailable} ${unit} available across these batches)`
          : `Allocated ${allocated} ${unit} exceeds the total of ${totalQty} ${unit}`
      );
      return;
    }

    const selectedBrandId =
      selectedBrandKey === NO_BRAND ? null : selectedBrandKey;
    const allocations = rows
      .filter((r) => r.assigned > 0)
      .map((r) => ({ batch_ref_code: r.refCode, quantity: r.assigned }));

    try {
      await recordWaterfall.mutateAsync({
        usage_site_id: consumingSiteId,
        material_id: materialId,
        brand_id: selectedBrandId,
        usage_date: usageDate,
        work_description: workDescription || undefined,
        created_by: user?.id,
        allocations,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to record usage");
    }
  };

  const noBatches = candidateRows.length === 0;

  return (
    <Dialog
      open={open}
      onClose={(_e, reason) => {
        if (reason !== "backdropClick") onClose();
      }}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <BatchIcon color="primary" />
          <Box>
            <Typography variant="h6" component="span" sx={{ display: "block", lineHeight: 1.2 }}>
              Log material usage
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {materialName ?? "Material"}
              {selectedBrandName ? ` · ${selectedBrandName}` : ""} — fills oldest batch first
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2}>
          {error && (
            <Grid size={12}>
              <Alert severity="error" onClose={() => setError("")}>
                {error}
              </Alert>
            </Grid>
          )}

          {/* Consuming site */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              fullWidth
              label="Which site used it?"
              value={consumingSiteId}
              onChange={(e) => setConsumingSiteId(e.target.value)}
            >
              {(groupMembership?.allSites ?? []).map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name}
                  {site.id === siteId ? " (Current)" : ""}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Usage date */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Usage date"
              type="date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Variant selector (only when the material has >1 variant) */}
          {variants.length > 1 && (
            <Grid size={12}>
              <TextField
                select
                fullWidth
                label="Variant / size"
                value={selectedBrandKey}
                onChange={(e) => {
                  setSelectedBrandKey(e.target.value);
                  setTotalQty(0);
                }}
                helperText="Each size keeps its own batches and remaining stock."
              >
                {variants.map((v) => (
                  <MenuItem key={brandKey(v.brandId)} value={brandKey(v.brandId)}>
                    {v.brandName ?? "Standard"}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}

          {/* Total to record */}
          <Grid size={12}>
            <TextField
              fullWidth
              label={`Total to record (${unit})`}
              type="number"
              value={totalQty === 0 ? "" : totalQty}
              onChange={(e) => applyTotal(Number(e.target.value))}
              disabled={noBatches}
              inputProps={{ min: 0, step: "any" }}
              helperText={
                noBatches
                  ? "No batches with remaining stock for this material."
                  : `Available across ${candidateRows.length} batch${
                      candidateRows.length === 1 ? "" : "es"
                    }: ${totalAvailable} ${unit}`
              }
            />
            {!noBatches && (
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={`Use all ${totalAvailable} ${unit}`}
                  size="small"
                  variant="outlined"
                  onClick={() => applyTotal(totalAvailable)}
                />
              </Box>
            )}
          </Grid>

          {/* Reconciler */}
          {!noBatches && (
            <Grid size={12}>
              <Paper
                variant="outlined"
                sx={{
                  px: 1.5,
                  py: 1,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderColor: isBalanced
                    ? "success.main"
                    : overLocked || leftToAssign < 0
                    ? "error.main"
                    : "warning.main",
                  bgcolor: isBalanced
                    ? "success.50"
                    : overLocked || leftToAssign < 0
                    ? "error.50"
                    : "warning.50",
                }}
              >
                <Typography variant="body2" fontWeight={600}>
                  Allocated {allocated} / {totalQty || 0} {unit}
                </Typography>
                <Typography
                  variant="body2"
                  color={
                    isBalanced
                      ? "success.main"
                      : leftToAssign < 0 || overLocked
                      ? "error.main"
                      : "warning.main"
                  }
                >
                  {isBalanced
                    ? "Balanced ✓"
                    : leftToAssign > 0
                    ? `${leftToAssign} ${unit} left to assign`
                    : `${Math.abs(leftToAssign)} ${unit} over`}
                </Typography>
              </Paper>
            </Grid>
          )}

          {/* Per-batch rows */}
          {rows.map((r, idx) => {
            const selfUse = !!r.payingSiteId && r.payingSiteId === consumingSiteId;
            const fillPct = r.remaining > 0 ? (r.assigned / r.remaining) * 100 : 0;
            const isPreselected =
              preselectedBatchRefCode && r.refCode === preselectedBatchRefCode;
            return (
              <Grid size={12} key={r.refCode}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    borderColor: isPreselected ? "primary.main" : undefined,
                    borderWidth: isPreselected ? 2 : 1,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {idx + 1}. {r.refCode}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {r.purchaseDate || "—"} · {r.remaining} {r.unit} left
                      </Typography>
                      <Box sx={{ mt: 0.25, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        <Chip
                          label={
                            selfUse
                              ? "Self-use"
                              : r.payingSiteName
                              ? `Owes ${r.payingSiteName}`
                              : "Inter-site"
                          }
                          size="small"
                          color={selfUse ? "success" : "warning"}
                          variant="outlined"
                          sx={{ height: 20 }}
                        />
                        {r.locked && (
                          <Chip label="Pinned" size="small" sx={{ height: 20 }} />
                        )}
                      </Box>
                    </Box>

                    <TextField
                      type="number"
                      size="small"
                      label="Use"
                      value={r.assigned === 0 ? "" : r.assigned}
                      onChange={(e) => onRowChange(r.refCode, Number(e.target.value))}
                      inputProps={{ min: 0, max: r.remaining, step: "any" }}
                      sx={{ width: 96 }}
                    />

                    {r.locked && (
                      <Tooltip title="Reset to auto">
                        <IconButton size="small" onClick={() => onResetRow(r.refCode)}>
                          <ResetIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>

                  <LinearProgress
                    variant="determinate"
                    value={Math.min(fillPct, 100)}
                    sx={{ height: 5, borderRadius: 1, mt: 0.75 }}
                  />
                </Paper>
              </Grid>
            );
          })}

          {/* Cost summary */}
          {(costSummary.selfUse > 0 || costSummary.interSite > 0) && (
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">
                    Self-use (no settlement)
                  </Typography>
                  <Typography variant="body2" color="info.main" fontWeight={600}>
                    {formatCurrency(costSummary.selfUse)}
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">
                    Inter-site debt
                    {costSummary.owedCount > 0
                      ? ` (${costSummary.owedCount} site${
                          costSummary.owedCount === 1 ? "" : "s"
                        })`
                      : ""}
                  </Typography>
                  <Typography variant="body2" color="warning.main" fontWeight={600}>
                    {formatCurrency(costSummary.interSite)}
                  </Typography>
                </Box>
                {rows.some((r) => r.assigned > 0 && r.hasTransport) && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    Incl. proportional transport — landed cost.
                  </Typography>
                )}
              </Paper>
            </Grid>
          )}

          {/* Work description */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Work description (optional)"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              multiline
              rows={2}
              placeholder="e.g., Foundation work, Brick wall construction"
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={recordWaterfall.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={recordWaterfall.isPending || noBatches || !isBalanced || overLocked}
        >
          {recordWaterfall.isPending ? "Recording…" : "Record usage"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
