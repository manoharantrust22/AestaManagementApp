/**
 * Types for the company contact Directory (/company/directory).
 *
 * The directory aggregates four contact sources into one searchable,
 * tap-to-call list:
 *  - `technician` — the new, editable `technicians` store (phone-only
 *    contacts: electricians, CCTV dealers, carpenters, borewell, etc.)
 *  - `laborer`    — existing labor catalog rows that have a phone
 *  - `vendor`     — existing active vendors/dealers that have a phone
 *  - `mestri`     — team leaders (from `teams`)
 *
 * Only `technician` rows are editable on the page; the others are read-only
 * with a "view full profile →" deep link.
 *
 * We deliberately hand-roll the `TechnicianRow` shape rather than depend on
 * the generated Supabase types: the `technicians` table is queried via the
 * `from("technicians" as any)` escape hatch (same pattern the codebase uses
 * for `laborer_skills`), so the feature doesn't block on a types regen.
 */

/** Contact kind stored on a `technicians` row. */
export type ContactKind = "technician" | "brand";

/** A row of the `technicians` table. */
export interface TechnicianRow {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  trade: string | null;
  specialties: string[];
  area: string | null;
  worked_with: boolean;
  photo_url: string | null;
  notes: string | null;
  /** technician (default) | brand (manufacturer/brand quick-contact). */
  contact_kind: ContactKind;
  /** Optional brand portal / support URL (mainly for brand contacts). */
  website: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** The editable fields of a technician (create + update form payload). */
export interface TechnicianFormData {
  name: string;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  trade: string | null;
  specialties: string[];
  area: string | null;
  worked_with: boolean;
  photo_url: string | null;
  notes: string | null;
  contact_kind: ContactKind;
  website: string | null;
}

export type DirectorySource =
  | "technician"
  | "brand"
  | "laborer"
  | "vendor"
  | "mestri";

/** A normalized contact, regardless of its underlying source table. */
export interface DirectoryEntry {
  source: DirectorySource;
  /** Namespaced id, unique across sources: `tech:<uuid>`, `lab:<uuid>`, etc. */
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  /** Primary trade / specialty label (display + filter). */
  trade: string | null;
  /** Extra specialties / skills (filterable, shown as chips). */
  secondaryTrades: string[];
  area: string | null;
  photoUrl: string | null;
  workedWith: boolean;
  notes: string | null;
  /** Brand portal / support URL (brand contacts only). */
  website?: string | null;
  /** Deep link to the source's own page; null for editable technicians/brands. */
  profileHref: string | null;
  /** A laborer who is also a team leader (counts as both laborer & mestri). */
  alsoMestri?: boolean;
  /** Present for `technicians`-table rows (`technician` & `brand`), to hydrate edit. */
  rawTechnician?: TechnicianRow;
}

/** Data returned by the server loader for the directory page. */
export interface DirectoryPageData {
  /** Non-technician entries (laborers, vendors, mestris) — read-only this session. */
  entries: DirectoryEntry[];
  /** Raw technician rows for the live React Query cache (drives add/edit/delete). */
  technicians: TechnicianRow[];
  /** Options for the trade autocomplete: labor categories ∪ TECHNICIAN_TRADES. */
  tradeOptions: string[];
}

/**
 * Curated technician trades. Powers the trade autocomplete together with the
 * live `labor_categories` names. Free-text entry is still allowed; this list
 * just covers the common construction trades (incl. ones with no labor
 * category, like CCTV / Borewell) and sets the leftmost chip order.
 */
export const TECHNICIAN_TRADES: string[] = [
  "Electrician",
  "Plumber",
  "Carpenter",
  "Painter",
  "Mason",
  "Welder",
  "Fabricator",
  "CCTV",
  "Borewell",
  "Pump / Motor",
  "Tiles",
  "Flooring",
  "POP / False Ceiling",
  "Aluminium / Glass",
  "Grill / Gate",
  "Waterproofing",
  "Interior",
  "AC / Refrigeration",
  "JCB / Earthmover",
  "Surveyor",
  "Lift / Elevator",
];

/** Per-source display metadata (chip label + MUI color). */
export const SOURCE_META: Record<
  DirectorySource,
  {
    label: string;
    plural: string;
    color: "primary" | "info" | "secondary" | "warning" | "success";
  }
> = {
  technician: { label: "Technician", plural: "Technicians", color: "primary" },
  brand: { label: "Brand", plural: "Brands", color: "success" },
  laborer: { label: "Laborer", plural: "Laborers", color: "info" },
  vendor: { label: "Vendor", plural: "Vendors", color: "secondary" },
  mestri: { label: "Mestri", plural: "Mestris", color: "warning" },
};
