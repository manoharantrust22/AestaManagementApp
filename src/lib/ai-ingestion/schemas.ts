/**
 * Zod schemas for AI-extracted payloads (Purchase / Quotation / Warranty).
 *
 * Two layers:
 *   1. AI-output schemas — match exactly what the AI returns when given the
 *      prompt template. Permissive on fields the AI commonly drops or fills
 *      with empty strings.
 *   2. Resolved-payload schemas — what the client sends to the ingest RPC
 *      after the user confirms in the preview UI. Has resolved UUIDs.
 *
 * The runtime validator strips currency symbols / commas from numeric fields
 * before parsing, since AI output sometimes leaks "₹" or "1,500" through.
 */

import { z } from "zod";

import type { MaterialUnit } from "@/types/material.types";

// ============================================================================
// Shared primitives
// ============================================================================

/**
 * Material unit enum mirroring the Postgres `material_unit` type. Kept here
 * (rather than imported from `material.types.ts` directly as a Zod enum) so
 * the Zod tree compiles without circular imports.
 */
export const MATERIAL_UNITS = [
  "kg",
  "g",
  "ton",
  "liter",
  "ml",
  "piece",
  "bag",
  "bundle",
  "sqft",
  "sqm",
  "cft",
  "cum",
  "nos",
  "rmt",
  "box",
  "set",
] as const satisfies readonly MaterialUnit[];

export const materialUnitSchema = z.enum(MATERIAL_UNITS);

/**
 * Coerce a stringified or symbol-prefixed number ("₹1,500", "1,500.00", " 1500 ")
 * into a clean number. AI output frequently leaks these despite the prompt rule.
 */
const coerceNumber = z.preprocess((raw) => {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== "string") return raw;
  const cleaned = raw.replace(/[₹$€£¥]/g, "").replace(/,/g, "").trim();
  if (cleaned === "") return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : raw;
}, z.number());

const optionalCoerceNumber = coerceNumber.optional().nullable();

const trimmedString = z.preprocess((raw) => {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  return t === "" ? undefined : t;
}, z.string());

const optionalTrimmedString = trimmedString.optional().nullable();

