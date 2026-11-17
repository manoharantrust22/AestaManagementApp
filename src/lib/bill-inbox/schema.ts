/**
 * Bill Inbox extraction shape (client-safe: no server imports).
 *
 * The reader (src/lib/bill-inbox/extract.ts) returns BillExtraction. The review
 * screen turns it into the existing AiPurchaseOutput so the AI-ingestion
 * preview and the ingest_purchase_atomic save path are reused unchanged.
 */

import { z } from "zod";

import { MATERIAL_UNITS, type AiPurchaseOutput } from "@/lib/ai-ingestion/schemas";

export const DOC_KINDS = [
  "tax_invoice",
  "cash_bill",
  "estimate",
  "quotation",
  "transport_slip",
  "payment_receipt",
  "other",
] as const;
export type BillDocKind = (typeof DOC_KINDS)[number] | "unknown";

export const DOC_KIND_LABEL: Record<BillDocKind, string> = {
  unknown: "Not read yet",
  tax_invoice: "GST invoice",
  cash_bill: "Cash bill",
  estimate: "Estimate",
  quotation: "Quotation",
  transport_slip: "Transport slip",
  payment_receipt: "Payment receipt",
  other: "Other",
};

const num = z.preprocess((raw) => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[₹$,\s]/g, "").replace(/^rs\.?/i, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

const str = z.preprocess((raw) => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return String(raw);
  const t = raw.trim();
  return t === "" ? null : t;
}, z.string().nullable());

const isoDate = z.preprocess((raw) => {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}, z.string().nullable());

const unit = z.preprocess(
  (raw) => (typeof raw === "string" && (MATERIAL_UNITS as readonly string[]).includes(raw.trim()) ? raw.trim() : "nos"),
  z.enum(MATERIAL_UNITS),
);

const confidence = z.preprocess((raw) => {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}, z.number().nullable());

export const billExtractionItemSchema = z.object({
  name: z.preprocess((raw) => (typeof raw === "string" && raw.trim() ? raw.trim() : "Unreadable item"), z.string()),
  raw_text: str.default(null),
  local_name: str.default(null),
  category_hint: str.default(null),
  brand: str.default(null),
  quantity: num.default(null),
  unit: unit.default("nos"),
  unit_price: num.default(null),
  line_total: num.default(null),
  hsn_code: str.default(null),
  gst_rate: num.default(null),
  pack_size: str.default(null),
});

export const billExtractionSchema = z.object({
  doc_kind: z.preprocess(
    (raw) => (typeof raw === "string" && (DOC_KINDS as readonly string[]).includes(raw) ? raw : "other"),
    z.enum(DOC_KINDS),
  ),
  vendor: z
    .object({
      name: str.default(null),
      phone: str.default(null),
      gst_number: str.default(null),
      city: str.default(null),
    })
    .default({ name: null, phone: null, gst_number: null, city: null }),
  invoice_no: str.default(null),
  bill_date: isoDate.default(null),
  subtotal: num.default(null),
  discount: num.default(null),
  round_off: num.default(null),
  tax_amount: num.default(null),
  transport_cost: num.default(null),
  total_amount: num.default(null),
  items: z.array(billExtractionItemSchema).default([]),
  confidence: z
    .object({
      overall: confidence.default(null),
      vendor: confidence.default(null),
      total: confidence.default(null),
      items: confidence.default(null),
    })
    .default({ overall: null, vendor: null, total: null, items: null }),
  reader_notes: str.default(null),
});

export type BillExtraction = z.infer<typeof billExtractionSchema>;
export type BillExtractionItem = z.infer<typeof billExtractionItemSchema>;

/** Below this overall confidence a reading is flagged for review. */
export const LOW_CONFIDENCE = 0.6;

/** Normalised GSTIN (15 chars) or null. */
export function normalizeGstin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const g = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^[0-9]{2}[0-9A-Z]{13}$/.test(g) ? g : null;
}

