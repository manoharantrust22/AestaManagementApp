/**
 * Tolerant LLM-output parser for the Backfill AI ingest flow.
 *
 * Handles:
 *  - Field name variations: qty | quantity, amount | total | line_total,
 *    purchase_date | date | purchaseDate, paid_by | paidBy, group_split |
 *    groupSplit, etc.
 *  - Catalog matching: vendor + material names matched case-insensitively
 *    against existing IDs; unmatched flagged via _vendorIsDraft /
 *    _materialIsDraft.
 *  - Wrapper objects: handled by the caller (parseBackfillResponse), which
 *    unwraps {records:[...]}, {items:[...]}, {purchases:[...]} before passing
 *    rows to normalizeBackfillRow.
 *
 * Mirrors `normalizeBackfillRow()` in docs/Historical_Material_Backfill/proto-backfill.jsx.
 */

import type {
  BackfillCatalogVendor,
  BackfillCatalogMaterial,
} from "./buildBackfillPrompt";

export interface BackfillPreviewRow {
  /** include in commit (preview-table checkbox) */
  _include: boolean;
  _vendorIsDraft: boolean;
  _materialIsDraft: boolean;

  /** Existing vendor id when matched; null when draft. */
  vendor_id: string | null;
  /** Display name (what'll go into the draft if not matched). */
  vendor: string;

  /** Existing material id when matched; null when draft. */
  material_id: string | null;
  material: string;
  material_spec?: string;

  qty: number;
  unit: string;
  amount: number;
  purchase_date: string;
  section: string;
  kind: "own" | "group";
  group_split?: { site_id: string; pct: number }[];
  payment_status: "settled" | "pending";
  paid_by: "office" | "wallet" | "site";
  used_qty: number;
  notes: string;
}

/**
 * Parses an LLM response string into preview rows. Unwraps wrapper objects
 * the AI commonly returns ({records:[...]}, {items:[...]}, {purchases:[...]})
 * and applies normalizeBackfillRow to each entry. Throws on hard parse error.
 */
export function parseBackfillResponse(
  text: string,
  vendors: BackfillCatalogVendor[],
  materials: BackfillCatalogMaterial[]
): BackfillPreviewRow[] {
  const raw = JSON.parse(text);
  const arr = Array.isArray(raw)
    ? raw
    : raw?.records ?? raw?.items ?? raw?.purchases ?? raw?.data;
  if (!Array.isArray(arr)) {
    throw new Error(
      "Expected a JSON array (or an object with a `records`, `items`, or `purchases` array)."
    );
  }
  return arr.map((r) => normalizeBackfillRow(r, vendors, materials));
}

function pickNumber(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (c == null) continue;
    const n = typeof c === "number" ? c : parseFloat(String(c));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function pickString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s.length > 0) return s;
  }
  return "";
}

export function normalizeBackfillRow(
  raw: any,
  vendors: BackfillCatalogVendor[],
  materials: BackfillCatalogMaterial[]
): BackfillPreviewRow {
  const vendorName = pickString(raw?.vendor, raw?.vendor_name, raw?.shop);
  const matchedVendor = vendorName
    ? vendors.find(
        (v) =>
          v.name.toLowerCase() === vendorName.toLowerCase() ||
          v.id === raw?.vendor_id
      )
    : undefined;

  const materialName = pickString(
    raw?.material,
    raw?.material_name,
    raw?.item
  );
  const matchedMaterial = materialName
    ? materials.find(
        (m) =>
          m.name.toLowerCase() === materialName.toLowerCase() ||
          m.id === raw?.material_id
      )
    : undefined;

  const qty = pickNumber(raw?.qty, raw?.quantity);
  const amount = pickNumber(raw?.amount, raw?.total, raw?.line_total);
  const purchaseDate = pickString(
    raw?.purchase_date,
    raw?.date,
    raw?.purchaseDate
  );

  const kindRaw = String(raw?.kind ?? "own").toLowerCase();
  const kind: "own" | "group" = kindRaw === "group" ? "group" : "own";

  const splitRaw = raw?.group_split ?? raw?.groupSplit;
  const groupSplit =
    kind === "group" && Array.isArray(splitRaw)
      ? splitRaw.map((s: any) => ({
          site_id: pickString(s?.site_id, s?.siteId, s?.site),
          pct: pickNumber(s?.pct, s?.percentage, s?.percent),
        }))
      : undefined;

  const paymentStatusRaw = pickString(
    raw?.payment_status,
    raw?.paymentStatus
  );
  const payment_status: "settled" | "pending" =
    paymentStatusRaw === "pending" ? "pending" : "settled";

  const paidByRaw = pickString(raw?.paid_by, raw?.paidBy).toLowerCase();
  const paid_by: "office" | "wallet" | "site" =
    paidByRaw === "wallet" ? "wallet" : paidByRaw === "site" ? "site" : "office";

  const include =
    !!vendorName &&
    !!materialName &&
    qty > 0 &&
    amount > 0 &&
    !!purchaseDate;

  return {
    _include: include,
    _vendorIsDraft: !!vendorName && !matchedVendor,
    _materialIsDraft: !!materialName && !matchedMaterial,
    vendor_id: matchedVendor?.id ?? null,
    vendor: matchedVendor?.name ?? vendorName,
    material_id: matchedMaterial?.id ?? null,
    material: matchedMaterial?.name ?? materialName,
    material_spec: pickString(raw?.material_spec, raw?.materialSpec, raw?.spec),
    qty,
    unit: pickString(raw?.unit, matchedMaterial?.unit) || "piece",
    amount,
    purchase_date: purchaseDate,
    section: pickString(raw?.section) || "Historical",
    kind,
    group_split: groupSplit,
    payment_status,
    paid_by,
    used_qty: pickNumber(raw?.used_qty, raw?.usedQty),
    notes: pickString(raw?.notes),
  };
}
