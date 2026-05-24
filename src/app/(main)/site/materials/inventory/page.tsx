"use client";

/**
 * /site/materials/inventory — warehouse browse of all stocked batches.
 *
 * Default Cards view feels like walking the shelves; Table view (TODO) is for
 * filter/sort-heavy ops. KPI strip on top. Tabs (All / Own / Group) + search.
 *
 * Mirrors `ProtoInventory` in docs/MaterialHub_Redesign/proto-inventory.jsx.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
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
import { useSelectedSite } from "@/contexts/SiteContext";
import PageHeader from "@/components/layout/PageHeader";
import {
  useSiteStock,
  useGroupStockInventory,
  type ExtendedStockInventory,
  type GroupStockItem,
} from "@/hooks/queries/useStockInventory";
import InventoryKpiStrip from "@/components/inventory/InventoryKpiStrip";
import InventoryCard, {
  type InventoryItemView,
} from "@/components/inventory/InventoryCard";
import { hubTokens } from "@/lib/material-hub/tokens";

type Tab = "all" | "own" | "group";

function mapOwnStock(row: ExtendedStockInventory): InventoryItemView {
  const received = Number((row as any).total_received_qty ?? row.current_qty ?? 0);
  const remaining = Number(row.current_qty ?? 0);
  const used = Math.max(received - remaining, 0);
  const derivedValue = (row.avg_unit_cost ?? 0) * (row.current_qty ?? 0);
  const totalValue = Number((row as any).total_value ?? derivedValue) || 0;
  return {
    id: row.id,
    kind: row.is_shared ? "group" : "own",
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

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"cards" | "table">("cards");

  const { data: ownStock = [], isLoading: ownLoading } = useSiteStock(siteId, {
    siteGroupId: siteGroupId ?? undefined,
  });
  const { data: groupStock = [], isLoading: groupLoading } = useGroupStockInventory(
    siteGroupId
  );

  const items = useMemo<InventoryItemView[]>(() => {
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

  const filteredItems = useMemo(() => {
    let out = items;
    if (tab === "own") out = out.filter((i) => i.kind === "own");
    if (tab === "group") out = out.filter((i) => i.kind === "group");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (i) =>
          i.material_name.toLowerCase().includes(q) ||
          (i.batch_code ?? "").toLowerCase().includes(q) ||
          (i.vendor_name ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [items, tab, search]);

  const counts = useMemo(
    () => ({
      all: items.length,
      own: items.filter((i) => i.kind === "own").length,
      group: items.filter((i) => i.kind === "group").length,
    }),
    [items]
  );

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

      {ownLoading || groupLoading ? (
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
            {search ? `No matches for "${search}".` : "No batches in this view yet."}
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
            <InventoryCard key={item.id} item={item} />
          ))}
        </Box>
      )}
    </Box>
  );
}
