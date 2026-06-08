/**
 * Pure title-derivation helpers for Material Hub threads.
 *
 * Extracted from MaterialThreadRow so the card row and the mobile detail sheet
 * derive a thread's display title with one shared rule (DRY).
 */
import type { MaterialThread } from "./threadTypes";

/**
 * Longest common prefix of variant names, trimmed to a word boundary. Falls
 * back to `fallback` (typically the thread's primary material name) when the
 * prefix collapses to almost nothing (e.g. unrelated materials).
 */
export function threadVariantCategory(
  variants: Array<{ material_name: string }>,
  fallback: string
): string {
  if (variants.length === 0) return fallback;
  const names = variants.map((v) => v.material_name || "").filter(Boolean);
  if (names.length <= 1) return names[0] || fallback;
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    let j = 0;
    while (j < prefix.length && j < names[i].length && prefix[j] === names[i][j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  prefix = prefix.replace(/[\s\-_/]+$/, "").trim();
  if (prefix.length < 3) return fallback;
  return prefix;
}

/**
 * Display name for a thread title: the shared variant category when the thread
 * carries multiple variants, else the material name.
 */
export function threadDisplayName(
  thread: Pick<MaterialThread, "variants" | "material_name">
): string {
  if (thread.variants && thread.variants.length > 1) {
    return threadVariantCategory(thread.variants, thread.material_name);
  }
  return thread.material_name;
}

/**
 * The brand string to show on a Hub card's subtitle, or null when none.
 *
 * Multi-size threads: the distinct set of variant brands joined by " / "
 * (usually a single brand, e.g. "Amman"); falls back to the primary brand when
 * no variant carries one. Single-line threads: just the primary brand.
 */
export function threadBrandLabel(thread: {
  brand_name?: string | null;
  variants?: Array<{ brand_name?: string | null }>;
}): string | null {
  if (thread.variants && thread.variants.length > 1) {
    const names = Array.from(
      new Set(
        thread.variants.map((v) => (v.brand_name ?? "").trim()).filter(Boolean)
      )
    );
    if (names.length > 0) return names.join(" / ");
  }
  return thread.brand_name?.trim() || null;
}
