import type { HubFilterKey } from "@/components/material-hub/MaterialHubFilterChips";
import type { FilterGroup, FilterKind, MaterialOption } from "./threadFilters";

/**
 * Per-tab persistence for the Material Hub filter toolbar. The Hub page
 * snapshots its five filter controls into sessionStorage (keyed by site) so a
 * page refresh restores them; closing the tab clears everything.
 */
export interface HubFilterSnapshot {
  filter: HubFilterKey;
  selectedFilter: MaterialOption | null;
  /** Free-text search term (IDs + names). Optional so older snapshots that
   *  predate the search box still restore. */
  search?: string;
  /** ISO strings — Date objects don't survive JSON. */
  dateStart: string | null;
  dateEnd: string | null;
  layout: "cards" | "table";
}

const STORAGE_PREFIX = "material_hub_filters_";

const FILTER_KEYS: HubFilterKey[] = [
  "all",
  "action",
  "own",
  "group",
  "advance",
  "spot",
  "historical",
];
const FILTER_KINDS: FilterKind[] = ["material", "variant", "brand"];
const FILTER_GROUPS: FilterGroup[] = ["Material", "Size / Variant", "Brand"];

export function hubFilterStorageKey(siteId: string): string {
  return `${STORAGE_PREFIX}${siteId}`;
}

function isValidDateString(s: unknown): s is string | null {
  if (s === null) return true;
  return typeof s === "string" && !isNaN(new Date(s).getTime());
}

function isValidMaterialOption(o: unknown): o is MaterialOption | null {
  if (o === null) return true;
  if (typeof o !== "object") return false;
  const c = o as Record<string, unknown>;
  return (
    FILTER_KINDS.includes(c.kind as FilterKind) &&
    typeof c.id === "string" &&
    typeof c.label === "string" &&
    FILTER_GROUPS.includes(c.group as FilterGroup)
  );
}

/** Restore the saved snapshot for a site. Returns null when nothing was saved
 *  or the stored value fails validation (corrupt / from an older shape). */
export function loadHubFilters(siteId: string): HubFilterSnapshot | null {
  if (typeof window === "undefined" || !siteId) return null;
  try {
    const raw = window.sessionStorage.getItem(hubFilterStorageKey(siteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      !FILTER_KEYS.includes(parsed.filter as HubFilterKey) ||
      !isValidMaterialOption(parsed.selectedFilter ?? null) ||
      !isValidDateString(parsed.dateStart ?? null) ||
      !isValidDateString(parsed.dateEnd ?? null) ||
      (parsed.layout !== "cards" && parsed.layout !== "table")
    ) {
      return null;
    }
    return {
      filter: parsed.filter as HubFilterKey,
      selectedFilter: (parsed.selectedFilter ?? null) as MaterialOption | null,
      search: typeof parsed.search === "string" ? parsed.search : "",
      dateStart: (parsed.dateStart ?? null) as string | null,
      dateEnd: (parsed.dateEnd ?? null) as string | null,
      layout: parsed.layout,
    };
  } catch {
    return null;
  }
}

/** Persist the current snapshot for a site. Quota / availability errors are
 *  swallowed — persistence is best-effort. */
export function saveHubFilters(siteId: string, snapshot: HubFilterSnapshot): void {
  if (typeof window === "undefined" || !siteId) return;
  try {
    window.sessionStorage.setItem(
      hubFilterStorageKey(siteId),
      JSON.stringify(snapshot)
    );
  } catch {
    // best-effort only
  }
}
