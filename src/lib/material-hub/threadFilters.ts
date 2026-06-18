import dayjs from "dayjs";
import type { MaterialThread } from "./threadTypes";

export type FilterKind = "material" | "variant" | "brand";

export type FilterGroup = "Material" | "Size / Variant" | "Brand";

/**
 * One entry in the Hub's grouped material filter. `kind` decides how
 * {@link matchesMaterial} interprets `id`:
 *   - "material" → a parent (or standalone) material_id; matches the material
 *     itself AND every variant rolled under it.
 *   - "variant"  → a specific leaf material_id; exact match.
 *   - "brand"    → a brand_id; matches any line (primary or variant) of that brand.
 */
export interface MaterialOption {
  kind: FilterKind;
  id: string;
  label: string;
  group: FilterGroup;
}

/** Per-material parent lookup (see `useMaterialParentMap`). */
export interface ParentInfo {
  parentId: string | null;
  parentName: string | null;
  selfName: string;
}
export type ParentMap = Map<string, ParentInfo>;

/** Narrow shapes so unit tests can pass minimal objects. */
type MaterialFilterable = Pick<
  MaterialThread,
  "material_id" | "material_name" | "brand_id" | "brand_name"
> & {
  variants?: {
    material_id: string;
    material_name: string;
    brand_id?: string | null;
    brand_name?: string | null;
  }[];
};
type DateFilterable = Pick<MaterialThread, "requested_at">;

/** Fields the free-text search box scans: IDs + names. Narrowed so unit tests
 *  can pass minimal objects. */
type SearchFilterable = Pick<MaterialThread, "material_name" | "request_number"> & {
  po?: { po_number?: string | null; vendor_name?: string | null } | null;
  settlement?: { expense_ref?: string | null; expense_id?: string | null } | null;
  variants?: { material_name: string }[];
};

/** All material lines on a thread (primary + variants), id + name. */
function threadMaterials(
  t: MaterialFilterable
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  if (t.material_id) out.push({ id: t.material_id, name: t.material_name });
  for (const v of t.variants ?? []) {
    if (v.material_id) out.push({ id: v.material_id, name: v.material_name });
  }
  return out;
}

/** All brand lines on a thread (primary + variants), id + name. */
function threadBrands(
  t: MaterialFilterable
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  if (t.brand_id) out.push({ id: t.brand_id, name: t.brand_name ?? "Brand" });
  for (const v of t.variants ?? []) {
    if (v.brand_id) out.push({ id: v.brand_id, name: v.brand_name ?? "Brand" });
  }
  return out;
}

/**
 * Distinct filter options across the given threads, grouped into Material /
 * Size·Variant / Brand. Variants roll up under their parent (resolved via
 * `parentMap`) so picking a parent matches all its sizes & brands. Options are
 * returned group-contiguous (Material, then Size/Variant, then Brand) and
 * sorted by label within each group — MUI's `groupBy` needs them pre-grouped.
 */
export function collectMaterialOptions(
  threads: MaterialFilterable[],
  parentMap: ParentMap
): MaterialOption[] {
  const materialNames = new Map<string, string>();
  const brandNames = new Map<string, string>();
  for (const t of threads) {
    for (const m of threadMaterials(t)) materialNames.set(m.id, m.name);
    for (const b of threadBrands(t)) brandNames.set(b.id, b.name);
  }

  const parentOpts = new Map<string, MaterialOption>();
  const variantOpts = new Map<string, MaterialOption>();
  for (const [id, name] of materialNames) {
    const info = parentMap.get(id);
    if (info?.parentId) {
      // A variant → contributes a parent option + its own size option.
      parentOpts.set(info.parentId, {
        kind: "material",
        id: info.parentId,
        label: info.parentName ?? "Material",
        group: "Material",
      });
      variantOpts.set(id, {
        kind: "variant",
        id,
        label: name,
        group: "Size / Variant",
      });
    } else {
      // A root / standalone material → a single parent-level option.
      parentOpts.set(id, {
        kind: "material",
        id,
        label: info?.selfName ?? name,
        group: "Material",
      });
    }
  }

  const brandOpts = [...brandNames.entries()].map(
    ([id, label]): MaterialOption => ({ kind: "brand", id, label, group: "Brand" })
  );

  const byLabel = (a: MaterialOption, b: MaterialOption) =>
    a.label.localeCompare(b.label);
  return [
    ...[...parentOpts.values()].sort(byLabel),
    ...[...variantOpts.values()].sort(byLabel),
    ...brandOpts.sort(byLabel),
  ];
}

/**
 * True when the thread matches the selected filter option. A null selection
 * passes everything.
 *   - "material" (parent/standalone): any material line equals the id OR rolls
 *     up to it via `parentMap`.
 *   - "variant": any material line equals the id exactly.
 *   - "brand": any brand line equals the id.
 */
export function matchesMaterial(
  t: MaterialFilterable,
  sel: MaterialOption | null,
  parentMap: ParentMap
): boolean {
  if (!sel) return true;
  if (sel.kind === "brand") {
    return threadBrands(t).some((b) => b.id === sel.id);
  }
  const materials = threadMaterials(t);
  if (sel.kind === "variant") {
    return materials.some((m) => m.id === sel.id);
  }
  // sel.kind === "material" (parent or standalone)
  return materials.some(
    (m) => m.id === sel.id || parentMap.get(m.id)?.parentId === sel.id
  );
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

/**
 * Case-insensitive substring match across the thread's IDs and names so an
 * engineer can jump to a thread by typing a PO number, settlement/expense ref,
 * expense UUID, MR number, vendor name, or material / variant name. An empty or
 * whitespace-only term passes everything.
 */
export function matchesSearch(t: SearchFilterable, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const fields = [
    t.material_name,
    t.request_number,
    t.po?.po_number,
    t.po?.vendor_name,
    t.settlement?.expense_ref,
    t.settlement?.expense_id,
    ...(t.variants?.map((v) => v.material_name) ?? []),
  ];
  return fields.some((f) => f != null && f.toLowerCase().includes(q));
}
