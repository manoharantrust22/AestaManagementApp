"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Alert,
  Chip,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Tooltip,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Collapse,
  Link,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  SwapHoriz as SwapIcon,
  CheckCircle as CheckIcon,
  EditOutlined as EditIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useGroupMaterialPurchases } from "@/hooks/queries/useMaterialPurchases";
import {
  useGroupBatchUsageRecords,
  useRecordReconciliationUsage,
} from "@/hooks/queries/useBatchUsage";
import { useGenerateSettlement } from "@/hooks/queries/useInterSiteSettlements";
import {
  computeReconcileAllocations,
  summarizeReconcileUsage,
  groupReplaceableUsage,
  type BatchPoolRow,
  type ExistingUsage,
  type ReconcilePeriod,
  type ReconcileUsageSummary,
} from "@/lib/material-hub/reconcileAllocator";

interface ReconcileUsageDialogProps {
  open: boolean;
  onClose: () => void;
  /** The site currently being viewed (for group resolution + auth). */
  siteId: string;
  siteGroupId?: string | null;
  /** The material to reconcile (parent or a specific material). */
  materialId: string;
  materialName?: string;
  materialUnit?: string;
}

interface PeriodInput {
  id: string;
  fromDate: string; // "" = open
  asOfDate: string;
  bags: Record<string, string>; // siteId -> raw input
  note: string;
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
/** Landed-cost ratio for a batch: amount actually paid / Σ item line totals. */
function batchLandedRatio(batch: any): number {
  const items = (batch?.items ?? []) as Array<any>;
  const itemsTotal = items.reduce((s, it) => {
    const tp = it?.total_price != null ? Number(it.total_price) : Number(it?.quantity ?? 0) * Number(it?.unit_price ?? 0);
    return s + (Number.isFinite(tp) ? tp : 0);
  }, 0);
  const paid = Number(batch?.amount_paid ?? batch?.total_amount ?? 0) || 0;
  if (itemsTotal <= 0 || paid <= 0) return 1;
  return paid / itemsTotal;
}

let _seq = 0;
function newPeriod(siteIds: string[], asOf: string): PeriodInput {
  _seq += 1;
  return {
    id: `p${_seq}`,
    fromDate: "",
    asOfDate: asOf,
    bags: Object.fromEntries(siteIds.map((s) => [s, ""])),
    note: "",
  };
}

export default function ReconcileUsageDialog({
  open,
  onClose,
  siteId,
  siteGroupId,
  materialId,
  materialName,
  materialUnit,
}: ReconcileUsageDialogProps) {
  const isMobile = useIsMobile();
  const { user, userProfile } = useAuth();
  const supabase = createClient();

  const { data: membership } = useSiteGroupMembership(siteId);
  const groupId = membership?.groupId ?? siteGroupId ?? undefined;
  const sites = useMemo(() => membership?.allSites ?? [], [membership]);
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "—";

  const { data: batches = [] } = useGroupMaterialPurchases(groupId);
  const { data: usageRecords = [] } = useGroupBatchUsageRecords(groupId);
  const recordReconcile = useRecordReconciliationUsage();
  const generateSettlement = useGenerateSettlement();

  // ── Material family (parent + grade variants) — a "PPC Cement" pool is one
  //    parent plus its child grades. ──
  const { data: familyIds = [] } = useQuery({
    queryKey: ["reconcile-material-family", materialId],
    enabled: open && !!materialId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from("materials")
        .select("id, parent_id")
        .or(`id.eq.${materialId},parent_id.eq.${materialId}`);
      if (error) throw error;
      const ids = new Set<string>([materialId]);
      for (const m of (data ?? []) as Array<{ id: string }>) ids.add(m.id);
      return [...ids];
    },
  });
  const familySet = useMemo(() => new Set(familyIds), [familyIds]);

  // Batches in this cluster whose items belong to the material family.
  // Completed batches are excluded from the POOL only — the RPC rejects adding
  // usage to a `status='completed'` batch, so the client must agree. (They stay
  // in `batches` for payer/stock-picture maps; their existing usage records still
  // feed the net.)
  const familyBatches = useMemo(() => {
    return (batches as any[])
      .map((b) => {
        if (b.status === "completed") return null;
        const fams = (b.items ?? []).filter((it: any) => familySet.has(it.material_id));
        if (fams.length === 0) return null;
        // One family-item per batch for cement; if several, take the largest.
        const item = fams.sort((x: any, y: any) => Number(y.quantity) - Number(x.quantity))[0];
        return { b, item };
      })
      .filter(Boolean) as Array<{ b: any; item: any }>;
  }, [batches, familySet]);

  // Family-relevant batches that WERE excluded because they're completed — so the
  // user understands why the available pool may be smaller than expected (a
  // mis-flagged completed batch with leftover stock should be reopened).
  const excludedCompletedCount = useMemo(
    () =>
      (batches as any[]).filter(
        (b) => b.status === "completed" && (b.items ?? []).some((it: any) => familySet.has(it.material_id))
      ).length,
    [batches, familySet]
  );

