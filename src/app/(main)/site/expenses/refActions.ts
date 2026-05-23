import type { ExpenseRow } from "@/hooks/queries/useExpensesData";

// `RefAction` is the discriminated union returned by resolveRefAction.
// `navigate` and `weekly-fallback-nav` both result in `router.push(url)` at
// the call site, but they are kept distinct so future telemetry / UI
// affordances can react differently to "user opened a detail page" vs
// "user fell back to a list page because we lacked weekly context".
export type RefAction =
  | { kind: "navigate"; url: string }
  | { kind: "rental-pane"; orderId: string }
  | { kind: "daily-pane"; date: string; ref: string }
  | {
      kind: "weekly-pane";
      laborerId: string;
      weekStart: string;
      weekEnd: string;
      ref: string;
    }
  | { kind: "weekly-fallback-nav"; url: string }
  | { kind: "edit-dialog" }
  | { kind: "unknown" };

function matRefUrl(ref: string): string {
  return `/site/material-settlements?highlight=${encodeURIComponent(ref)}`;
}
function miscUrl(ref: string): string {
  return `/site/expenses/miscellaneous?highlight=${encodeURIComponent(ref)}`;
}
function teaShopUrl(ref: string): string {
  return `/site/tea-shop?highlight=${encodeURIComponent(ref)}`;
}
function weeklyFallbackUrl(ref: string): string {
  return `/site/payments?tab=contract&highlight=${encodeURIComponent(ref)}`;
}

// Weekly settlement rows expose `contract_laborer_id`, `week_start`, and
// `week_end` from the `v_all_expenses` view. These columns aren't on the
// `ExpenseRow` type today (the type is shared with non-weekly rows that
// don't have them), so we narrow via cast. If these become a regular need,
// promote them onto `ExpenseRow` as optional fields.
function resolveWeekly(row: ExpenseRow, ref: string): RefAction {
  const lid = (row as unknown as { contract_laborer_id?: string })
    .contract_laborer_id;
  const ws = (row as unknown as { week_start?: string }).week_start;
  const we = (row as unknown as { week_end?: string }).week_end;
  if (lid && ws && we) {
    return {
      kind: "weekly-pane",
      laborerId: lid,
      weekStart: ws,
      weekEnd: we,
      ref,
    };
  }
  return { kind: "weekly-fallback-nav", url: weeklyFallbackUrl(ref) };
}

export function resolveRefAction(row: ExpenseRow): RefAction {
  const ref = row.settlement_reference;
  if (!ref) return { kind: "unknown" };

  // Source-type-first routing — authoritative.
  switch (row.source_type) {
    case "material_purchase":
      return { kind: "navigate", url: matRefUrl(ref) };
    case "rental_settlement":
      if (row.source_id) return { kind: "rental-pane", orderId: row.source_id };
      break;
    case "misc_expense":
      return { kind: "navigate", url: miscUrl(ref) };
    case "tea_shop_settlement":
      return { kind: "navigate", url: teaShopUrl(ref) };
    case "subcontract_payment":
      // /site/subcontracts doesn't yet honour ?highlight=, so we land the
      // user on the page without one. Add it here if/when the page supports it.
      return { kind: "navigate", url: "/site/subcontracts" };
    case "settlement":
      if (ref.startsWith("WS-")) return resolveWeekly(row, ref);
      return { kind: "daily-pane", date: row.date, ref };
    case "expense":
      // Manual entries: open the row's edit dialog (full row context).
      // Prefix backups below catch the case where a manual row's ref still
      // looks like a settlement code (e.g. it was carried over from import).
      break;
  }

  // Prefix-based backup — covers source_type drift or rows the switch didn't
  // resolve (e.g. rental_settlement missing source_id, manual expense rows
  // bearing a settlement-style ref).
  if (ref.startsWith("MISC-")) return { kind: "navigate", url: miscUrl(ref) };
  if (ref.startsWith("TSS-")) return { kind: "navigate", url: teaShopUrl(ref) };
  if (ref.startsWith("SCP-")) return { kind: "navigate", url: "/site/subcontracts" };
  if (ref.startsWith("SELF-")) return { kind: "navigate", url: matRefUrl(ref) };
  if (ref.startsWith("RSET-") && row.source_id) {
    return { kind: "rental-pane", orderId: row.source_id };
  }
  if (ref.startsWith("WS-")) return resolveWeekly(row, ref);
  if (
    ref.startsWith("DLY-") ||
    ref.startsWith("SS-") ||
    ref.startsWith("SET-")
  ) {
    return { kind: "daily-pane", date: row.date, ref };
  }

  // For source_type='expense' rows we already broke out of the switch; route
  // those to the edit dialog so the user sees the full row form.
  if (row.source_type === "expense") return { kind: "edit-dialog" };

  return { kind: "unknown" };
}
