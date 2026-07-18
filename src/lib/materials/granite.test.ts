import { describe, it, expect } from "vitest";
import {
  graniteSizeNote,
  graniteAreaVariance,
  graniteQuantityAllocated,
  GRANITE_AREA_VARIANCE_WARN_PCT,
} from "./granite";
import { graniteSqft } from "@/lib/spaces/measurements";
import type { GraniteLine } from "@/types/spaces.types";

const line = (over: Partial<GraniteLine> = {}): GraniteLine => ({
  id: "g1",
  label: "KitchenTop",
  length_in: 120, // 10'
  width_in: 30, // 2' 6"
  count: 1,
  ...over,
});

describe("granite helpers", () => {
  describe("graniteSizeNote", () => {
    it("renders the real-world kitchen-top request the site would enter", () => {
      // 10' x 2'6" x4 = the countertop pieces, 2' deep + 1" nosing.
      expect(graniteSizeNote([line({ count: 4 })])).toBe(
        `KitchenTop: 10' × 2' 6" ×4`
      );
    });

    it("joins multiple pieces with '; ' and omits a count of 1", () => {
      const note = graniteSizeNote([
        line({ count: 4 }),
        line({ id: "g2", label: "Steps", length_in: 48, width_in: 11 }),
      ]);
      // Sub-foot values keep their 0' — formatFeetInches only drops the inches
      // half, never the feet half. Locking the real output in: the docstring's
      // `4' × 11"` example has never been what the code produces.
      expect(note).toBe(`KitchenTop: 10' × 2' 6" ×4; Steps: 4' × 0' 11"`);
    });

    it("skips lines with no dimensions yet so a half-typed row is not shown", () => {
      expect(graniteSizeNote([line(), line({ id: "g2", length_in: 0 })])).toBe(
        `KitchenTop: 10' × 2' 6"`
      );
    });
  });

  describe("graniteAreaVariance", () => {
    it("reports the extra slab bought as positive offcut", () => {
      // Requested 140 sq.ft; vendor only had bigger slabs → bought 150.
      const v = graniteAreaVariance(140, 150);
      expect(v.diffSqft).toBe(10);
      expect(v.diffPct).toBe(7.14);
      expect(v.isLarge).toBe(false);
    });

    it("reports buying short as a negative diff", () => {
      const v = graniteAreaVariance(140, 130);
      expect(v.diffSqft).toBe(-10);
      expect(v.diffPct).toBe(-7.14);
      expect(v.isLarge).toBe(false);
    });

    it("is not large exactly at the threshold, only beyond it", () => {
      expect(graniteAreaVariance(100, 110).diffPct).toBe(
        GRANITE_AREA_VARIANCE_WARN_PCT
      );
      expect(graniteAreaVariance(100, 110).isLarge).toBe(false);
      expect(graniteAreaVariance(100, 110.5).isLarge).toBe(true);
    });

    it("flags a large under-buy too, not just over-buy", () => {
      expect(graniteAreaVariance(100, 80).isLarge).toBe(true);
    });

    it("has no percentage to report when nothing was requested", () => {
      const v = graniteAreaVariance(0, 150);
      expect(v.diffPct).toBeNull();
      expect(v.isLarge).toBe(false);
      expect(v.diffSqft).toBe(150);
    });

    it("treats an exact match as zero variance", () => {
      const v = graniteAreaVariance(140, 140);
      expect(v.diffSqft).toBe(0);
      expect(v.diffPct).toBe(0);
      expect(v.isLarge).toBe(false);
    });

    it("clamps negative inputs rather than inventing negative area", () => {
      expect(graniteAreaVariance(-5, -5)).toMatchObject({
        requestedSqft: 0,
        actualSqft: 0,
        diffSqft: 0,
        diffPct: null,
      });
    });

    it("derives from the editor's own sqft math end to end", () => {
      const requested = [line({ count: 4 })]; // 10' x 2'6" x4 = 100 sq.ft
      const actual = [line({ count: 4, length_in: 126 })]; // 10'6" slabs = 105
      expect(graniteSqft(requested)).toBe(100);
      expect(graniteSqft(actual)).toBe(105);
      expect(
        graniteAreaVariance(graniteSqft(requested), graniteSqft(actual))
      ).toMatchObject({ diffSqft: 5, diffPct: 5, isLarge: false });
    });
  });

  describe("graniteQuantityAllocated", () => {
    it("caps at what the request still needs when bigger slabs are bought", () => {
      // Bought 150 against a 140 request: the PO bills 150, but only 140 of it
      // answers the request — the other 10 is offcut.
      expect(graniteQuantityAllocated(150, 140)).toBe(140);
    });

    it("allocates the full amount when buying short", () => {
      expect(graniteQuantityAllocated(130, 140)).toBe(130);
    });

    it("allocates everything on an exact match", () => {
      expect(graniteQuantityAllocated(140, 140)).toBe(140);
    });

    it("never returns a negative allocation", () => {
      expect(graniteQuantityAllocated(-10, 140)).toBe(0);
      expect(graniteQuantityAllocated(150, -1)).toBe(0);
    });
  });
});
