/**
 * summarizeLegacyExpenseBatch — pure financial rollup for a legacy-expense import.
 *
 * Used server-side in two places:
 *   - the validate route, to drive the preview summary panel
 *   - the import route, to freeze the same summary into import_batches.summary
 *
 * It operates on RESOLVED rows (category_id / subcontract_id already looked up), so
 * it has no DB or network dependency and is trivially unit-testable.
 *
 * The per-subcontract `balance` (value - importedSpend) is INDICATIVE only — it
 * reflects just this batch, not the live cross-source total (that stays
 * calculateSubcontractTotals() over v_all_expenses). Labelled "as imported" in the UI.
 */

import { LegacyExpenseSummary } from "@/types/mass-upload.types";

export interface LegacyExpenseRowInput {
  amount: number | string | null | undefined;
  date?: string | null;
  category_id?: string | null;
  subcontract_id?: string | null;
  payer_source?: string | null;
}

export interface LegacyExpenseSummaryContext {
  subcontracts: Array<{ id: string; title: string; total_value: number | null }>;
  categories: Array<{ id: string; name: string }>;
  cutoffDate: string | null; // sites.data_started_at (YYYY-MM-DD)
}

const UNCATEGORIZED = "Uncategorized";
const NO_SUBCONTRACT = "(No subcontract)";
const UNSPECIFIED_PAYER = "unspecified";

function toAmount(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function summarizeLegacyExpenseBatch(
  rows: LegacyExpenseRowInput[],
  ctx: LegacyExpenseSummaryContext
): LegacyExpenseSummary {
  const categoryName = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const subById = new Map(ctx.subcontracts.map((s) => [s.id, s]));

  let totalSpent = 0;
  let rowsOnOrAfterCutoff = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  const catMap = new Map<string, { categoryId: string | null; name: string; total: number; count: number }>();
  const subMap = new Map<
    string,
    { subcontractId: string | null; title: string; matched: boolean; value: number | null; importedSpend: number }
  >();
  const payerMap = new Map<string, { payerSource: string; total: number; count: number }>();

  for (const row of rows) {
    const amount = toAmount(row.amount);
    totalSpent += amount;

    // date range + cutoff flag (string compare is valid for YYYY-MM-DD)
    const date = row.date ?? null;
    if (date) {
      if (minDate === null || date < minDate) minDate = date;
      if (maxDate === null || date > maxDate) maxDate = date;
      if (ctx.cutoffDate && date >= ctx.cutoffDate) rowsOnOrAfterCutoff += 1;
    }

    // by category — an unknown id collapses into the single Uncategorized bucket
    const rawCatId = row.category_id ?? null;
    const resolvedCatName = rawCatId ? categoryName.get(rawCatId) : undefined;
    const catId = resolvedCatName ? rawCatId : null;
    const catKey = catId ?? "__none__";
    const existingCat = catMap.get(catKey);
    if (existingCat) {
      existingCat.total += amount;
      existingCat.count += 1;
    } else {
      catMap.set(catKey, {
        categoryId: catId,
        name: resolvedCatName ?? UNCATEGORIZED,
        total: amount,
        count: 1,
      });
    }

    // by subcontract
    const subId = row.subcontract_id ?? null;
    const subKey = subId ?? "__none__";
    const matchedSub = subId ? subById.get(subId) : undefined;
    const existingSub = subMap.get(subKey);
    if (existingSub) {
      existingSub.importedSpend += amount;
    } else {
      subMap.set(subKey, {
        subcontractId: subId,
        title: subId ? matchedSub?.title ?? subId : NO_SUBCONTRACT,
        matched: Boolean(matchedSub),
        value: matchedSub ? matchedSub.total_value ?? null : null,
        importedSpend: amount,
      });
    }

    // by payer source
    const payer = row.payer_source ?? UNSPECIFIED_PAYER;
    const existingPayer = payerMap.get(payer);
    if (existingPayer) {
      existingPayer.total += amount;
      existingPayer.count += 1;
    } else {
      payerMap.set(payer, { payerSource: payer, total: amount, count: 1 });
    }
  }

  const byCategory = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

  const bySubcontract = Array.from(subMap.values())
    .map((s) => ({
      subcontractId: s.subcontractId,
      title: s.title,
      matched: s.matched,
      value: s.value,
      importedSpend: s.importedSpend,
      balance: s.value === null ? null : s.value - s.importedSpend,
    }))
    .sort((a, b) => b.importedSpend - a.importedSpend);

  const byPayerSource = Array.from(payerMap.values()).sort((a, b) => b.total - a.total);

  return {
    totalSpent,
    count: rows.length,
    byCategory,
    bySubcontract,
    byPayerSource,
    dateRange: { min: minDate, max: maxDate },
    rowsOnOrAfterCutoff,
  };
}
