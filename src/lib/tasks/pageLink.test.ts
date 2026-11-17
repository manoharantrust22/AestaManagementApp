import { describe, expect, it } from "vitest";
import { buildTaskPage, searchWithoutSite, siteIdFromSearch } from "./pageLink";
import { clockOffsetMs, elapsedMs, formatElapsed, spokenElapsed } from "./elapsed";

const SITE = { id: "70508a18-63e0-4e58-a90f-8e19419cfacb", name: "Mathur" };

describe("buildTaskPage", () => {
  it("carries ?site=<id> of the selected site and drops an open task id", () => {
    const p = buildTaskPage({
      href: "http://localhost:3001/site/materials/hub?tab=stock&id=abc",
      heading: "Materials hub",
      site: SITE,
    });
    expect(p).toEqual({
      url: `/site/materials/hub?tab=stock&site=${SITE.id}`,
      title: "Materials hub",
      siteId: SITE.id,
      siteName: "Mathur",
    });
  });

  it("replaces a stale ?site= with the selected site", () => {
    const p = buildTaskPage({ href: "https://app.aesta.co.in/site/attendance?site=old-site-id-123", site: SITE });
    expect(new URL(p.url, "https://x").searchParams.get("site")).toBe(SITE.id);
  });

  it("falls back from the heading to the tab title to the path", () => {
    expect(buildTaskPage({ href: "/site/tea-shop", documentTitle: "Tea shop | Aesta" }).title).toBe("Tea shop");
    expect(buildTaskPage({ href: "/site/tea-shop", documentTitle: "Aesta" }).title).toBe("Tea shop");
    expect(buildTaskPage({ href: "/company/engineer-wallet", heading: "" }).title).toBe("Engineer wallet");
  });
});

describe("?site= links", () => {
  it("reads and removes the site", () => {
    expect(siteIdFromSearch(`?site=${SITE.id}&tab=2`)).toBe(SITE.id);
    expect(siteIdFromSearch("?tab=2")).toBeNull();
    expect(siteIdFromSearch("?site=<script>")).toBeNull();
    expect(searchWithoutSite(`?site=${SITE.id}&tab=2`)).toBe("?tab=2");
    expect(searchWithoutSite(`?site=${SITE.id}`)).toBe("");
  });
});

describe("running time (counted on the hub's clock)", () => {
  it("uses the server's now, not the phone's", () => {
    // Phone is 10 minutes slow.
    const phoneNow = Date.parse("2026-11-17T10:00:00Z");
    const offset = clockOffsetMs("2026-11-17T10:10:00Z", phoneNow);
    expect(offset).toBe(10 * 60_000);
    expect(elapsedMs("2026-11-17T10:05:00Z", phoneNow, offset)).toBe(5 * 60_000);
  });

  it("formats short and long times", () => {
    expect(formatElapsed(30_000)).toBe("<1m");
    expect(formatElapsed(4 * 60_000)).toBe("4m");
    expect(formatElapsed(65 * 60_000)).toBe("1h 05m");
    expect(formatElapsed((51 * 60 + 3) * 60_000)).toBe("2d 3h");
    expect(spokenElapsed(65 * 60_000)).toBe("1 hour 5 minutes");
    expect(spokenElapsed(60_000)).toBe("1 minute");
  });
});