  // All family stock across the cluster — powers the per-site "stock picture"
  // AND resolves item-less advance batches (no line items) to a variant.
  const clusterSiteIds = useMemo(() => sites.map((s) => s.id), [sites]);
  const groupRefCodes = useMemo(
    () => new Set((batches as any[]).map((b) => b.ref_code)),
    [batches]
  );
  const { data: familyStock = [] } = useQuery({
    queryKey: ["reconcile-family-stock", groupId, familyIds.slice().sort().join(","), clusterSiteIds.slice().sort().join(",")],
    enabled: open && clusterSiteIds.length > 0 && familyIds.length > 0,
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await (supabase as any)
        .from("stock_inventory")
        .select("id, site_id, material_id, brand_id, batch_code, current_qty")
        .in("material_id", familyIds)
        .in("site_id", clusterSiteIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // batch_code → family variant (for item-less advance batches lacking line items).
  const stockVariantByBatch = useMemo(() => {
    const m = new Map<string, { material_id: string; brand_id: string | null }>();
    for (const r of familyStock as any[]) {
      if (!r.batch_code) continue;
      if (!m.has(r.batch_code)) m.set(r.batch_code, { material_id: r.material_id, brand_id: r.brand_id ?? null });
    }
    return m;
  }, [familyStock]);

  // Item-less group batches (advance/partial, not yet itemised) that DO have
  // delivered family stock — include at a derived cost so delivered qty is usable.
  const itemlessBatches = useMemo(() => {
    return (batches as any[])
      .filter((b) => b.status !== "completed" && (b.items ?? []).every((it: any) => !familySet.has(it.material_id)))
      .map((b) => ({ b, variant: stockVariantByBatch.get(b.ref_code) }))
      .filter((x) => !!x.variant) as Array<{ b: any; variant: { material_id: string; brand_id: string | null } }>;
  }, [batches, familySet, stockVariantByBatch]);

  const poIds = useMemo(
    () =>
      [
        ...new Set(
          [...familyBatches.map(({ b }) => b), ...itemlessBatches.map(({ b }) => b)]
            .map((b) => b.purchase_order_id)
            .filter(Boolean)
        ),
      ] as string[],
    [familyBatches, itemlessBatches]
  );

  // Delivered+verified qty per PO, by delivery date — caps the pool to delivered
  // stock (advance/partial batches lend only what's arrived).
  const { data: deliveriesByPo } = useQuery({
    queryKey: ["reconcile-deliveries", groupId, poIds.sort().join(",")],
    enabled: open && poIds.length > 0,
    queryFn: async (): Promise<Map<string, { date: string; qty: number }[]>> => {
      const { data, error } = await (supabase as any)
        .from("deliveries")
        .select("id, po_id, delivery_date, verification_status, delivery_items(material_id, received_qty, accepted_qty)")
        .in("po_id", poIds)
        .eq("verification_status", "verified");
      if (error) throw error;
      const map = new Map<string, { date: string; qty: number }[]>();
      for (const d of (data ?? []) as any[]) {
        const qty = (d.delivery_items ?? [])
          .filter((it: any) => familySet.has(it.material_id))
          .reduce((s: number, it: any) => s + Number(it.accepted_qty ?? it.received_qty ?? 0), 0);
        if (qty <= 0) continue;
        const arr = map.get(d.po_id) ?? [];
        arr.push({ date: d.delivery_date, qty });
        map.set(d.po_id, arr);
      }
      return map;
    },
  });

  const pool: BatchPoolRow[] = useMemo(() => {
    const mk = (
      b: any,
      mId: string,
      brId: string | null,
      originalQty: number,
      unitCost: number,
      unit: string
    ): BatchPoolRow => {
      const payingSiteId = b.paying_site_id ?? b.site_id;
      const deliveries = b.purchase_order_id ? deliveriesByPo?.get(b.purchase_order_id) ?? [] : [];
      return {
        refCode: b.ref_code,
        purchaseDate: b.purchase_date,
        payingSiteId,
        payingSiteName: siteName(payingSiteId),
        unit,
        landedUnitCost: unitCost,
        originalQty,
        materialId: mId,
        brandId: brId,
        deliveries,
      };
    };
    const itemRows = familyBatches.map(({ b, item }) =>
      mk(
        b,
        item.material_id,
        item.brand_id ?? null,
        Number(item.quantity ?? 0),
        Number(item.unit_price ?? 0) * batchLandedRatio(b),
        item.material?.unit ?? materialUnit ?? "nos"
      )
    );
    // Item-less advance batches: ceiling = ordered qty, cost = amount_paid / ordered.
    // The delivered-as-of cap (deliveries) still limits how much can be allocated.
    const itemlessRows = itemlessBatches.map(({ b, variant }) => {
      const orig = Number(b.original_qty ?? 0);
      const paid = Number(b.amount_paid ?? b.total_amount ?? 0);
      return mk(b, variant.material_id, variant.brand_id, orig, orig > 0 ? paid / orig : 0, materialUnit ?? "nos");
    });
    return [...itemRows, ...itemlessRows];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyBatches, itemlessBatches, deliveriesByPo, materialUnit, sites]);

  const payerByRef = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of batches as any[]) m.set(b.ref_code, b.paying_site_id ?? b.site_id);
    return m;
  }, [batches]);

  const existing: ExistingUsage[] = useMemo(() => {
    return (usageRecords as any[])
      .filter((u) => familySet.has(u.material_id) && payerByRef.has(u.batch_ref_code))
      .map((u) => ({
        id: u.id,
        batchRefCode: u.batch_ref_code,
        usageSiteId: u.usage_site_id,
        payingSiteId: payerByRef.get(u.batch_ref_code)!,
        usageDate: u.usage_date,
        quantity: Number(u.quantity ?? 0),
        totalCost: Number(u.total_cost ?? 0),
        isSelfUse: !!u.is_self_use,
        settlementStatus: u.settlement_status,
      }));
  }, [usageRecords, familySet, payerByRef]);

