import { describe, it, expect } from "vitest";
import { activePacks, representativePack, formatPackPrice, packBaseQty } from "./packs";
import type { MaterialPack } from "@/types/material.types";

const pack = (over: Partial<MaterialPack> = {}): MaterialPack => ({
  id: "p1",
  material_id: "m1",
  label: "5 L can",
  contents_qty: 5,
  price: 1620,
  price_includes_gst: false,
  gst_rate: null,
  is_active: true,
  display_order: 0,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
  ...over,
});

describe("packs helpers", () => {
  describe("activePacks", () => {
    it("drops inactive packs and sorts by display_order then contents_qty", () => {
      const packs = [
        pack({ id: "b", label: "10 L can", contents_qty: 10, display_order: 1 }),
        pack({ id: "x", label: "20 L drum", contents_qty: 20, is_active: false }),
        pack({ id: "a", label: "5 L can", contents_qty: 5, display_order: 0 }),
      ];
      const result = activePacks(packs);
      expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    });

    it("returns [] for undefined / null input", () => {
      expect(activePacks(undefined)).toEqual([]);
      expect(activePacks(null)).toEqual([]);
    });
  });

  describe("representativePack", () => {
    it("picks the smallest active contents_qty", () => {
      const packs = [
        pack({ id: "big", contents_qty: 20 }),
        pack({ id: "small", contents_qty: 5 }),
        pack({ id: "mid", contents_qty: 10 }),
      ];
      expect(representativePack(packs)?.id).toBe("small");
    });

    it("breaks ties on equal contents_qty by lowest display_order", () => {
      const packs = [
        pack({ id: "late", contents_qty: 5, display_order: 3 }),
        pack({ id: "early", contents_qty: 5, display_order: 1 }),
      ];
      expect(representativePack(packs)?.id).toBe("early");
    });

    it("ignores inactive packs and returns null when none active", () => {
      expect(representativePack([pack({ is_active: false })])).toBeNull();
      expect(representativePack([])).toBeNull();
      expect(representativePack(undefined)).toBeNull();
    });
  });

  describe("formatPackPrice", () => {
    it("formats as '₹1,620 / 5 L can'", () => {
      expect(formatPackPrice(pack())).toBe("₹1,620 / 5 L can");
    });

    it("returns null label form when price is missing", () => {
      expect(formatPackPrice(pack({ price: null }))).toBeNull();
    });
  });

  describe("packBaseQty", () => {
    it("multiplies contents by can count", () => {
      expect(packBaseQty(pack({ contents_qty: 5 }), 3)).toBe(15);
    });

    it("treats invalid counts as 0", () => {
      expect(packBaseQty(pack({ contents_qty: 5 }), 0)).toBe(0);
      expect(packBaseQty(pack({ contents_qty: 5 }), -2)).toBe(0);
      expect(packBaseQty(pack({ contents_qty: 5 }), NaN)).toBe(0);
    });
  });
});
