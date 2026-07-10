import type { GraniteLine } from "@/types/spaces.types";
import { formatFeetInches } from "@/lib/spaces/measurements";

/** A fresh empty slab line for the granite/area size editor. */
export const makeGraniteLine = (): GraniteLine => ({
  id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  label: "",
  length_in: 0,
  width_in: 0,
  count: 1,
});

/**
 * Human-readable slab-size summary, e.g.
 * "Kitchen top: 12' × 2'; Steps: 4' × 11" ×10".
 * Saved to a request item's notes / a spot-purchase batch's notes so the
 * actual sizes bought/needed are preserved alongside the computed sq.ft.
 */
export const graniteSizeNote = (lines: GraniteLine[]): string =>
  lines
    .filter((l) => l.length_in > 0 && l.width_in > 0)
    .map((l) => {
      const dims = `${formatFeetInches(l.length_in)} × ${formatFeetInches(l.width_in)}`;
      const label = l.label.trim();
      const cnt = l.count > 1 ? ` ×${l.count}` : "";
      return `${label ? `${label}: ` : ""}${dims}${cnt}`;
    })
    .join("; ");