/** Invoice numbers compared loosely: "5198/26-27", "No. 5198 / 26-27" -> "5198/26-27". */
export function normalizeInvoiceNo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .toLowerCase()
    .replace(/^(inv(oice)?|bill|no|cr|sl)\.?\s*(no\.?)?\s*[:#-]?\s*/i, "")
    .replace(/\s+/g, "");
  return s === "" ? null : s;
}

/**
 * Sanity checks on a reading. Returned as plain sentences for the review screen.
 * Line sums often differ from the total on Indian bills (discount, round-off,
 * "cash dis"), so a mismatch is a warning, never a block.
 */
export function extractionWarnings(x: BillExtraction): string[] {
  const out: string[] = [];
  if (!x.vendor.name) out.push("Shop name not found on the bill. Add it before saving.");
  if (x.total_amount == null) out.push("Bill total not found.");
  if (!x.bill_date) out.push("Bill date not found. The capture date will be used unless you change it.");
  if (x.items.length === 0) out.push("No item lines found.");
  const missingPrice = x.items.filter((i) => i.unit_price == null && i.line_total == null).length;
  if (missingPrice > 0) out.push(`${missingPrice} line${missingPrice === 1 ? "" : "s"} without a price.`);
  if (x.total_amount != null && x.items.length > 0) {
    const lines = x.items.reduce((s, i) => s + lineAmount(i), 0);
    const extras = -(x.discount ?? 0) + (x.round_off ?? 0) + (x.transport_cost ?? 0);
    // Lines may be printed with or without tax, so accept either reading.
    const candidates = [lines, lines + extras, lines + extras + (x.tax_amount ?? 0)];
    const tolerance = Math.max(2, x.total_amount * 0.02);
    if (!candidates.some((c) => Math.abs(c - x.total_amount!) <= tolerance)) {
      out.push(
        `Lines add up to ${formatInr(lines)} but the bill total is ${formatInr(x.total_amount)}. Check quantities, prices and discounts.`,
      );
    }
  }
  return out;
}

function lineAmount(i: BillExtractionItem): number {
  if (i.line_total != null) return i.line_total;
  if (i.quantity != null && i.unit_price != null) return i.quantity * i.unit_price;
  return 0;
}

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Convert a reading into the AI-ingestion purchase shape. Fills gaps so the
 * existing preview can render; the reviewer corrects what is wrong.
 *
 * - vendorName overrides the read name (used when someone fills a pending name).
 * - Missing unit price is derived from line_total / quantity.
 * - Missing quantity defaults to 1 with the line total as the price.
 */
export function toPurchaseOutput(
  x: BillExtraction,
  opts: { vendorName?: string | null; fallbackDate?: string | null; totalAmount?: number | null } = {},
): AiPurchaseOutput {
  const items = x.items
    .filter((i) => i.quantity != null || i.unit_price != null || i.line_total != null)
    .map((i) => {
      let quantity = i.quantity != null && i.quantity > 0 ? i.quantity : null;
      let unitPrice = i.unit_price;
      if (unitPrice == null && i.line_total != null) {
        unitPrice = quantity ? i.line_total / quantity : i.line_total;
      }
      if (quantity == null) quantity = 1;
      return {
        name: i.name,
        local_name: i.local_name,
        category_hint: i.category_hint,
        brand: i.brand,
        quantity,
        unit: i.unit,
        unit_price: Math.max(0, Math.round((unitPrice ?? 0) * 100) / 100),
        hsn_code: i.hsn_code,
        gst_rate: i.gst_rate,
        pack_size: i.pack_size,
      };
    });

  const lineSum = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const total = opts.totalAmount ?? x.total_amount ?? (lineSum > 0 ? Math.round(lineSum * 100) / 100 : 0);

  return {
    kind: "purchase",
    vendor: {
      name: (opts.vendorName ?? x.vendor.name ?? "").trim(),
      phone: x.vendor.phone,
      gst_number: normalizeGstin(x.vendor.gst_number) ?? x.vendor.gst_number,
      city: x.vendor.city,
    },
    invoice_no: x.invoice_no,
    purchase_date: x.bill_date ?? opts.fallbackDate ?? null,
    transport_cost: x.transport_cost,
    total_amount: total,
    items,
  };
}
