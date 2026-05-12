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
    { id: "b1", rental_item_id: "item-1", rental_item_name: "Side Sheet", size_label: "6×1½", quantity: 50, days: 25 },
    { id: "b2", rental_item_id: "item-1", rental_item_name: "Side Sheet", size_label: "4×1½", quantity: 20, days: 25 },
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