  // Batch context (bought date · qty) keyed by ref, for the grouped replace list.
  const batchMetaByRef = useMemo(() => {
    const m = new Map<string, { purchaseDate?: string; originalQty: number; unit: string }>();
    for (const b of pool) {
      const e = m.get(b.refCode);
      if (e) e.originalQty += b.originalQty;
      else m.set(b.refCode, { purchaseDate: b.purchaseDate, originalQty: b.originalQty, unit: b.unit });
    }
    return m;
  }, [pool]);

  // ── Local state ──
  const [step, setStep] = useState(0);
  const [periods, setPeriods] = useState<PeriodInput[]>([]);
  const [committed, setCommitted] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Recording ADDS to the ledger by default — nothing is deleted unless the user
  // explicitly ticks records to replace. `replaceIds` holds those choices; the
  // destructive commit is still gated behind an acknowledgement (`confirmReplace`).
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [replaceIds, setReplaceIds] = useState<string[]>([]);
  const [showReplace, setShowReplace] = useState(false);
  // Snapshot of "what this entry recorded", frozen at commit so the Done step
  // keeps showing it after the post-commit refetch changes `existing`/`preview`.
  const [committedSummary, setCommittedSummary] = useState<ReconcileUsageSummary | null>(null);

  // Reset on open.
  useEffect(() => {
    if (open) {
      _seq = 0;
      const today = new Date().toISOString().slice(0, 10);
      setPeriods([newPeriod(sites.map((s) => s.id), today)]);
      setStep(0);
      setCommitted(false);
      setGenDone(false);
      setErr(null);
      setConfirmReplace(false);
      setReplaceIds([]);
      setShowReplace(false);
      setCommittedSummary(null);
    }
  }, [open, sites]);

  // NO prefill: inputs start blank and mean "additional usage to record now".
  // Recording adds on top of the existing ledger, so prefilling would double-count.

  const periodsForCalc: ReconcilePeriod[] = useMemo(
    () =>
      periods.map((p) => ({
        id: p.id,
        fromDate: p.fromDate || null,
        asOfDate: p.asOfDate,
        bagsBySite: Object.fromEntries(
          Object.entries(p.bags).map(([s, v]) => [s, Number(v) || 0])
        ),
        workDescription: p.note || undefined,
      })),
    [periods]
  );

  const preview = useMemo(
    () => computeReconcileAllocations(periodsForCalc, pool, existing, replaceIds),
    [periodsForCalc, pool, existing, replaceIds]
  );

  // Existing ledger records the allocator KEPT (the same set it nets over — those
  // not selected for replacement). Feeds the Net card's combined breakdown so the
  // batch-logged usage and this reconcile read as one whole.
  const existingKept = useMemo(
    () => existing.filter((e) => !preview.deleteIds.includes(e.id)),
    [existing, preview.deleteIds]
  );
  const usageSummary = useMemo(
    () => summarizeReconcileUsage(preview.allocations, existingKept),
    [preview.allocations, existingKept]
  );

  // Existing records the user is ALLOWED to replace (pending/self_use — never
  // settled). Drives the opt-in "Replace / correct existing records" checklist.
  const replaceableExisting = useMemo(
    () =>
      existing
        .filter((e) => e.settlementStatus !== "settled" && e.settlementStatus !== "in_settlement")
        .sort((a, b) => a.usageDate.localeCompare(b.usageDate) || a.batchRefCode.localeCompare(b.batchRefCode)),
    [existing]
  );
  const toggleReplace = (id: string) =>
    setReplaceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const totalEntered = periodsForCalc.reduce(
    (s, p) => s + Object.values(p.bagsBySite).reduce((a, b) => a + b, 0),
    0
  );
  const lockedKept = existing.filter(
    (e) => !preview.deleteIds.includes(e.id) && (e.settlementStatus === "settled" || e.settlementStatus === "in_settlement")
  ).length;
  // Physically-honest orientation numbers (independent of the replace scope):
  // delivered-and-stocked total + usage already on the ledger.
  const deliveredTotal = useMemo(
    () =>
      pool.reduce((s, b) => {
        const d = b.deliveries.length
          ? Math.min(b.deliveries.reduce((a, x) => a + x.qty, 0), b.originalQty)
          : b.originalQty;
        return s + d;
      }, 0),
    [pool]
  );
  const recordedSoFar = useMemo(() => existing.reduce((s, e) => s + e.quantity, 0), [existing]);

  // Live "group pool remaining after this reconcile". NOT clusterAvailable −
  // entered: the first period is prefilled with replaceable usage and a period
  // REPLACES the pending logs in its range, so the pool only drops by net-new
  // usage. delivered − (usage kept on the ledger) − (entered) is correct in both
  // the settled-locked case (degrades to 840 − entered) and the replaced case,
  // and equals clusterAvailable on open (prefill reproduces the existing usage).
  const keptUsageQty = useMemo(
    () => existing.filter((e) => !preview.deleteIds.includes(e.id)).reduce((s, e) => s + e.quantity, 0),
    [existing, preview.deleteIds]
  );
  const poolRemaining = round2(deliveredTotal - keptUsageQty - totalEntered);

