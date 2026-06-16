import { describe, it, expect } from "vitest";
import { reciprocalRaisedPairs, type RaisedSettlementLike } from "./raisedNetSettle";

const SR = "site-sr";
const PD = "site-pd";

function s(over: Partial<RaisedSettlementLike> & { id: string }): RaisedSettlementLike {
  return {
    settlement_code: over.id.toUpperCase(),
    creditor_site_id: PD,
    creditor_site_name: "Padmavathy",
    debtor_site_id: SR,
    debtor_site_name: "Srinivasan",
    pending_amount: 0,
    ...over,
  };
}

describe("reciprocalRaisedPairs", () => {
  it("nets the PPC reciprocal pair (Srini 18,200 vs Padma 5,600)", () => {
    const items = [
      // Srinivasan owes Padmavathy 18,200
      s({ id: "big", debtor_site_id: SR, debtor_site_name: "Srinivasan", creditor_site_id: PD, creditor_site_name: "Padmavathy", pending_amount: 18200 }),
      // Padmavathy owes Srinivasan 5,600
      s({ id: "small", debtor_site_id: PD, debtor_site_name: "Padmavathy", creditor_site_id: SR, creditor_site_name: "Srinivasan", pending_amount: 5600 }),
    ];
    const [pair] = reciprocalRaisedPairs(items);
    expect(pair.larger.id).toBe("big");
    expect(pair.smaller.id).toBe("small");
    expect(pair.offsetAmount).toBe(5600);
    expect(pair.netAmount).toBe(12600);
    expect(pair.owerName).toBe("Srinivasan");
    expect(pair.owedName).toBe("Padmavathy");
  });

  it("returns no pair when both settlements are the same direction", () => {
    const items = [
      s({ id: "a", debtor_site_id: SR, creditor_site_id: PD, pending_amount: 100 }),
      s({ id: "b", debtor_site_id: SR, creditor_site_id: PD, pending_amount: 200 }),
    ];
    expect(reciprocalRaisedPairs(items)).toEqual([]);
  });

  it("ignores a single (non-reciprocal) settlement", () => {
    expect(reciprocalRaisedPairs([s({ id: "only", pending_amount: 100 })])).toEqual([]);
  });

  it("skips messy pairs (more than one settlement per direction)", () => {
    const items = [
      s({ id: "a", debtor_site_id: SR, creditor_site_id: PD, pending_amount: 100 }),
      s({ id: "b", debtor_site_id: PD, creditor_site_id: SR, pending_amount: 50 }),
      s({ id: "c", debtor_site_id: SR, creditor_site_id: PD, pending_amount: 30 }),
    ];
    expect(reciprocalRaisedPairs(items)).toEqual([]);
  });

  it("equal reciprocal debts net to zero", () => {
    const items = [
      s({ id: "a", debtor_site_id: SR, creditor_site_id: PD, pending_amount: 5000 }),
      s({ id: "b", debtor_site_id: PD, creditor_site_id: SR, pending_amount: 5000 }),
    ];
    const [pair] = reciprocalRaisedPairs(items);
    expect(pair.offsetAmount).toBe(5000);
    expect(pair.netAmount).toBe(0);
  });
});
