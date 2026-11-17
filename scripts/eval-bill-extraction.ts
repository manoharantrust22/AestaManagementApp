/**
 * Run the Bill Inbox reader on a folder of bill photos and print what it read.
 *
 *   npx tsx scripts/eval-bill-extraction.ts <folder-with-bills> [out-folder]
 *
 * Photos are shrunk the same way the phone does before reading (long side
 * 2200px, JPEG). Keep sample bills OUT of the repo: they contain vendor bank
 * and phone details. Reads GEMINI_API_KEY from the environment, or from
 * .env.cloud.local / .env.local.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

import { extractBill } from "../src/lib/bill-inbox/extract";
import { extractionWarnings, toPurchaseOutput } from "../src/lib/bill-inbox/schema";

function loadKey() {
  if (process.env.GEMINI_API_KEY) return;
  for (const f of [".env.cloud.local", ".env.local"]) {
    const p = path.join(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(GEMINI_API_KEY|GEMINI_MODEL)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

async function main() {
  const [dir, outDir] = process.argv.slice(2);
  if (!dir) throw new Error("Usage: npx tsx scripts/eval-bill-extraction.ts <folder> [out-folder]");
  loadKey();
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp|pdf)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  for (const f of files) {
    const original = fs.readFileSync(path.join(dir, f));
    const sha = crypto.createHash("sha256").update(original).digest("hex").slice(0, 12);
    const isPdf = /\.pdf$/i.test(f);
    const bytes = isPdf
      ? original
      : await sharp(original).rotate().resize(2200, 2200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const t0 = Date.now();
    try {
      const { extraction: x, model } = await extractBill(bytes, isPdf ? "application/pdf" : "image/jpeg");
      const ms = Date.now() - t0;
      const p = toPurchaseOutput(x);
      console.log(
        `\n## ${f}  (sha ${sha}, ${(original.length / 1e6).toFixed(1)}MB -> ${(bytes.length / 1e6).toFixed(2)}MB, ${ms}ms, ${model})`,
      );
      console.log(
        `kind=${x.doc_kind} vendor=${x.vendor.name ?? "(none)"} gstin=${x.vendor.gst_number ?? "-"} inv=${x.invoice_no ?? "-"} date=${x.bill_date ?? "-"}`,
      );
      console.log(
        `subtotal=${x.subtotal ?? "-"} discount=${x.discount ?? "-"} round_off=${x.round_off ?? "-"} tax=${x.tax_amount ?? "-"} transport=${x.transport_cost ?? "-"} TOTAL=${x.total_amount ?? "-"}`,
      );
      console.log(`lines=${x.items.length} conf=${JSON.stringify(x.confidence)}`);
      for (const it of x.items.slice(0, 40)) {
        console.log(
          `  - ${it.name}${it.brand ? ` [${it.brand}]` : ""}: ${it.quantity ?? "?"} ${it.unit} x ${it.unit_price ?? "?"} = ${it.line_total ?? "?"}`,
        );
      }
      const warnings = extractionWarnings(x);
      if (warnings.length) console.log(`warnings: ${warnings.join(" | ")}`);
      if (x.reader_notes) console.log(`notes: ${x.reader_notes}`);
      console.log(`as purchase: ${p.items.length} items, total ${p.total_amount}`);
      if (outDir) fs.writeFileSync(path.join(outDir, `${f}.json`), JSON.stringify(x, null, 2));
    } catch (err) {
      console.log(`\n## ${f}  FAILED after ${Date.now() - t0}ms: ${(err as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
