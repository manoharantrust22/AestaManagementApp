import { describe, it, expect } from "vitest";
import {
  formatContractWorkerCount,
  formatContractDayLabel,
  formatContractWorkerSummary,
  contractItemHref,
  type ContractPresenceDay,
  type ContractPresenceItem,
} from "./contractPresenceUtils";

const pkg = (over: Partial<ContractPresenceItem> = {}): ContractPresenceItem => ({
  kind: "package",
  id: "pkg-1",
  title: "All civil Work & elevation - Barun",
  units: 3,
  workerSummary: "Mason ×2 · Helper ×1",
  ...over,
});

const day = (items: ContractPresenceItem[]): ContractPresenceDay => ({
  date: "2026-06-19",
  totalUnits: items.reduce((s, i) => s + i.units, 0),
  items,
});

describe("contractPresenceUtils", () => {
  describe("formatContractWorkerCount", () => {
    it("rounds fractional man-days and pluralises", () => {
      expect(formatContractWorkerCount(3)).toBe("3 workers");
      expect(formatContractWorkerCount(1)).toBe("1 worker");
      expect(formatContractWorkerCount(2.6)).toBe("3 workers");
      expect(formatContractWorkerCount(0)).toBe("0 workers");
    });
  });

  describe("formatContractDayLabel", () => {
    it("shows the single contract name", () => {
      expect(formatContractDayLabel(day([pkg()]))).toBe(
        "All civil Work & elevation - Barun"
      );
    });

    it("adds '+N more' when several contracts ran the same day", () => {
      expect(
        formatContractDayLabel(
          day([pkg(), pkg({ id: "pkg-2", title: "Plastering" })])
        )
      ).toBe("All civil Work & elevation - Barun +1 more");
    });
  });

  describe("formatContractWorkerSummary", () => {
    it("joins per-package breakdowns and skips blanks", () => {
      const d = day([
        pkg(),
        { kind: "subcontract", id: "sc-1", title: "RCC", units: 2, workerSummary: "" },
      ]);
      expect(formatContractWorkerSummary(d)).toBe("Mason ×2 · Helper ×1");
    });
  });

  describe("contractItemHref", () => {
    it("links packages and subcontracts to the right param", () => {
      expect(contractItemHref(pkg())).toBe("/site/trades?package=pkg-1");
      expect(
        contractItemHref({
          kind: "subcontract",
          id: "sc-9",
          title: "RCC",
          units: 1,
          workerSummary: "",
        })
      ).toBe("/site/trades?contract=sc-9");
    });
  });
});
