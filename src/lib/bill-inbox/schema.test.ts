import { describe, expect, it } from "vitest";

import {
  billExtractionSchema,
  extractionWarnings,
  normalizeGstin,
  normalizeInvoiceNo,
  toPurchaseOutput,
} from "./schema";

const base = {
  doc_kind: "tax_invoice",
  vendor: { name: "Sri Ramesh Hardwares", phone: null, gst_number: "33 aahfs1234k1z5", city: "Pudukkottai" },
  invoice_no: "5199/26-27",
  bill_date: "2026-10-27",
  total_amount: 10000,
  items: [
    { name: "CPVC Elbow 90° 1 inch", quantity: 10, unit: "nos", unit_price: 50, line_total: 500 },
    { name: "Steel pipe", quantity: 13.6, unit: "kg", unit_price: null, line_total: 952 },
  ],
  confidence: { overall: 0.9, vendor: 0.95, total: 0.99, items: 0.85 },
};

describe("billExtractionSchema", () => {
  it("tolerates junk from the reader", () => {
    const x = billExtractionSchema.parse({
      doc_kind: "invoice-ish",
      vendor: { name: "  " },
      total_amount: "₹1,00,000.00",
      items: [{ name: "", quantity: "40", unit: "SHT", unit_price: "74" }],
      confidence: { overall: 7 },
    });
    expect(x.doc_kind).toBe("other");
    expect(x.vendor.name).toBeNull();
    expect(x.total_amount).toBe(100000);
    expect(x.items[0]).toMatchObject({ name: "Unreadable item", quantity: 40, unit: "nos", unit_price: 74 });
    expect(x.confidence.overall).toBe(1);
    expect(x.bill_date).toBeNull();
  });

  it("drops dates that are not ISO", () => {
    expect(billExtractionSchema.parse({ ...base, bill_date: "27/10/26" }).bill_date).toBeNull();
  });
});

describe("toPurchaseOutput", () => {
  it("derives a missing unit price from the line total", () => {
    const out = toPurchaseOutput(billExtractionSchema.parse(base));
    expect(out.items[1].unit_price).toBe(70);
    expect(out.vendor.gst_number).toBe("33AAHFS1234K1Z5");
    expect(out.total_amount).toBe(10000);
    expect(out.purchase_date).toBe("2026-10-27");
  });

  it("uses overrides for a pending shop name, the total and the date", () => {
    const x = billExtractionSchema.parse({ ...base, vendor: { name: null }, bill_date: null, total_amount: null });
    const out = toPurchaseOutput(x, { vendorName: " Local shop ", fallbackDate: "2026-11-03", totalAmount: 1400 });
    expect(out.vendor.name).toBe("Local shop");
    expect(out.purchase_date).toBe("2026-11-03");
    expect(out.total_amount).toBe(1400);
  });

  it("falls back to the line sum when no total was read, and skips lines with no numbers", () => {
    const x = billExtractionSchema.parse({
      ...base,
      total_amount: null,
      items: [...base.items, { name: "Heading text", quantity: null, unit: "nos", unit_price: null, line_total: null }],
    });
    const out = toPurchaseOutput(x);
    expect(out.items).toHaveLength(2);
    expect(out.total_amount).toBe(1452);
  });

  it("treats a line with only an amount as one unit", () => {
    const x = billExtractionSchema.parse({
      ...base,
      items: [{ name: "Unloading", quantity: null, unit: "nos", unit_price: null, line_total: 103 }],
    });
    expect(toPurchaseOutput(x).items[0]).toMatchObject({ quantity: 1, unit_price: 103 });
  });
});

describe("extractionWarnings", () => {
  it("accepts a total reached through discount and round-off", () => {
    const x = billExtractionSchema.parse({
      ...base,
      total_amount: 1400,
      discount: 52.38,
      round_off: 0.38,
    });
    expect(extractionWarnings(x).some((w) => w.startsWith("Lines add up"))).toBe(false);
  });

  it("warns when lines and total disagree", () => {
    const x = billExtractionSchema.parse({ ...base, total_amount: 5000 });
    expect(extractionWarnings(x).some((w) => w.startsWith("Lines add up"))).toBe(true);
  });

  it("asks for a shop name when none was read", () => {
    const x = billExtractionSchema.parse({ ...base, vendor: { name: null } });
    expect(extractionWarnings(x)[0]).toMatch(/Shop name not found/);
  });
});

describe("normalizers", () => {
  it("normalizes GSTIN or rejects it", () => {
    expect(normalizeGstin("33aanc s1234k1z9")).toBe("33AANCS1234K1Z9");
    expect(normalizeGstin("FOR OWN USE")).toBeNull();
  });

  it("compares invoice numbers loosely", () => {
    expect(normalizeInvoiceNo("No. 5198 / 26-27")).toBe("5198/26-27");
    expect(normalizeInvoiceNo("Invoice No: 5198/26-27")).toBe("5198/26-27");
    expect(normalizeInvoiceNo("C06615")).toBe("c06615");
    expect(normalizeInvoiceNo("  ")).toBeNull();
  });
});
