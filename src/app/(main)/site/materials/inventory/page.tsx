"use client";

/**
 * /site/materials/inventory — warehouse browse of all stocked batches.
 *
 * Default Cards view feels like walking the shelves; Table view (TODO) is for
 * filter/sort-heavy ops. KPI strip on top. Tabs (All / Own / Group) + search.
 *
 * Mirrors `ProtoInventory` in docs/MaterialHub_Redesign/proto-inventory.jsx.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { useSelectedSite } from "@/contexts/SiteContext";
import PageHeader from "@/components/layout/PageHeader";
import {
  useSiteStock,
  useSiteStockAll,
  useGroupStockInventory,
  type ExtendedStockInventory,
  type GroupStockItem,
} from "@/hooks/queries/useStockInventory";
import InventoryKpiStrip from "@/components/inventory/InventoryKpiStrip";
import InventoryCard, {
  type InventoryItemView,
} from "@/components/inventory/InventoryCard";
import { hubTokens } from "@/lib/material-hub/tokens";
import {
  usePurchasedBatches,
  type PurchasedBatchView,
} from "@/hooks/queries/usePurchasedBatches";
import WaterfallUsageDialog from "@/components/materials/WaterfallUsageDialog";
import UsageEntryDrawer from "@/components/inventory/UsageEntryDrawer";
import UsageHistoryDialog, {
  type UsageHistoryItem,
} from "@/components/inventory/UsageHistoryDialog";

type Tab = "all" | "own" | "group";
type ViewMode = "batch" | "material";

function mapBatchView(b: PurchasedBatchView): InventoryItemView {
  const received = b.received_qty;
  // For per-batch cards, "remaining" is best-effort: exact for group POs,
  // shared-pool for own POs. When we have no match at all (legacy data),
  // show 0 remaining with a hint.
  const remaining = b.remaining_qty != null ? b.remaining_qty : 0;
  const used = Math.max(received - remaining, 0);
  return {
    id: b.id,
    kind: b.kind,
    material_id: b.material_id,
    brand_id: b.brand_id,
    material_name: b.material_name,
    material_spec: null,
    material_unit: b.material_unit,
    material_category: null,
    material_image_url: b.material_image_url,
    batch_code: b.expense_ref,
    vendor_name: b.vendor_name,
    payer_site_name: b.payer_site_name,
    received_qty: received,
    remaining_qty: remaining,
    used_qty: used,
    total_value: b.total_value,
    brand_name: b.brand_name,
    brand_variant: b.brand_variant,
    brand_image_url: b.brand_image_url,
    remaining_is_pooled: b.remaining_is_pooled && b.remaining_qty != null,
    purchased_at: b.purchase_date,
  };
}

function mapOwnStock(row: ExtendedStockInventory): InventoryItemView {
  const received = Number((row as any).total_received_qty ?? row.current_qty ?? 0);
  const remaining = Number(row.current_qty ?? 0);
  const used = Math.max(received - remaining, 0);
  const derivedValue = (row.avg_unit_cost ?? 0) * (row.current_qty ?? 0);
  const totalValue = Number((row as any).total_value ?? derivedValue) || 0;
  return {
    id: row.id,
    kind: row.is_shared ? "group" : "own",
    material_id: (row as any).material?.id ?? row.material_id,
    brand_id: row.brand_id ?? null,
    material_name: (row as any).material?.name ?? "—",
    material_spec: null,
    material_unit: (row as any).material?.unit ?? "nos",
    material_category: (row as any).material?.category?.name ?? null,
    material_image_url: (row as any).material?.image_url ?? null,
    batch_code: row.batch_code ?? null,
    vendor_name: (row as any).vendor?.name ?? null,
    payer_site_name: row.paid_by_site_name ?? null,
    received_qty: received,
    remaining_qty: remaining,
    used_qty: used,
    total_value: totalValue,
  };
}

function mapGroupStock(row: GroupStockItem): InventoryItemView {
  const received = Number(row.current_qty ?? 0);
  const remaining = Number(row.available_qty ?? row.current_qty ?? 0);
  const used = Math.max(received - remaining, 0);
  return {
    id: row.id,
    kind: "group",
    material_id: row.material?.id ?? (row as any).material_id,
    brand_id: (row as any).brand_id ?? null,
    material_name: row.material?.name ?? "—",
    material_spec: null,
    material_unit: row.material?.unit ?? "nos",
    material_category: null,
    material_image_url: null,
    batch_code: row.batch_code ?? null,
    vendor_name: null,
    payer_site_name: row.dedicated_site?.name ?? null,
    received_qty: received,
    remaining_qty: remaining,
    used_qty: used,
    total_value: Number(row.total_value ?? 0),
  };
}

export default function InventoryPage() {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;
  const siteGroupId = selectedSite?.site_group_id ?? null;

  // Material Hub → Inventory deep links use two query params:
  //   ?focus=<term>          → human-readable handle (batch ref, expense
  //                             ref_code). Pre-populates the visible search
  //                             input so the user sees what we're filtering on.
  //   ?focusMaterialId=<uuid>→ silent filter by material_id. Used when there's
  //                             no good text handle (own-PO pooled threads).
  //                             Doesn't touch the visible search input — a UUID
  //                             in the search box would look like noise.
  // Both force the "All" tab so the matching card surfaces regardless of
  // own/group split.
  const searchParams = useSearchParams();
  const focusParam = searchParams?.get("focus") ?? "";
  const focusMaterialId = searchParams?.get("focusMaterialId") ?? "";
  const focusMaterialNameParam = searchParams?.get("focusMaterialName") ?? "";
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState(focusParam);
  useEffect(() => {
    if (focusParam) {
      setSearch(focusParam);
      setTab("all");
    }
  }, [focusParam]);
  useEffect(() => {
    if (focusMaterialId) {
      setTab("all");
    }
  }, [focusMaterialId]);
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  // Per-batch is the new default — surfaces every purchase as its own card so
  // engineers can find specific brand variants (TNPL Cement, ARM Cement) that
  // currently get merged into the site's shared bucket.
  const [viewMode, setViewMode] = useState<ViewMode>("batch");
  // Two usage dialogs depending on the card's source:
  //   - Group / batch-exact rows → WaterfallUsageDialog (material-scoped:
  //     distributes a total across the material's group batches oldest→newest,
  //     writes batch_usage_records, drives group settlement).
  //   - Own / pooled rows → UsageEntryDrawer (writes to daily_material_usage,
  //     trigger decrements stock_inventory.current_qty).
  const [usageBatchRefCode, setUsageBatchRefCode] = useState<string | undefined>(
    undefined
  );
  const [usageMaterialId, setUsageMaterialId] = useState<string | undefined>(undefined);
  const [usageBrandId, setUsageBrandId] = useState<string | null | undefined>(undefined);
  const [usageMaterialName, setUsageMaterialName] = useState<string | undefined>(undefined);
  const [usageMaterialUnit, setUsageMaterialUnit] = useState<string | undefined>(undefined);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [ownUsageStockRow, setOwnUsageStockRow] =
    useState<ExtendedStockInventory | null>(null);
  const [ownUsageOpen, setOwnUsageOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<UsageHistoryItem | null>(null);

  const { data: ownStock = [], isLoading: ownLoading } = useSiteStock(siteId, {
    siteGroupId: siteGroupId ?? undefined,
  });
  // Unfiltered stock view for usage-drawer preselection. useSiteStock filters
  // out current_qty<=0, so depleted pools (e.g., your TNPL bag that's already
  // been consumed) would otherwise drop out of the lookup and the drawer would
  // open empty. ownStockAll keeps every row, including 0/negative.
  const { data: ownStockAll = [] } = useSiteStockAll(siteId);
  const { data: groupStock = [], isLoading: groupLoading } = useGroupStockInventory(
    siteGroupId
  );
  const { data: purchasedBatches = [], isLoading: batchesLoading } =
    usePurchasedBatches(siteId, siteGroupId);

  const materialView = useMemo<InventoryItemView[]>(() => {
    const own = ownStock.map(mapOwnStock);
    const group = groupStock.map(mapGroupStock);
    // Dedupe by batch_code where the same batch shows up in both sources.
    const seen = new Set<string>();
    const merged: InventoryItemView[] = [];
    for (const it of [...own, ...group]) {
      const key = it.batch_code ?? it.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(it);
    }
    return merged;
  }, [ownStock, groupStock]);

  const batchView = useMemo<InventoryItemView[]>(
    () => purchasedBatches.map(mapBatchView),
    [purchasedBatches]
  );

  const items = viewMode === "batch" ? batchView : materialView;

  const filteredItems = useMemo(() => {
    let out = items;
    if (tab === "own") out = out.filter((i) => i.kind === "own");
    if (tab === "group") out = out.filter((i) => i.kind === "group");
    if (focusMaterialId) {
      out = out.filter((i) => i.material_id === focusMaterialId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (i) =>
          i.material_name.toLowerCase().includes(q) ||
          (i.batch_code ?? "").toLowerCase().includes(q) ||
          (i.vendor_name ?? "").toLowerCase().includes(q) ||
          (i.brand_name ?? "").toLowerCase().includes(q) ||
          (i.brand_variant ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [items, tab, search, focusMaterialId]);

  const counts = useMemo(
    () => ({
      all: items.length,
      own: items.filter((i) => i.kind === "own").length,
      group: items.filter((i) => i.kind === "group").length,
    }),
    [items]
  );

  // Resolve the human-readable name for the focused material so the chip can
  // say "Focused on: Chips Jalli" instead of leaking a UUID. The Hub passes the
  // name explicitly via `focusMaterialName` because the inventory list may not
  // contain a row for this material yet (delivery pending verification), in
  // which case looking it up against `items` would also come up empty.
  const focusedMaterialName = useMemo(() => {
    if (!focusMaterialId) return null;
    if (focusMaterialNameParam) return focusMaterialNameParam;
    return items.find((i) => i.material_id === focusMaterialId)?.material_name ?? null;
  }, [items, focusMaterialId, focusMaterialNameParam]);

  const clearMaterialFocus = () => {
    router.replace("/site/materials/inventory");
  };

  const kpis = useMemo(() => {
    let ownValue = 0;
    let groupValue = 0;
    let lowStock = 0;
    for (const i of items) {
      if (i.kind === "own") ownValue += i.total_value;
      else groupValue += i.total_value;
      if (
        i.received_qty > 0 &&
        i.remaining_qty > 0 &&
        i.remaining_qty < i.received_qty * 0.2
      )
        lowStock++;
    }
    return { ownValue, groupValue, lowStock, total: items.length };
  }, [items]);

  if (!selectedSite) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Select a site to view its inventory.</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        padding: { xs: "14px 14px 80px", md: "18px 22px 80px" },
        minHeight: 0,
      }}
    >
      <PageHeader
        title="Inventory"
        subtitle="Walk the shelves — what's physically here, what's shared with the cluster, and what's running low."
        showBack
        actions={
          <ToggleButtonGroup
            value={layout}
            exclusive
            onChange={(_, next) => next && setLayout(next as "cards" | "table")}
            size="small"
            sx={{
              display: { xs: "none", md: "inline-flex" },
              background: hubTokens.card,
              "& .MuiToggleButton-root": {
                border: `1px solid ${hubTokens.border}`,
                textTransform: "none",
                fontSize: 12,
                padding: "5px 12px",
                color: hubTokens.muted,
                "&.Mui-selected": {
                  background: hubTokens.primary,
                  color: "#fff",
                  "&:hover": { background: hubTokens.primaryHover },
                },
              },
            }}
          >
            <ToggleButton value="cards">
              <GridViewIcon sx={{ fontSize: 14, mr: 0.5 }} /> Cards
            </ToggleButton>
            <ToggleButton value="table">
              <ViewListIcon sx={{ fontSize: 14, mr: 0.5 }} /> Table
            </ToggleButton>
          </ToggleButtonGroup>
        }
      />

      <InventoryKpiStrip
        ownStockValue={kpis.ownValue}
        groupStockValue={kpis.groupValue}
        lowStockCount={kpis.lowStock}
        totalBatches={kpis.total}
      />

      {focusMaterialId && (
        <Box sx={{ marginTop: "14px" }}>
          <Chip
            icon={<FilterAltIcon sx={{ fontSize: 14 }} />}
            label={`Focused on: ${focusedMaterialName ?? "this material"}`}
            onDelete={clearMaterialFocus}
            sx={{
              background: hubTokens.primarySoft,
              color: hubTokens.primary,
              fontWeight: 600,
              "& .MuiChip-deleteIcon": { color: hubTokens.primary },
            }}
          />
        </Box>
      )}

      {/* Tabs + Search */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginTop: "20px",
          marginBottom: "14px",
        }}
      >
        <ToggleButtonGroup
          value={tab}
          exclusive
          onChange={(_, next) => next && setTab(next as Tab)}
          size="small"
        >
          <ToggleButton value="all" sx={{ textTransform: "none", fontSize: 12 }}>
            All <Box sx={{ ml: 0.75, color: hubTokens.subtle }}>{counts.all}</Box>
          </ToggleButton>
          <ToggleButton value="own" sx={{ textTransform: "none", fontSize: 12 }}>
            Own <Box sx={{ ml: 0.75, color: hubTokens.subtle }}>{counts.own}</Box>
          </ToggleButton>
          <ToggleButton value="group" sx={{ textTransform: "none", fontSize: 12 }}>
            Group <Box sx={{ ml: 0.75, color: hubTokens.subtle }}>{counts.group}</Box>
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, next) => next && setViewMode(next as ViewMode)}
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                textTransform: "none",
                fontSize: 12,
                padding: "5px 12px",
                color: hubTokens.muted,
                "&.Mui-selected": {
                  background: hubTokens.primarySoft,
                  color: hubTokens.primary,
                },
              },
            }}
          >
            <ToggleButton value="batch">Per batch</ToggleButton>
            <ToggleButton value="material">By material</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            placeholder="Search material / batch / vendor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 240 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16 }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Box>

      {ownLoading || groupLoading || batchesLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : filteredItems.length === 0 ? (
        <Box
          sx={{
            padding: "40px 20px",
            textAlign: "center",
            background: hubTokens.card,
            border: `1px dashed ${hubTokens.border}`,
            borderRadius: "12px",
          }}
        >
          <Typography sx={{ fontSize: 13, color: hubTokens.muted }}>
            {focusMaterialId
              ? `No stock yet for ${focusedMaterialName ?? "this material"} at this site.`
              : search
                ? `No matches for "${search}".`
                : "No batches in this view yet."}
          </Typography>
        </Box>
      ) : layout === "table" ? (
        <Box
          sx={{
            padding: "40px 20px",
            textAlign: "center",
            background: hubTokens.card,
            border: `1px dashed ${hubTokens.border}`,
            borderRadius: "12px",
          }}
        >
          <Typography sx={{ fontSize: 13, color: hubTokens.muted }}>
            Table view — coming soon. Use Cards for now.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(auto-fill, minmax(280px, 1fr))",
            },
            gap: "12px",
          }}
        >
          {filteredItems.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onLogUsage={(it) => {
                // Own / pooled rows: use UsageEntryDrawer which writes to
                // daily_material_usage. We need to find the matching
                // ExtendedStockInventory row by (material_id, brand_id).
                if (it.kind === "own" || it.remaining_is_pooled) {
                  // Lookup pool: ownStockAll (includes depleted rows). The
                  // drawer's stock list still uses ownStock (qty>0 only) so
                  // the engineer can't accidentally choose a wrong empty row.
                  // Order of preference: exact (material+brand) → material-only
                  // → first row for material in the live ownStock list.
                  const exact = ownStockAll.find(
                    (s: any) =>
                      s.material_id === it.material_id &&
                      (s.brand_id ?? null) === (it.brand_id ?? null)
                  );
                  const byMaterial =
                    exact ||
                    ownStockAll.find((s: any) => s.material_id === it.material_id);
                  const liveByMaterial =
                    byMaterial ||
                    ownStock.find((s) => s.material_id === it.material_id);
                  setOwnUsageStockRow(
                    (liveByMaterial as ExtendedStockInventory) ?? null
                  );
                  setOwnUsageOpen(true);
                  return;
                }
                // Group / batch-exact rows: the waterfall usage dialog.
                // Material-scoped — it gathers ALL group batches of this
                // material and distributes a total oldest→newest. The variant
                // (material_id, brand_id) scopes which size; batch_code just
                // highlights the originating batch.
                setUsageBatchRefCode(it.batch_code ?? undefined);
                setUsageMaterialId(it.material_id ?? undefined);
                setUsageBrandId(it.brand_id ?? null);
                setUsageMaterialName(it.material_name ?? undefined);
                setUsageMaterialUnit(it.material_unit ?? undefined);
                setUsageDialogOpen(true);
              }}
              onViewHistory={(it) => {
                setHistoryItem({
                  material_id: it.material_id,
                  brand_id: it.brand_id ?? null,
                  material_name: it.material_name,
                  material_unit: it.material_unit,
                  batch_code: it.batch_code,
                  kind: it.kind,
                });
              }}
            />
          ))}
        </Box>
      )}

      {siteId && (
        <>
          <WaterfallUsageDialog
            open={usageDialogOpen && !!usageMaterialId}
            onClose={() => {
              setUsageDialogOpen(false);
              setUsageMaterialId(undefined);
              setUsageBrandId(undefined);
              setUsageMaterialName(undefined);
              setUsageMaterialUnit(undefined);
            }}
            siteId={siteId}
            siteGroupId={siteGroupId}
            defaultScope="all"
            materialId={usageMaterialId ?? ""}
            brandId={usageBrandId}
            materialName={usageMaterialName}
            materialUnit={usageMaterialUnit}
            preselectedBatchRefCode={usageBatchRefCode}
          />
          <UsageEntryDrawer
            open={ownUsageOpen}
            onClose={() => {
              setOwnUsageOpen(false);
              setOwnUsageStockRow(null);
            }}
            siteId={siteId}
            stock={ownStock}
            preSelectedStock={ownUsageStockRow}
          />
          <UsageHistoryDialog
            open={!!historyItem}
            onClose={() => setHistoryItem(null)}
            siteId={siteId}
            item={historyItem}
          />
        </>
      )}
    </Box>
  );
}
