/**
 * Prompt template for MULTI-BILL batch ingestion. The user attaches several
 * bill photos to one ChatGPT/Gemini chat and pastes back a single JSON array —
 * one purchase object per bill. Each bill is independent (its own vendor, date,
 * items, total); bills in a stack are routinely from different shops on
 * different days.
 */

import type { IngestionContext } from "@/lib/ai-ingestion/types";

export function buildPurchaseBatchPrompt(ctx: IngestionContext): string {
  const dateLine = ctx.defaultDate
    ? `If a bill has no readable date, use null for that bill (we'll fall back to ${ctx.defaultDate}).`
    : "";
  return `You are extracting MULTIPLE construction-material PURCHASE BILLS into JSON for ingestion into a catalog system.

Each attached image is a SEPARATE purchase bill — usually a different shop and a different date. Do NOT merge them.

Return ONLY a single JSON code block. No prose before or after. Output ONE object per bill, in the SAME ORDER as the attached images, inside the "purchases" array.

Schema:
\`\`\`json
{
  "kind": "purchase_batch",
  "purchases": [
    {
      "vendor": {
        "name": "string (the shop / dealer name as shown on the bill, in English)",
        "phone": "string|null",
        "gst_number": "string|null",
        "city": "string|null"
      },
      "invoice_no": "string|null",
      "purchase_date": "YYYY-MM-DD or null  ← this bill's own date",
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
          "gst_rate": null,
          "pack_size": "string|null  ← for packaged goods sold by the can/bottle/bag, e.g. \\"5L can\\", \\"20kg bag\\"; else null"
        }
      ]
    }
  ]
}
\`\`\`

Rules (apply per bill):
- One object per attached bill image, in image order. If you see N images, return N objects.
- Translate Tamil/Hindi material names to English in "name"; preserve the original in "local_name".
- "unit" must be one of the 16 enum values exactly. "no.s"/"pcs" → "nos"; "kgs"/"Kg" → "kg".
- Numbers only — strip currency symbols (₹, INR) and commas. "1,500" → 1500.
- If a bill line shows a brand prefix like "AN AMMAN 08 MM TMT", extract "8mm TMT Bar" as "name" and "AN AMMAN" as "brand".
- For packaged goods sold by the can/bottle/bag (e.g. "Dr. Fixit LW+ 5L"), set "pack_size" to that size ("5L can"), quantity = number of cans, unit = "nos"/"box" — do NOT spread the litres across quantity (a 5L can is quantity 1, not 5).
- "purchase_date" is each bill's OWN printed date. ${dateLine}
- "category_hint" should be a 2-level hint like "Steel & Metals > TMT Bars", "Electrical > Distribution Boxes".
- If multiple items appear in one row (e.g. cable color × length grid), expand into one item per cell.
- "total_amount" is each bill's printed grand total.

Now extract the JSON array for the attached bills.`;
}
