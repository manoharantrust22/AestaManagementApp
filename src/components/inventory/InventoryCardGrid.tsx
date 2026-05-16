"use client";

import React, { useState } from "react";
import { Box, Typography, Chip } from "@mui/material";
import { MaterialStockCard } from "./MaterialStockCard";
import { BatchStockCard } from "./BatchStockCard";
import {
  CATEGORY_TAB_MAPPING,
  CATEGORY_TABS,
  CATEGORY_COLORS,
  type CategoryTabId,
} from "@/lib/constants/materialCategories";
import type { ConsolidatedStockItem } from "@/lib/utils/fifoAllocator";
import type { ExtendedStockInventory } from "@/hooks/queries/useStockInventory";

/** Filter items to only those matching a category tab (by material_code prefix) */
export function filterByCategory<T extends { material_code: string | null }>(
  items: T[],
  category: CategoryTabId,
): T[] {
  if (category === "all") return items;
  const codes = CATEGORY_TAB_MAPPING[category] ?? [];
  return items.filter(
    (item) => item.material_code && codes.some((c) => item.material_code!.startsWith(c)),
  );
}

/** Group items by category tab key. Items with no matching category go under 'general'. */
export function groupByCategory<T extends { material_code: string | null }>(
  items: T[],
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};

  for (const item of items) {
    let placed = false;
    for (const [tabId, codes] of Object.entries(CATEGORY_TAB_MAPPING)) {
      if (tabId === "all") continue;
      if (item.material_code && codes.some((c) => item.material_code!.startsWith(c))) {
        groups[tabId] = [...(groups[tabId] ?? []), item];
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.general = [...(groups.general ?? []), item];
    }
  }

  return groups;
}

/** Adapter so we can re-use category filters on a batch item (which has material_code under item.material.code) */
function batchToFilterable(batch: ExtendedStockInventory): ExtendedStockInventory & {
  material_code: string | null;
} {
  return Object.assign(batch, { material_code: batch.material?.code ?? null });
}

/** Group batches by material_id, ordered newest-first within each material group */
function groupBatchesByMaterial(
  batches: ExtendedStockInventory[],
): { materialId: string; materialName: string; items: ExtendedStockInventory[] }[] {
  const map = new Map<string, ExtendedStockInventory[]>();
  for (const b of batches) {
    const list = map.get(b.material_id) ?? [];
    list.push(b);
    map.set(b.material_id, list);
  }

  const groups = Array.from(map.entries()).map(([materialId, items]) => {
    items.sort((a, b) => {
      const aDate = a.last_received_date || a.created_at || "";
      const bDate = b.last_received_date || b.created_at || "";
      return bDate.localeCompare(aDate);
    });
    const first = items[0];
    const rawBrand = (first as any)?.brand as { brand_name?: string; variant_name?: string } | null | undefined;
    const parentMaterial = (first?.material as any)?.parent_material as { id: string; name: string } | null | undefined;
    const brandLabel = rawBrand?.brand_name
      ? rawBrand.variant_name
        ? `${rawBrand.brand_name} ${rawBrand.variant_name}`
        : rawBrand.brand_name
      : null;
    const variantLabel = brandLabel ?? first?.material?.name ?? "Unknown";
    return {
      materialId,
      materialName: parentMaterial?.name ? `${parentMaterial.name} · ${variantLabel}` : variantLabel,
      items,
    };
  });

  groups.sort((a, b) => a.materialName.localeCompare(b.materialName));
  return groups;
}

interface Props {
  items: ConsolidatedStockItem[];
  batchItems?: ExtendedStockInventory[];
  mode: "material" | "batch";
  lowStockIds: Set<string>;
  onRecordMaterialUsage: (item: ConsolidatedStockItem) => void;
  onRecordBatchUsage: (item: ExtendedStockInventory) => void;
}

