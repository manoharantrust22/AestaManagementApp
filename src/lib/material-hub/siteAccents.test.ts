import { describe, it, expect } from "vitest";
import { hubTokens } from "./tokens";
import {
  SITE_ACCENTS,
  siteShort,
  assignSiteAccents,
  usageSegments,
} from "./siteAccents";

describe("siteShort", () => {
  it("takes up to 3 initials, uppercased", () => {
    expect(siteShort("Srinivasan House & Shop")).toBe("SH&"); // S, H, & (first 3 tokens)
    expect(siteShort("Padmavathy Apartments")).toBe("PA");
    expect(siteShort("alpha")).toBe("A");
  });
  it("handles empty / null", () => {
    expect(siteShort(null)).toBe("—");
    expect(siteShort("")).toBe("—");
  });
});

describe("assignSiteAccents", () => {
  it("viewing site → primary blue, first other → pink, rest cycle", () => {
    const m = assignSiteAccents(["srini", "padma", "x", "y"], "srini");
    expect(m.get("srini")).toBe(hubTokens.primary);
    expect(m.get("padma")).toBe(hubTokens.pink);
    expect(m.get("x")).toBe(SITE_ACCENTS[0]);
    expect(m.get("y")).toBe(SITE_ACCENTS[1]);
  });
  it("with no viewing site, the first listed is the pink 'other'", () => {
    const m = assignSiteAccents(["padma", "srini"], undefined);
    expect(m.get("padma")).toBe(hubTokens.pink);
    expect(m.get("srini")).toBe(SITE_ACCENTS[0]);
  });
});

describe("usageSegments", () => {
  const perSite = [
    { site_id: "srini", site_name: "Srinivasan House & Shop", received: 50, used: 30 },
    { site_id: "padma", site_name: "Padmavathy Apartments", received: 0, used: 20 },
  ];

  it("builds one coloured segment per used>0 site with correct widths + accents", () => {
    const segs = usageSegments(perSite, 50, "srini");
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ siteId: "srini", used: 30, widthPct: 60, accent: hubTokens.primary });
    expect(segs[1]).toMatchObject({ siteId: "padma", used: 20, widthPct: 40, accent: hubTokens.pink });
  });

  it("drops zero-used sites", () => {
    const segs = usageSegments(
      [
        { site_id: "a", site_name: "A site", used: 0 },
        { site_id: "b", site_name: "B site", used: 5 },
      ],
      10,
      "a"
    );
    expect(segs.map((s) => s.siteId)).toEqual(["b"]);
    expect(segs[0].widthPct).toBe(50);
  });

  it("caps width at 100% and guards received=0", () => {
    expect(usageSegments([{ site_id: "a", site_name: "A", used: 80 }], 50, "a")[0].widthPct).toBe(100);
    expect(usageSegments([{ site_id: "a", site_name: "A", used: 5 }], 0, "a")[0].widthPct).toBe(0);
  });
});
