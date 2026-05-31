import { describe, it, expect } from "vitest";
import { slugifyPayerSourceKey } from "./payerSourceKey";

describe("slugifyPayerSourceKey", () => {
  it("snake-cases a simple label", () => {
    expect(slugifyPayerSourceKey("Site Cash")).toBe("site_cash");
  });

  it("collapses non-alphanumerics and trims edges", () => {
    expect(slugifyPayerSourceKey("  Bank A!! ")).toBe("bank_a");
  });

  it("lowercases and handles mixed separators", () => {
    expect(slugifyPayerSourceKey("Partner-Loan / 2024")).toBe("partner_loan_2024");
  });

  it("suffixes _2 on collision with an existing key", () => {
    expect(slugifyPayerSourceKey("Site Cash", ["site_cash"])).toBe("site_cash_2");
  });

  it("walks past multiple taken suffixes", () => {
    expect(slugifyPayerSourceKey("Loan", ["loan", "loan_2"])).toBe("loan_3");
  });

  it("falls back to 'source' for an all-symbol label", () => {
    expect(slugifyPayerSourceKey("!!!")).toBe("source");
  });

  it("dedupes the fallback too", () => {
    expect(slugifyPayerSourceKey("###", ["source"])).toBe("source_2");
  });
});