  // Per-site BEFORE → AFTER diff for the replace, so the destructive commit is
  // legible: how much each site has recorded now vs what it will have after.
  const replaceDiff = useMemo(() => {
    const deleteSet = new Set(preview.deleteIds);
    const before = new Map<string, number>();
    const after = new Map<string, number>();
    const deletedQty = new Map<string, number>();
    for (const e of existing) {
      before.set(e.usageSiteId, (before.get(e.usageSiteId) ?? 0) + e.quantity);
      if (deleteSet.has(e.id)) {
        deletedQty.set(e.usageSiteId, (deletedQty.get(e.usageSiteId) ?? 0) + e.quantity);
      } else {
        after.set(e.usageSiteId, (after.get(e.usageSiteId) ?? 0) + e.quantity); // kept (settled etc.)
      }
    }
    for (const a of preview.allocations) {
      after.set(a.usageSiteId, (after.get(a.usageSiteId) ?? 0) + a.quantity);
    }
    const rows = sites.map((s) => ({
      siteId: s.id,
      name: s.name,
      before: round2(before.get(s.id) ?? 0),
      after: round2(after.get(s.id) ?? 0),
    }));
    // A site whose recorded usage would DROP (esp. to zero) is the silent-loss
    // footgun — surface it explicitly.
    const dropping = rows.filter((r) => r.after < r.before - 1e-6);
    const totalDeleted = round2([...deletedQty.values()].reduce((a, b) => a + b, 0));
    return { rows, dropping, totalDeleted };
  }, [existing, preview.deleteIds, preview.allocations, sites]);

  // Per-site stock picture: own-site (dedicated) vs group held at that site.
  const stockBySite = useMemo(() => {
    const m = new Map<string, { own: number; groupHeld: number }>();
    for (const s of sites) m.set(s.id, { own: 0, groupHeld: 0 });
    for (const r of familyStock as any[]) {
      const acc = m.get(r.site_id);
      if (!acc) continue;
      const qty = Number(r.current_qty ?? 0);
      if (r.batch_code && groupRefCodes.has(r.batch_code)) acc.groupHeld += qty;
      else acc.own += qty; // null batch_code or own_site batch
    }
    return m;
  }, [familyStock, groupRefCodes, sites]);

  // Shared group pool available now = delivered − usage already on the ledger.
  const clusterAvailable = useMemo(() => {
    const usedByBatch = new Map<string, number>();
    for (const e of existing) usedByBatch.set(e.batchRefCode, (usedByBatch.get(e.batchRefCode) ?? 0) + e.quantity);
    return pool.reduce((s, b) => {
      const delivered = b.deliveries.length
        ? Math.min(b.deliveries.reduce((a, x) => a + x.qty, 0), b.originalQty)
        : b.originalQty;
      return s + Math.max(0, delivered - (usedByBatch.get(b.refCode) ?? 0));
    }, 0);
  }, [pool, existing]);

  // Per-period over-allocation guard: Σ(site inputs) must not exceed what's
  // available as of that period's date (group pool, delivered, after earlier periods).
  const periodEntered = (p: PeriodInput) =>
    Object.values(p.bags).reduce((a, v) => a + (Number(v) || 0), 0);
  const periodOver = (p: PeriodInput) =>
    periodEntered(p) > (preview.periodCapacity[p.id] ?? Infinity) + 1e-6;
  const anyOver = periods.some(periodOver);

