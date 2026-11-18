import { describe, it, expect } from "vitest";
import { buildClientStatement, type BuildStatementInput } from "./buildClientStatement";
import { buildStatementMessage, statementFileName } from "./statementMessage";

function statement(contractValue: number, paid: number, due: BuildStatementInput["options"]["due"], titleVariant: "statement" | "final" = "statement") {
  return buildClientStatement({
    site: { name: "Srinivasan House & Shop", contractValue },
    company: { name: "Aesta Construction", code: "AESTA", addressLines: [], phone: null, email: null, gstin: null, logoUrl: null, payment: {}, footerNote: null, signatureDataUrl: null, signatoryName: null },
    recipient: { name: "Gayathri", phone: null, clientId: null },
    clients: [],
    works: [],
    payments: paid ? [{ id: "p", amount: paid, payment_date: "2026-11-01", payment_mode: "cash" }] : [],
    options: { asOfDate: "2026-11-18", titleVariant, due, includeNotes: false, statementNo: "X" },
  });
}

describe("buildStatementMessage", () => {
  it("writes a polite handover message with the balance", () => {
    const msg = buildStatementMessage({
      statement: statement(2923500, 2874500, { kind: "handover", date: "2026-11-20" }),
      greetingName: "Gayathri",
      lang: "en",
    });
    expect(msg).toContain("Dear Gayathri,");
    expect(msg).toContain("key handover of your home on Fri, 20 Nov 2026");
    expect(msg).toContain("Total project value: ₹29,23,500");
    expect(msg).toContain("Received so far: ₹28,74,500");
    expect(msg).toContain("*Balance to be settled at the key handover: ₹49,000*");
    expect(msg).toContain("reconcile it before the handover");
    expect(msg.trim().endsWith("Aesta Construction")).toBe(true);
  });

  it("uses a payable-by line for a due date and an outstanding line without one", () => {
    expect(buildStatementMessage({ statement: statement(100, 40, { kind: "date", date: "2026-12-05" }), greetingName: "A", lang: "en" }))
      .toContain("*Balance payable by 05 Dec 2026: ₹60*");
    expect(buildStatementMessage({ statement: statement(100, 40, { kind: "none" }), greetingName: "A", lang: "en" }))
      .toContain("*Balance outstanding: ₹60*");
  });

  it("thanks the client when settled and mentions credit when over-paid", () => {
    expect(buildStatementMessage({ statement: statement(100, 100, { kind: "none" }), greetingName: "A", lang: "en" }))
      .toContain("fully settled");
    expect(buildStatementMessage({ statement: statement(100, 150, { kind: "none" }), greetingName: "A", lang: "en" }))
      .toContain("*Excess received: ₹50*");
  });

  it("falls back to Sir/Madam without a name", () => {
    expect(buildStatementMessage({ statement: statement(1, 0, { kind: "none" }), greetingName: " ", lang: "en" }))
      .toContain("Dear Sir/Madam,");
  });

  it("writes Tamil with Tamil dates", () => {
    const msg = buildStatementMessage({
      statement: statement(2923500, 2874500, { kind: "handover", date: "2026-11-20" }),
      greetingName: "Gayathri",
      lang: "ta",
    });
    expect(msg).toContain("வணக்கம் Gayathri,");
    expect(msg).toContain("20 நவம்பர் 2026 (வெள்ளி)");
    expect(msg).toContain("₹49,000");
  });
});

describe("statementFileName", () => {
  it("slugs the site name", () => {
    expect(statementFileName(statement(1, 0, { kind: "none" }))).toBe("Statement_Srinivasan-House-Shop_2026-11-18.pdf");
    expect(statementFileName(statement(1, 0, { kind: "none" }, "final"))).toBe("Final-Settlement_Srinivasan-House-Shop_2026-11-18.pdf");
  });
});
