/**
 * Single source of truth for "which trades earn an attendance/salary/holidays
 * workspace chip" on a site.
 *
 * This rule used to be inlined separately in TradeChipFilter and holidays-content,
 * and the drift between the two copies caused a real bug (a ladder-only trade —
 * Workspace toggle OFF but holding a detailed contract — wrongly showed an
 * attendance chip). Centralising it here keeps every surface (attendance chips,
 * holidays chip-row gate, the site-dashboard "Today by trade" card) in lock-step.
 *
 * The rule: Civil is always a workspace. A non-Civil trade qualifies iff BOTH
 *   1. its per-site Workspace toggle is ON — `category.hasWorkspace !== false`
 *      (resolved from `site_trade_settings.has_workspace`; `undefined` = ON), AND
 *   2. it has at least one contract in FULL per-laborer ("detailed") mode to scope
 *      into — the chip navigates to `?contractId=<that contract>`, so a trade with
 *      none has nothing to record against and stays hidden.
 * Count-by-role ("headcount") and lump ("mesthri_only"/"mid") contracts do their
 * counts/payouts inline on the contract and never earn a workspace chip.
 */
import type { Trade, TradeContract } from "@/types/trade.types";

/** A contract is a real attendance/salary workspace only in full per-laborer mode. */
export const isTrackedContract = (c: TradeContract): boolean =>
  c.laborTrackingMode === "detailed";

/**
 * Civil + the non-Civil trades that earn a workspace chip. Returns the SAME Trade
 * objects but with `contracts` narrowed to detailed-only, so callers can safely read
 * `contracts[0].id` for navigation and `contracts.length` for the "(N)" badge.
 *
 * The `.map(filter detailed)` BEFORE the `.filter(...)` is load-bearing: a trade
 * qualifies on the count of its *detailed* contracts, not its total contracts.
 * The `=== false` check (not `!hasWorkspace`) keeps `undefined` treated as ON.
 */
export function visibleTradeWorkspaces(trades: Trade[] | undefined): Trade[] {
  return (trades ?? [])
    .map((t) => ({ ...t, contracts: t.contracts.filter(isTrackedContract) }))
    .filter((t) => {
      if (t.category.name === "Civil") return true;
      if (t.category.hasWorkspace === false) return false;
      return t.contracts.length > 0;
    });
}

/**
 * True when at least one NON-Civil workspace trade qualifies. Drives "self-hide the
 * whole chip row on Civil-only sites" (TradeChipFilter) and the holidays chip-row gate.
 */
export function hasNonCivilWorkspace(trades: Trade[] | undefined): boolean {
  return visibleTradeWorkspaces(trades).some(
    (t) => t.category.name !== "Civil" && t.contracts.length > 0,
  );
}
