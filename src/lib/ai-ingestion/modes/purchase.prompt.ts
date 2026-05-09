/**
 * Prompt template the user copies into ChatGPT or Gemini for Purchase mode.
 *
 * Rules are explicit because handwritten Tamil/English bills (Anandam,
 * Karuppan) need translation and bill formats vary widely (printed steel
 * weighbridge bills, color-coded cable tables, etc.).
 */

import type { IngestionContext } from "@/lib/ai-ingestion/types";

export function buildPurchasePrompt(ctx: IngestionContext): string {
  const dateLine = ctx.defaultDate
    ? `Default date if missing on the bill: ${ctx.defaultDate}.`
    : "";
  return `You are extracting a construction-material PURCHASE BILL into JSON for ingestion into a catalog system.

Return ONLY a single JSON code block. No prose before or after.

Schema:
\`\`\`json
{
  "kind": "purchase",
  "vendor": {
    "name": "string (the shop / dealer name as shown on the bill, in English)",
    "phone": "string|null",
    "gst_number": "string|null",
    "city": "string|null"
  },
  "invoice_no": "string|null",
  "purchase_date": "YYYY-MM-DD or null",
  "transport_cost": 0,
  "total_amount": 0,
  "items": [
    {
      "name": "string  ← canonical English material name",
      "local_name": "string|null  ← original Tamil/Hindi if printed on bill",
      "category_hint": "string|null  ← \\"Parent > Child\\" e.g. \\"Steel & Metals > TMT Bars\\"",
      "brand": "string|null",
      "quantity": 0,
      "unit": "kg | g | ton | liter | ml | piece | bag | bundle | sqft | sqm | cft | cum | nos | rmt | box | set",
      "unit_price": 0,
      "hsn_code": "string|null",
      "gst_rate": null
    }
  ]
}
\`\`\`

Rules:
- Translate Tamil/Hindi material names to English in "name"; preserve the original in "local_name".
- "unit" must be one of the 16 enum values exactly. If the bill says "no.s" or "pcs", use "nos". If it says "kgs" or "Kg", use "kg".
- Numbers only — strip currency symbols (₹, INR) and commas. "1,500" → 1500.
- If a bill line shows a brand prefix like "AN AMMAN 08 MM TMT", extract "8mm TMT Bar" as "name" and "AN AMMAN" as "brand".
- If the date is missing, return "purchase_date": null. ${dateLine}
- "category_hint" should be a 2-level hint like "Steel & Metals > TMT Bars", "Electrical > Distribution Boxes", "Hardware > Pipes & Fittings".
- Ignore quotation/estimate-only stamps; treat the document as a purchase bill regardless.
- If multiple items appear in one row (e.g. cable color × length grid), expand into one item per cell.
- "total_amount" is the bill's grand total after any rounding. Match it to the printed total.

Now extract the JSON for the attached bill.`;
}
