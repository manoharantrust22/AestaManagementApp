import { describe, expect, it } from "vitest";
import { buildContractScopeHref, type ContractScopeRef } from "./contractScope";

const make = (over: Partial<ContractScopeRef>): ContractScopeRef => ({
  id: "c1",
  tradeCategoryId: "cat-paint",
  tradeName: "Painting",
  isInHouse: false,
  ...over,
});

describe("buildContractScopeHref", () => {
  it("a non-Civil tracked trade gets scoped params", () => {
    const href = buildContractScopeHref("/site/attendance", make({}));
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/site/attendance");
    expect(url.searchParams.get("categoryId")).toBe("cat-paint");
    expect(url.searchParams.get("contractId")).toBe("c1");
    expect(url.searchParams.get("trade")).toBe("Painting");
  });

  it("works for the payments base too", () => {
    const href = buildContractScopeHref("/site/payments", make({ id: "c9" }));
    expect(href.startsWith("/site/payments?")).toBe(true);
    expect(new URL(href, "http://x").searchParams.get("contractId")).toBe("c9");
  });

  it("Civil-category contracts resolve to the default Civil flow (no params)", () => {
    expect(
      buildContractScopeHref("/site/attendance", make({ tradeName: "Civil", tradeCategoryId: "cat-civil" }))
    ).toBe("/site/attendance");
  });

  it("in-house contracts resolve to the default flow", () => {
    expect(
      buildContractScopeHref("/site/payments", make({ isInHouse: true }))
    ).toBe("/site/payments");
  });

  it("trade-less (uncategorized) contracts resolve to the default flow", () => {
    expect(
      buildContractScopeHref("/site/attendance", make({ tradeCategoryId: null }))
    ).toBe("/site/attendance");
  });

  it("encodes trade names with spaces / symbols", () => {
    const href = buildContractScopeHref("/site/attendance", make({ tradeName: "Water Proofing & Sealing" }));
    expect(new URL(href, "http://x").searchParams.get("trade")).toBe("Water Proofing & Sealing");
  });
});
