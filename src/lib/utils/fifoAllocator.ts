import type { ExtendedStockInventory } from "@/hooks/queries/useStockInventory";
import type { GroupStockBatch } from "@/types/material.types";

/**
 * Represents a single batch allocation from FIFO distribution.
 */
export interface BatchAllocation {
  /** The stock_inventory row to deduct from */
  inventory_id: string;
  /** Material ID */
  material_id: string;
  /** Brand ID (null if unbranded) */
  brand_id: string | null;
  /** The batch code (null for own stock) */
  batch_code: string | null;
  /** Whether this is shared/group stock */
  is_shared: boolean;
  /** Quantity to deduct from this batch */
  quantity: number;
  /** Unit cost for this batch */
  unit_cost: number;
  /** Total cost for this allocation */
  total_cost: number;
  /** The site that paid for this stock (for shared stock settlement) */
  paid_by_site_id: string | null;
  /** Pricing mode */
  pricing_mode: "per_piece" | "per_kg";
  /** Total weight in this batch before deduction (for per_kg weight tracking) */
  total_weight: number | null;
  /** Current qty in this batch before deduction (for weight-per-piece calc) */
  current_qty: number;
}

/**
 * Represents a consolidated material grouping multiple batches.
 */
export interface ConsolidatedStockItem {
  /** Composite key: material_id (or material_id__brand_id when grouped by brand) */
  key: string;
  material_id: string;
  material_name: string;
  material_code: string | null;
  /** Unique brand names across all batches (for display) */
  brand_names: string[];
  /** Unit from material */
  unit: string;
  /** Category from material */
  category_id: string | null;
  category_name: string | null;
  /** Total current quantity across all batches */
  total_qty: number;
  /** Total available quantity across all batches */
  total_available_qty: number;
  /** Number of underlying stock_inventory rows */
  batch_count: number;
  /** Weighted average cost (by quantity) */
  weighted_avg_cost: number;
  /** Total stock value */
  total_value: number;
  /** Total originally purchased quantity across all batches (from batch_original_qty) */
  total_purchased: number;
  /** Whether any batch is shared */
  has_shared_batches: boolean;
  /** Whether any batch is own stock */
  has_own_batches: boolean;
  /** Pricing mode across batches */
  pricing_mode: "per_piece" | "per_kg" | "mixed";
  /** Total weight (for per-kg items) */
  total_weight: number | null;
  /** Underlying batches sorted by date (oldest first) */
  batches: ExtendedStockInventory[];
}

/**
 * Compute effective cost-per-piece for a stock inventory row.
 * For per_kg items, converts weight-based cost to per-piece cost.
 */
function getEffectiveCostPerPiece(stock: ExtendedStockInventory): number {
  const baseCost =
    stock.is_shared && stock.batch_unit_cost
      ? stock.batch_unit_cost
      : stock.avg_unit_cost;

  if (!baseCost) return 0;

  if (
    stock.pricing_mode === "per_kg" &&
    stock.total_weight &&
    stock.current_qty > 0
  ) {
    const weightPerPiece = stock.total_weight / stock.current_qty;
    return weightPerPiece * baseCost;
  }

  return baseCost;
}

/**
 * Allocates a requested quantity across multiple stock batches using FIFO.
 *
 * Order of consumption (3-tier priority):
 * 1. Own stock batches (no batch_code) — no settlement implications
 * 2. Self-paid group stock (batch_code, paying_site = current site) — self_use settlement
 * 3. Other-site group stock (batch_code, paying_site ≠ current site) — pending settlement
 *
 * Within each tier, sorted by last_received_date ascending (oldest first).
 *
 * @param batches - Stock inventory rows for the same material+brand
 * @param requestedQty - Total quantity to allocate
 * @param siteId - Current site ID for self-paid priority (optional for backward compat)
 * @returns Array of BatchAllocation objects, one per consumed batch
 * @throws Error if insufficient total stock
 */