  // ── Actions ──
  const updatePeriod = (id: string, patch: Partial<PeriodInput>) =>
    setPeriods((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const setBags = (id: string, site: string, v: string) =>
    setPeriods((ps) => ps.map((p) => (p.id === id ? { ...p, bags: { ...p.bags, [site]: v } } : p)));

  const handleCommit = async () => {
    setErr(null);
    try {
      const byEntry = new Map<string, { usage_site_id: string; usage_date: string; work_description?: string | null; allocations: any[] }>();
      for (const a of preview.allocations) {
        const key = `${a.usageSiteId}__${a.usageDate}__${a.workDescription ?? ""}`;
        const e = byEntry.get(key) ?? {
          usage_site_id: a.usageSiteId,
          usage_date: a.usageDate,
          work_description: a.workDescription ?? null,
          allocations: [],
        };
        e.allocations.push({
          batch_ref_code: a.batchRefCode,
          material_id: a.materialId,
          brand_id: a.brandId,
          quantity: a.quantity,
        });
        byEntry.set(key, e);
      }
      await recordReconcile.mutateAsync({
        created_by: user?.id,
        delete_ids: preview.deleteIds,
        entries: [...byEntry.values()],
      });
      // Freeze the "what this entry recorded" summary before the refetch lands.
      setCommittedSummary(usageSummary);
      setCommitted(true);
      setStep(2);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to record usage");
    }
  };

  const handleGenerate = async () => {
    setErr(null);
    try {
      if (!groupId) throw new Error("Cluster not resolved");
      for (const f of preview.grossFlows) {
        if (f.amount <= 0) continue;
        await generateSettlement.mutateAsync({
          siteGroupId: groupId,
          fromSiteId: f.creditorSiteId, // creditor (paid)
          toSiteId: f.debtorSiteId, // debtor (used)
          materialIds: familyIds,
          // created_by on inter_site_material_settlements FKs public.users(id),
          // so this must be the public-users id (userProfile.id), NOT the auth id
          // (user.id) — the latter triggers inter_site_material_settlements_created_by_fkey.
          userId: userProfile?.id,
        } as any);
      }
      setGenDone(true);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setErr(msg.startsWith("VENDOR_UNPAID") ? "Some batches aren't vendor-paid yet — settle the vendor first." : msg || "Failed to generate settlement");
    }
  };

  const canNext =
    (totalEntered > 0 || replaceIds.length > 0) && preview.shortfalls.length === 0 && !anyOver;

  const netLabel =
    preview.net.amount > 0 && preview.net.fromSiteId && preview.net.toSiteId
      ? `${siteName(preview.net.fromSiteId)} owes ${siteName(preview.net.toSiteId)}`
      : "Cluster is square — no net owed";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 6 }}>
        <SwapIcon fontSize="small" color="primary" />
        <Box>
          <Typography variant="h6" component="div" sx={{ lineHeight: 1.2 }}>
            Reconcile usage — {materialName ?? "Material"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {membership?.groupName ?? "Cluster"} · group stock only · own-site purchases are excluded
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {["Declare usage", "Preview & net", committed ? "Done" : "Commit"].map((l) => (
            <Step key={l}>
              <StepLabel>{l}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {err && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
            {err}
          </Alert>
        )}

        {/* ── STEP 0: DECLARE ── */}
        {step === 0 && (
          <Box>
            {/* Stock picture — what each site has + the shared pool to split. */}
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "grey.50" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
                <Typography variant="overline" color="text.secondary">Stock picture</Typography>
                <Typography variant="caption" color="text.secondary">
                  {pool.length} group batches · {fmtQty(deliveredTotal)} {materialUnit} delivered · {fmtQty(recordedSoFar)} used so far
                </Typography>
              </Box>
              {excludedCompletedCount > 0 && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1, fontStyle: "italic" }}>
                  {excludedCompletedCount} completed batch{excludedCompletedCount > 1 ? "es" : ""} excluded from the pool —
                  reopen one from its batch card if it still has stock.
                </Typography>
              )}
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1 }}>
                {sites.map((s) => {
                  const sp = stockBySite.get(s.id) ?? { own: 0, groupHeld: 0 };
                  return (
                    <Box key={s.id} sx={{ flex: 1, minWidth: 180, p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}>
                      <Typography variant="subtitle2" noWrap>{s.name}</Typography>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="caption" color="text.secondary">Own (dedicated)</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{fmtQty(sp.own)} {materialUnit}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="caption" color="text.secondary">Group held here</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{fmtQty(sp.groupHeld)} {materialUnit}</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Shared group pool available now</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: "success.main" }}>{fmtQty(clusterAvailable)} {materialUnit}</Typography>
              </Box>
            </Paper>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Enter how much each site <strong>additionally</strong> used <strong>from the group pool</strong>. This{" "}
              <strong>adds</strong> to what&apos;s already recorded — existing logs are kept. A site uses its own group
              batches first (self-use, never settles), then borrows from the other site — only that last part is a
              debt. Made a mistake? Expand <strong>Replace / correct existing records</strong> below and tick the ones
              to overwrite.
            </Typography>

            {periods.map((p, idx) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>
                    Period {idx + 1}
                  </Typography>
                  {periods.length > 1 && (
                    <IconButton size="small" onClick={() => setPeriods((ps) => ps.filter((x) => x.id !== p.id))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
                  <TextField
                    label="Used as of *"
                    type="date"
                    size="small"
                    value={p.asOfDate}
                    onChange={(e) => updatePeriod(p.id, { asOfDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    helperText="Date stamped on the new usage + delivered-stock cap"
                  />
                  <TextField
                    label="Note (optional)"
                    size="small"
                    value={p.note}
                    onChange={(e) => updatePeriod(p.id, { note: e.target.value })}
                    sx={{ flex: 1, minWidth: 160 }}
                  />
                </Box>
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  {sites.map((s) => (
                    <TextField
                      key={s.id}
                      label={`${s.name} — add usage`}
                      type="number"
                      size="small"
                      value={p.bags[s.id] ?? ""}
                      onChange={(e) => setBags(p.id, s.id, e.target.value)}
                      InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">{materialUnit}</Typography> }}
                      sx={{ width: 220 }}
                    />
                  ))}
                </Box>
                {/* Per-period ceiling = what's still available to record as of this
                    date (delivered − usage already on the ledger − earlier periods).
                    In pure-add mode this equals the "Shared group pool available now"
                    header; ticking records to replace below frees their qty and raises
                    this number. */}
                {(() => {
                  const cap = preview.periodCapacity[p.id] ?? 0;
                  const entered = periodEntered(p);
                  const over = periodOver(p);
                  return (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color={over ? "error" : "text.secondary"} sx={{ fontWeight: over ? 700 : 400 }}>
                        <strong>{fmtQty(cap)} {materialUnit}</strong> available to record as of this date
                      </Typography>
                      {/* Live remaining-after-entry feedback. Hidden once over the
                          cap (the red over-limit warning below covers that), and
                          hidden if it would go negative to avoid a confusing
                          negative in green. */}
                      {totalEntered > 0 && !over && poolRemaining >= -1e-6 && (
                        <Typography variant="caption" component="div" color="success.main" sx={{ fontWeight: 600 }}>
                          <strong>{fmtQty(poolRemaining)} {materialUnit}</strong> will remain after these entries
                        </Typography>
                      )}
                      {over && (
                        <Typography variant="caption" color="error" component="div">
                          Exceeds available group stock by {fmtQty(entered - cap)} {materialUnit} — reduce the quantity,
                          extend the “used as of” date, or replace an existing record below.
                        </Typography>
                      )}
                    </Box>
                  );
                })()}
              </Paper>
            ))}

            <Button
              startIcon={<AddIcon />}
              size="small"
              onClick={() => setPeriods((ps) => [...ps, newPeriod(sites.map((s) => s.id), ps[ps.length - 1]?.asOfDate ?? new Date().toISOString().slice(0, 10))])}
            >
              Add another period
            </Button>

            {/* Live before→after per site, so adding on top of the ledger is legible
                (and a typed total never silently doubles the recorded usage). */}
            {(totalEntered > 0 || replaceIds.length > 0) && (
              <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">After recording:</Typography>
                {replaceDiff.rows
                  .filter((r) => r.before > 0 || r.after > 0)
                  .map((r) => {
                    const dropped = r.after < r.before - 1e-6;
                    const grew = r.after > r.before + 1e-6;
                    return (
                      <Chip
                        key={r.siteId}
                        size="small"
                        variant="outlined"
                        color={dropped ? "error" : grew ? "success" : "default"}
                        label={`${r.name}: ${fmtQty(r.before)} → ${fmtQty(r.after)} ${materialUnit}`}
                      />
                    );
                  })}
              </Box>
            )}

            {/* Opt-in replace: by default this is closed and nothing is deleted.
                Ticking a record marks it for permanent replacement on commit. */}
            {replaceableExisting.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  color="warning"
                  startIcon={<EditIcon fontSize="small" />}
                  onClick={() => setShowReplace((v) => !v)}
                >
                  Replace / correct existing records
                  {replaceIds.length > 0 ? ` (${replaceIds.length} selected)` : ""}
                </Button>
                <Collapse in={showReplace}>
                  <Paper variant="outlined" sx={{ p: 1.5, mt: 1, borderColor: "warning.200" }}>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                      Recording adds on top of these by default. Tick a record only if it&apos;s wrong — it will be
                      permanently replaced on commit (recoverable from the audit log). Grouped by source batch;
                      own-stock usage never settles between sites.
                    </Typography>
                    {groupReplaceableUsage(replaceableExisting).map((g) => {
                      const meta = batchMetaByRef.get(g.batchRefCode);
                      const renderRow = (e: ExistingUsage) => (
                        <FormControlLabel
                          key={e.id}
                          sx={{ display: "flex", m: 0, py: 0.25 }}
                          control={
                            <Checkbox
                              size="small"
                              checked={replaceIds.includes(e.id)}
                              onChange={() => toggleReplace(e.id)}
                            />
                          }
                          label={
                            <Typography variant="body2" component="span">
                              {e.usageDate} · <strong>{siteName(e.usageSiteId)}</strong> used{" "}
                              {fmtQty(e.quantity)} {materialUnit}
                            </Typography>
                          }
                        />
                      );
                      return (
                        <Box
                          key={g.batchRefCode}
                          sx={{
                            mb: 1,
                            pb: 1,
                            borderBottom: 1,
                            borderColor: "divider",
                            "&:last-of-type": { borderBottom: 0, pb: 0, mb: 0 },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, flexWrap: "wrap" }}>
                            <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
                              {g.batchRefCode}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {meta?.purchaseDate ? `bought ${meta.purchaseDate} · ` : ""}
                              paid by {siteName(g.payingSiteId)}
                              {meta ? ` · ${fmtQty(meta.originalQty)} ${meta.unit}` : ""}
                            </Typography>
                          </Box>
                          {g.crossSite.length > 0 && (
                            <Box sx={{ pl: 1.5, mt: 0.25 }}>
                              <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 700 }}>
                                Cross-site · settles
                              </Typography>
                              {g.crossSite.map(renderRow)}
                            </Box>
                          )}
                          {g.selfUse.length > 0 && (
                            <Box sx={{ pl: 1.5, mt: 0.25 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                Own stock · never settles
                              </Typography>
                              {g.selfUse.map(renderRow)}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Paper>
                </Collapse>
              </Box>
            )}

            {preview.shortfalls.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {preview.shortfalls.map((s) => (
                  <div key={`${s.periodId}-${s.usageSiteId}`}>
                    {siteName(s.usageSiteId)}: only {fmtQty(s.allocated)} of {fmtQty(s.requested)} available as of that date
                    (short by {fmtQty(s.shortBy)}). Reduce the qty or extend the date.
                  </div>
                ))}
              </Alert>
            )}
          </Box>
        )}

        {/* ── STEP 1: PREVIEW ── */}
        {step === 1 && (
          <Box>
            <Paper
              variant="outlined"
              sx={{ p: 2, mb: 2, bgcolor: preview.net.amount > 0 ? "warning.50" : "success.50", borderColor: preview.net.amount > 0 ? "warning.200" : "success.200" }}
            >
              <Typography variant="overline" color="text.secondary">
                Net settlement
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {netLabel}
                {preview.net.amount > 0 && (
                  <Box component="span" sx={{ color: "warning.main", ml: 1 }}>
                    {formatCurrency(preview.net.amount)}
                  </Box>
                )}
              </Typography>

              {/* How this is calculated — only cross-site borrowed stock settles.
                  Each leg is tagged "new this entry" vs "already logged on a
                  batch" so the batch-logged usage and this reconcile read as one
                  whole (and an existing record that isn't in the table below is
                  no longer invisible). */}
              {usageSummary.flows.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="overline" color="text.secondary" component="div">
                    Only stock borrowed across sites settles
                  </Typography>
                  {usageSummary.flows.map((f) => (
                    <Box key={`${f.creditorSiteId}-${f.debtorSiteId}`} sx={{ mb: 0.25 }}>
                      {f.newQty > 0 && (
                        <Typography variant="body2" component="div">
                          {siteName(f.debtorSiteId)} used <strong>{fmtQty(f.newQty)} {materialUnit}</strong> paid by{" "}
                          {siteName(f.creditorSiteId)} → {formatCurrency(f.newAmount)}
                          <Chip size="small" color="primary" variant="outlined" label="new this entry" sx={{ ml: 1, height: 18 }} />
                        </Typography>
                      )}
                      {f.existingQty > 0 && (
                        <Typography variant="body2" component="div">
                          {siteName(f.debtorSiteId)} used <strong>{fmtQty(f.existingQty)} {materialUnit}</strong> paid by{" "}
                          {siteName(f.creditorSiteId)} → {formatCurrency(f.existingAmount)}
                          <Chip size="small" variant="outlined" label="already logged on a batch" sx={{ ml: 1, height: 18 }} />
                        </Typography>
                      )}
                    </Box>
                  ))}

                  {/* Net formula (2-site cluster): bigger direction − smaller. */}
                  {(() => {
                    if (!(preview.net.amount > 0 && preview.net.fromSiteId && preview.net.toSiteId)) return null;
                    const owedTo = preview.grossFlows.find(
                      (f) => f.creditorSiteId === preview.net.toSiteId && f.debtorSiteId === preview.net.fromSiteId
                    )?.amount ?? 0;
                    const owedBack = preview.grossFlows.find(
                      (f) => f.creditorSiteId === preview.net.fromSiteId && f.debtorSiteId === preview.net.toSiteId
                    )?.amount ?? 0;
                    if (owedBack <= 0) return null; // only one direction → net == that leg, no subtraction to show
                    return (
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
                        Net = {formatCurrency(owedTo)} − {formatCurrency(owedBack)} = {formatCurrency(preview.net.amount)} →{" "}
                        {siteName(preview.net.fromSiteId)} owes {siteName(preview.net.toSiteId)}
                      </Typography>
                    );
                  })()}
                </Box>
              )}

              {/* Why a big typed total collapses to a small net: most of it is a
                  site using its OWN group batches, which never settles. */}
              {usageSummary.bySite.some((s) => s.selfUse > 0) && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                  Own group stock (never settles):{" "}
                  {usageSummary.bySite
                    .filter((s) => s.selfUse > 0)
                    .map((s) => `${siteName(s.siteId)} ${fmtQty(s.selfUse)}`)
                    .join(" · ")}
                </Typography>
              )}
            </Paper>

            <Typography variant="caption" color="text.secondary">
              {preview.allocations.length} new allocation(s) added on top of existing
              {preview.deleteIds.length > 0 ? ` · replacing ${preview.deleteIds.length} selected record(s)` : ""}
              {" · "}{lockedKept} settled log(s) kept
            </Typography>

            {/* Destructive-change confirmation: this commit PERMANENTLY deletes
                the in-range pending/self-use records and rebuilds them. Show the
                per-site before→after so it's legible, flag any site whose usage
                would drop, and require an explicit acknowledgement. */}
            {preview.deleteIds.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, borderColor: "warning.main", bgcolor: "warning.50" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  This permanently replaces {preview.deleteIds.length} existing usage record(s)
                  {replaceDiff.totalDeleted > 0 ? ` (${fmtQty(replaceDiff.totalDeleted)} ${materialUnit})` : ""}.
                </Typography>
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", my: 1 }}>
                  {replaceDiff.rows.map((r) => {
                    const dropped = r.after < r.before - 1e-6;
                    return (
                      <Box
                        key={r.siteId}
                        sx={{
                          px: 1, py: 0.5, borderRadius: 1, border: "1px solid",
                          borderColor: dropped ? "error.main" : "divider",
                          bgcolor: "background.paper",
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" component="div">{r.name}</Typography>
                        <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
                          {fmtQty(r.before)} → <Box component="span" sx={{ color: dropped ? "error.main" : "success.main" }}>{fmtQty(r.after)}</Box> {materialUnit}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
                {replaceDiff.dropping.length > 0 && (
                  <Alert severity="error" sx={{ mb: 1, py: 0.25 }}>
                    {replaceDiff.dropping.map((r) => `${r.name} drops from ${fmtQty(r.before)} to ${fmtQty(r.after)} ${materialUnit}`).join(" · ")}.
                    {" "}If that site really used that material, go back and enter its usage before committing.
                  </Alert>
                )}
                <FormControlLabel
                  control={<Checkbox size="small" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />}
                  label={<Typography variant="body2">I understand this permanently replaces those records (recoverable from the audit log).</Typography>}
                />
              </Paper>
            )}

            <Box sx={{ overflowX: "auto", mt: 1 }}>
              <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 13, "& td, & th": { p: 0.75, borderBottom: "1px solid", borderColor: "divider", textAlign: "left", whiteSpace: "nowrap" } }}>
                <Box component="thead">
                  <Box component="tr">
                    <Box component="th">Batch</Box>
                    <Box component="th">Date</Box>
                    <Box component="th">Payer</Box>
                    {sites.map((s) => (
                      <Box component="th" key={s.id} sx={{ textAlign: "right !important" }}>{s.name}</Box>
                    ))}
                    <Box component="th" sx={{ textAlign: "right !important" }}>Cost</Box>
                  </Box>
                </Box>
                <Box component="tbody">
                  {preview.perBatch.map((row) => (
                    <Box component="tr" key={row.refCode}>
                      <Box component="td" sx={{ fontFamily: "monospace" }}>{row.refCode}</Box>
                      <Box component="td">{row.purchaseDate}</Box>
                      <Box component="td">
                        <Chip size="small" variant="outlined" label={row.payingSiteName ?? siteName(row.payingSiteId)} />
                      </Box>
                      {sites.map((s) => (
                        <Box component="td" key={s.id} sx={{ textAlign: "right !important" }}>
                          {row.qtyBySite[s.id] ? fmtQty(row.qtyBySite[s.id]) : "—"}
                        </Box>
                      ))}
                      <Box component="td" sx={{ textAlign: "right !important" }}>{formatCurrency(row.cost)}</Box>
                    </Box>
                  ))}
                  {preview.perBatch.length > 0 && (
                    <Box
                      component="tr"
                      sx={{ "& td": { fontWeight: 700, borderTop: "2px solid", borderColor: "text.secondary" } }}
                    >
                      <Box component="td">Total</Box>
                      <Box component="td" />
                      <Box component="td" />
                      {sites.map((s) => {
                        const colTotal = preview.perBatch.reduce((sum, row) => sum + (row.qtyBySite[s.id] ?? 0), 0);
                        return (
                          <Box component="td" key={s.id} sx={{ textAlign: "right !important" }}>
                            {colTotal > 0 ? fmtQty(round2(colTotal)) : "—"}
                          </Box>
                        );
                      })}
                      <Box component="td" sx={{ textAlign: "right !important" }}>
                        {formatCurrency(preview.perBatch.reduce((sum, row) => sum + row.cost, 0))}
                      </Box>
                    </Box>
                  )}
                  {preview.perBatch.length === 0 && (
                    <Box component="tr">
                      <Box component="td" colSpan={3 + sites.length} sx={{ color: "text.secondary" }}>
                        No new allocations.
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {/* ── STEP 2: DONE ── */}
        {step === 2 && (
          <Box sx={{ textAlign: "center", py: 2 }}>
            <CheckIcon color="success" sx={{ fontSize: 48 }} />
            <Typography variant="h6" sx={{ mt: 1 }}>
              Usage recorded
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, mb: 2 }}>
              {netLabel}
              {preview.net.amount > 0 && <strong> {formatCurrency(preview.net.amount)}</strong>}
            </Typography>
            {(() => {
              const sum = committedSummary ?? usageSummary;
              const selfSites = sum.bySite.filter((s) => s.selfUse > 0);
              const flows = sum.flows.filter((f) => f.newQty > 0);
              if (selfSites.length === 0 && flows.length === 0) return null;
              return (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, textAlign: "left", maxWidth: 440, mx: "auto" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    What this entry recorded
                  </Typography>
                  {flows.map((f) => (
                    <Typography key={`${f.creditorSiteId}-${f.debtorSiteId}`} variant="body2">
                      {siteName(f.debtorSiteId)} used <strong>{fmtQty(f.newQty)} {materialUnit}</strong> paid by{" "}
                      {siteName(f.creditorSiteId)} → {formatCurrency(f.newAmount)}
                    </Typography>
                  ))}
                  {selfSites.map((s) => (
                    <Typography key={s.siteId} variant="body2" color="text.secondary">
                      {siteName(s.siteId)} used <strong>{fmtQty(s.selfUse)} {materialUnit}</strong> from its own stock
                      <Box component="span" sx={{ color: "text.disabled" }}> · doesn&apos;t settle</Box>
                    </Typography>
                  ))}
                </Paper>
              );
            })()}
            {preview.net.amount > 0 ? (
              genDone ? (
                <Alert severity="success" sx={{ textAlign: "left" }}>
                  Settlement generated as <strong>pending</strong>. Mark it paid in Inter-site settlements when the
                  money changes hands.
                </Alert>
              ) : (
                <Box sx={{ maxWidth: 440, mx: "auto", textAlign: "left" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Generating creates a <strong>pending</strong> debt record in Inter-site
                    settlements — <strong>no money moves now</strong>. You&apos;ll mark it paid there
                    when the cash actually changes hands.
                  </Typography>
                  {preview.grossFlows.filter((f) => f.amount > 0).length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Will record:
                      </Typography>
                      {preview.grossFlows
                        .filter((f) => f.amount > 0)
                        .map((f, i) => (
                          <Typography
                            key={i}
                            variant="body2"
                            sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}
                          >
                            <span>
                              {siteName(f.debtorSiteId)} → {siteName(f.creditorSiteId)}
                            </span>
                            <strong>{formatCurrency(f.amount)}</strong>
                          </Typography>
                        ))}
                      {preview.net.amount > 0 && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.75, pt: 0.75, borderTop: 1, borderColor: "divider" }}
                        >
                          Net: {netLabel} {formatCurrency(preview.net.amount)}
                        </Typography>
                      )}
                    </Paper>
                  )}
                  <Box sx={{ textAlign: "center" }}>
                    <Button variant="contained" onClick={handleGenerate} disabled={generateSettlement.isPending}>
                      {generateSettlement.isPending ? "Generating…" : "Generate settlement"}
                    </Button>
                  </Box>
                </Box>
              )
            ) : (
              <Alert severity="success" sx={{ textAlign: "left" }}>
                Nothing to settle between sites for this material.
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
              See every entry on the{" "}
              <Link href="/site/materials/usage-ledger" underline="hover">
                Usage Ledger
              </Link>
              . A pending settlement can be undone by deleting it on the Inter-site page.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {step === 0 && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Tooltip title={!canNext ? "Enter usage and clear any shortfall" : ""}>
              <span>
                <Button variant="contained" disabled={!canNext} onClick={() => setStep(1)}>
                  Preview
                </Button>
              </span>
            </Tooltip>
          </>
        )}
        {step === 1 && (
          <>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Tooltip title={preview.deleteIds.length > 0 && !confirmReplace ? "Tick the confirmation to replace the existing records" : ""}>
              <span>
                <Button
                  variant="contained"
                  onClick={handleCommit}
                  disabled={recordReconcile.isPending || (preview.deleteIds.length > 0 && !confirmReplace)}
                >
                  {recordReconcile.isPending ? <CircularProgress size={18} /> : "Record usage"}
                </Button>
              </span>
            </Tooltip>
          </>
        )}
        {step === 2 && (
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
