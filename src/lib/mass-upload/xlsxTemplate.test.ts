import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildLegacyXlsxTemplate, parseLegacyXlsx } from "./xlsxTemplate";

/** Same thenable-builder mock shape as serverValidate.test.ts (queries end in .order). */
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
    };
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => builder(t) } as any;
}

const datasets = {
  payer_sources: [
    { label: "Own Money" },
    { label: "Amma Money" },
    { label: "Trust Account" },
  ],
  subcontracts: [{ title: "Ground Floor Construction" }, { title: "1st Floor Construction" }],
  expense_categories: [{ name: "Material Settlement" }, { name: "Daily Labor Settlement" }],
};

async function build() {
  return buildLegacyXlsxTemplate(mockClient(datasets), "site-1");
}

describe("buildLegacyXlsxTemplate", () => {
  it("writes a Data sheet with the expected headers and a Lists sheet of per-site values", async () => {
    const buf = await build();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as Parameters<typeof wb.xlsx.load>[0]);

    const data = wb.getWorksheet("Data");
    const lists = wb.getWorksheet("Lists");
    expect(data).toBeTruthy();
    expect(lists).toBeTruthy();

    const headers = (data!.getRow(1).values as unknown[]).filter(Boolean).map(String);
    expect(headers).toEqual(
      expect.arrayContaining(["date", "amount", "category", "subcontract", "payment_mode", "payer_source"])
    );

    // Lists sheet carries the site's actual dropdown values.
    const colValues = (letter: string) => {
      const out: string[] = [];
      lists!.getColumn(letter).eachCell((c, rowNo) => {
        if (rowNo > 1 && c.value) out.push(String(c.value));
      });
      return out;
    };
    expect(colValues("A")).toEqual(["Own Money", "Amma Money", "Trust Account"]); // payer labels
    expect(colValues("B")).toEqual(["Ground Floor Construction", "1st Floor Construction"]); // subs
    expect(colValues("C")).toEqual(["Material Settlement", "Daily Labor Settlement"]); // categories
    expect(colValues("D").length).toBeGreaterThan(0); // payment modes
  });

  it("attaches list data-validations (dropdowns) on the restricted columns", async () => {
    const buf = await build();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as Parameters<typeof wb.xlsx.load>[0]);
    const data = wb.getWorksheet("Data")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (data as any).dataValidations?.model ?? {};
    const validations = Object.values(model) as Array<{ type?: string }>;
    expect(validations.length).toBeGreaterThanOrEqual(1);
    expect(validations.some((v) => v.type === "list")).toBe(true);
  });
});

describe("parseLegacyXlsx", () => {
  it("round-trips: parses the built template's Data sheet back into keyed rows", async () => {
    const buf = await build();
    const rows = await parseLegacyXlsx(buf);
    // The template ships one example row.
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.date).toBeTruthy();
    expect(row.amount).toBe("5000");
    expect(row.category).toBe("Material Settlement"); // first category used in the example
    expect(row.payer_source).toBe("Own Money"); // first payer label used in the example
  });
});
