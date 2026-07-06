/**
 * Floor helpers for the Spaces register.
 *
 * `building_sections` doubles as a work-phase list on real sites (Site
 * Preparation, Plastering, Electrical…), so anything presented as a "floor"
 * picker filters to floor-like names — while always keeping sections that
 * are already in use (or currently selected) visible, plus a show-all
 * escape hatch. Pure module: no I/O, no React.
 */

import type { Space } from "@/types/spaces.types";

export interface FloorSectionLike {
  id: string;
  name: string;
  sequence_order: number;
}

// Word boundaries are load-bearing: a bare /floor/i would also match the
// seeded "Flooring" work-phase section.
export const FLOOR_NAME_RE =
  /\b(floor|ground|basement|terrace|roof|mezzanine|penthouse)\b/i;

export const isFloorLikeSection = (name: string): boolean =>
  FLOOR_NAME_RE.test(name);

/**
 * Sections to offer as floors: floor-like ∪ already holding a space or
 * plan ∪ the currently selected value. `showAll` bypasses the filter.
 * Input order (sequence_order from the query) is preserved.
 */
export function filterFloorSections<T extends FloorSectionLike>(
  sections: T[],
  opts: {
    usedSectionIds?: ReadonlySet<string>;
    selectedId?: string | null;
    showAll?: boolean;
  } = {}
): T[] {
  if (opts.showAll) return sections;
  return sections.filter(
    (s) =>
      isFloorLikeSection(s.name) ||
      opts.usedSectionIds?.has(s.id) === true ||
      s.id === opts.selectedId
  );
}

/**
 * Default floor for "Add space": the floor of the most recently created
 * space, else the first floor-like section by sequence_order, else null.
 * Never blindly `sections[0]` — on seeded sites that is "Site Preparation".
 */
export function pickDefaultFloorSectionId(
  sections: FloorSectionLike[],
  spaces: Pick<Space, "section_id" | "created_at">[]
): string | null {
  const known = new Set(sections.map((s) => s.id));
  let latest: Pick<Space, "section_id" | "created_at"> | null = null;
  for (const space of spaces) {
    if (!space.section_id || !known.has(space.section_id)) continue;
    if (!latest || space.created_at > latest.created_at) latest = space;
  }
  if (latest?.section_id) return latest.section_id;

  const firstFloor = [...sections]
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .find((s) => isFloorLikeSection(s.name));
  return firstFloor?.id ?? null;
}

const normalizeName = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Match an AI-supplied floor string to a section:
 * 1. trimmed case-insensitive exact name;
 * 2. normalized (lowercase, non-alphanumerics stripped) equality;
 * 3. normalized(input + " floor") — so "Ground" matches "Ground Floor".
 * Returns null when nothing matches (caller shows a warning).
 */
export function matchFloorByName<T extends FloorSectionLike>(
  input: string,
  sections: T[]
): T | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const exact = sections.find((s) => s.name.trim().toLowerCase() === lower);
  if (exact) return exact;

  const norm = normalizeName(trimmed);
  if (!norm) return null;
  const normalized = sections.find((s) => normalizeName(s.name) === norm);
  if (normalized) return normalized;

  return (
    sections.find((s) => normalizeName(s.name) === `${norm}floor`) ?? null
  );
}

/**
 * A stored plan/photo ref points at a PDF (not an image) when its path ends
 * in `.pdf`. Plans commonly arrive as PDFs; those can't render in an <img>,
 * so callers show a PDF affordance instead. Detected from `storage_path`
 * (preserves the uploaded extension), falling back to the public `url`.
 */
export const isPdfRef = (
  ref: { storage_path?: string | null; url?: string | null } | null | undefined
): boolean => {
  const s = (ref?.storage_path || ref?.url || "").toLowerCase();
  return s.endsWith(".pdf") || s.includes(".pdf?");
};
