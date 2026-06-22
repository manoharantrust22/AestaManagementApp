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

  it("Civil attendance carries ONLY contractId (stays on the per-laborer flow)", () => {
    const href = buildContractScopeHref(
      "/site/attendance",
      make({ id: "civ1", tradeName: "Civil", tradeCategoryId: "cat-civil" })
    );
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/site/attendance");
    expect(url.searchParams.get("contractId")).toBe("civ1");
    // Must NOT carry the trade triple, or the page would switch to the headcount view.
    expect(url.searchParams.get("categoryId")).toBeNull();
    expect(url.searchParams.get("trade")).toBeNull();
  });

  it("Civil PAYMENTS still resolves to the default flow (no params)", () => {
    expect(
      buildContractScopeHref("/site/payments", make({ tradeName: "Civil", tradeCategoryId: "cat-civil" }))
    ).toBe("/site/payments");
  });

  it("in-house contracts resolve to the default flow (payments)", () => {
    expect(
      buildContractScopeHref("/site/payments", make({ isInHouse: true }))
    ).toBe("/site/payments");
  });

  it("trade-less attendance carries contractId; payments stays bare", () => {
    expect(
      buildContractScopeHref("/site/attendance", make({ id: "u1", tradeCategoryId: null }))
    ).toBe("/site/attendance?contractId=u1");
    expect(
      buildContractScopeHref("/site/payments", make({ tradeCategoryId: null }))
    ).toBe("/site/payments");
  });

  it("encodes trade names with spaces / symbols", () => {
    const href = buildContractScopeHref("/site/attendance", make({ tradeName: "Water Proofing & Sealing" }));
    expect(new URL(href, "http://x").searchParams.get("trade")).toBe("Water Proofing & Sealing");
  });
});
