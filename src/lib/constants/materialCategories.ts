export const CATEGORY_TAB_MAPPING: Record<string, string[]> = {
  civil: ["CEM", "STL", "AGG", "BRK"],
  electrical: ["ELC"],
  plumbing: ["PLB"],
  painting: ["PNT", "WPF"],
  doors_windows: ["WOD", "GLS"],
  hardware: ["HRD", "MSC"],
  tiles: ["TIL"],
  pumps: ["PMP"],
  formwork: ["CTR"],
  all: [],
};

export const CATEGORY_TABS = [
  { id: "all", label: "All", icon: "📦" },
  { id: "civil", label: "Civil", icon: "🏗️" },
  { id: "electrical", label: "Electrical", icon: "⚡" },
  { id: "plumbing", label: "Plumbing", icon: "🚿" },
  { id: "painting", label: "Painting", icon: "🎨" },
  { id: "doors_windows", label: "Doors & Windows", icon: "🚪" },
  { id: "hardware", label: "Hardware", icon: "🔧" },
  { id: "tiles", label: "Tiles", icon: "🔲" },
  { id: "pumps", label: "Pumps & Motors", icon: "⚙️" },
  { id: "formwork", label: "Centering & Shuttering", icon: "🪵" },
] as const;

export type CategoryTabId = (typeof CATEGORY_TABS)[number]["id"];

/** Bucket id for materials whose category has no tab-mapped code. */
export const OTHER_TAB_ID = "other" as const;
export type CategorySectionId = CategoryTabId | typeof OTHER_TAB_ID;

export const OTHER_TAB_LABEL = "Other";

/**
 * Reverse of the catalog's `tabCategoryIds` logic: given a material category's
 * `code`, return the top-level tab/section it belongs to ("civil", "electrical",
 * …). Falls back to {@link OTHER_TAB_ID} when the code is null or doesn't map to
 * any tab. Matches both exact codes and prefixed sub-codes (e.g. "STL-TMT" → civil).
 */
export function categoryTabIdForCode(
  code: string | null | undefined
): CategorySectionId {
  if (!code) return OTHER_TAB_ID;
  for (const [tabId, codes] of Object.entries(CATEGORY_TAB_MAPPING)) {
    if (tabId === "all") continue;
    if (
      codes.includes(code) ||
      codes.some((c) => code.startsWith(`${c}-`))
    ) {
      return tabId as CategoryTabId;
    }
  }
  return OTHER_TAB_ID;
}

/** Display label for a section id (handles the "other" bucket). */
export function categorySectionLabel(id: CategorySectionId): string {
  if (id === OTHER_TAB_ID) return OTHER_TAB_LABEL;
  return CATEGORY_TABS.find((t) => t.id === id)?.label ?? id;
}

/**
 * Stable ordering for sections/chips: follow CATEGORY_TABS order (excluding
 * "all"), with the "Other" bucket pinned last.
 */
export const CATEGORY_SECTION_ORDER: CategorySectionId[] = [
  ...CATEGORY_TABS.filter((t) => t.id !== "all").map((t) => t.id),
  OTHER_TAB_ID,
];

/** Section header accent colors per category */
export const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  civil:         { bg: "#e3f2fd", color: "#1565c0" },
  electrical:    { bg: "#f3e5f5", color: "#6a1b9a" },
  plumbing:      { bg: "#e0f2f1", color: "#00695c" },
  painting:      { bg: "#fff3e0", color: "#e65100" },
  doors_windows: { bg: "#fce4ec", color: "#880e4f" },
  hardware:      { bg: "#f3f3f3", color: "#424242" },
  tiles:         { bg: "#e8f5e9", color: "#2e7d32" },
  pumps:         { bg: "#e8eaf6", color: "#283593" },
  formwork:      { bg: "#efebe9", color: "#4e342e" },
  other:         { bg: "#f3f3f3", color: "#546e7a" },
  general:       { bg: "#fafafa", color: "#555" },
};
