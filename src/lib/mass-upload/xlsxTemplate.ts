/**
 * Server-side .xlsx template generation + parsing for the legacy expense importer.
 *
 * The downloaded template is a real Excel workbook whose payer_source / subcontract /
 * category / payment_mode columns are locked to dropdowns built from the SELECTED SITE's
 * actual configured values — so the user can't type something the app doesn't know.
 * exceljs stays entirely server-side (no client-bundle cost); the uploaded .xlsx is read
 * back into the same Record<string,string>[] shape the CSV path produces.
 */

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getTableConfig } from "./tableConfigs";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const LEGACY_TABLE = "legacy_misc_expenses" as const;
const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "cheque"];
const DATA_SHEET = "Data";
const LISTS_SHEET = "Lists";
const VALIDATION_ROWS = 2000; // apply dropdowns to rows 2..N

/** Per-site allowed values that drive the dropdowns. */
async function fetchSiteAllowedValues(supabase: ServerClient, siteId: string) {
  // payer_sources isn't in the generated Database types -> cast the query builder.
  const payerSrcQuery = (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: unknown) => {
          eq: (k: string, v: unknown) => {
            order: (c: string) => Promise<{ data: { label: string }[] | null }>;
          };
        };
      };
    };
  })
    .from("payer_sources")
    .select("label, sort_order")
    .eq("site_id", siteId)
    .eq("is_hidden", false)
    .order("sort_order");

  const [{ data: payerSrcs }, { data: subs }, { data: cats }] = await Promise.all([
    payerSrcQuery,
    supabase.from("subcontracts").select("title").eq("site_id", siteId).order("title"),
    supabase
      .from("expense_categories")
      .select("name")
      .eq("module", "miscellaneous")
      .eq("is_active", true)
      .order("name"),
  ]);

  const payerLabels = ((payerSrcs as { label: string }[] | null) ?? [])
    .map((p) => p.label)
    .filter(Boolean);
  const subTitles = ((subs as { title: string }[] | null) ?? [])
    .map((s) => s.title)
    .filter(Boolean);
  const categoryNames = ((cats as { name: string }[] | null) ?? [])
    .map((c) => c.name)
    .filter(Boolean);

  return { payerLabels, subTitles, categoryNames, paymentModes: PAYMENT_MODES };
}

/**
 * Build the per-site legacy expense .xlsx template with dropdown-restricted columns.
 * Returns an ArrayBuffer ready to stream as a download.
 */
export async function buildLegacyXlsxTemplate(
  supabase: ServerClient,
  siteId: string
): Promise<ArrayBuffer> {
  const config = getTableConfig(LEGACY_TABLE);
  if (!config) throw new Error("legacy_misc_expenses config not found");
  const headers = config.fields.map((f) => f.csvHeader);

  const { payerLabels, subTitles, categoryNames, paymentModes } =
    await fetchSiteAllowedValues(supabase, siteId);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Aesta";
  const data = wb.addWorksheet(DATA_SHEET);
  const lists = wb.addWorksheet(LISTS_SHEET);

  // --- Data sheet: header + one example row ---
  data.addRow(headers);
  data.getRow(1).font = { bold: true };

  const example: Record<string, string> = {
    date: "2024-12-05",
    amount: "5000",
    category: categoryNames[0] ?? "",
    subcontract: "",
    vendor_name: "Example vendor",
    description: "EXAMPLE ROW — delete before importing",
    payment_mode: "cash",
    payer_source: payerLabels[0] ?? "",
    payer_name: "",
    notes: "Legacy paper record",
  };
  data.addRow(headers.map((h) => example[h] ?? ""));
  data.columns.forEach((c) => {
    c.width = 20;
  });

  // --- Lists sheet (hidden): one column per dropdown source ---
  const listCols: Array<{ letter: string; header: string; values: string[] }> = [
    { letter: "A", header: "payer_source", values: payerLabels },
    { letter: "B", header: "subcontract", values: subTitles },
    { letter: "C", header: "category", values: categoryNames },
    { letter: "D", header: "payment_mode", values: paymentModes },
  ];
  listCols.forEach((col) => {
    lists.getCell(`${col.letter}1`).value = col.header;
    col.values.forEach((v, i) => {
      lists.getCell(`${col.letter}${i + 2}`).value = v;
    });
  });
  lists.state = "hidden";

  // --- Dropdown validations on the Data sheet, referencing the Lists ranges ---
  const headerToCol = (header: string): string | null => {
    const idx = headers.indexOf(header);
    if (idx < 0) return null;
    return data.getColumn(idx + 1).letter;
  };
  // exceljs exposes worksheet.dataValidations at runtime but the type isn't declared.
  const dataValidations = (data as unknown as {
    dataValidations: { add: (ref: string, model: unknown) => void };
  }).dataValidations;
  const addDropdown = (header: string, listLetter: string, count: number) => {
    if (count <= 0) return; // no values -> leave free (server still validates)
    const dataCol = headerToCol(header);
    if (!dataCol) return;
    const formula = `${LISTS_SHEET}!$${listLetter}$2:$${listLetter}$${count + 1}`;
    dataValidations.add(`${dataCol}2:${dataCol}${VALIDATION_ROWS}`, {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Not allowed",
      error: "Pick a value from the dropdown (these are this site's configured values).",
    });
  };
  addDropdown("payer_source", "A", payerLabels.length);
  addDropdown("subcontract", "B", subTitles.length);
  addDropdown("category", "C", categoryNames.length);
  addDropdown("payment_mode", "D", paymentModes.length);

  return wb.xlsx.writeBuffer();
}

/** Coerce an exceljs cell value into a plain trimmed string. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (typeof v.text === "string") return v.text.trim(); // hyperlink cell
    if ("result" in v) return cellToString(v.result as ExcelJS.CellValue); // formula cell
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text: string }>).map((r) => r.text).join("").trim();
    }
    return "";
  }
  return String(value).trim();
}

/**
 * Read an uploaded .xlsx (the "Data" sheet) into the same row shape the CSV path yields:
 * an array of objects keyed by the header row. Blank rows are dropped.
 */
export async function parseLegacyXlsx(
  buffer: ArrayBuffer
): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs types `load` as its own Buffer (extends ArrayBuffer); an ArrayBuffer is
  // accepted at runtime — cast to satisfy the stricter declared type.
  await wb.xlsx.load(buffer as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.getWorksheet(DATA_SHEET) ?? wb.worksheets[0];
  if (!ws) return [];

  const headers: Record<number, string> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellToString(cell.value);
    if (h) headers[col] = h;
  });

  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const obj: Record<string, string> = {};
    let hasValue = false;
    Object.entries(headers).forEach(([colStr, header]) => {
      const col = Number(colStr);
      const str = cellToString(row.getCell(col).value);
      obj[header] = str;
      if (str) hasValue = true;
    });
    if (hasValue) rows.push(obj);
  });

  return rows;
}
