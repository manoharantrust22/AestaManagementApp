/**
 * Shared write path for a contract-aware tea entry.
 *
 * Used by BOTH the enhanced TeaShopEntryDialog and the dedicated quick-add page
 * so there is ONE place that knows how to persist a contract-aware tea bill.
 *
 * What it writes:
 *  - a group `tea_shop_entries` row (total = the bill);
 *  - per-site `tea_shop_entry_allocations` with `is_manual_override = true` so the
 *    auto-recalc (`recalculate_tea_shop_allocations_for_date`) never re-includes a
 *    contract the engineer excluded — the hand-tuned split is frozen;
 *  - per-contract `tea_shop_entry_contract_selections` rows (the engineer's intent);
 *  - then runs the oldest-first settlement waterfall for the group.
 *
 * It does NOT touch `v_trade_tea_share` or any existing function — those stay as-is.
 */

import { ensureFreshSession } from "@/lib/auth/sessionManager";
import { recalculateWaterfallForGroup } from "@/hooks/queries/useGroupTeaShop";

export interface SiteAllocationInput {
  site_id: string;
  day_units_sum: number;
  worker_count: number;
  allocation_percentage: number;
  allocated_amount: number;
}

export interface ContractSelectionInput {
  site_id: string;
  presence_kind: "package" | "subcontract" | "mesthri";
  /** package_id / subcontract_id; null for the implicit mesthri row. */
  ref_id: string | null;
  trade_category_id: string | null;
  man_days: number;
  allocated_amount: number;
  is_included: boolean;
  is_amount_override: boolean;
}

export interface SaveContractTeaEntryParams {
  supabase: any;
  /** Set to edit an existing entry; omit/null to insert a new one. */
  existingEntryId?: string | null;
  teaShopId: string;
  /** The shop's own site id (group entries still carry it, like the legacy path). */
  primarySiteId: string | null;
  companyTeaShopId: string | null;
  siteGroupId: string;
  date: string;
  /** The full tea bill for the day. */
  total: number;
  notes: string | null;
  /** Σ man-days across all included rows (for reference on the entry). */
  totalDayUnits: number | null;
  allocations: SiteAllocationInput[];
  selections: ContractSelectionInput[];
  user: { name: string | null; id: string | null };
}

/** Persist a contract-aware tea entry; returns the entry id. */
export async function saveContractTeaEntry(p: SaveContractTeaEntryParams): Promise<string> {
  const { supabase } = p;
  await ensureFreshSession();

  const entryData: Record<string, unknown> = {
    tea_shop_id: p.teaShopId,
    site_id: p.primarySiteId,
    date: p.date,
    amount: p.total,
    total_amount: p.total,
    entry_mode: "simple",
    simple_total_cost: p.total,
    // The labor-group percentage split is not used in the contract-aware path.
    percentage_split: null,
    is_split_entry: false,
    split_percentage: null,
    split_target_site_id: null,
    company_tea_shop_id: p.companyTeaShopId,
    is_group_entry: true,
    site_group_id: p.siteGroupId,
    total_day_units: p.totalDayUnits,
    // Deprecated detailed fields kept at 0/null (parity with the legacy path).
    tea_rounds: 0,
    tea_rate_per_round: 0,
    tea_total: 0,
    snacks_items: null,
    snacks_total: 0,
    tea_people_count: 0,
    num_rounds: 0,
    num_people: 0,
    market_laborer_count: 0,
    market_laborer_tea_amount: 0,
    market_laborer_snacks_amount: 0,
    market_laborer_total: 0,
    nonworking_laborer_count: 0,
    nonworking_laborer_total: 0,
    working_laborer_count: 0,
    working_laborer_total: 0,
    // Common pool; the per-trade attribution view resolves NULL → default host.
    trade_pool_host_category_id: null,
    notes: p.notes,
    entered_by: p.user.name,
    entered_by_user_id: p.user.id,
  };

  let entryId = p.existingEntryId ?? null;

  if (entryId) {
    const { error: updateError } = await supabase
      .from("tea_shop_entries")
      .update({
        ...entryData,
        updated_by: p.user.name,
        updated_by_user_id: p.user.id,
      })
      .eq("id", entryId);
    if (updateError) throw updateError;
  } else {
    const { data: insertData, error: insertError } = await supabase
      .from("tea_shop_entries")
      .insert(entryData)
      .select("id")
      .single();
    if (insertError) throw insertError;
    entryId = insertData.id as string;
  }

  // Per-site allocations — ALWAYS manual override so the auto-recalc leaves the
  // engineer's contract selection alone (delete + re-insert, like the hook).
  await supabase.from("tea_shop_entry_allocations").delete().eq("entry_id", entryId);
  if (p.allocations.length > 0) {
    const { error: allocError } = await supabase.from("tea_shop_entry_allocations").insert(
      p.allocations.map((a) => ({
        ...a,
        entry_id: entryId,
        is_manual_override: true,
      }))
    );
    if (allocError) throw allocError;
  }

  // Per-contract breakdown (intent record). Additive — failure here must not
  // abort a recorded entry, but it should surface, so we throw on a hard error.
  await supabase.from("tea_shop_entry_contract_selections").delete().eq("entry_id", entryId);
  if (p.selections.length > 0) {
    const { error: selError } = await supabase
      .from("tea_shop_entry_contract_selections")
      .insert(p.selections.map((s) => ({ ...s, entry_id: entryId })));
    if (selError) throw selError;
  }

  // Re-run the oldest-first settlement waterfall for the whole group.
  if (p.siteGroupId) {
    await recalculateWaterfallForGroup(supabase, p.siteGroupId);
  }

  return entryId as string;
}
