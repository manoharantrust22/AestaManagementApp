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

  it("a non-Civil trade on the FULL workspace (detailed) uses the per-laborer flow", () => {
    // Painting on "detailed" → attendance carries contractId ONLY (not the trade triple),
    // so the page renders the full per-laborer flow, the same one Civil uses.
    const href = buildContractScopeHref(
      "/site/attendance",
      make({ id: "p7", tradeName: "Painting", tradeCategoryId: "cat-paint", mode: "detailed" })
    );
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/site/attendance");
    expect(url.searchParams.get("contractId")).toBe("p7");
    expect(url.searchParams.get("categoryId")).toBeNull();
    expect(url.searchParams.get("trade")).toBeNull();
  });

  it("a non-Civil DETAILED contract resolves payments to a contract-scoped settlement flow", () => {
    expect(
      buildContractScopeHref("/site/payments", make({ id: "c1", tradeName: "Painting", tradeCategoryId: "cat-paint", mode: "detailed" }))
    ).toBe("/site/payments?contractId=c1");
  });

  it("a non-Civil HEADCOUNT trade still gets the trade-scoped triple", () => {
    const href = buildContractScopeHref(
      "/site/attendance",
      make({ id: "p8", tradeName: "Painting", tradeCategoryId: "cat-paint", mode: "headcount" })
    );
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("categoryId")).toBe("cat-paint");
    expect(url.searchParams.get("trade")).toBe("Painting");
  });

  // --- Required invariants (exact refs from the task spec) ---

  it("detailed non-Civil (isInHouse:true) attendance → contractId only", () => {
    const ref: ContractScopeRef = {
      id: "c1",
      tradeCategoryId: "t1",
      tradeName: "Painting",
      isInHouse: true,
      mode: "detailed",
    };
    const href = buildContractScopeHref("/site/attendance", ref);
    expect(href).toBe("/site/attendance?contractId=c1");
  });

  it("detailed non-Civil (isInHouse:true) payments → contract-scoped settlement", () => {
    const ref: ContractScopeRef = {
      id: "c1",
      tradeCategoryId: "t1",
      tradeName: "Painting",
      isInHouse: true,
      mode: "detailed",
    };
    const href = buildContractScopeHref("/site/payments", ref);
    expect(href).toBe("/site/payments?contractId=c1");
  });

  it("Civil payments → bare (no query string)", () => {
    const ref: ContractScopeRef = {
      id: "c2",
      tradeCategoryId: "civ",
      tradeName: "Civil",
      isInHouse: true,
      mode: "detailed",
    };
    expect(buildContractScopeHref("/site/payments", ref)).toBe("/site/payments");
  });

  it("headcount non-Civil attendance → triple with all three params", () => {
    const ref: ContractScopeRef = {
      id: "c3",
      tradeCategoryId: "t3",
      tradeName: "Tiling",
      isInHouse: false,
      mode: "headcount",
    };
    const href = buildContractScopeHref("/site/attendance", ref);
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("categoryId")).toBe("t3");
    expect(url.searchParams.get("contractId")).toBe("c3");
    expect(url.searchParams.get("trade")).toBe("Tiling");
  });

  it("headcount non-Civil payments → triple with all three params", () => {
    const ref: ContractScopeRef = {
      id: "c3",
      tradeCategoryId: "t3",
      tradeName: "Tiling",
      isInHouse: false,
      mode: "headcount",
    };
    const href = buildContractScopeHref("/site/payments", ref);
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("categoryId")).toBe("t3");
    expect(url.searchParams.get("contractId")).toBe("c3");
    expect(url.searchParams.get("trade")).toBe("Tiling");
  });
});
