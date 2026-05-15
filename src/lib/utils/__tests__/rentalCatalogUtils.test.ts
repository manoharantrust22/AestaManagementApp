import { describe, it, expect } from "vitest";
import {
  getRateForSize,
  computeVendorEstimates,
  cheapestVendorId,
} from "../rentalCatalogUtils";
import type { RentalStoreInventoryWithDetails } from "@/types/rental.types";

const makeInventory = (
  vendorId: string,
  vendorName: string,
  dailyRate: number,
  sizeRates: Record<string, number> | null = null
): RentalStoreInventoryWithDetails =>
  ({
    id: `inv-${vendorId}`,
    vendor_id: vendorId,
    rental_item_id: "item-1",
    daily_rate: dailyRate,
    size_rates: sizeRates,
    vendor: { id: vendorId, name: vendorName },
    rental_item: { id: "item-1", name: "Side Sheet" },
  } as any);

describe("getRateForSize", () => {
  it("returns size-specific rate when size_rates has the label", () => {
    const inv = makeInventory("v1", "Vendor A", 10, { "6×1½": 8, "4×1½": 7 });
    expect(getRateForSize(inv, "6×1½")).toBe(8);
  });

  it("falls back to daily_rate when size not in size_rates", () => {
    const inv = makeInventory("v1", "Vendor A", 10, { "6×1½": 8 });
    expect(getRateForSize(inv, "5×1½")).toBe(10);
  });

  it("returns daily_rate when size_rates is null", () => {
    const inv = makeInventory("v1", "Vendor A", 10, null);
    expect(getRateForSize(inv, "6×1½")).toBe(10);
  });

  it("returns daily_rate when sizeLabel is null", () => {
    const inv = makeInventory("v1", "Vendor A", 10, { "6×1½": 8 });
    expect(getRateForSize(inv, null)).toBe(10);
  });
});

describe("computeVendorEstimates", () => {
  const vendorA = makeInventory("v1", "Vendor A", 10, { "6×1½": 8, "4×1½": 7 });
  const vendorB = makeInventory("v2", "Vendor B", 12, { "6×1½": 11 });

  const basketItems = [
    { id: "b1", rental_item_id: "item-1", rental_item_name: "Side Sheet", size_label: "6×1½", rental_item_size_id: null, quantity: 50, days: 25 },
    { id: "b2", rental_item_id: "item-1", rental_item_name: "Side Sheet", size_label: "4×1½", rental_item_size_id: null, quantity: 20, days: 25 },
  ];

  const inventoryByItemId = {
    "item-1": [vendorA, vendorB],
  };

  it("computes total cost per vendor correctly", () => {
    const estimates = computeVendorEstimates(basketItems, inventoryByItemId);
    const a = estimates.find((e) => e.vendor_id === "v1")!;
    const b = estimates.find((e) => e.vendor_id === "v2")!;
    // Vendor A: (50 × 8 × 25) + (20 × 7 × 25) = 10,000 + 3,500 = 13,500
    expect(a.total_rental_cost).toBe(13500);
    // Vendor B: (50 × 11 × 25) + (20 × 12 × 25) = 13,750 + 6,000 = 19,750
    expect(b.total_rental_cost).toBe(19750);
  });

  it("marks the cheapest vendor", () => {
    const estimates = computeVendorEstimates(basketItems, inventoryByItemId);
    const a = estimates.find((e) => e.vendor_id === "v1")!;
    const b = estimates.find((e) => e.vendor_id === "v2")!;
    expect(a.is_cheapest).toBe(true);
    expect(b.is_cheapest).toBe(false);
  });

  it("returns empty array for empty basket", () => {
    expect(computeVendorEstimates([], inventoryByItemId)).toEqual([]);
  });
});

describe("cheapestVendorId", () => {
  it("returns vendor_id of the cheapest estimate", () => {
    const estimates = [
      { vendor_id: "v1", total_rental_cost: 13500, is_cheapest: true } as any,
      { vendor_id: "v2", total_rental_cost: 19750, is_cheapest: false } as any,
    ];
    expect(cheapestVendorId(estimates)).toBe("v1");
  });

  it("returns null for empty array", () => {
    expect(cheapestVendorId([])).toBeNull();
  });
});

import { resolveVariantRate } from "../rentalCatalogUtils";
import type {
  RentalItem,
  RentalItemSize,
} from "@/types/rental.types";

const makeItem = (overrides: Partial<RentalItem> = {}): RentalItem => ({
  id: "item-1",
  name: "Roof Sheet",
  code: null,
  local_name: null,
  category_id: null,
  description: null,
  rental_type: "scaffolding",
  source_type: "store",
  rate_type: "daily",
  unit: "piece",
  specifications: null,
  default_daily_rate: 5,
  image_url: null,
  is_active: true,
  created_at: "",
  updated_at: "",
  created_by: null,
  ...overrides,
});

const makeVariant = (overrides: Partial<RentalItemSize> = {}): RentalItemSize => ({
  id: "size-1",
  rental_item_id: "item-1",
  size_label: "3×2",
  display_order: 0,
  is_active: true,
  created_at: "",
  daily_rate: 2,
  default_hourly_rate: null,
  image_url: null,
  ...overrides,
});

describe("resolveVariantRate", () => {
  it("uses vendor size_rates override when present", () => {
    const item = makeItem();
    const variant = makeVariant({ size_label: "3×2", daily_rate: 2 });
    const vendorInv = {
      id: "inv-1",
      vendor_id: "v1",
      rental_item_id: "item-1",
      daily_rate: 10,
      size_rates: { "3×2": 4 },
    } as unknown as RentalStoreInventoryWithDetails;
    expect(resolveVariantRate(item, variant, vendorInv)).toBe(4);
  });

  it("falls back to variant.daily_rate when vendor has no size override", () => {
    const item = makeItem();
    const variant = makeVariant({ daily_rate: 2 });
    const vendorInv = {
      id: "inv-1",
      vendor_id: "v1",
      rental_item_id: "item-1",
      daily_rate: 10,
      size_rates: { "different-size": 4 },
    } as unknown as RentalStoreInventoryWithDetails;
    expect(resolveVariantRate(item, variant, vendorInv)).toBe(2);
  });

  it("falls back to parent default_daily_rate when variant has no rate", () => {
    const item = makeItem({ default_daily_rate: 5 });
    const variant = makeVariant({ daily_rate: null });
    expect(resolveVariantRate(item, variant, null)).toBe(5);
  });

  it("uses parent default when no variant is picked", () => {
    const item = makeItem({ default_daily_rate: 7 });
    expect(resolveVariantRate(item, null, null)).toBe(7);
  });

  it("returns 0 when nothing is set anywhere", () => {
    const item = makeItem({ default_daily_rate: null });
    const variant = makeVariant({ daily_rate: null });
    expect(resolveVariantRate(item, variant, null)).toBe(0);
  });

  it("prefers variant.default_hourly_rate when parent rate_type is hourly", () => {
    const item = makeItem({ rate_type: "hourly", default_daily_rate: 1 });
    const variant = makeVariant({ daily_rate: 2, default_hourly_rate: 9 });
    expect(resolveVariantRate(item, variant, null)).toBe(9);
  });
});
