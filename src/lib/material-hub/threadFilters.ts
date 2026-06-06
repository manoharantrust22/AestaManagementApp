import dayjs from "dayjs";
import type { MaterialThread } from "./threadTypes";

export interface MaterialOption {
  material_id: string;
  material_name: string;
}

/** Narrow shapes so unit tests can pass minimal objects. */
type MaterialFilterable = Pick<MaterialThread, "material_id" | "material_name"> & {
  variants?: { material_id: string; material_name: string }[];
};
type DateFilterable = Pick<MaterialThread, "requested_at">;

/**
 * Distinct materials present across the given threads — primary material plus
 * every variant — deduped by material_id and sorted by name. Drives the Hub
 * material-filter dropdown, so options always correspond to real rows.
 */
export function collectMaterialOptions(
  threads: MaterialFilterable[]
): MaterialOption[] {
  const byId = new Map<string, string>();
  for (const t of threads) {
    if (t.material_id) byId.set(t.material_id, t.material_name);
    for (const v of t.variants ?? []) {
      if (v.material_id) byId.set(v.material_id, v.material_name);
    }
  }
  return [...byId.entries()]
    .map(([material_id, material_name]) => ({ material_id, material_name }))
    .sort((a, b) => a.material_name.localeCompare(b.material_name));
}

/**
 * True when the thread's primary material OR any of its variants equals the
 * selected material. A null selection passes everything.
 */
export function matchesMaterial(
  t: MaterialFilterable,
  materialId: string | null
): boolean {
  if (!materialId) return true;
  if (t.material_id === materialId) return true;
  return (t.variants ?? []).some((v) => v.material_id === materialId);
}

/**
 * True when the thread's request date falls within [start, end] inclusive
 * (day granularity). Both bounds must be non-null to activate the filter; if
 * either is null the function passes everything (the Hub date picker always
 * sets both together). A thread with no requested_at fails when both bounds
 * are set.
 */
export function matchesDateRange(
  t: DateFilterable,
  start: Date | null,
  end: Date | null
): boolean {
  if (!start || !end) return true;
  if (!t.requested_at) return false;
  const d = dayjs(t.requested_at).startOf("day").valueOf();
  const s = dayjs(start).startOf("day").valueOf();
  const e = dayjs(end).startOf("day").valueOf();
  return d >= s && d <= e;
}
