import { describe, it, expect } from "vitest";
import {
  buildClientStatement,
  formatRupees,
  greetingNameFrom,
  makeStatementNo,
  siteCode,
  dueLabelFor,
  type BuildStatementInput,
  type StatementWorkInput,
  type StatementPaymentInput,
} from "./buildClientStatement";

const company = {
  name: "Aesta Construction",
  code: "AESTA",
  addressLines: [],
  phone: null,
  email: null,
  gstin: null,
  logoUrl: null,
  payment: {},
  footerNote: null, signatureDataUrl: null, signatoryName: null,
};

function work(p: Partial<StatementWorkInput> & { id: string }): StatementWorkInput {
  return {
    title: p.id,
    status: "confirmed",
    estimated_amount: 0,
    confirmed_amount: null,
    confirmation_date: null,
    ...p,
  };
}

function pay(p: Partial<StatementPaymentInput> & { id: string; amount: number; payment_date: string }): StatementPaymentInput {
  return { payment_mode: "upi", ...p };
}

function input(over: Partial<BuildStatementInput> = {}, opts: Partial<BuildStatementInput["options"]> = {}): BuildStatementInput {
  return {
    site: { name: "Srinivasan House & Shop", address: "1593 North second street", city: "Pudukkottai", contractValue: "2500000.00" },
    company,
    recipient: { name: "Gayathri", phone: "9944420304", clientId: "c1" },
    clients: [{ id: "c1", name: "Gayathri w/o Srinivasan" }],
    works: [],
    payments: [],
    ...over,
    options: {
      asOfDate: "2026-11-18",
      titleVariant: "statement",
      due: { kind: "handover", date: "2026-11-20" },
      includeNotes: false,
      statementNo: "AESTA/SHS/2611/01",
      ...opts,
    },
  };
}

