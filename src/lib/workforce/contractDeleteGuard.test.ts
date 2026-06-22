import { describe, expect, it } from "vitest";
import { decideContractDelete, type ContractDeleteCounts } from "./contractDeleteGuard";

const zero: ContractDeleteCounts = {
  payments: 0,
  settlements: 0,
  attendance: 0,
  headcount: 0,
  packages: 0,
};

describe("decideContractDelete", () => {
  it("allows hard delete when nothing hangs off the contract", () => {
    const d = decideContractDelete(zero);
    expect(d.canHardDelete).toBe(true);
    expect(d.blockers).toEqual([]);
  });

  it("blocks when a payment exists (the RESTRICT FK)", () => {
    const d = decideContractDelete({ ...zero, payments: 3 });
    expect(d.canHardDelete).toBe(false);
    expect(d.blockers[0]).toBe("3 payments recorded");
  });

  it("singularises a single blocker", () => {
    expect(decideContractDelete({ ...zero, attendance: 1 }).blockers[0]).toBe("1 attendance day");
  });

  it("lists every non-zero reason", () => {
    const d = decideContractDelete({ payments: 1, settlements: 2, attendance: 0, headcount: 4, packages: 1 });
    expect(d.canHardDelete).toBe(false);
    expect(d.blockers).toEqual([
      "1 payment recorded",
      "2 salary settlements",
      "4 headcount entries",
      "1 linked package",
    ]);
  });
});
