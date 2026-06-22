import { describe, expect, it } from "vitest";
import { decideTradeDelete, type TradeDeleteRefs } from "./tradeDeleteGuard";

const noRefs: TradeDeleteRefs = {
  laborers: 0,
  roles: 0,
  subcontracts: 0,
  packages: 0,
  teams: 0,
};

describe("decideTradeDelete", () => {
  it("never deletes a system-seed trade", () => {
    const d = decideTradeDelete({ isSystemSeed: true, ...noRefs });
    expect(d.action).toBe("blocked-system");
  });

  it("deletes an unused custom trade", () => {
    const d = decideTradeDelete({ isSystemSeed: false, ...noRefs });
    expect(d.action).toBe("delete");
    expect(d.blockers).toEqual([]);
  });

  it("offers disable when a custom trade is in use, listing references", () => {
    const d = decideTradeDelete({ isSystemSeed: false, ...noRefs, subcontracts: 2, laborers: 1 });
    expect(d.action).toBe("disable");
    expect(d.blockers).toEqual(["1 laborer", "2 contracts"]);
  });

  it("system-seed wins even when unused", () => {
    expect(decideTradeDelete({ isSystemSeed: true, ...noRefs, teams: 3 }).action).toBe("blocked-system");
  });
});