const isoDateOrNull = z.preprocess((raw) => {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if (t === "") return undefined;
  // Accept YYYY-MM-DD strictly; further parsing happens in the UI via dayjs.
  return t;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")).optional().nullable();

// ============================================================================
// AI-output schemas
// ============================================================================

/**
 * AI returns category as a "Parent > Child" hint string. The client splits
 * it before sending to the RPC.
 */
const categoryHintSchema = optionalTrimmedString;

const aiVendorSchema = z.object({
  name: trimmedString,
  phone: optionalTrimmedString,
  gst_number: optionalTrimmedString,
  city: optionalTrimmedString,
});

const aiPurchaseItemSchema = z.object({
  name: trimmedString,
  local_name: optionalTrimmedString,
  category_hint: categoryHintSchema,
  brand: optionalTrimmedString,
  quantity: coerceNumber.refine((n) => n > 0, "quantity must be > 0"),
  unit: materialUnitSchema,
  unit_price: coerceNumber.refine((n) => n >= 0, "unit_price must be >= 0"),
  hsn_code: optionalTrimmedString,
  gst_rate: optionalCoerceNumber,
  /** Standard pack/can size for packaged goods, e.g. "5L can", "20kg bag". */
  pack_size: optionalTrimmedString,
});

/** Per-bill fields shared by the single-purchase and batch schemas. */
const aiPurchaseBodyShape = {
  vendor: aiVendorSchema,
  invoice_no: optionalTrimmedString,
  purchase_date: isoDateOrNull,
  transport_cost: optionalCoerceNumber,
  total_amount: coerceNumber.refine((n) => n > 0, "total_amount must be > 0"),
  items: z.array(aiPurchaseItemSchema).min(1, "At least one item is required"),
};

export const aiPurchaseOutputSchema = z.object({
  kind: z.literal("purchase"),
  ...aiPurchaseBodyShape,
});

export type AiPurchaseOutput = z.infer<typeof aiPurchaseOutputSchema>;

/**
 * Multi-bill batch: an array of independent purchases — each its own vendor,
 * date, items, and total (bills in a stack are routinely from different shops
 * on different days). `kind` per item defaults to "purchase" so the AI may
 * omit it; each item is shape-identical to AiPurchaseOutput so the batch mode
 * can feed it straight into the single-bill resolver/commit.
 */
const aiPurchaseBatchItemSchema = z.object({
  kind: z.literal("purchase").default("purchase"),
  ...aiPurchaseBodyShape,
});

export const aiPurchaseBatchOutputSchema = z.object({
  kind: z.literal("purchase_batch"),
  purchases: z.array(aiPurchaseBatchItemSchema).min(1, "At least one bill is required"),
});

export type AiPurchaseBatchOutput = z.infer<typeof aiPurchaseBatchOutputSchema>;

const aiQuotationItemSchema = aiPurchaseItemSchema.extend({
  quantity: optionalCoerceNumber,
});

export const aiQuotationOutputSchema = z.object({
  kind: z.literal("quotation"),
  vendor: aiVendorSchema,
  quote_no: optionalTrimmedString,
  quoted_on: isoDateOrNull,
  valid_until: isoDateOrNull,
  subtotal: optionalCoerceNumber,
  total_amount: optionalCoerceNumber,
  items: z.array(aiQuotationItemSchema).min(1, "At least one item is required"),
});

export type AiQuotationOutput = z.infer<typeof aiQuotationOutputSchema>;

const aiWarrantyItemSchema = z.object({
  name: trimmedString,
  serial_number: optionalTrimmedString,
  model_number: optionalTrimmedString,
  warranty_months: coerceNumber.refine((n) => n > 0, "warranty_months must be > 0"),
  warranty_start_date: isoDateOrNull,
});

export const aiWarrantyOutputSchema = z.object({
  kind: z.literal("warranty"),
  vendor_hint: optionalTrimmedString,
  brand_hint: optionalTrimmedString,
  purchase_date_hint: isoDateOrNull,
  items: z.array(aiWarrantyItemSchema).min(1, "At least one item is required"),
  warranty_notes: optionalTrimmedString,
});

export type AiWarrantyOutput = z.infer<typeof aiWarrantyOutputSchema>;

export const aiOutputSchema = z.discriminatedUnion("kind", [
  aiPurchaseOutputSchema,
  aiQuotationOutputSchema,
  aiWarrantyOutputSchema,
]);

export type AiOutput = z.infer<typeof aiOutputSchema>;

// ============================================================================
// Resolved-payload schemas (what we send to the ingest RPCs)
// ============================================================================

const resolvedCategorySchema = z.object({
  id: z.string().uuid().nullable(),
  parent_name: optionalTrimmedString,
  child_name: optionalTrimmedString,
});

const resolvedBrandSchema = z.object({
  id: z.string().uuid().nullable(),
  name: optionalTrimmedString,
});

const resolvedVendorSchema = z.object({
  id: z.string().uuid().nullable(),
  name: trimmedString,
  phone: optionalTrimmedString,
  gst_number: optionalTrimmedString,
  city: optionalTrimmedString,
  vendor_type: optionalTrimmedString,
});

const resolvedItemBaseSchema = z.object({
  material_id: z.string().uuid().nullable(),
  name: trimmedString,
  local_name: optionalTrimmedString,
  category: resolvedCategorySchema.nullable(),
  brand: resolvedBrandSchema.nullable(),
  unit: materialUnitSchema,
  unit_price: coerceNumber.refine((n) => n >= 0, "unit_price must be >= 0"),
  hsn_code: optionalTrimmedString,
  gst_rate: optionalCoerceNumber,
  notes: optionalTrimmedString,
});

const resolvedPurchaseItemSchema = resolvedItemBaseSchema.extend({
  quantity: coerceNumber.refine((n) => n > 0, "quantity must be > 0"),
});

export const resolvedPurchasePayloadSchema = z.object({
  site_id: z.string().uuid(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_amount: coerceNumber.refine((n) => n > 0),
  transport_cost: optionalCoerceNumber,
  invoice_no: optionalTrimmedString,
  bill_url: optionalTrimmedString,
  payment_mode: optionalTrimmedString,
  purchase_type: z.enum(["own_site", "group_stock"]).default("own_site"),
  notes: optionalTrimmedString,
  vendor: resolvedVendorSchema,
  items: z.array(resolvedPurchaseItemSchema).min(1),
});

export type ResolvedPurchasePayload = z.infer<typeof resolvedPurchasePayloadSchema>;

const resolvedQuotationItemSchema = resolvedItemBaseSchema.extend({
  quantity: optionalCoerceNumber,
});

export const resolvedQuotationPayloadSchema = z.object({
  quote_no: optionalTrimmedString,
  quoted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bill_url: optionalTrimmedString,
  vendor: resolvedVendorSchema,
  items: z.array(resolvedQuotationItemSchema).min(1),
});

export type ResolvedQuotationPayload = z.infer<typeof resolvedQuotationPayloadSchema>;

export const resolvedWarrantyPayloadSchema = z.object({
  purchase_id: z.string().uuid(),
  warranty_months: coerceNumber.refine((n) => n > 0),
  warranty_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  warranty_serial_numbers: z
    .array(
      z.object({
        item_index: z.number().int().nonnegative(),
        serial: optionalTrimmedString,
        model: optionalTrimmedString,
      }),
    )
    .optional()
    .nullable(),
  warranty_notes: optionalTrimmedString,
  warranty_doc_url: optionalTrimmedString,
});

export type ResolvedWarrantyPayload = z.infer<typeof resolvedWarrantyPayloadSchema>;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Split an AI-supplied "Parent > Child" hint into structured parts.
 * Tolerates "Parent>Child", "Parent / Child", and trailing whitespace.
 */
export function splitCategoryHint(hint: string | null | undefined): {
  parent_name: string | null;
  child_name: string | null;
} {
  if (!hint) return { parent_name: null, child_name: null };
  const parts = hint
    .split(/[>\/]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return { parent_name: null, child_name: null };
  if (parts.length === 1) return { parent_name: null, child_name: parts[0] };
  return { parent_name: parts[0], child_name: parts.slice(1).join(" > ") };
}
