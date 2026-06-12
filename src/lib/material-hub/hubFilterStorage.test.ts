import { describe, it, expect, beforeEach } from "vitest";
import {
  loadHubFilters,
  saveHubFilters,
  hubFilterStorageKey,
  type HubFilterSnapshot,
} from "./hubFilterStorage";

const snapshot: HubFilterSnapshot = {
  filter: "group",
  selectedFilter: {
    kind: "material",
    id: "m-tmt-parent",
    label: "TMT Rods",
    group: "Material",
  },
  dateStart: "2026-03-01T00:00:00.000Z",
  dateEnd: "2026-03-31T00:00:00.000Z",
  layout: "table",
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("hubFilterStorage", () => {
  it("round-trips a full snapshot", () => {
    saveHubFilters("site-1", snapshot);
    expect(loadHubFilters("site-1")).toEqual(snapshot);
  });

  it("round-trips cleared filters (nulls)", () => {
    saveHubFilters("site-1", {
      filter: "all",
      selectedFilter: null,
      dateStart: null,
      dateEnd: null,
      layout: "cards",
    });
    expect(loadHubFilters("site-1")).toEqual({
      filter: "all",
      selectedFilter: null,
      dateStart: null,
      dateEnd: null,
      layout: "cards",
    });
  });

  it("keys snapshots per site", () => {
    saveHubFilters("site-1", snapshot);
    saveHubFilters("site-2", { ...snapshot, filter: "own" });
    expect(loadHubFilters("site-1")?.filter).toBe("group");
    expect(loadHubFilters("site-2")?.filter).toBe("own");
  });

  it("returns null when nothing was saved", () => {
    expect(loadHubFilters("site-1")).toBeNull();
  });

  it("returns null for an empty siteId", () => {
    expect(loadHubFilters("")).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    window.sessionStorage.setItem(hubFilterStorageKey("site-1"), "{not json");
    expect(loadHubFilters("site-1")).toBeNull();
  });

  it("returns null on an unknown filter key", () => {
    window.sessionStorage.setItem(
      hubFilterStorageKey("site-1"),
      JSON.stringify({ ...snapshot, filter: "bogus" })
    );
    expect(loadHubFilters("site-1")).toBeNull();
  });

  it("returns null on an invalid date string", () => {
    window.sessionStorage.setItem(
      hubFilterStorageKey("site-1"),
      JSON.stringify({ ...snapshot, dateStart: "not-a-date" })
    );
    expect(loadHubFilters("site-1")).toBeNull();
  });

  it("returns null on a malformed material option", () => {
    window.sessionStorage.setItem(
      hubFilterStorageKey("site-1"),
      JSON.stringify({
        ...snapshot,
        selectedFilter: { kind: "material", id: 42 },
      })
    );
    expect(loadHubFilters("site-1")).toBeNull();
  });

  it("returns null on an unknown layout", () => {
    window.sessionStorage.setItem(
      hubFilterStorageKey("site-1"),
      JSON.stringify({ ...snapshot, layout: "list" })
    );
    expect(loadHubFilters("site-1")).toBeNull();
  });
});
