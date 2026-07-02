/**
 * Pure helpers for the contact Directory: trade canonicalization, vendor-type
 * humanization, and normalization of the four contact sources into one
 * `DirectoryEntry[]` (with the mestri↔laborer dedupe).
 *
 * Everything here is side-effect free (no Supabase, no React) so it can be
 * unit-tested directly and shared between the server loader and the client.
 */

import {
  DirectoryEntry,
  DirectorySource,
  TECHNICIAN_TRADES,
  TechnicianRow,
} from "@/types/directory.types";

// ---------------------------------------------------------------------------
// Trade canonicalization
// ---------------------------------------------------------------------------

/**
 * Synonyms that collapse the same trade expressed differently across sources
 * (free-text technician trade vs FK laborer category vs vendor specialization).
 * Keys are already lowercased/space-collapsed. This is the single fix-point for
 * label-matching drift.
 */
const TRADE_SYNONYMS: Record<string, string> = {
  electrical: "electrician",
  electric: "electrician",
  carpentry: "carpenter",
  plumbing: "plumber",
  painting: "painter",
  masonry: "mason",
  helper: "helper",
  "cctv camera": "cctv",
  "cctv cameras": "cctv",
  "false ceiling": "pop / false ceiling",
  pop: "pop / false ceiling",
  fabrication: "fabricator",
  welding: "welder",
  "bore well": "borewell",
  "bore-well": "borewell",
  tile: "tiles",
  tiling: "tiles",
};

/** Normalize a trade label to a canonical key for matching/grouping. */
export function canonicalTrade(label?: string | null): string {
  if (!label) return "";
  const base = label.trim().toLowerCase().replace(/\s+/g, " ");
  return TRADE_SYNONYMS[base] ?? base;
}

/**
 * Build the trade autocomplete options: TECHNICIAN_TRADES first (preserving
 * order), then any labor-category names not already covered, deduped by
 * canonical key (case/synonym-insensitive).
 */