describe("buildClientStatement", () => {
  it("reproduces the Srinivasan handover figures", () => {
    const works = [
      work({ id: "plinth", confirmed_amount: 200000, confirmation_date: "2026-01-01" }),
      work({ id: "beam", confirmed_amount: 20000, confirmation_date: "2026-01-27" }),
      work({ id: "cw1", confirmed_amount: 40000, confirmation_date: "2026-03-12" }),
      work({ id: "cw2", confirmed_amount: 74000, confirmation_date: "2026-05-01" }),
      work({ id: "jalli", confirmed_amount: 16000, confirmation_date: "2026-06-17" }),
      work({ id: "paver", status: "paid", confirmed_amount: 40000, confirmation_date: "2026-09-21" }),
      work({ id: "shutter", status: "paid", confirmed_amount: 18500, confirmation_date: "2026-10-01" }),
      work({ id: "ots", title: "OTS Closing", confirmed_amount: 12000, confirmation_date: "2026-11-08" }),
      work({ id: "plaster", confirmed_amount: 3000, confirmation_date: "2026-11-12" }),
    ];
    const payments = [
      pay({ id: "p1", amount: 2859500, payment_date: "2026-10-01" }),
      pay({ id: "p2", amount: 3000, payment_date: "2026-11-14", tagged_additional_work_id: "plaster" }),
      pay({ id: "p3", amount: 12000, payment_date: "2026-11-17", tagged_additional_work_id: "ots", received_from_client_id: "c1" }),
    ];
    const s = buildClientStatement(input({ works, payments }));
    expect(s.summary).toMatchObject({
      baseContract: 2500000,
      approvedExtras: 423500,
      totalContract: 2923500,
      received: 2874500,
      balance: 49000,
      balanceDue: 49000,
      credit: 0,
    });
    expect(s.summary.pctReceived).toBe(98.3);
    expect(s.dueLabel).toBe("Payable at key handover on Fri, 20 Nov 2026");
    expect(s.extras.find((e) => e.id === "ots")?.paidAgainst).toBe(12000);
    expect(s.payments.at(-1)).toMatchObject({ appliedTo: "Extra: OTS Closing", from: "Gayathri w/o Srinivasan", runningTotal: 2874500 });
  });

  it("orders payments oldest first with a running total", () => {
    const s = buildClientStatement(input({
      payments: [
        pay({ id: "b", amount: 200, payment_date: "2026-02-01" }),
        pay({ id: "a", amount: 100, payment_date: "2026-01-01" }),
        pay({ id: "c", amount: 300, payment_date: "2026-03-01" }),
      ],
    }));
    expect(s.payments.map((p) => [p.id, p.runningTotal])).toEqual([["a", 100], ["b", 300], ["c", 600]]);
  });

  it("shows over-payment as a credit instead of clamping to zero", () => {
    const s = buildClientStatement(input({
      site: { name: "X", contractValue: 1000 },
      payments: [pay({ id: "p", amount: 1500, payment_date: "2026-01-01" })],
    }));
    expect(s.summary.balance).toBe(-500);
    expect(s.summary.balanceDue).toBe(0);
    expect(s.summary.credit).toBe(500);
    expect(s.dueLabel).toBeNull();
  });

  it("lists quoted works without a confirmed amount separately and excludes cancelled works", () => {
    const s = buildClientStatement(input({
      works: [
        work({ id: "q", status: "quoted", estimated_amount: 5000, confirmed_amount: null }),
        work({ id: "x", status: "cancelled", estimated_amount: 9000, confirmed_amount: 9000, confirmation_date: "2026-01-01" }),
        work({ id: "qc", status: "quoted", estimated_amount: 700, confirmed_amount: 650, confirmation_date: "2026-01-01" }),
      ],
    }));
    expect(s.pendingExtras).toEqual([{ id: "q", title: "q", quotedAmount: 5000 }]);
    expect(s.extras.map((e) => e.id)).toEqual(["qc"]);
    expect(s.summary.approvedExtras).toBe(650);
  });

  it("respects the as-on date for payments and extras", () => {
    const s = buildClientStatement(input({
      works: [work({ id: "late", confirmed_amount: 1000, confirmation_date: "2026-12-01" })],
      payments: [
        pay({ id: "in", amount: 10, payment_date: "2026-11-18" }),
        pay({ id: "out", amount: 20, payment_date: "2026-11-19" }),
      ],
    }));
    expect(s.payments.map((p) => p.id)).toEqual(["in"]);
    expect(s.extras).toHaveLength(0);
  });

  it("hides payment notes unless requested", () => {
    const payments = [pay({ id: "p", amount: 1, payment_date: "2026-01-01", notes: "for help" })];
    expect(buildClientStatement(input({ payments })).payments[0]!.notes).toBeNull();
    expect(buildClientStatement(input({ payments }, { includeNotes: true })).payments[0]!.notes).toBe("for help");
  });

  it("shows only transaction-like references unless notes are on", () => {
    const payments = [
      pay({ id: "a", amount: 1, payment_date: "2026-01-01", transaction_reference: "i went home and collect" }),
      pay({ id: "b", amount: 1, payment_date: "2026-01-02", transaction_reference: "UTR412345678901" }),
      pay({ id: "c", amount: 1, payment_date: "2026-01-03", transaction_reference: "Chq 004512" }),
      pay({ id: "d", amount: 1, payment_date: "2026-01-04", transaction_reference: "004512" }),
    ];
    expect(buildClientStatement(input({ payments })).payments.map((p) => p.reference))
      .toEqual([null, "UTR412345678901", null, "004512"]);
    expect(buildClientStatement(input({ payments }, { includeNotes: true })).payments[0]!.reference)
      .toBe("i went home and collect");
  });

  it("falls back to the default approver when a work has none recorded", () => {
    const works = [
      work({ id: "old", confirmed_amount: 100, confirmation_date: "2026-01-01" }),
      work({ id: "named", confirmed_amount: 100, confirmation_date: "2026-01-02", client_approved_by: "Srinivasan" }),
    ];
    const s = buildClientStatement({ ...input({ works }), defaultApprover: "Gayathri w/o Srinivasan" });
    expect(s.extras.map((e) => e.approvedBy)).toEqual(["Gayathri w/o Srinivasan", "Srinivasan"]);
    expect(buildClientStatement(input({ works })).extras[0]!.approvedBy).toBeNull();
  });

  it("falls back to the default payer when a payment has none recorded", () => {
    const payments = [
      pay({ id: "a", amount: 1, payment_date: "2026-01-01" }),
      pay({ id: "b", amount: 1, payment_date: "2026-01-02", received_from_client_id: "c1" }),
    ];
    const s = buildClientStatement({ ...input({ payments }), defaultPayer: "Srinivasan" });
    expect(s.payments.map((p) => p.from)).toEqual(["Srinivasan", "Gayathri w/o Srinivasan"]);
    expect(buildClientStatement(input({ payments })).payments[0]!.from).toBeNull();
  });

  it("handles an empty site", () => {
    const s = buildClientStatement(input({ site: { name: "Empty", contractValue: null } }));
    expect(s.summary).toMatchObject({ totalContract: 0, received: 0, balance: 0, pctReceived: 0 });
    expect(s.payments).toEqual([]);
  });
});

describe("helpers", () => {
  it("formats rupees with Indian grouping", () => {
    expect(formatRupees(2923500)).toBe("₹29,23,500");
    expect(formatRupees(49000.5)).toBe("₹49,000.50");
    expect(formatRupees(-500)).toBe("-₹500");
  });

  it("builds statement numbers", () => {
    expect(siteCode("Srinivasan House & Shop")).toBe("SHS");
    expect(makeStatementNo("aesta", "Srinivasan House & Shop", "2026-11-18", 3)).toBe("AESTA/SHS/2611/03");
  });

  it("derives a greeting name", () => {
    expect(greetingNameFrom("Gayathri w/o Srinivasan")).toBe("Gayathri");
    expect(greetingNameFrom("Ravi S/O. Kumar")).toBe("Ravi");
    expect(greetingNameFrom("Meena")).toBe("Meena");
  });

  it("labels the due date", () => {
    expect(dueLabelFor({ kind: "none" })).toBeNull();
    expect(dueLabelFor({ kind: "date", date: "2026-12-05" })).toBe("Payable by 05 Dec 2026");
  });
});
