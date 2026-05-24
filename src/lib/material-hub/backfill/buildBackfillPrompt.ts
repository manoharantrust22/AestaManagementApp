/**
 * Catalog-aware prompt builder for the Backfill AI ingest flow.
 *
 * The prompt embeds the user's live vendor + material catalogs + cluster site
 * IDs so the LLM tries to match to existing IDs first, only flagging genuinely
 * new ones as drafts.
 *
 * Mirrors `buildBackfillPrompt()` in docs/Historical_Material_Backfill/proto-backfill.jsx.
 */

export interface BackfillCatalogVendor {
  id: string;
  name: string;
}

export interface BackfillCatalogMaterial {
  id: string;
  name: string;
  unit: string | null;
  description?: string | null;
}

export interface BackfillCatalogSite {
  id: string;
  name: string;
}

export interface BuildBackfillPromptInput {
  vendors: BackfillCatalogVendor[];
  materials: BackfillCatalogMaterial[];
  sites: BackfillCatalogSite[];
}

export function buildBackfillPrompt(input: BuildBackfillPromptInput): string {
  const vendorLines = input.vendors
    .map((v) => `  - ${v.name} (id: ${v.id})`)
    .join("\n");

  const materialLines = input.materials
    .map((m) => {
      const spec = m.description ? ` · ${m.description}` : "";
      return `  - ${m.name}${spec} (id: ${m.id}, unit: ${m.unit ?? "piece"})`;
    })
    .join("\n");

  const siteLines = input.sites
    .map((s) => `  - ${s.name} (id: ${s.id})`)
    .join("\n");

  return `You are helping me bulk-import historical material purchase records into our construction site app (Aesta).

I'll attach photos of past purchase bills. Read each bill and return a JSON array of records — one object per material line item.

# Output schema

Return ONLY a JSON array. Each object MUST have these fields:

{
  "vendor": "string — vendor name as shown on bill",
  "material": "string — material name as shown on bill",
  "material_spec": "string — spec like '50kg bag · OPC 53 grade' (optional)",
  "qty": number,
  "unit": "string — bag | kg | cft | tonne | nos | piece | m | unit",
  "amount": number — total for this line in INR (just the number, no commas),
  "purchase_date": "YYYY-MM-DD",
  "section": "string — e.g. Foundation, Slab, Plaster (optional)",
  "kind": "own" | "group",
  "group_split": [{ "site_id": "<uuid from site catalog below>", "pct": number }] — only when kind is "group", must sum to 100,
  "payment_status": "settled" | "pending",
  "paid_by": "office" | "wallet" | "site" — only when payment_status is "settled",
  "used_qty": number — how much of this batch has already been consumed (0 if unknown),
  "notes": "string (optional)"
}

# Vendor catalog — match to existing IDs where possible. New vendor? Use the bill name as-is, we'll save as draft.

${vendorLines || "  (no vendors yet)"}

# Material catalog — match to existing IDs where possible. New material? Use bill name as-is.

${materialLines || "  (no materials yet)"}

# Site IDs (use the exact UUID in group_split.site_id)

${siteLines || "  (no sites in this cluster)"}

# Rules

1. One row per material line item — split bills with multiple materials into multiple rows.
2. ALWAYS use ISO date (YYYY-MM-DD). If only month is shown, use the 15th.
3. Dates MUST be between 2025-11-09 and 2026-05-09 (the historical backfill window).
4. If unsure whether a purchase was "own" or "group", default to "own".
5. For group purchases without explicit split shown on the bill, omit group_split (we'll ask the user).
6. For payment status, look for "PAID" stamps, signatures, or "balance" / "due" annotations. Default to "settled" if unclear.
7. used_qty should be 0 unless the bill or my note explicitly says how much was consumed.
8. amounts: just the line total — no GST breakdowns, no truck/loading charges as separate rows.
9. RETURN ONLY THE JSON ARRAY. No markdown, no commentary, no \`\`\`json wrapper.`;
}
