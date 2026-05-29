import { describe, it, expect, beforeEach } from "vitest";
import { getStoredSiteId, storeSiteId } from "./SiteProvider";

const KEY = "selectedSiteId";

describe("site storage (per-tab invariant)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("storeSiteId writes BOTH sessionStorage and localStorage", () => {
    storeSiteId("s-1");
    expect(sessionStorage.getItem(KEY)).toBe("s-1");
    expect(localStorage.getItem(KEY)).toBe("s-1");
  });

  it("prefers per-tab sessionStorage over shared localStorage", () => {
    localStorage.setItem(KEY, "shared-site");
    sessionStorage.setItem(KEY, "this-tab-site");
    expect(getStoredSiteId()).toBe("this-tab-site");
  });

  it("falls back to shared localStorage when sessionStorage is empty (fresh-tab seed)", () => {
    localStorage.setItem(KEY, "shared-site");
    expect(getStoredSiteId()).toBe("shared-site");
  });

  it("clearing (null) removes from BOTH stores", () => {
    storeSiteId("s-1");
    storeSiteId(null);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
