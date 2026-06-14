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
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
} from "@mui/material";
import {
  Close as CloseIcon,
  Inventory2 as BatchIcon,
  Replay as ResetIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useGroupMaterialPurchases } from "@/hooks/queries/useMaterialPurchases";
import {
  useGroupBatchUsageRecords,
  useRecordBatchUsageWaterfall,
  useRecordBatchUsageMultiSite,
} from "@/hooks/queries/useBatchUsage";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import DateRangePicker from "@/components/common/DateRangePicker";
import { useMaterialUsageLedger } from "@/hooks/queries/useMaterialUsageLedger";
import UsedSoFarStrip from "@/components/materials/UsedSoFarStrip";
import UsageDetailDrawer from "@/components/materials/UsageDetailDrawer";
import {
  NO_BRAND,
  brandKey,
  deriveBatchBrandKey,
  summarizeSiteSplit,
  validateSiteSplit,
} from "@/lib/material-hub/batchUsageSplit";

type Scope = "batch" | "all" | "range";

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
  /** Highlight (and, in "This batch" scope, restrict to) a specific batch. */
  preselectedBatchRefCode?: string;
  materialName?: string;
  materialUnit?: string;
  /**
   * Which scope to open in. Hub threads pass "batch" (log against the clicked
   * batch); Inventory material cards pass "all" (waterfall the whole material).
   * Falls back to "all" if "batch" is requested without a preselected batch.
   */
  defaultScope?: "batch" | "all";
}

