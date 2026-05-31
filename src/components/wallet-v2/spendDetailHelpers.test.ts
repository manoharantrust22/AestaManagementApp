import { describe, it, expect } from "vitest";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import {
  classifySpend,
  parseMiscReference,
  mapMiscExpenseRow,
  buildSpendPhotos,
  prettyPayerSource,
} from "./spendDetailHelpers";

describe("classifySpend", () => {
  it("classifies misc expenses", () => {
    expect(classifySpend("Misc expense MISC-260530-003 - Pudukai Building Materials")).toBe("misc");
  });
  it("classifies contract payments before salary (both carry SET-)", () => {
    expect(classifySpend("Contract payment for Chithranjith (SET-260525-001)")).toBe("contract");
  });
  it("classifies salary settlements", () => {
    expect(classifySpend("Salary settlement SET-260528-003")).toBe("salary");
  });
  it("falls back to other for material/rental/empty", () => {
    expect(classifySpend("Group stock advance payment")).toBe("other");
    expect(classifySpend(null)).toBe("other");
    expect(classifySpend(undefined)).toBe("other");
  });
});

describe("parseMiscReference", () => {
  it("extracts the MISC reference", () => {
    expect(parseMiscReference("Misc expense MISC-260530-003 - Vendor")).toBe("MISC-260530-003");
  });
  it("extracts a UUID-suffixed fallback reference", () => {
    expect(parseMiscReference("Misc expense MISC-260530-AB12CD34")).toBe("MISC-260530-AB12CD34");
  });
  it("returns null when there is no MISC reference", () => {
    expect(parseMiscReference("Salary settlement SET-260528-003")).toBeNull();
    expect(parseMiscReference(null)).toBeNull();
  });
});

describe("mapMiscExpenseRow", () => {
  it("flattens the joined category and passes fields through", () => {
    const raw = {
      bill_url: "https://x/bill.jpg",
      vendor_name: "Pudukai",
      description: "Plastering",
      notes: "urgent",
      amount: 150,
      payer_source: "site_cash",
      payer_name: null,
      expense_categories: { name: "Hardware" },
    };
    expect(mapMiscExpenseRow(raw)).toEqual({
      bill_url: "https://x/bill.jpg",
      vendor_name: "Pudukai",
      description: "Plastering",
      notes: "urgent",
      amount: 150,
      payer_source: "site_cash",
      payer_name: null,
      category_name: "Hardware",
    });
  });
  it("nulls missing fields and a missing category join", () => {
    expect(mapMiscExpenseRow({})).toEqual({
      bill_url: null,
      vendor_name: null,
      description: null,
      notes: null,
      amount: null,
      payer_source: null,
      payer_name: null,
      category_name: null,
    });
  });
});

describe("buildSpendPhotos", () => {
  const row = { proof_url: "https://x/proof.jpg", transaction_date: "2026-05-30" } as WalletLedgerEntry;
  it("lists the vendor bill first, then the payment proof", () => {
    const photos = buildSpendPhotos(row, { bill_url: "https://x/bill.jpg" } as any);
    expect(photos.map((p) => p.id)).toEqual(["bill", "proof"]);
    expect(photos[0].description).toBe("Vendor bill");
    expect(photos[1].url).toBe("https://x/proof.jpg");
  });
  it("returns only the proof when there is no bill", () => {
    const photos = buildSpendPhotos(row, null);
    expect(photos.map((p) => p.id)).toEqual(["proof"]);
  });
  it("returns an empty array when nothing is attached", () => {
    const photos = buildSpendPhotos({ proof_url: null, transaction_date: "2026-05-30" } as WalletLedgerEntry, null);
    expect(photos).toEqual([]);
  });
});

describe("prettyPayerSource", () => {
  it("maps known keys", () => {
    expect(prettyPayerSource("client_money", null)).toBe("Client Money");
  });
  it("uses the custom name for other_site/custom", () => {
    expect(prettyPayerSource("custom", "Friend")).toBe("Friend");
  });
  it("falls back to the raw key when unknown", () => {
    expect(prettyPayerSource("site_cash", null)).toBe("site_cash");
  });
});