export function InventoryCardGrid({
  items,
  batchItems = [],
  mode,
  lowStockIds,
  onRecordMaterialUsage,
  onRecordBatchUsage,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<CategoryTabId>("all");

  const isMaterial = mode === "material";
  const filteredMaterials = isMaterial ? filterByCategory(items, activeCategory) : [];
  const filteredBatches = !isMaterial
    ? filterByCategory(batchItems.map(batchToFilterable), activeCategory)
    : [];

  const chipTabs = CATEGORY_TABS.filter((tab) => {
    if (tab.id === "all") return true;
    if (isMaterial) {
      return filterByCategory(items, tab.id as CategoryTabId).length > 0;
    }
    return (
      filterByCategory(batchItems.map(batchToFilterable), tab.id as CategoryTabId).length > 0
    );
  });

  const materialGroups =
    isMaterial && activeCategory === "all" ? groupByCategory(filteredMaterials) : null;

  const categoryOrder = [
    ...CATEGORY_TABS.map((t) => t.id).filter((id) => id !== "all"),
    "general",
  ];

  const batchGroups = !isMaterial ? groupBatchesByMaterial(filteredBatches) : null;

  return (
    <Box>
      {/* Category chips */}
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "nowrap", overflowX: "auto", mb: 2, pb: 0.5 }}>
        {chipTabs.map((tab) => {
          const count = isMaterial
            ? filterByCategory(items, tab.id as CategoryTabId).length
            : filterByCategory(batchItems.map(batchToFilterable), tab.id as CategoryTabId).length;
          const isActive = activeCategory === tab.id;
          return (
            <Chip
              key={tab.id}
              label={`${tab.icon} ${tab.label} ${count}`}
              onClick={() => setActiveCategory(tab.id as CategoryTabId)}
              sx={{
                fontWeight: 600,
                fontSize: 11,
                bgcolor: isActive ? "#1565c0" : "#fff",
                color: isActive ? "#fff" : "#555",
                border: isActive ? "1.5px solid #1565c0" : "1.5px solid #e0e0e0",
                "&:hover": { bgcolor: isActive ? "#1565c0" : "#f5f5f5" },
              }}
            />
          );
        })}
      </Box>

      {/* Material mode rendering — grouped by category when "All" */}
      {isMaterial && materialGroups && (
        <>
          {categoryOrder
            .filter((key) => materialGroups[key]?.length)
            .map((key) => {
              const tabMeta = CATEGORY_TABS.find((t) => t.id === key);
              const clr = CATEGORY_COLORS[key] ?? CATEGORY_COLORS.general;
              const sectionItems = materialGroups[key];
              const lowCount = sectionItems.filter((i) => lowStockIds.has(i.material_id)).length;

              return (
                <Box key={key} mb={2.5}>
                  <SectionHeader
                    icon={tabMeta?.icon ?? "📦"}
                    label={tabMeta?.label ?? "General"}
                    itemCount={sectionItems.length}
                    lowCount={lowCount}
                    bg={clr.bg}
                    color={clr.color}
                  />
                  <MaterialCardRow
                    items={sectionItems}
                    lowStockIds={lowStockIds}
                    onRecord={onRecordMaterialUsage}
                  />
                </Box>
              );
            })}
        </>
      )}

      {isMaterial && !materialGroups && (
        <MaterialCardRow
          items={filteredMaterials}
          lowStockIds={lowStockIds}
          onRecord={onRecordMaterialUsage}
        />
      )}

      {/* Batch mode rendering — always grouped by material */}
      {!isMaterial && batchGroups && (
        <>
          {batchGroups.map((g) => (
            <Box key={g.materialId} mb={2.5}>
              <SectionHeader
                icon="🏷"
                label={g.materialName}
                itemCount={g.items.length}
                bg="#f5f5f5"
                color="#333"
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 1.25,
                }}
              >
                {g.items.map((batch) => (
                  <BatchStockCard key={batch.id} item={batch} onRecordUsage={onRecordBatchUsage} />
                ))}
              </Box>
            </Box>
          ))}
        </>
      )}

      {/* Empty states */}
      {isMaterial && filteredMaterials.length === 0 && (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">No materials in this category</Typography>
        </Box>
      )}
      {!isMaterial && filteredBatches.length === 0 && (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">No batches in this category</Typography>
        </Box>
      )}
    </Box>
  );
}

function SectionHeader({
  icon,
  label,
  itemCount,
  lowCount,
  bg,
  color,
}: {
  icon: string;
  label: string;
  itemCount: number;
  lowCount?: number;
  bg: string;
  color: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        bgcolor: bg,
        color,
        borderRadius: 2,
        px: 1.5,
        py: 0.75,
        mb: 1.25,
      }}
    >
      <Typography sx={{ fontSize: 16 }}>{icon}</Typography>
      <Typography variant="body2" fontWeight={800}>
        {label}
      </Typography>
      <Typography variant="caption" fontWeight={600} sx={{ opacity: 0.65 }}>
        · {itemCount} items
      </Typography>
      {lowCount !== undefined && lowCount > 0 && (
        <Chip
          label={`⚠️ ${lowCount} low`}
          size="small"
          sx={{ ml: "auto", height: 20, fontSize: 10, fontWeight: 700, bgcolor: "#ffebee", color: "#c62828" }}
        />
      )}
    </Box>
  );
}

function MaterialCardRow({
  items,
  lowStockIds,
  onRecord,
}: {
  items: ConsolidatedStockItem[];
  lowStockIds: Set<string>;
  onRecord: (item: ConsolidatedStockItem) => void;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 1.25,
      }}
    >
      {items.map((item) => (
        <MaterialStockCard
          key={item.key}
          item={item}
          isLowStock={lowStockIds.has(item.material_id)}
          onRecordUsage={onRecord}
        />
      ))}
    </Box>
  );
}
