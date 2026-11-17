/**
 * Server-only bill reader: image/PDF bytes -> BillExtraction, via Gemini.
 *
 * Import only from route handlers or scripts (uses GEMINI_API_KEY).
 * The prompt encodes what the 12 sample bills taught us (gap analysis 2.11):
 * printed headers lie ("Quotation" that is a sale), totals are bargained down
 * through discount / round-off, rates can be per sqft while qty is in sheets,
 * fractions like "11/2" mean 1½, and some estimates have no shop name at all.
 */

import { GEMINI_MODEL, getGemini } from "@/lib/ai/gemini";
import { MATERIAL_UNITS } from "@/lib/ai-ingestion/schemas";

import { billExtractionSchema, DOC_KINDS, type BillExtraction } from "./schema";

const PROMPT = `You read construction-material purchase documents from shops in Tamil Nadu, India, for a construction company's purchase records.
The photo may be a printed GST invoice, a printed cash bill, a handwritten estimate, a transport/delivery slip, or a payment receipt (GPay/bank screenshot).
Text may be English, Tamil, or mixed. Return JSON only, matching the schema.

doc_kind:
- "tax_invoice": shows the seller's GSTIN and tax (CGST/SGST/IGST).
- "cash_bill": a printed or handwritten sale bill without GST, even if headed "Quotation" or "Estimate" when it clearly records goods sold (has quantities, amounts and a total, often stamped paid or delivered).
- "estimate" / "quotation": a price offer only, not a sale.
- "transport_slip": freight, lorry, unloading or loading charges.
- "payment_receipt": a UPI/bank payment screenshot or receipt.
- "other": anything else.

vendor (the SELLER, never the buyer; the buyer is usually AESTA or Hari Babu):
- name: the shop name in English as printed. If the shop name is blank or not visible (common on handwritten estimates with an empty "M/s"), return null. Never invent a name and never use the buyer's name.
- gst_number: the seller GSTIN (15 characters, starts with two digits) or null.
- phone, city: as printed, or null.

Header:
- invoice_no: as printed, including the financial-year suffix, e.g. "5198/26-27". null if none.
- bill_date: YYYY-MM-DD. Dates are day-first: 03/11/26 is 2026-11-03; 14-Jul-26 is 2026-07-14.
- subtotal: sum before discount and tax if printed.
- discount: total discount on the bill (sum any "Discount", "Cash Dis", "Less" lines), as a positive number.
- round_off: the round-off amount, signed (-0.38 if it reduces the total).
- tax_amount: total CGST+SGST+IGST if printed.
- transport_cost: freight / transport / unloading / loading charges printed on THIS bill, else null.
- total_amount: the final amount payable (grand total / net amount) exactly as printed.

items (one per bill line, top to bottom; skip totals, tax and discount lines):
- name: a clear English material name without the brand, e.g. "CPVC Elbow 90° 1 inch". Read fraction notation: "11/2" is 1½, "21/2" is 2½, "3/4" is ¾.
- raw_text: the line exactly as printed.
- local_name: original Tamil text if present, else null.
- brand: brand if printed in the line (e.g. "Parryware", "Avon", "Asian Paints"), else null.
- category_hint: "Parent > Child", e.g. "Hardware > Pipes & Fittings", "Steel & Metals > Pipes", "Paints > Enamel", "Plywood & Boards > Plywood".
- quantity: number of units bought, as a number.
- unit: one of ${MATERIAL_UNITS.join(", ")}. "pcs", "no", "no.s" -> "nos"; "mtr", "m" -> "rmt"; "L", "ltr" -> "liter"; "SHT", "sheet" -> "nos"; "length" -> "nos"; weight with no unit on steel lines -> "kg".
- unit_price: the price for ONE unit of "unit". If the bill prices per a different basis (e.g. plywood: 40 sheets at ₹74 per sqft on 1280 sqft), return the price per unit of "quantity" (line amount / quantity) and explain in reader_notes.
- line_total: the printed line amount, after any line discount.
- hsn_code, gst_rate (percent, e.g. 18): if printed per line or for the bill, else null.
- pack_size: for cans/bags/bottles, e.g. "8L can", "20kg bag", else null. Quantity is the number of cans, not litres.

confidence (0 to 1): how sure you are of the vendor, total, and item lines, and overall. Use low values for blurred, cut-off or handwritten parts you had to guess.
reader_notes: one or two short sentences about anything unusual (different rate basis, second bill visible in the background, stamps such as "goods delivered" or "payment received", credit/due date). null if nothing.

Use numbers without currency symbols or commas. Use null when a value is not on the document. Do not guess numbers you cannot read.`;

const numOrNull = { type: ["number", "null"] } as const;
const strOrNull = { type: ["string", "null"] } as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    doc_kind: { type: "string", enum: [...DOC_KINDS] },
    vendor: {
      type: "object",
      properties: { name: strOrNull, phone: strOrNull, gst_number: strOrNull, city: strOrNull },
      required: ["name", "phone", "gst_number", "city"],
    },
    invoice_no: strOrNull,
    bill_date: strOrNull,
    subtotal: numOrNull,
    discount: numOrNull,
    round_off: numOrNull,
    tax_amount: numOrNull,
    transport_cost: numOrNull,
    total_amount: numOrNull,
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          raw_text: strOrNull,
          local_name: strOrNull,
          brand: strOrNull,
          category_hint: strOrNull,
          quantity: numOrNull,
          unit: { type: "string", enum: [...MATERIAL_UNITS] },
          unit_price: numOrNull,
          line_total: numOrNull,
          hsn_code: strOrNull,
          gst_rate: numOrNull,
          pack_size: strOrNull,
        },
        required: ["name", "quantity", "unit", "unit_price", "line_total"],
      },
    },
    confidence: {
      type: "object",
      properties: {
        overall: { type: "number" },
        vendor: { type: "number" },
        total: { type: "number" },
        items: { type: "number" },
      },
      required: ["overall", "vendor", "total", "items"],
    },
    reader_notes: strOrNull,
  },
  required: ["doc_kind", "vendor", "invoice_no", "bill_date", "total_amount", "items", "confidence"],
};

/** Gemini accepts inline payloads up to ~20 MB (base64 grows by a third). */
export const MAX_INLINE_BYTES = 14 * 1024 * 1024;

export interface ExtractResult {
  extraction: BillExtraction;
  model: string;
}

export async function extractBill(bytes: Buffer, mimeType: string): Promise<ExtractResult> {
  if (bytes.byteLength > MAX_INLINE_BYTES) {
    throw new Error("File too large to read. Upload a smaller photo.");
  }
  const ai = getGemini();
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPT }, { inlineData: { mimeType: normalizeMime(mimeType), data: bytes.toString("base64") } }],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  });
  const text = res.text ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The reader returned something that is not JSON.");
  }
  return { extraction: billExtractionSchema.parse(raw), model: GEMINI_MODEL };
}

function normalizeMime(mime: string): string {
  const base = (mime || "image/jpeg").split(";")[0].trim().toLowerCase();
  return base === "image/jpg" ? "image/jpeg" : base;
}
