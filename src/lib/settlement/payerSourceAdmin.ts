import { slugifyPayerSourceKey } from "./payerSourceKey";
import type { PayerSourceRow } from "@/hooks/queries/usePayerSources";

/** Next sort_order for a new source: max existing + 10, or 10 when empty. */
export function nextSortOrder(rows: { sort_order: number }[]): number {
  if (rows.length === 0) return 10;
  return Math.max(...rows.map((r) => r.sort_order)) + 10;
}

export interface NewCustomSource {
  site_id: string;
  key: string;
  label: string;
  requires_name: boolean;
  is_built_in: false;
  is_hidden: false;
  sort_order: number;
}

/**
 * Build the insert payload for a custom (non-built-in) payer source.
 * The key is derived from the label and de-duplicated against the
 * site's existing keys; the label is trimmed; sort_order lands after
 * the current rows.
 */
export function buildCustomSourceRow(args: {
  siteId: string;
  label: string;
  requiresName?: boolean;
  existingRows: { key: string; sort_order: number }[];
}): NewCustomSource {
  const label = args.label.trim();
  const key = slugifyPayerSourceKey(
    label,
    args.existingRows.map((r) => r.key),
  );
  return {
    site_id: args.siteId,
    key,
    label,
    requires_name: args.requiresName ?? false,
    is_built_in: false,
    is_hidden: false,
    sort_order: nextSortOrder(args.existingRows),
  };
}

/**
 * Compute the sort_order updates to move a visible row up or down by one
 * position among the *visible* sources (the order the picker shows).
 * Hidden rows are ignored. Returns only the rows whose sort_order
 * actually changes, renumbered to clean multiples of 10 so values stay
 * distinct. Returns null when the move is a no-op (edge / unknown id).
 */
export function reorderVisible(
  rows: PayerSourceRow[],
  id: string,
  direction: "up" | "down",
): { id: string; sort_order: number }[] | null {
  const visible = [...rows.filter((r) => !r.is_hidden)].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const idx = visible.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= visible.length) return null;

  const original = new Map(visible.map((r) => [r.id, r.sort_order]));
  [visible[idx], visible[swapIdx]] = [visible[swapIdx], visible[idx]];

  return visible
    .map((r, i) => ({ id: r.id, sort_order: (i + 1) * 10 }))
    .filter((u) => original.get(u.id) !== u.sort_order);
}

/** True when `id` is the only currently-visible source (hiding/deleting it
 *  would leave the picker with nothing and fall back to the hardcoded set). */
export function isLastVisibleSource(rows: PayerSourceRow[], id: string): boolean {
  const visible = rows.filter((r) => !r.is_hidden);
  return visible.length === 1 && visible[0].id === id;
}
