"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Checkbox,
  Chip,
  Tooltip,
  Divider,
  CircularProgress,
  InputAdornment,
  Alert,
} from "@mui/material";
import {
  Engineering as EngineeringIcon,
  Groups as GroupsIcon,
} from "@mui/icons-material";
import { useDayUnitsForDate } from "@/hooks/queries/useCompanyTeaShops";
import { useContractPresenceForSites } from "@/hooks/queries/useContractPresenceForSites";
import { useTeaEntryContractSelections } from "@/hooks/queries/useTeaEntryContractSelections";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { computeContractTeaSplit, type TeaSplitRow } from "@/lib/tea/contractTeaSplit";
import type {
  SiteAllocationInput,
  ContractSelectionInput,
} from "@/lib/tea/saveContractTeaEntry";
import type { ContractPresenceItem } from "@/lib/utils/contractPresenceUtils";

export interface ContractTeaModel {
  total: number;
  totalDayUnits: number;
  allocations: SiteAllocationInput[];
  selections: ContractSelectionInput[];
}

interface AllocRow {
  key: string;
  siteId: string;
  siteName: string;
  label: string;
  presenceKind: "package" | "subcontract" | "mesthri";
  refId: string | null;
  tradeCategoryId: string | null;
  tradeName: string | null;
  manDays: number;
}

interface ContractTeaAllocatorProps {
  siteGroupId: string;
  /** A representative site id for resolving per-trade workspace (activated) flags. */
  primarySiteId: string | undefined;
  date: string;
  totalCost: number;
  onTotalCostChange: (n: number) => void;
  sites: { id: string; name: string }[];
  /** Emits the computed split model (null while loading / no activity). */
  onModelChange: (model: ContractTeaModel | null) => void;
  /** Render the allocator's own total-cost field (default true). The dialog
   *  hides it because SimpleEntryModeContent already owns the cost input. */
  showTotalField?: boolean;
  /** When editing, the entry id whose saved selections repopulate the picker. */
  entryId?: string | null;
}

const round = (n: number) => Math.round(n);