export function buildTradeOptions(categoryNames: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of [...TECHNICIAN_TRADES, ...categoryNames]) {
    const key = canonicalTrade(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

const VENDOR_TYPE_LABELS: Record<string, string> = {
  shop: "Shop",
  dealer: "Dealer",
  manufacturer: "Manufacturer",
  individual: "Individual",
  rental_store: "Rental store",
};

export function humanizeVendorType(type?: string | null): string | null {
  if (!type) return null;
  return VENDOR_TYPE_LABELS[type] ?? type;
}

// ---------------------------------------------------------------------------
// Source → DirectoryEntry mapping
// ---------------------------------------------------------------------------

/**
 * Map a `technicians` row to a directory entry (also used live, post-mutation).
 *
 * The same table backs both individual technicians and lightweight brand /
 * manufacturer quick-contacts, discriminated by `contact_kind`. Brand rows map
 * to their own `brand` source (own filter chip + card tag) and drop the
 * technician-only fields (area, worked_with, secondary specialties) so a
 * technician→brand switch doesn't surface stale data.
 */
export function technicianToEntry(t: TechnicianRow): DirectoryEntry {
  const isBrand = t.contact_kind === "brand";
  return {
    source: isBrand ? "brand" : "technician",
    id: isBrand ? `brand:${t.id}` : `tech:${t.id}`,
    name: t.name,
    phone: t.phone,
    whatsapp: t.whatsapp_number,
    email: t.email,
    trade: t.trade,
    secondaryTrades: isBrand ? [] : t.specialties ?? [],
    area: isBrand ? null : t.area,
    photoUrl: t.photo_url,
    workedWith: isBrand ? false : t.worked_with,
    notes: t.notes,
    website: t.website ?? null,
    profileHref: null,
    rawTechnician: t,
  };
}

// Light input shapes for normalizeDirectory (already flattened by the loader).
export interface RawLaborer {
  id: string;
  name: string;
  phone: string | null;
  category_name: string | null;
  /** category_ids from laborer_skills (incl. the primary). */
  skillCategoryIds: string[];
  address: string | null;
  photo_url: string | null;
}

export interface RawVendor {
  id: string;
  name: string;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  contact_person: string | null;
  vendor_type: string | null;
  specializations: string[] | null;
  serving_locations: string[] | null;
  shop_photo_url: string | null;
}

export interface RawTeam {
  id: string;
  name: string | null;
  leader_name: string | null;
  leader_phone: string | null;
  leader_laborer_id: string | null;
}

export interface NormalizeInput {
  technicians: TechnicianRow[];
  laborers: RawLaborer[];
  vendors: RawVendor[];
  teams: RawTeam[];
  /** category_id → name, to resolve laborer skill names. */
  categoryNameById: Record<string, string>;
}

/**
 * Normalize all four sources into one `DirectoryEntry[]`.
 *
 * Mestri↔laborer dedupe (mirrors /company/laborers detection): a laborer whose
 * id matches a team's `leader_laborer_id`, or whose name matches a legacy
 * text-only `leader_name`, is flagged `alsoMestri` and does NOT also appear as a
 * standalone mestri row. A team becomes a standalone mestri only when its leader
 * isn't already present as a laborer entry AND it has a phone to call.
 */
export function normalizeDirectory({
  technicians,
  laborers,
  vendors,
  teams,
  categoryNameById,
}: NormalizeInput): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];

  // 1. Technicians
  for (const t of technicians) {
    if (t.is_active === false) continue;
    entries.push(technicianToEntry(t));
  }

  // Mestri detection sets (mirror laborers-content.tsx)
  const mestriFkSet = new Set<string>();
  const mestriNameSet = new Set<string>();
  for (const t of teams) {
    if (t.leader_laborer_id) {
      mestriFkSet.add(t.leader_laborer_id);
    } else if (t.leader_name) {
      mestriNameSet.add(t.leader_name.trim().toLowerCase());
    }
  }

  const presentLaborerIds = new Set(laborers.map((l) => l.id));
  const presentLaborerNames = new Set(
    laborers.map((l) => (l.name || "").trim().toLowerCase())
  );

  // 2. Laborers (with phone)
  for (const l of laborers) {
    const nameKey = (l.name || "").trim().toLowerCase();
    const alsoMestri = mestriFkSet.has(l.id) || mestriNameSet.has(nameKey);
    const skillNames = Array.from(
      new Set(
        (l.skillCategoryIds ?? [])
          .map((cid) => categoryNameById[cid])
          .filter((n): n is string => !!n && n !== l.category_name)
      )
    );
    entries.push({
      source: "laborer",
      id: `lab:${l.id}`,
      name: l.name,
      phone: l.phone,
      whatsapp: null,
      email: null,
      trade: l.category_name || null,
      secondaryTrades: skillNames,
      area: l.address || null,
      photoUrl: l.photo_url,
      workedWith: true,
      notes: null,
      profileHref: "/company/laborers",
      alsoMestri,
    });
  }

  // 3. Standalone mestris (leader not already shown as a laborer, and callable)
  const seenMestriNames = new Set<string>();
  for (const t of teams) {
    const nameKey = (t.leader_name || "").trim().toLowerCase();
    if (!nameKey) continue;
    const linkedPresent =
      (t.leader_laborer_id && presentLaborerIds.has(t.leader_laborer_id)) ||
      presentLaborerNames.has(nameKey);
    if (linkedPresent) continue; // already represented (and flagged alsoMestri)
    if (seenMestriNames.has(nameKey)) continue; // dedupe multiple teams, same leader
    if (!t.leader_phone) continue; // no way to reach them → skip
    seenMestriNames.add(nameKey);
    entries.push({
      source: "mestri",
      id: `mes:${t.id}`,
      name: t.leader_name as string,
      phone: t.leader_phone,
      whatsapp: null,
      email: null,
      trade: "Mestri / Team Leader",
      secondaryTrades: [],
      area: null,
      photoUrl: null,
      workedWith: true,
      notes: t.name ? `Team: ${t.name}` : null,
      profileHref: "/company/teams",
    });
  }

  // 4. Vendors (with phone)
  for (const v of vendors) {
    const specs = (v.specializations ?? []).filter(Boolean);
    const primaryTrade = specs[0] ?? humanizeVendorType(v.vendor_type);
    entries.push({
      source: "vendor",
      id: `ven:${v.id}`,
      name: v.name,
      phone: v.phone,
      whatsapp: v.whatsapp_number,
      email: v.email,
      trade: primaryTrade,
      secondaryTrades: specs.slice(1),
      area: (v.serving_locations ?? []).filter(Boolean)[0] ?? null,
      photoUrl: v.shop_photo_url,
      workedWith: true,
      notes: v.contact_person ? `Contact: ${v.contact_person}` : null,
      profileHref: "/company/vendors",
    });
  }

  return entries;
}

/** Count entries per source (an alsoMestri laborer counts as both). */
export function sourceCountsOf(
  entries: DirectoryEntry[]
): Record<DirectorySource, number> {
  const counts: Record<DirectorySource, number> = {
    technician: 0,
    brand: 0,
    laborer: 0,
    vendor: 0,
    mestri: 0,
  };
  for (const e of entries) {
    counts[e.source] += 1;
    if (e.source === "laborer" && e.alsoMestri) counts.mestri += 1;
  }
  return counts;
}

/**
 * Distinct trades present across all entries, ordered for filter chips:
 * TECHNICIAN_TRADES order first, then remaining by descending frequency.
 * Returns `{ key, label, count }` where `key` is the canonical match key.
 */
export function tradeChipsOf(
  entries: DirectoryEntry[]
): Array<{ key: string; label: string; count: number }> {
  const map = new Map<string, { label: string; count: number }>();
  for (const e of entries) {
    // Brand contacts carry a product category, not a construction trade —
    // keep them out of the trade rail (they have their own "Brands" chip).
    if (e.source === "brand") continue;
    const labels = [e.trade, ...e.secondaryTrades].filter(Boolean) as string[];
    const seenForEntry = new Set<string>();
    for (const lab of labels) {
      const key = canonicalTrade(lab);
      if (!key || seenForEntry.has(key)) continue;
      seenForEntry.add(key);
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { label: lab, count: 1 });
    }
  }
  const order = new Map<string, number>();
  TECHNICIAN_TRADES.forEach((t, i) => order.set(canonicalTrade(t), i));
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => {
      const ai = order.has(a.key) ? order.get(a.key)! : Infinity;
      const bi = order.has(b.key) ? order.get(b.key)! : Infinity;
      if (ai !== bi) return ai - bi;
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
}