const QTY_EPS = 1e-6;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Local YYYY-MM-DD (no UTC shift) for string-comparing against purchase_date. */
function toYMD(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface BatchRowState {
  refCode: string;
  purchaseDate: string;
  vendorName: string | null;
  payingSiteId: string | null;
  payingSiteName: string | null;
  unit: string;
  unitCost: number; // product unit price (pre-transport)
  landedUnitCost: number; // incl. proportional transport — matches the RPC
  hasTransport: boolean;
  original: number;
  used: number;
  remaining: number;
  assigned: number;
  locked: boolean;
}

/**
 * Distribute `total` across `rows` oldest→newest (rows sorted ascending by
 * purchase date), filling each unlocked batch to its remaining before the next.
 * Locked rows keep their value; the pool is `total − Σ(locked)`.
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
function batchLanded(batch: any): { ratio: number; hasTransport: boolean } {
  const items = (batch?.items ?? []) as Array<any>;
  const itemsTotal = items.reduce((sum, it) => {
    const tp =
      it?.total_price != null
        ? Number(it.total_price)
        : Number(it?.quantity ?? 0) * Number(it?.unit_price ?? 0);
    return sum + (Number.isFinite(tp) ? tp : 0);
  }, 0);
  const finalPayment = Number(batch?.amount_paid ?? batch?.total_amount ?? 0) || 0;
  if (itemsTotal <= 0 || finalPayment <= 0) return { ratio: 1, hasTransport: false };
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
  defaultScope = "all",
}: WaterfallUsageDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const { data: groupMembership } = useSiteGroupMembership(siteId);
  const groupId = groupMembership?.groupId ?? siteGroupId ?? undefined;

  const { data: batches = [] } = useGroupMaterialPurchases(groupId);
  const { data: usageRecords = [] } = useGroupBatchUsageRecords(groupId);

  const recordWaterfall = useRecordBatchUsageWaterfall();
  const recordMultiSite = useRecordBatchUsageMultiSite();

  // ── Ledger data for "Used so far" strip + detail drawer ────────────────────
  const { data: ledgerRows = [] } = useMaterialUsageLedger({ site_id: siteId });
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [scope, setScope] = useState<Scope>("all");
  const [consumingSiteId, setConsumingSiteId] = useState<string>(siteId);
  const [selectedBrandKey, setSelectedBrandKey] = useState<string>("");
  const [totalQty, setTotalQty] = useState<number>(0);
  const [usageDate, setUsageDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [workDescription, setWorkDescription] = useState<string>("");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [rows, setRows] = useState<BatchRowState[]>([]);
  // "This batch" scope only: per-consuming-site quantity split (e.g. Srinivasan
  // 30 + Padmavathy 20 against one batch), keyed by site_id.
  const [siteQty, setSiteQty] = useState<Record<string, number>>({});
  const [expandedLog, setExpandedLog] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [buildingSections, setBuildingSections] = useState<{ id: string; name: string }[]>([]);

  // Fetch building sections for the section picker.
  useEffect(() => {
    if (!siteId || !open) return;
    createClient()
      .from("building_sections")
      .select("id, name")
      .eq("site_id", siteId)
      .order("name")
      .then(({ data }) => setBuildingSections(data ?? []));
  }, [siteId, open]);

  const activeBatches = useMemo(
    () => batches.filter((b) => b.status !== "completed" && b.status !== "converted"),
    [batches]
  );

  // Σ usage per (batch, variant) for THIS material → per-variant remaining.
  const usedByBatchVariant = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of usageRecords as Array<any>) {
      if (r.material_id !== materialId) continue;
      const k = `${r.batch_ref_code}::${brandKey(r.brand_id)}`;
      m.set(k, (m.get(k) ?? 0) + Number(r.quantity || 0));
    }
    return m;
  }, [usageRecords, materialId]);

  // Prior usage ENTRIES per batch for the selected variant (the collapsible log).
  const usageEntriesByBatch = useMemo(() => {
    const m = new Map<string, Array<{ date: string; site: string; qty: number }>>();
    if (!selectedBrandKey) return m;
    for (const r of usageRecords as Array<any>) {
      if (r.material_id !== materialId) continue;
      if (brandKey(r.brand_id) !== selectedBrandKey) continue;
      const arr = m.get(r.batch_ref_code) ?? [];
      arr.push({
        date: r.usage_date,
        site: r.usage_site?.name ?? "—",
        qty: Number(r.quantity || 0),
      });
      m.set(r.batch_ref_code, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return m;
  }, [usageRecords, materialId, selectedBrandKey]);

  // Distinct variants of this material across the candidate batches.
  const variants = useMemo(() => {
    const map = new Map<string, { brandId: string | null; brandName: string | null; unit: string }>();
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

  // In "This batch" scope the brand is IMPLICIT — it's whatever the clicked
  // batch is. Derive it from the preselected batch's item for THIS material so
  // the candidate filter is locked to the right variant and never mismatches a
  // SIBLING batch's brand (which would falsely report "no remaining stock").
  const preselectedBatchBrandKey = useMemo<string | null>(
    () =>
      deriveBatchBrandKey(
        activeBatches as any[],
        preselectedBatchRefCode,
        materialId
      ),
    [activeBatches, preselectedBatchRefCode, materialId]
  );

  // Candidate batch rows for the selected variant + scope, oldest→newest.
  const candidateRows = useMemo<BatchRowState[]>(() => {
    if (!selectedBrandKey) return [];
    const rangeFrom = toYMD(rangeStart);
    const rangeTo = toYMD(rangeEnd);
    const out: BatchRowState[] = [];
    for (const b of activeBatches) {
      const ref = (b as any).ref_code as string;
      const pd = ((b as any).purchase_date ?? "") as string;
      // Scope filters.
      if (scope === "batch" && ref !== preselectedBatchRefCode) continue;
      if (scope === "range") {
        if (rangeFrom && pd < rangeFrom) continue;
        if (rangeTo && pd > rangeTo) continue;
      }
      const landed = batchLanded(b);
      for (const it of ((b as any).items ?? []) as Array<any>) {
        const mId = it.material_id ?? it.material?.id;
        const bId = it.brand_id ?? it.brand?.id ?? null;
        if (mId !== materialId) continue;
        if (brandKey(bId) !== selectedBrandKey) continue;
        const original = Number(it.quantity) || 0;
        const used = usedByBatchVariant.get(`${ref}::${selectedBrandKey}`) ?? 0;
        const remaining = round3(Math.max(0, original - used));
        if (remaining <= 0) continue;
        const unitCost = Number(it.unit_price) || 0;
        out.push({
          refCode: ref,
          purchaseDate: pd,
          vendorName: (b as any).vendor?.name ?? (b as any).vendor_name ?? null,
          payingSiteId: (b as any).paying_site_id ?? null,
          payingSiteName: (b as any).paying_site?.name ?? (b as any).site?.name ?? null,
          unit: it.material?.unit ?? materialUnit ?? "nos",
          unitCost,
          landedUnitCost: unitCost * landed.ratio,
          hasTransport: landed.hasTransport,
          original,
          used: round3(used),
          remaining,
          assigned: 0,
          locked: false,
        });
      }
    }
    out.sort((a, b) => (a.purchaseDate || "").localeCompare(b.purchaseDate || ""));
    return out;
  }, [
    activeBatches,
    materialId,
    selectedBrandKey,
    usedByBatchVariant,
    materialUnit,
    scope,
    preselectedBatchRefCode,
    rangeStart,
    rangeEnd,
  ]);

  const candidateSig = useMemo(
    () => candidateRows.map((r) => `${r.refCode}:${r.remaining}`).join("|"),
    [candidateRows]
  );

  const totalAvailable = useMemo(
    () => round3(candidateRows.reduce((s, r) => s + r.remaining, 0)),
    [candidateRows]
  );

  const isMulti = scope !== "batch";

  // ── Initialise on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (variants.length === 0) return;
    let initial: string;
    if (brandId !== undefined) {
      initial = brandKey(brandId);
      if (!variants.some((v) => brandKey(v.brandId) === initial)) {
        initial = brandKey(variants[0].brandId);
      }
    } else {
      initial = brandKey(variants[0].brandId);
    }
    setSelectedBrandKey((prev) => (prev ? prev : initial));
  }, [open, variants, brandId]);

  // "This batch" scope: force the brand to the clicked batch's brand, overriding
  // the "default to the most-recent variant" init above. Without this, a cluster
  // that also bought the same material under a DIFFERENT brand (e.g. an unbranded
  // sibling batch) makes the dialog default to the wrong brand and falsely report
  // the clicked batch as having no remaining stock.
  useEffect(() => {
    if (!open || scope !== "batch") return;
    if (preselectedBatchBrandKey == null) return;
    setSelectedBrandKey((prev) =>
      prev === preselectedBatchBrandKey ? prev : preselectedBatchBrandKey
    );
  }, [open, scope, preselectedBatchBrandKey]);

  // Set the initial scope once per open (Hub → batch, Inventory → all).
  useEffect(() => {
    if (!open) return;
    setScope(defaultScope === "batch" && preselectedBatchRefCode ? "batch" : defaultScope);
  }, [open, defaultScope, preselectedBatchRefCode]);

  // Rebuild editable rows whenever the candidate set changes; re-apply the total
  // via the waterfall (no-op total in "This batch" scope).
  useEffect(() => {
    setRows(distributeWaterfall(candidateRows, totalQty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateSig]);

  // Reset on close.
  useEffect(() => {
    if (open) return;
    setScope("all");
    setConsumingSiteId(siteId);
    setSelectedBrandKey("");
    setTotalQty(0);
    setUsageDate(new Date().toISOString().split("T")[0]);
    setWorkDescription("");
    setRangeStart(null);
    setRangeEnd(null);
    setRows([]);
    setSiteQty({});
    setExpandedLog(new Set());
    setError("");
    setSectionId(null);
    setDetailOpen(false);
  }, [open, siteId]);

  // ── Interactions ───────────────────────────────────────────────────────────
  const applyTotal = useCallback((next: number) => {
    const t = Number.isFinite(next) && next > 0 ? round3(next) : 0;
    setTotalQty(t);
    setRows((rs) => distributeWaterfall(rs, t));
  }, []);

  const onRowChange = useCallback(
    (refCode: string, value: number) => {
      setRows((rs) => {
        const next = rs.map((r) =>
          r.refCode === refCode
            ? { ...r, assigned: round3(Math.max(0, Math.min(value, r.remaining))), locked: true }
            : r
        );
        // In "This batch" scope there's no total to balance against — just set it.
        return scope === "batch" ? next : distributeWaterfall(next, totalQty);
      });
    },
    [totalQty, scope]
  );

  const onResetRow = useCallback(
    (refCode: string) => {
      setRows((rs) => {
        const next = rs.map((r) => (r.refCode === refCode ? { ...r, locked: false } : r));
        return distributeWaterfall(next, totalQty);
      });
    },
    [totalQty]
  );

  const onScopeChange = useCallback((_e: unknown, val: Scope | null) => {
    if (!val) return;
    setScope(val);
    setTotalQty(0); // rows rebuild via candidateSig effect
    setSiteQty({}); // per-site split is batch-scope only
    setError("");
  }, []);

  const toggleLog = useCallback((refCode: string) => {
    setExpandedLog((prev) => {
      const n = new Set(prev);
      if (n.has(refCode)) n.delete(refCode);
      else n.add(refCode);
      return n;
    });
  }, []);

  // ── Derived / reconciliation ───────────────────────────────────────────────
  const allocated = useMemo(() => round3(rows.reduce((s, r) => s + r.assigned, 0)), [rows]);
  const leftToAssign = round3(totalQty - allocated);
  const isBalanced = Math.abs(leftToAssign) < QTY_EPS && totalQty > 0;
  const overLocked =
    rows.reduce((s, r) => (r.locked ? s + r.assigned : s), 0) - totalQty > QTY_EPS;

  const unit =
    variants.find((v) => brandKey(v.brandId) === selectedBrandKey)?.unit ?? materialUnit ?? "nos";

  const costSummary = useMemo(() => {
    let selfUse = 0;
    let interSite = 0;
    const owedSites = new Set<string>();
    for (const r of rows) {
      if (r.assigned <= 0) continue;
      const cost = r.assigned * r.landedUnitCost;
      if (r.payingSiteId && r.payingSiteId === consumingSiteId) selfUse += cost;
      else {
        interSite += cost;
        if (r.payingSiteName) owedSites.add(r.payingSiteName);
      }
    }
    return { selfUse, interSite, owedCount: owedSites.size };
  }, [rows, consumingSiteId]);

  // ── "This batch" per-site split ────────────────────────────────────────────
  // The cluster sites that can consume this batch, current site first.
  const clusterSites = useMemo(() => {
    const all = (groupMembership?.allSites ?? []) as Array<{ id: string; name: string }>;
    return [...all].sort((a, b) =>
      a.id === siteId ? -1 : b.id === siteId ? 1 : 0
    );
  }, [groupMembership, siteId]);

  // The single preselected batch (batch scope only) drives remaining + payer.
  const batchRow = scope === "batch" ? candidateRows[0] ?? null : null;
  const batchRemaining = batchRow?.remaining ?? 0;

  const siteSplitEntries = useMemo(
    () => clusterSites.map((st) => ({ siteId: st.id, qty: siteQty[st.id] || 0 })),
    [clusterSites, siteQty]
  );
  const splitSummary = useMemo(
    () =>
      summarizeSiteSplit(
        siteSplitEntries,
        batchRow?.payingSiteId ?? null,
        batchRow?.landedUnitCost ?? 0
      ),
    [siteSplitEntries, batchRow]
  );
  const splitValidation = useMemo(
    () => validateSiteSplit(splitSummary.total, batchRemaining, QTY_EPS),
    [splitSummary.total, batchRemaining]
  );

  const onSiteQtyChange = useCallback((id: string, value: number) => {
    setSiteQty((prev) => ({
      ...prev,
      [id]: Number.isFinite(value) && value > 0 ? round3(value) : 0,
    }));
    setError("");
  }, []);

  const selectedBrandName = variants.find((v) => brandKey(v.brandId) === selectedBrandKey)?.brandName;

  const noBatches = candidateRows.length === 0;
  const canSubmit =
    scope === "batch"
      ? !noBatches && splitValidation.canSubmit
      : !noBatches && isBalanced && !overLocked;

  // Self-use / inter-site cost — per-site split in batch scope, per-batch
  // allocation in the multi-batch scopes.
  const activeCost =
    scope === "batch"
      ? {
          selfUse: splitSummary.selfUse,
          interSite: splitSummary.interSite,
          owedCount: splitSummary.owedSiteIds.length,
        }
      : costSummary;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!materialId) return setError("Missing material");

    const selectedBrandId = selectedBrandKey === NO_BRAND ? null : selectedBrandKey;

    // "This batch" scope: a per-site split against the one batch (atomic RPC).
    if (scope === "batch") {
      if (!batchRow) return setError("This batch has no remaining stock");
      if (splitSummary.total <= 0)
        return setError("Enter how much each site used");
      if (splitValidation.over)
        return setError(
          `Allocated ${splitSummary.total} ${unit} exceeds the ${batchRemaining} ${unit} left in this batch`
        );

      const entries = siteSplitEntries
        .filter((e) => e.qty > 0)
        .map((e) => ({ usage_site_id: e.siteId, quantity: e.qty }));
      try {
        await recordMultiSite.mutateAsync({
          batch_ref_code: batchRow.refCode,
          material_id: materialId,
          brand_id: selectedBrandId,
          usage_date: usageDate,
          work_description: workDescription || undefined,
          section_id: sectionId,
          created_by: user?.id,
          entries,
        });
        onClose();
      } catch (err: any) {
        setError(err?.message || "Failed to record usage");
      }
      return;
    }

    // Multi-batch scopes (All / By date): one consuming site, waterfall batches.
    if (!consumingSiteId) return setError("Select which site used the material");
    if (totalQty <= 0) return setError("Enter the total quantity to record");
    if (overLocked)
      return setError("Pinned rows already exceed the total — lower a pinned batch or raise the total");
    if (!isBalanced)
      return setError(
        leftToAssign > 0
          ? `${leftToAssign} ${unit} still unassigned (only ${totalAvailable} ${unit} available)`
          : `Allocated ${allocated} ${unit} exceeds the total of ${totalQty} ${unit}`
      );

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
        section_id: sectionId,
        created_by: user?.id,
        allocations,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to record usage");
    }
  };

  const shortMaterial = (materialName ?? "material").split(" ")[0];
  const isSaving = recordWaterfall.isPending || recordMultiSite.isPending;

  return (
  <>
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
              {selectedBrandName ? ` · ${selectedBrandName}` : ""}
              {scope === "batch" ? " — this batch" : " — fills oldest batch first"}
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

          {/* Scope selector */}
          <Grid size={12}>
            <ToggleButtonGroup
              value={scope}
              exclusive
              onChange={onScopeChange}
              size="small"
              fullWidth
              color="primary"
            >
              <ToggleButton value="batch" disabled={!preselectedBatchRefCode}>
                This batch
              </ToggleButton>
              <ToggleButton value="all">All {shortMaterial}</ToggleButton>
              <ToggleButton value="range">By date</ToggleButton>
            </ToggleButtonGroup>
          </Grid>

          {/* "Used so far" reference strip */}
          <Grid size={12}>
            <UsedSoFarStrip
              siteId={siteId}
              materialId={materialId}
              materialName={materialName ?? "Material"}
              unit={unit}
              onViewDetails={() => setDetailOpen(true)}
            />
          </Grid>

          {/* Consuming site — multi-batch scopes only. In "This batch" scope the
              per-site split table below captures who used the batch instead. */}
          {isMulti && (
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
          )}

          {/* Usage date */}
          <Grid size={{ xs: 12, sm: isMulti ? 6 : 12 }}>
            <TextField
              fullWidth
              label="Usage date"
              type="date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Brand selector — shown only when the brand wasn't pre-locked by the
              caller AND this material genuinely has more than one brand across
              its batches. (This dropdown selects by brand_id, not size; a
              single-brand thread passes brandId so we hide it entirely instead
              of confusingly offering one "Standard" / other-brand option.)
              Never shown in "This batch" scope — there the brand is implicit
              (it's the clicked batch's brand) and a picker would be confusing. */}
          {scope !== "batch" && brandId === undefined && variants.length > 1 && (
            <Grid size={12}>
              <TextField
                select
                fullWidth
                label="Brand"
                value={selectedBrandKey}
                onChange={(e) => {
                  setSelectedBrandKey(e.target.value);
                  setTotalQty(0);
                }}
                helperText="Each brand keeps its own batches and remaining stock."
              >
                {variants.map((v) => (
                  <MenuItem key={brandKey(v.brandId)} value={brandKey(v.brandId)}>
                    {v.brandName ?? "Unbranded"}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}

          {/* Date range picker (By date scope) */}
          {scope === "range" && (
            <Grid size={12}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="body2" color="text.secondary">
                  Batches bought in:
                </Typography>
                <DateRangePicker
                  standalone
                  startDate={rangeStart}
                  endDate={rangeEnd}
                  onChange={(s, e) => {
                    setRangeStart(s);
                    setRangeEnd(e);
                    setTotalQty(0);
                  }}
                />
              </Box>
            </Grid>
          )}

          {/* Total to record + reconciler (multi-batch scopes only) */}
          {isMulti && (
            <>
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
                      ? "No batches with remaining stock for this selection."
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
            </>
          )}

          {/* Empty state for "This batch" with nothing left */}
          {scope === "batch" && noBatches && (
            <Grid size={12}>
              <Alert severity="info">
                This batch has no remaining stock. Switch to <strong>All {shortMaterial}</strong> to
                log against other batches.
              </Alert>
            </Grid>
          )}

          {/* "This batch" scope: the batch is fixed (brand implicit) — capture a
              per-consuming-site split (e.g. Srinivasan 30 + Padmavathy 20) and
              record it in one atomic submit. */}
          {scope === "batch" && batchRow && (
            <>
              {/* Batch header */}
              <Grid size={12}>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.25, borderColor: "primary.main", borderWidth: 2 }}
                >
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, flexWrap: "wrap" }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      Bought {batchRow.purchaseDate || "—"}
                      {batchRow.vendorName ? ` · ${batchRow.vendorName}` : ""}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: "monospace", color: "text.disabled" }}
                    >
                      {batchRow.refCode}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {batchRow.used} used / {batchRow.original} {batchRow.unit} · {batchRow.remaining} left
                  </Typography>
                  {(usageEntriesByBatch.get(batchRow.refCode)?.length ?? 0) > 0 && (
                    <>
                      <Button
                        size="small"
                        onClick={() => toggleLog(batchRow.refCode)}
                        endIcon={
                          expandedLog.has(batchRow.refCode) ? <ExpandLessIcon /> : <ExpandMoreIcon />
                        }
                        sx={{ minWidth: 0, py: 0, px: 0.5, mt: 0.25, textTransform: "none" }}
                      >
                        {usageEntriesByBatch.get(batchRow.refCode)!.length} prior
                      </Button>
                      <Collapse in={expandedLog.has(batchRow.refCode)} unmountOnExit>
                        <Box sx={{ mt: 0.5, pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
                          {(usageEntriesByBatch.get(batchRow.refCode) ?? []).map((e, i) => (
                            <Typography key={i} variant="caption" color="text.secondary" component="div">
                              {e.date} · {e.site} · {e.qty} {batchRow.unit}
                            </Typography>
                          ))}
                        </Box>
                      </Collapse>
                    </>
                  )}
                </Paper>
              </Grid>

              {/* Per-site quantity table */}
              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  How much did each site use?
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {clusterSites.map((st) => {
                    const selfUse = !!batchRow.payingSiteId && batchRow.payingSiteId === st.id;
                    return (
                      <Box key={st.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {st.name}
                            {st.id === siteId ? " (Current)" : ""}
                          </Typography>
                          <Chip
                            label={
                              selfUse
                                ? "Self-use"
                                : batchRow.payingSiteName
                                ? `Owes ${batchRow.payingSiteName}`
                                : "Inter-site"
                            }
                            size="small"
                            color={selfUse ? "success" : "warning"}
                            variant="outlined"
                            sx={{ height: 20 }}
                          />
                        </Box>
                        <TextField
                          type="number"
                          size="small"
                          label="Used"
                          value={siteQty[st.id] ? siteQty[st.id] : ""}
                          onChange={(e) => onSiteQtyChange(st.id, Number(e.target.value))}
                          inputProps={{ min: 0, step: "any" }}
                          sx={{ width: 110 }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              </Grid>

              {/* Allocated / remaining balance */}
              <Grid size={12}>
                <Paper
                  variant="outlined"
                  sx={{
                    px: 1.5,
                    py: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderColor: splitValidation.over
                      ? "error.main"
                      : splitSummary.total > 0
                      ? "success.main"
                      : "divider",
                    bgcolor: splitValidation.over
                      ? "error.50"
                      : splitSummary.total > 0
                      ? "success.50"
                      : undefined,
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    Allocated {splitSummary.total} / {batchRemaining} {batchRow.unit}
                  </Typography>
                  <Typography
                    variant="body2"
                    color={splitValidation.over ? "error.main" : "success.main"}
                  >
                    {splitValidation.over
                      ? `${round3(splitSummary.total - batchRemaining)} ${batchRow.unit} over`
                      : `${splitValidation.remainingAfter} ${batchRow.unit} left`}
                  </Typography>
                </Paper>
              </Grid>
            </>
          )}

          {/* Per-batch rows (multi-batch scopes only) */}
          {isMulti && rows.map((r, idx) => {
            const selfUse = !!r.payingSiteId && r.payingSiteId === consumingSiteId;
            const fillPct = r.remaining > 0 ? (r.assigned / r.remaining) * 100 : 0;
            const isPreselected = preselectedBatchRefCode && r.refCode === preselectedBatchRefCode;
            const entries = usageEntriesByBatch.get(r.refCode) ?? [];
            const logOpen = expandedLog.has(r.refCode);
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
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, flexWrap: "wrap" }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {isMulti ? `${idx + 1}. ` : ""}
                          Bought {r.purchaseDate || "—"}
                          {r.vendorName ? ` · ${r.vendorName}` : ""}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: "monospace", color: "text.disabled" }}
                        >
                          {r.refCode}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {r.used} used / {r.original} {r.unit} · {r.remaining} left
                      </Typography>
                      <Box sx={{ mt: 0.25, display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
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
                        {r.locked && <Chip label="Pinned" size="small" sx={{ height: 20 }} />}
                        {entries.length > 0 && (
                          <Button
                            size="small"
                            onClick={() => toggleLog(r.refCode)}
                            endIcon={logOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            sx={{ minWidth: 0, py: 0, px: 0.5, textTransform: "none" }}
                          >
                            {entries.length} prior
                          </Button>
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

                    {isMulti && r.locked && (
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

                  <Collapse in={logOpen} unmountOnExit>
                    <Box sx={{ mt: 1, pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
                      {entries.map((e, i) => (
                        <Typography key={i} variant="caption" color="text.secondary" component="div">
                          {e.date} · {e.site} · {e.qty} {r.unit}
                        </Typography>
                      ))}
                    </Box>
                  </Collapse>
                </Paper>
              </Grid>
            );
          })}

          {/* Cost summary */}
          {(activeCost.selfUse > 0 || activeCost.interSite > 0) && (
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">
                    Self-use (no settlement)
                  </Typography>
                  <Typography variant="body2" color="info.main" fontWeight={600}>
                    {formatCurrency(activeCost.selfUse)}
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">
                    Inter-site debt
                    {activeCost.owedCount > 0
                      ? ` (${activeCost.owedCount} site${activeCost.owedCount === 1 ? "" : "s"})`
                      : ""}
                  </Typography>
                  <Typography variant="body2" color="warning.main" fontWeight={600}>
                    {formatCurrency(activeCost.interSite)}
                  </Typography>
                </Box>
                {(scope === "batch"
                  ? !!batchRow?.hasTransport && splitSummary.total > 0
                  : rows.some((r) => r.assigned > 0 && r.hasTransport)) && (
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

          {/* Construction section picker */}
          <Grid size={12}>
            <TextField
              select
              fullWidth
              label="Construction section (optional)"
              value={sectionId ?? ""}
              onChange={(e) => setSectionId(e.target.value || null)}
            >
              <MenuItem value="">
                <em>No section</em>
              </MenuItem>
              {buildingSections.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            {sectionId === null && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: "block" }}>
                No section selected — this entry won&apos;t appear in section breakdowns of the Usage Ledger
              </Typography>
            )}
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSaving || !canSubmit}
        >
          {isSaving ? "Recording…" : "Record usage"}
        </Button>
      </DialogActions>
    </Dialog>

    <UsageDetailDrawer
      open={detailOpen}
      onClose={() => setDetailOpen(false)}
      rows={ledgerRows}
      materialId={materialId}
      materialName={materialName ?? "Material"}
      siteId={siteId}
      scopeKey={`waterfall:${siteId}:${materialId}`}
      canEdit={false}
    />
  </>
  );
}