export default function ContractTeaAllocator({
  siteGroupId,
  primarySiteId,
  date,
  totalCost,
  onTotalCostChange,
  sites,
  onModelChange,
  showTotalField = true,
  entryId = null,
}: ContractTeaAllocatorProps) {
  // Per-site regular-crew (mesthri) man-days = named + market day units.
  const { data: dayUnitsData, isLoading: loadingDayUnits } = useDayUnitsForDate(
    siteGroupId,
    date,
    undefined,
    sites
  );
  // Per-site activated contracts that worked the day.
  const siteIds = useMemo(() => sites.map((s) => s.id), [sites]);
  const { data: presenceBySite, isLoading: loadingPresence } =
    useContractPresenceForSites({ siteIds, date });
  // Trades — for the activated gate + trade names.
  const { data: siteTrades } = useSiteTrades(primarySiteId);

  const deactivatedTradeIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of siteTrades ?? []) {
      if (t.category.name !== "Civil" && t.category.hasWorkspace === false) {
        s.add(t.category.id);
      }
    }
    return s;
  }, [siteTrades]);

  const tradeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of siteTrades ?? []) m.set(t.category.id, t.category.name);
    return m;
  }, [siteTrades]);

  // Build the flat row list: a mesthri row per active site + one row per
  // activated contract item. Skip sites with no activity at all.
  const rows = useMemo<AllocRow[]>(() => {
    const out: AllocRow[] = [];
    const dayUnitsBySite = new Map(
      (dayUnitsData ?? []).map((d) => [d.siteId, d])
    );
    for (const site of sites) {
      const du = dayUnitsBySite.get(site.id);
      const mesthriUnits = du?.totalUnits ?? 0;
      const items = (presenceBySite?.get(site.id) ?? []).filter(
        (i: ContractPresenceItem) =>
          i.tradeCategoryId === null || !deactivatedTradeIds.has(i.tradeCategoryId)
      );
      const hasActivity = mesthriUnits > 0 || items.length > 0;
      if (!hasActivity) continue;

      out.push({
        key: `mesthri:${site.id}`,
        siteId: site.id,
        siteName: site.name,
        label: "Regular crew (mesthri)",
        presenceKind: "mesthri",
        refId: null,
        tradeCategoryId: null,
        tradeName: null,
        manDays: mesthriUnits,
      });
      for (const it of items) {
        out.push({
          key: `${it.kind}:${it.id}`,
          siteId: site.id,
          siteName: site.name,
          label: it.title,
          presenceKind: it.kind,
          refId: it.id,
          tradeCategoryId: it.tradeCategoryId,
          tradeName: it.tradeCategoryId ? tradeNameById.get(it.tradeCategoryId) ?? null : null,
          manDays: it.units,
        });
      }
    }
    return out;
  }, [sites, dayUnitsData, presenceBySite, deactivatedTradeIds, tradeNameById]);

  // Engineer controls: include toggle + optional per-row amount override.
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});

  // Default every NEW row to included; drop state for rows that disappear.
  useEffect(() => {
    setIncluded((prev) => {
      const next: Record<string, boolean> = {};
      for (const r of rows) next[r.key] = prev[r.key] ?? true;
      return next;
    });
    setOverrides((prev) => {
      const next: Record<string, number | null> = {};
      for (const r of rows) next[r.key] = prev[r.key] ?? null;
      return next;
    });
  }, [rows]);

  // When EDITING, repopulate the engineer's saved include/exclude + overrides
  // once (otherwise a re-save would silently revert to all-included auto split).
  const { data: savedSelections } = useTeaEntryContractSelections(entryId);
  const appliedForEntry = React.useRef<string | null>(null);
  useEffect(() => {
    if (!entryId || !savedSelections || rows.length === 0) return;
    if (appliedForEntry.current === entryId) return;
    appliedForEntry.current = entryId;
    const inc: Record<string, boolean> = {};
    const ovr: Record<string, number | null> = {};
    for (const sel of savedSelections) {
      const key =
        sel.presence_kind === "mesthri"
          ? `mesthri:${sel.site_id}`
          : `${sel.presence_kind}:${sel.ref_id}`;
      inc[key] = sel.is_included;
      ovr[key] = sel.is_amount_override ? sel.allocated_amount : null;
    }
    setIncluded((prev) => ({ ...prev, ...inc }));
    setOverrides((prev) => ({ ...prev, ...ovr }));
  }, [entryId, savedSelections, rows]);

  // Compute the split.
  const split = useMemo(() => {
    const splitRows: TeaSplitRow[] = rows.map((r) => ({
      key: r.key,
      siteId: r.siteId,
      manDays: r.manDays,
      included: included[r.key] ?? true,
      overrideAmount: overrides[r.key] ?? null,
    }));
    return computeContractTeaSplit(totalCost, splitRows);
  }, [rows, included, overrides, totalCost]);

  const amountByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of split.rows) m.set(r.key, r.amount);
    return m;
  }, [split]);

  // Emit the model upward.
  useEffect(() => {
    if (rows.length === 0) {
      onModelChange(null);
      return;
    }
    // Per-site allocation = Σ included row amounts; included man-days for the site.
    const bySiteUnits = new Map<string, number>();
    const bySiteWorkers = new Map<string, number>();
    for (const r of rows) {
      if (!(included[r.key] ?? true)) continue;
      bySiteUnits.set(r.siteId, (bySiteUnits.get(r.siteId) ?? 0) + r.manDays);
      bySiteWorkers.set(r.siteId, (bySiteWorkers.get(r.siteId) ?? 0) + r.manDays);
    }
    const allocations: SiteAllocationInput[] = [];
    for (const site of sites) {
      const amount = split.bySite[site.id] ?? 0;
      const units = bySiteUnits.get(site.id) ?? 0;
      // Only emit allocations for sites that participate (amount or units > 0).
      if (amount <= 0 && units <= 0) continue;
      allocations.push({
        site_id: site.id,
        day_units_sum: Math.round(units * 100) / 100,
        worker_count: Math.round(bySiteWorkers.get(site.id) ?? 0),
        allocation_percentage:
          split.total > 0 ? Math.round((amount / split.total) * 100) : 0,
        allocated_amount: amount,
      });
    }
    const selections: ContractSelectionInput[] = rows.map((r) => ({
      site_id: r.siteId,
      presence_kind: r.presenceKind,
      ref_id: r.refId,
      trade_category_id: r.tradeCategoryId,
      man_days: Math.round(r.manDays * 100) / 100,
      allocated_amount: amountByKey.get(r.key) ?? 0,
      is_included: included[r.key] ?? true,
      is_amount_override: (overrides[r.key] ?? null) != null,
    }));
    const totalDayUnits = rows
      .filter((r) => included[r.key] ?? true)
      .reduce((s, r) => s + r.manDays, 0);

    onModelChange({
      total: split.total,
      totalDayUnits: Math.round(totalDayUnits * 100) / 100,
      allocations,
      selections,
    });
    // onModelChange is provided fresh each render by the parent; depend on data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, included, overrides, split, amountByKey, sites]);

  const loading = loadingDayUnits || loadingPresence;

  // Group rows by site for rendering.
  const rowsBySite = useMemo(() => {
    const m = new Map<string, AllocRow[]>();
    for (const r of rows) {
      const arr = m.get(r.siteId) ?? [];
      arr.push(r);
      m.set(r.siteId, arr);
    }
    return m;
  }, [rows]);

  const handleOverride = (key: string, raw: string) => {
    const v = raw.trim();
    setOverrides((p) => ({ ...p, [key]: v === "" ? null : Math.max(0, Number(v) || 0) }));
  };

  return (
    <Box>
      {showTotalField && (
        <TextField
          label="Total tea / snacks cost"
          type="number"
          value={totalCost || ""}
          onChange={(e) => onTotalCostChange(Math.max(0, Number(e.target.value) || 0))}
          fullWidth
          size="small"
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
          sx={{ mb: 2 }}
        />
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={26} />
        </Box>
      ) : rows.length === 0 ? (
        <Alert severity="warning" sx={{ py: 0.5 }}>
          No crew was recorded on {date} for any site in this group, so there is
          nothing to split. Check the date or log attendance/contract work first.
        </Alert>
      ) : (
        Array.from(rowsBySite.entries()).map(([siteId, siteRows]) => {
          const siteName = siteRows[0]?.siteName ?? siteId;
          const siteTotal = split.bySite[siteId] ?? 0;
          return (
            <Paper key={siteId} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <GroupsIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle2" fontWeight={700}>
                    {siteName}
                  </Typography>
                </Box>
                <Chip
                  label={`₹${siteTotal.toLocaleString("en-IN")}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
              <Divider sx={{ mb: 1 }} />
              {siteRows.map((r) => {
                const isIncluded = included[r.key] ?? true;
                const amount = amountByKey.get(r.key) ?? 0;
                const isOverride = (overrides[r.key] ?? null) != null;
                return (
                  <Box
                    key={r.key}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      py: 0.5,
                      opacity: isIncluded ? 1 : 0.5,
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={isIncluded}
                      onChange={(e) =>
                        setIncluded((p) => ({ ...p, [r.key]: e.target.checked }))
                      }
                      sx={{ p: 0.5 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                        {r.presenceKind === "mesthri" ? (
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {r.label}
                          </Typography>
                        ) : (
                          <Tooltip title={r.label}>
                            <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 180 }}>
                              {r.label}
                            </Typography>
                          </Tooltip>
                        )}
                        {r.presenceKind !== "mesthri" && (
                          <EngineeringIcon sx={{ fontSize: 14, color: "info.main" }} />
                        )}
                        {r.tradeName && (
                          <Chip label={r.tradeName} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.6rem" }} />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {r.manDays % 1 === 0 ? r.manDays : r.manDays.toFixed(1)} man-day
                        {r.manDays === 1 ? "" : "s"}
                      </Typography>
                    </Box>
                    <TextField
                      type="number"
                      size="small"
                      disabled={!isIncluded}
                      value={isIncluded ? (isOverride ? overrides[r.key] ?? "" : round(amount)) : 0}
                      onChange={(e) => handleOverride(r.key, e.target.value)}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                      }}
                      sx={{
                        width: 110,
                        "& input": { textAlign: "right", fontWeight: isOverride ? 700 : 400 },
                      }}
                    />
                  </Box>
                );
              })}
            </Paper>
          );
        })
      )}

      {rows.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Each crew&apos;s share is split by man-days and added to its own site. Untick a
          crew to leave it out, or type an amount to fix it (the rest re-split).
        </Typography>
      )}
    </Box>
  );
}