export function allocateFIFO(
  batches: ExtendedStockInventory[],
  requestedQty: number,
  siteId?: string
): BatchAllocation[] {
  if (requestedQty <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  const totalAvailable = batches.reduce(
    (sum, b) => sum + (b.available_qty ?? b.current_qty),
    0
  );

  if (requestedQty > totalAvailable) {
    throw new Error(
      `Insufficient stock. Available: ${totalAvailable}, Requested: ${requestedQty}`
    );
  }

  // Sort: own stock first, then self-paid group stock, then other-site group stock
  // Within each tier, sorted by date ascending (oldest first = FIFO)
  const sorted = [...batches]
    .filter((b) => (b.available_qty ?? b.current_qty) > 0)
    .sort((a, b) => {
      // Tier 1: Own stock (no batch_code) before shared/group stock
      const aShared = a.is_shared ? 1 : 0;
      const bShared = b.is_shared ? 1 : 0;
      if (aShared !== bShared) return aShared - bShared;

      // Tier 2: Within shared stock, self-paid batches before other-site batches
      if (siteId && aShared === 1) {
        const aSelfPaid = a.paid_by_site_id === siteId ? 0 : 1;
        const bSelfPaid = b.paid_by_site_id === siteId ? 0 : 1;
        if (aSelfPaid !== bSelfPaid) return aSelfPaid - bSelfPaid;
      }

      // Tier 3: Within same tier, oldest date first (FIFO)
      const aDate = a.last_received_date || a.created_at || "";
      const bDate = b.last_received_date || b.created_at || "";
      return aDate.localeCompare(bDate);
    });

  const allocations: BatchAllocation[] = [];
  let remaining = requestedQty;

  for (const batch of sorted) {
    if (remaining <= 0) break;

    const available = batch.available_qty ?? batch.current_qty;
    if (available <= 0) continue;

    const qty = Math.min(remaining, available);
    const effectiveUnitCost = getEffectiveCostPerPiece(batch);

    allocations.push({
      inventory_id: batch.id,
      material_id: batch.material_id,
      brand_id: batch.brand_id ?? null,
      batch_code: batch.batch_code ?? null,
      is_shared: batch.is_shared,
      quantity: qty,
      unit_cost: effectiveUnitCost,
      total_cost: Math.round(effectiveUnitCost * qty * 100) / 100,
      paid_by_site_id: batch.paid_by_site_id ?? null,
      pricing_mode: (batch.pricing_mode as "per_piece" | "per_kg") || "per_piece",
      total_weight: batch.total_weight ?? null,
      current_qty: batch.current_qty,
    });

    remaining -= qty;
  }

  return allocations;
}

/**
 * Consolidate stock inventory items by material+brand.
 * Groups multiple batch rows into single consolidated items.
 */
export function consolidateStock(
  stock: ExtendedStockInventory[],
  groupByBrand: boolean = false
): ConsolidatedStockItem[] {
  const map = new Map<string, ConsolidatedStockItem>();

  for (const item of stock) {
    // Group by material_id only, or material_id + brand_id when splitting by brand
    const key = groupByBrand
      ? `${item.material_id}__${item.brand_id || "no-brand"}`
      : item.material_id;

    if (!map.has(key)) {
      map.set(key, {
        key,
        material_id: item.material_id,
        material_name: item.material?.name || "Unknown",
        material_code: item.material?.code || null,
        brand_names: [],
        unit: (item.material?.unit as string) || "piece",
        category_id: item.material?.category_id ?? null,
        category_name: (item.material as any)?.category?.name ?? null,
        total_qty: 0,
        total_available_qty: 0,
        batch_count: 0,
        weighted_avg_cost: 0,
        total_value: 0,
        total_purchased: 0,
        has_shared_batches: false,
        has_own_batches: false,
        pricing_mode:
          (item.pricing_mode as "per_piece" | "per_kg") || "per_piece",
        total_weight: null,
        batches: [],
      });
    }

    const consolidated = map.get(key)!;

    // Collect unique brand names
    const brandName = item.brand?.brand_name;
    if (brandName && !consolidated.brand_names.includes(brandName)) {
      consolidated.brand_names.push(brandName);
    }
    consolidated.total_qty += item.current_qty;
    consolidated.total_available_qty += item.available_qty ?? item.current_qty;
    consolidated.batch_count += 1;
    consolidated.batches.push(item);
    consolidated.total_purchased += item.batch_original_qty ?? 0;

    if (item.is_shared) consolidated.has_shared_batches = true;
    else consolidated.has_own_batches = true;

    // Accumulate value for weighted average
    const effectiveCost = getEffectiveCostPerPiece(item);
    consolidated.total_value += effectiveCost * item.current_qty;

    // Accumulate weight
    if (item.total_weight) {
      consolidated.total_weight =
        (consolidated.total_weight || 0) + item.total_weight;
    }

    // Detect mixed pricing
    if (consolidated.batch_count > 1) {
      const firstMode =
        (consolidated.batches[0].pricing_mode as string) || "per_piece";
      const thisMode = (item.pricing_mode as string) || "per_piece";
      if (thisMode !== firstMode) {
        consolidated.pricing_mode = "mixed";
      }
    }
  }

  // Finalize weighted averages and sort batches
  for (const item of map.values()) {
    item.weighted_avg_cost =
      item.total_qty > 0
        ? Math.round((item.total_value / item.total_qty) * 100) / 100
        : 0;

    // Sort batches by date (oldest first) for FIFO display
    item.batches.sort((a, b) => {
      const aDate = a.last_received_date || a.created_at || "";
      const bDate = b.last_received_date || b.created_at || "";
      return aDate.localeCompare(bDate);
    });
  }

  return Array.from(map.values());
}

// ============================================
// GROUP STOCK BATCH FIFO ALLOCATION
// ============================================

/**
 * Represents a single FIFO allocation from a group stock batch.
 */
export interface GroupStockBatchAllocation {
  batch_ref_code: string;
  material_name: string;
  brand_name: string | null;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  remaining_after: number;
  will_complete: boolean;
  purchase_date: string;
  paying_site_name: string | null;
  paying_site_id: string | null;
}

/**
 * Represents a consolidated material from group stock batches.
 */
export interface ConsolidatedGroupStockMaterial {
  material_id: string;
  material_name: string;
  material_code: string | null;
  brand_names: string[];
  unit: string;
  total_remaining: number;
  batch_count: number;
  weighted_avg_cost: number;
  total_value: number;
}

/**
 * Consolidates group stock batches by material for the usage dialog.
 * Groups multiple batches of the same material into a single summary.
 */
export function consolidateGroupStockByMaterial(
  batches: GroupStockBatch[]
): ConsolidatedGroupStockMaterial[] {
  const map = new Map<string, ConsolidatedGroupStockMaterial>();

  for (const batch of batches) {
    const remainingQty = batch.remaining_quantity ?? 0;
    if (remainingQty <= 0) continue;

    for (const item of batch.items) {
      const key = item.material_id;
      // Proportional remaining for this item
      const totalBatchQty = batch.original_quantity ?? 0;
      const itemProportion = totalBatchQty > 0 ? item.quantity / totalBatchQty : 0;
      const itemRemaining = remainingQty * itemProportion;

      if (itemRemaining <= 0) continue;

      // Handle both flat (GroupStockBatch type) and nested (raw Supabase) formats
      const materialName = item.material_name || (item as any).material?.name || "Unknown";
      const materialCode = item.material_code ?? (item as any).material?.code ?? null;
      const brandName = item.brand_name || (item as any).brand?.brand_name || null;
      const unit = item.unit || (item as any).material?.unit || "piece";

      if (!map.has(key)) {
        map.set(key, {
          material_id: item.material_id,
          material_name: materialName,
          material_code: materialCode,
          brand_names: [],
          unit,
          total_remaining: 0,
          batch_count: 0,
          weighted_avg_cost: 0,
          total_value: 0,
        });
      }

      const consolidated = map.get(key)!;
      if (brandName && !consolidated.brand_names.includes(brandName)) {
        consolidated.brand_names.push(brandName);
      }
      consolidated.total_remaining += itemRemaining;
      consolidated.batch_count += 1;
      consolidated.total_value += item.unit_price * itemRemaining;
    }
  }

  // Finalize weighted averages
  for (const item of map.values()) {
    item.weighted_avg_cost =
      item.total_remaining > 0
        ? Math.round((item.total_value / item.total_remaining) * 100) / 100
        : 0;
  }

  return Array.from(map.values());
}

/**
 * Allocates a requested quantity across group stock batches using FIFO.
 * Batches are sorted by purchase_date ascending (oldest first).
 *
 * Uses batch-level remaining_quantity (not per-item) since each batch
 * can contain only one material type for group stock.
 */
export function allocateGroupStockFIFO(
  batches: GroupStockBatch[],
  materialId: string,
  requestedQty: number
): GroupStockBatchAllocation[] {
  if (requestedQty <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  // Filter to batches containing this material with remaining quantity
  const eligible = batches.filter((b) => {
    if ((b.remaining_quantity ?? 0) <= 0) return false;
    if (b.status === "completed" || b.status === "converted") return false;
    return b.items.some((item) => item.material_id === materialId);
  });

  // Sort by purchase_date ascending (oldest first)
  const sorted = [...eligible].sort((a, b) =>
    (a.purchase_date || "").localeCompare(b.purchase_date || "")
  );

  const totalAvailable = sorted.reduce(
    (sum, b) => sum + (b.remaining_quantity ?? 0),
    0
  );

  if (requestedQty > totalAvailable) {
    throw new Error(
      `Insufficient stock. Available: ${totalAvailable}, Requested: ${requestedQty}`
    );
  }

  const allocations: GroupStockBatchAllocation[] = [];
  let remaining = requestedQty;

  for (const batch of sorted) {
    if (remaining <= 0) break;

    const available = batch.remaining_quantity ?? 0;
    if (available <= 0) continue;

    const qty = Math.min(remaining, available);
    const remainingAfter = available - qty;

    // Get unit cost from batch item (handle both flat and nested formats)
    const batchItem = batch.items.find((i) => i.material_id === materialId);
    const unitCost = batchItem?.unit_price ?? 0;
    const itemMaterialName = batchItem?.material_name || (batchItem as any)?.material?.name || "Unknown";
    const itemBrandName = batchItem?.brand_name || (batchItem as any)?.brand?.brand_name || null;
    const itemUnit = batchItem?.unit || (batchItem as any)?.material?.unit || "piece";

    allocations.push({
      batch_ref_code: batch.ref_code,
      material_name: itemMaterialName,
      brand_name: itemBrandName,
      unit: itemUnit,
      quantity: qty,
      unit_cost: unitCost,
      total_cost: Math.round(unitCost * qty * 100) / 100,
      remaining_after: remainingAfter,
      will_complete: remainingAfter <= 0,
      purchase_date: batch.purchase_date,
      paying_site_name: batch.payment_source_site_name ?? batch.paying_site?.name ?? null,
      paying_site_id: batch.payment_source_site_id ?? null,
    });

    remaining -= qty;
  }

  return allocations;
}
