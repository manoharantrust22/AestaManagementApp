import { describe, expect, it } from "vitest";

import {
  FLOOR_NAME_RE,
  filterFloorSections,
  isFloorLikeSection,
  isPdfRef,
  matchFloorByName,
  pickDefaultFloorSectionId,
} from "./floors";

// Mirrors the seeded default_building_sections list (sequence 1–16).
const SEEDED = [
  "Site Preparation",
  "Foundation",
  "Plinth",
  "Ground Floor",
  "First Floor",
  "Second Floor",
  "Third Floor",
  "Roof",
  "Staircase",
  "Plastering",
  "Electrical",
  "Plumbing",
  "Flooring",
  "Painting",
  "Doors & Windows",
  "Finishing",
].map((name, i) => ({ id: `sec-${i + 1}`, name, sequence_order: i + 1 }));

const byName = (name: string) => SEEDED.find((s) => s.name === name)!;

describe("FLOOR_NAME_RE / isFloorLikeSection", () => {
  it.each([
    "Ground Floor",
    "First Floor",
    "2nd Floor",
    "Basement",
    "Terrace",
    "Roof",
    "Mezzanine",
    "Penthouse",
    "ground",
  ])("matches floor-like name %s", (name) => {
    expect(isFloorLikeSection(name)).toBe(true);
  });

  it.each([
    "Flooring", // word boundary must exclude the seeded phase
    "Site Preparation",
    "Plastering",
    "Electrical",
    "Doors & Windows",
    "Staircase",
    "Finishing",
  ])("excludes work phase %s", (name) => {
    expect(FLOOR_NAME_RE.test(name)).toBe(false);
  });
});

describe("filterFloorSections", () => {
  it("keeps only floor-like sections from the seeded list", () => {
    const names = filterFloorSections(SEEDED, {}).map((s) => s.name);
    expect(names).toEqual([
      "Ground Floor",
      "First Floor",
      "Second Floor",
      "Third Floor",
      "Roof",
    ]);
  });

  it("keeps non-floor sections that are in use or selected", () => {
    const used = new Set([byName("Plastering").id]);
    const names = filterFloorSections(SEEDED, {
      usedSectionIds: used,
      selectedId: byName("Electrical").id,
    }).map((s) => s.name);
    expect(names).toContain("Plastering");
    expect(names).toContain("Electrical");
    expect(names).not.toContain("Flooring");
  });

  it("showAll bypasses the filter", () => {
    expect(filterFloorSections(SEEDED, { showAll: true })).toHaveLength(16);
  });
});

describe("pickDefaultFloorSectionId", () => {
  const space = (sectionId: string | null, createdAt: string) => ({
    section_id: sectionId,
    created_at: createdAt,
  });

  it("prefers the floor of the most recently created space", () => {
    const picked = pickDefaultFloorSectionId(SEEDED, [
      space(byName("Ground Floor").id, "2026-07-01T00:00:00Z"),
      space(byName("First Floor").id, "2026-07-05T00:00:00Z"),
    ]);
    expect(picked).toBe(byName("First Floor").id);
  });

  it("falls back to the first floor-like section — never Site Preparation", () => {
    expect(pickDefaultFloorSectionId(SEEDED, [])).toBe(
      byName("Ground Floor").id
    );
  });

  it("ignores spaces on unknown/removed sections", () => {
    const picked = pickDefaultFloorSectionId(SEEDED, [
      space("gone", "2026-07-05T00:00:00Z"),
    ]);
    expect(picked).toBe(byName("Ground Floor").id);
  });

  it("returns null when no floor-like sections and no spaces", () => {
    const phasesOnly = SEEDED.filter((s) => !isFloorLikeSection(s.name));
    expect(pickDefaultFloorSectionId(phasesOnly, [])).toBeNull();
  });
});

describe("matchFloorByName", () => {
  it("matches exactly, case-insensitively, and trimmed", () => {
    expect(matchFloorByName("Ground Floor", SEEDED)?.name).toBe("Ground Floor");
    expect(matchFloorByName("ground floor", SEEDED)?.name).toBe("Ground Floor");
    expect(matchFloorByName("  First Floor ", SEEDED)?.name).toBe("First Floor");
  });

  it("matches with punctuation/spacing stripped", () => {
    expect(matchFloorByName("GroundFloor", SEEDED)?.name).toBe("Ground Floor");
    expect(matchFloorByName("ground-floor", SEEDED)?.name).toBe("Ground Floor");
  });

  it("appends 'floor': Ground → Ground Floor", () => {
    expect(matchFloorByName("Ground", SEEDED)?.name).toBe("Ground Floor");
    expect(matchFloorByName("second", SEEDED)?.name).toBe("Second Floor");
  });

  it("returns null for unknowns and near-misses", () => {
    expect(matchFloorByName("GF", SEEDED)).toBeNull();
    expect(matchFloorByName("Tenth Floor", SEEDED)).toBeNull();
    expect(matchFloorByName("", SEEDED)).toBeNull();
  });

  it("'Flooring' input does not match any floor", () => {
    // normalize("Flooring") = "flooring" — matches the Flooring phase
    // exactly (it IS a section) but never "First Floor" etc.
    expect(matchFloorByName("Flooring", SEEDED)?.name).toBe("Flooring");
    const withoutPhase = SEEDED.filter((s) => s.name !== "Flooring");
    expect(matchFloorByName("Flooring", withoutPhase)).toBeNull();
  });
});

describe("isPdfRef", () => {
  it("detects a PDF from the storage path", () => {
    expect(
      isPdfRef({ storage_path: "site/floor-plans/sec/1234-ab.pdf", url: "" })
    ).toBe(true);
    expect(isPdfRef({ storage_path: "x/PLAN.PDF" })).toBe(true);
  });

  it("falls back to the url (incl. query strings)", () => {
    expect(isPdfRef({ url: "https://cdn/x/plan.pdf" })).toBe(true);
    expect(isPdfRef({ url: "https://cdn/x/plan.pdf?token=abc" })).toBe(true);
  });

  it("is false for images and empty/null refs", () => {
    expect(isPdfRef({ storage_path: "x/plan.png", url: "x/plan.png" })).toBe(false);
    expect(isPdfRef({ storage_path: "x/1234.jpg" })).toBe(false);
    expect(isPdfRef(null)).toBe(false);
    expect(isPdfRef(undefined)).toBe(false);
    expect(isPdfRef({})).toBe(false);
  });
});
