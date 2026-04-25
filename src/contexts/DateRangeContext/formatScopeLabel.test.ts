import { describe, it, expect } from "vitest";
import { formatScopeLabel } from "./formatScopeLabel";

describe("formatScopeLabel", () => {
  it("returns 'All Time' when any of startDate/endDate/days is null", () => {
    expect(formatScopeLabel(null, null, null)).toBe("All Time");
    expect(formatScopeLabel(null, new Date("2026-04-25"), 7)).toBe("All Time");
    expect(formatScopeLabel(new Date("2026-04-25"), null, 7)).toBe("All Time");
    expect(
      formatScopeLabel(new Date("2026-04-25"), new Date("2026-04-25"), null)
    ).toBe("All Time");
  });

  it("formats a single-day range with full year and uses '1 day' (singular)", () => {
    const d = new Date("2026-04-24");
    expect(formatScopeLabel(d, d, 1)).toBe("Apr 24, 2026 · 1 day");
  });

  it("formats a same-year multi-day range without years and pluralises 'days'", () => {
    expect(
      formatScopeLabel(new Date("2026-04-05"), new Date("2026-04-20"), 16)
    ).toBe("Apr 5 – Apr 20 · 16 days");
  });

  it("formats a cross-year range with both years", () => {
    expect(
      formatScopeLabel(new Date("2025-12-20"), new Date("2026-01-05"), 17)
    ).toBe("Dec 20, 2025 – Jan 5, 2026 · 17 days");
  });

  it("uses '1 day' (not '1 days') for any range with days === 1", () => {
    const d = new Date("2026-04-24");
    expect(formatScopeLabel(d, d, 1)).toContain("1 day");
    expect(formatScopeLabel(d, d, 1)).not.toContain("1 days");
  });
});
