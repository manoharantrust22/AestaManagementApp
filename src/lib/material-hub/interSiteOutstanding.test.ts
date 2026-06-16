import { describe, it, expect } from "vitest";
import {
  summarizeOutstanding,
  legsFromUnpaidSettlements,
  type OutstandingLeg,
  type UnpaidSettlementLeg,
} from "./interSiteOutstanding";

// Sites: SR = Srinivasan, PD = Padmavathy. PPC = the material family.
const SR = "site-sr";
const PD = "site-pd";

function raisedLeg(
  debtorId: string,
  debtorName: string,
  creditorId: string,
  creditorName: string,
  amount: number,
  settlementId: string
): OutstandingLeg {
  return {
    debtorSiteId: debtorId,
    debtorName,
    creditorSiteId: creditorId,
    creditorName,
    materialId: "ppc",
    materialName: "PPC Cement",
    amount,
    raised: true,
    settlementId,
    settlementCode: settlementId.toUpperCase(),
  };
}

describe("summarizeOutstanding", () => {
  it("nets two opposing raised settlements into a single direction (the PPC case)", () => {
    // Srinivasan owes Padmavathy 18,200 ; Padmavathy owes Srinivasan 5,600.
    const legs = [
      raisedLeg(SR, "Srinivasan", PD, "Padmavathy", 18200, "s1"),
      raisedLeg(PD, "Padmavathy", SR, "Srinivasan", 5600, "s2"),
    ];
    const s = summarizeOutstanding(legs);
    expect(s.netLines).toHaveLength(1);
    expect(s.netLines[0]).toMatchObject({
      owerName: "Srinivasan",
      owedName: "Padmavathy",
      amount: 12600,
    });
    expect(s.total).toBe(12600);
    expect(s.settlementIds.sort()).toEqual(["s1", "s2"]);
    expect(s.hasRaised).toBe(true);
    expect(s.hasUnraised).toBe(false);
  });

  it("reports viewer-centric net (viewer owes 12,600)", () => {
    const legs = [
      raisedLeg(SR, "Srinivasan", PD, "Padmavathy", 18200, "s1"),
      raisedLeg(PD, "Padmavathy", SR, "Srinivasan", 5600, "s2"),
    ];
    const s = summarizeOutstanding(legs, { viewerSiteId: SR });
    expect(s.iOwe).toBe(18200);
    expect(s.othersOwe).toBe(5600);
    expect(s.net).toBe(-12600); // negative = you owe
  });

  it("filters to the material family", () => {
    const legs: OutstandingLeg[] = [
      raisedLeg(SR, "Srinivasan", PD, "Padmavathy", 18200, "s1"),
      { ...raisedLeg(SR, "Srinivasan", PD, "Padmavathy", 9999, "steel"), materialId: "steel" },
    ];
    const s = summarizeOutstanding(legs, { familyMaterialIds: new Set(["ppc"]) });
    expect(s.total).toBe(18200); // steel excluded
  });

  it("returns an empty summary when the pair nets to zero", () => {
    const legs = [
      raisedLeg(SR, "Srinivasan", PD, "Padmavathy", 5000, "s1"),
      raisedLeg(PD, "Padmavathy", SR, "Srinivasan", 5000, "s2"),
    ];
    const s = summarizeOutstanding(legs);
    expect(s.netLines).toHaveLength(0);
    expect(s.total).toBe(0);
  });

  it("flags a mix of raised and not-yet-raised debt", () => {
    const legs: OutstandingLeg[] = [
      raisedLeg(SR, "Srinivasan", PD, "Padmavathy", 5000, "s1"),
      {
        debtorSiteId: SR,
        debtorName: "Srinivasan",
        creditorSiteId: PD,
        creditorName: "Padmavathy",
        materialId: "ppc",
        materialName: "PPC Cement",
        amount: 1000,
        raised: false,
      },
    ];
    const s = summarizeOutstanding(legs);
    expect(s.total).toBe(6000);
    expect(s.hasRaised).toBe(true);
    expect(s.hasUnraised).toBe(true);
  });
});

describe("legsFromUnpaidSettlements", () => {
  it("maps settlement rows and drops zero-amount legs", () => {
    const rows: UnpaidSettlementLeg[] = [
      {
        settlement_id: "s1",
        settlement_code: "SET-1",
        creditor_site_id: PD,
        creditor_site_name: "Padmavathy",
        debtor_site_id: SR,
        debtor_site_name: "Srinivasan",
        material_id: "ppc",
        material_name: "PPC Cement",
        amount: 18200,
      },
      {
        settlement_id: "s2",
        settlement_code: "SET-2",
        creditor_site_id: SR,
        creditor_site_name: "Srinivasan",
        debtor_site_id: PD,
        debtor_site_name: "Padmavathy",
        material_id: "ppc",
        material_name: "PPC Cement",
        amount: 0,
      },
    ];
    const legs = legsFromUnpaidSettlements(rows);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ raised: true, amount: 18200, settlementCode: "SET-1" });
  });
});
