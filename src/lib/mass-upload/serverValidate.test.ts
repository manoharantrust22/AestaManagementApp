import { describe, it, expect } from "vitest";
import { validateRowsServerSide } from "./serverValidate";

/**
 * Minimal chainable Supabase mock. validateRowsServerSide receives the client as an
 * argument (it never calls createClient itself), so we just feed canned datasets per table.
 * Every builder is "thenable" so `await client.from(t).select().eq()...` resolves to {data}.
 */
type Row = Record<string, unknown>;
function mockClient(datasets: Record<string, Row[]>) {
  const builder = (table: string) => {
    const rows = datasets[table] ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: rows, error: null }),
      single: () => ({
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve({ data: rows[0] ?? null, error: null }),
      }),
    };
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => builder(t) } as any;
}

const SITE = "site-1";

const datasets = {
  payer_sources: [
    { key: "own_money", label: "Own Money" },
    { key: "trust_account", label: "Trust Account" },
    { key: "amma_money", label: "Amma Money" },
  ],
  subcontracts: [{ id: "sub-1", title: "Ground Floor Construction", total_value: 500000 }],
  expense_categories: [
    { id: "cat-1", name: "Material Settlement" },
    { id: "cat-2", name: "Daily Labor Settlement" },
  ],
  sites: [{ data_started_at: "2025-11-09" }],
};

const baseRow = {
  date: "2024-12-05",
  amount: "5000",
  payment_mode: "cash",
};

function run(rows: Record<string, string>[]) {
  return validateRowsServerSide(mockClient(datasets), "legacy_misc_expenses", SITE, rows);
}

describe("validateRowsServerSide — legacy payer_source (per-site)", () => {
  it("resolves a payer source by its human LABEL to the canonical key", async () => {
    const { parsedRows } = await run([{ ...baseRow, payer_source: "Trust Account" }]);
    expect(parsedRows[0].status).not.toBe("error");
    expect(parsedRows[0].transformedData.payer_source).toBe("trust_account");
  });

  it("resolves a payer source given by its raw KEY", async () => {
    const { parsedRows } = await run([{ ...baseRow, payer_source: "own_money" }]);
    expect(parsedRows[0].status).not.toBe("error");
    expect(parsedRows[0].transformedData.payer_source).toBe("own_money");
  });

  it("blocks a payer source not configured for the site", async () => {
    const { parsedRows } = await run([{ ...baseRow, payer_source: "Bank XYZ" }]);
    expect(parsedRows[0].status).toBe("error");
    expect(parsedRows[0].errors.some((e) => /not a payment source/i.test(e.message))).toBe(true);
  });

  it("allows a blank payer source (optional)", async () => {
    const { parsedRows } = await run([{ ...baseRow, payer_source: "" }]);
    expect(parsedRows[0].status).not.toBe("error");
    expect(parsedRows[0].transformedData.payer_source ?? null).toBeNull();
  });
});

describe("validateRowsServerSide — strict category / subcontract", () => {
  it("resolves a valid category name to its id", async () => {
    const { parsedRows } = await run([{ ...baseRow, category: "Material Settlement" }]);
    expect(parsedRows[0].status).not.toBe("error");
    expect(parsedRows[0].transformedData.category_id).toBe("cat-1");
  });

  it("blocks an unknown category (strictLookup) instead of warning", async () => {
    const { parsedRows } = await run([{ ...baseRow, category: "Made Up Category" }]);
    expect(parsedRows[0].status).toBe("error");
    expect(parsedRows[0].errors.some((e) => e.field === "category_id")).toBe(true);
  });

  it("allows a blank category (blank is still legal)", async () => {
    const { parsedRows } = await run([{ ...baseRow, category: "" }]);
    expect(parsedRows[0].status).not.toBe("error");
    expect(parsedRows[0].transformedData.category_id ?? null).toBeNull();
  });

  it("resolves a valid subcontract title, blocks an unknown one", async () => {
    const ok = await run([{ ...baseRow, subcontract: "Ground Floor Construction" }]);
    expect(ok.parsedRows[0].transformedData.subcontract_id).toBe("sub-1");

    const bad = await run([{ ...baseRow, subcontract: "Roof Work" }]);
    expect(bad.parsedRows[0].status).toBe("error");
    expect(bad.parsedRows[0].errors.some((e) => e.field === "subcontract_id")).toBe(true);
  });
});

describe("validateRowsServerSide — cutoff awareness", () => {
  it("warns (not errors) for a row dated on/after the site cutoff", async () => {
    const { parsedRows } = await run([{ ...baseRow, date: "2025-12-01" }]);
    expect(parsedRows[0].status).toBe("warning");
    expect(parsedRows[0].warnings.some((w) => /cutoff/i.test(w.message))).toBe(true);
  });
});
