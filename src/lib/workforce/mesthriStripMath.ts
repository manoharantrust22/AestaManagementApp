/**
 * Mesthri pay-strip arithmetic for one contract.
 *
 * All inputs are PROJECT-scoped (lifetime) — the strip answers "what do I still owe
 * him on this contract", which payments only ever have a project scope for.
 *
 * Commission accrues per contract but is paid per (site, collector). Only payouts
 * explicitly tagged with this contract count as `commissionPaid`; older untagged ones
 * are surfaced via `untaggedNote` instead, because counting them would understate the
 * debt and ignoring them silently would overstate it.
 */

export interface MesthriStripInput {
  /** Net earned by the mesthri's OWN days. Equals gross: the commission view
   *  self-excludes the collector, so he accrues no commission on himself. */
  ownNet: number;
  /** Paid against own wages, tagged to this contract. */
  ownPaid: number;
  /** Commission accrued on THIS contract's crew days. */
  commissionAccrued: number;
  /** Commission paid AND tagged to THIS contract. */
  commissionPaid: number;
  /** Commission paid to him site-wide with no contract tag (legacy payouts). */
  untaggedCommissionPaid: number;
  /** The contract's mesthri_commission_applies flag. */
  commissionApplies: boolean;
}

export interface MesthriStripView {
  ownRemaining: number;
  commissionRemaining: number;
  /** The headline: own wages + commission still to pay. */
  stillToPay: number;
  totalPaid: number;
  totalEarned: number;
  /** 0..100, rounded. 0 when nothing has been earned; capped at 100 when overpaid,
   *  because it drives a progress bar that overflows its track past 100. */
  pctPaid: number;
  isSettled: boolean;
  /** Untagged site-wide commission to warn about; 0 when there is nothing to say. */
  untaggedNote: number;
}

/** Below this, a residue is float noise rather than real debt. */
const SETTLED_EPSILON = 0.5;

export function computeMesthriStrip(input: MesthriStripInput): MesthriStripView {
  const accrued = input.commissionApplies ? input.commissionAccrued : 0;
  const commPaid = input.commissionApplies ? input.commissionPaid : 0;

  const ownRemaining = Math.max(input.ownNet - input.ownPaid, 0);
  const commissionRemaining = Math.max(accrued - commPaid, 0);
  const stillToPay = ownRemaining + commissionRemaining;
  const totalPaid = input.ownPaid + commPaid;
  const totalEarned = input.ownNet + accrued;

  return {
    ownRemaining,
    commissionRemaining,
    stillToPay,
    totalPaid,
    totalEarned,
    pctPaid: totalEarned > 0 ? Math.min(100, Math.round((totalPaid / totalEarned) * 100)) : 0,
    isSettled: totalEarned > 0 && stillToPay <= SETTLED_EPSILON,
    untaggedNote: input.commissionApplies ? Math.max(input.untaggedCommissionPaid, 0) : 0,
  };
}
