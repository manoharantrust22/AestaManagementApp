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
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  SwapHoriz as SwapIcon,
  CheckCircle as CheckIcon,
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
  type BatchPoolRow,
  type ExistingUsage,
  type ReconcilePeriod,
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
  const { user } = useAuth();
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
  const familyBatches = useMemo(() => {
    return (batches as any[])
      .map((b) => {
        const fams = (b.items ?? []).filter((it: any) => familySet.has(it.material_id));
        if (fams.length === 0) return null;
        // One family-item per batch for cement; if several, take the largest.
        const item = fams.sort((x: any, y: any) => Number(y.quantity) - Number(x.quantity))[0];
        return { b, item };
      })
      .filter(Boolean) as Array<{ b: any; item: any }>;
  }, [batches, familySet]);

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
      .filter((b) => (b.items ?? []).every((it: any) => !familySet.has(it.material_id)))
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

  // ── Local state ──
  const [step, setStep] = useState(0);
  const [periods, setPeriods] = useState<PeriodInput[]>([]);
  const [committed, setCommitted] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    }
  }, [open, sites]);

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
    () => computeReconcileAllocations(periodsForCalc, pool, existing),
    [periodsForCalc, pool, existing]
  );

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
          userId: user?.id,
        } as any);
      }
      setGenDone(true);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setErr(msg.startsWith("VENDOR_UNPAID") ? "Some batches aren't vendor-paid yet — settle the vendor first." : msg || "Failed to generate settlement");
    }
  };

  const canNext = totalEntered > 0 && preview.shortfalls.length === 0 && !anyOver;

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
              Enter how much each site consumed <strong>from the group pool</strong> in a period. A site uses its own
              dedicated stock first (never settles), then its own group batches (self-use), then borrows from the
              other site — only that last part is a debt. Each period <strong>replaces</strong> any pending logs in
              its date range, oldest→newest, capped at delivered stock.
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
                    label="From (optional)"
                    type="date"
                    size="small"
                    value={p.fromDate}
                    onChange={(e) => updatePeriod(p.id, { fromDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Used as of *"
                    type="date"
                    size="small"
                    value={p.asOfDate}
                    onChange={(e) => updatePeriod(p.id, { asOfDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
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
                      label={`${s.name} used (from group)`}
                      type="number"
                      size="small"
                      value={p.bags[s.id] ?? ""}
                      onChange={(e) => setBags(p.id, s.id, e.target.value)}
                      InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">{materialUnit}</Typography> }}
                      sx={{ width: 220 }}
                    />
                  ))}
                </Box>
                {/* Available-in-range cap + over-allocation guard */}
                {(() => {
                  const cap = preview.periodCapacity[p.id] ?? 0;
                  const entered = periodEntered(p);
                  const over = periodOver(p);
                  return (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color={over ? "error" : "text.secondary"} sx={{ fontWeight: over ? 700 : 400 }}>
                        Group available as of {p.asOfDate || "—"}: <strong>{fmtQty(cap)} {materialUnit}</strong>
                        {" · "}allocated {fmtQty(entered)} / {fmtQty(cap)}
                      </Typography>
                      {over && (
                        <Typography variant="caption" color="error" component="div">
                          Exceeds available stock for this period by {fmtQty(entered - cap)} {materialUnit} — reduce the
                          quantity or extend the “used as of” date.
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
              {preview.grossFlows.length > 0 && (
                <Box sx={{ mt: 1, display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {preview.grossFlows.map((f) => (
                    <Typography key={`${f.creditorSiteId}-${f.debtorSiteId}`} variant="caption" color="text.secondary">
                      {siteName(f.debtorSiteId)} → {siteName(f.creditorSiteId)}: {formatCurrency(f.amount)} ({fmtQty(f.qty)} {materialUnit})
                    </Typography>
                  ))}
                </Box>
              )}
            </Paper>

            <Typography variant="caption" color="text.secondary">
              Will replace {preview.deleteIds.length} pending log(s) in range · {lockedKept} settled log(s) kept · {preview.allocations.length} new allocation(s)
            </Typography>

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
            {preview.net.amount > 0 ? (
              genDone ? (
                <Alert severity="success" sx={{ textAlign: "left" }}>
                  Settlement generated as <strong>pending</strong>. Mark it paid in Inter-site settlements when the
                  money changes hands.
                </Alert>
              ) : (
                <Button variant="contained" onClick={handleGenerate} disabled={generateSettlement.isPending}>
                  {generateSettlement.isPending ? "Generating…" : "Generate settlement"}
                </Button>
              )
            ) : (
              <Alert severity="success" sx={{ textAlign: "left" }}>
                Nothing to settle between sites for this material.
              </Alert>
            )}
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
            <Button variant="contained" onClick={handleCommit} disabled={recordReconcile.isPending}>
              {recordReconcile.isPending ? <CircularProgress size={18} /> : "Record usage"}
            </Button>
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
