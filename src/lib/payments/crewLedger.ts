/**
 * Crew weekly-pay ledger — pure client model for the Salary Settlements
 * "By laborer" view.
 *
 * All money math lives server-side in get_salary_crew_ledger (the fill rules,
 * commission netting, pre/post-cutover semantics). This module only:
 *   1. maps the RPC's jsonb payload into camelCase types (defensively via
 *      Number() — jsonb numerics can arrive as strings through PostgREST),
 *   2. derives the mesthri strip view (remaining-first, mirroring
 *      computeMesthriStrip's semantics + the pool-absorbed chip),
 *   3. splits a "Pay all owed" total across weeks oldest-first (the
 *      allocation.ts convention) — the server re-clamps every week anyway.
 */

export type CrewPaymentState =
  | "considered_paid_waterfall"
  | "partial_waterfall"
  | "paid_direct"
  | "partial"
  | "unpaid";

export interface CrewLedgerRow {
  laborerId: string;
  name: string;
  role: string | null;
  isMesthri: boolean;
  days: number;
  gross: number;
  commission: number;
  net: number;
  /** What this person is owed for the week: net for crew, own+commission for the mesthri. */
  earned: number;
  paid: number;
  unpaid: number;
  paymentState: CrewPaymentState;
}

export interface CrewLedgerWeek {
  weekStart: string;
  weekEnd: string;
  isPostCutover: boolean;
  laborerCount: number;
  wagesDue: number;
  commissionTotal: number;
  mesthriOwn: number;
  weekPaid: number;
  rows: CrewLedgerRow[];
}

export interface CrewMesthriBlock {
  laborerId: string;
  name: string;
  ownGross: number;
  commissionAccrued: number;
  ownPaid: number;
  commissionPaid: number;
  commissionPaidDirect: number;
  /** Untargeted pool money (excess / lumps) absorbed into own wages + commission. */
  poolAbsorbed: number;
  ownRemaining: number;
  commissionRemaining: number;
  stillToPay: number;
}

export interface CrewLedger {
  enabled: true;
  config: {
    subcontractId: string;
    mesthriId: string;
    mesthriName: string;
    effectiveFrom: string;
  };
  weeks: CrewLedgerWeek[];
  mesthri: CrewMesthriBlock;
  totals: {
    weeksCount: number;
    gross: number;
    commission: number;
    laborersNet: number;
    laborersUnpaid: number;
  };
  pool: {
    poolTotal: number;
    commissionCashTotal: number;
    absorbedPre: number;
    absorbedMesthri: number;
    futureCredit: number;
  };
}

export type CrewLedgerResult = CrewLedger | { enabled: false };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function mapCrewLedger(raw: unknown): CrewLedgerResult {
  const r = raw as Record<string, any> | null | undefined;
  if (!r || r.enabled !== true || !r.config) return { enabled: false };

  const weeks: CrewLedgerWeek[] = (Array.isArray(r.weeks) ? r.weeks : []).map((w: any) => ({
    weekStart: str(w.week_start),
    weekEnd: str(w.week_end),
    isPostCutover: Boolean(w.is_post_cutover),
    laborerCount: num(w.laborer_count),
    wagesDue: num(w.wages_due),
    commissionTotal: num(w.commission_total),
    mesthriOwn: num(w.mesthri_own_gross),
    weekPaid: num(w.week_paid),
    rows: (Array.isArray(w.rows) ? w.rows : []).map((row: any): CrewLedgerRow => ({
      laborerId: str(row.laborer_id),
      name: str(row.name),
      role: row.role ?? null,
      isMesthri: Boolean(row.is_mesthri),
      days: num(row.days),
      gross: num(row.gross),
      commission: num(row.commission),
      net: num(row.net),
      earned: num(row.earned),
      paid: num(row.paid),
      unpaid: num(row.unpaid),
      paymentState: (row.payment_state as CrewPaymentState) ?? "unpaid",
    })),
  }));

  const m = r.mesthri ?? {};
  return {
    enabled: true,
    config: {
      subcontractId: str(r.config.subcontract_id),
      mesthriId: str(r.config.mesthri_id),
      mesthriName: str(r.config.mesthri_name),
      effectiveFrom: str(r.config.effective_from),
    },
    weeks,
    mesthri: {
      laborerId: str(m.laborer_id),
      name: str(m.name),
      ownGross: num(m.own_gross),
      commissionAccrued: num(m.commission_accrued),
      ownPaid: num(m.own_paid),
      commissionPaid: num(m.commission_paid),
      commissionPaidDirect: num(m.commission_paid_direct),
      poolAbsorbed: num(m.pool_absorbed),
      ownRemaining: num(m.own_remaining),
      commissionRemaining: num(m.commission_remaining),
      stillToPay: num(m.still_to_pay),
    },
    totals: {
      weeksCount: num(r.totals?.weeks_count),
      gross: num(r.totals?.gross),
      commission: num(r.totals?.commission),
      laborersNet: num(r.totals?.laborers_net),
      laborersUnpaid: num(r.totals?.laborers_unpaid),
    },
    pool: {
      poolTotal: num(r.pool?.pool_total),
      commissionCashTotal: num(r.pool?.commission_cash_total),
      absorbedPre: num(r.pool?.absorbed_pre),
      absorbedMesthri: num(r.pool?.absorbed_mesthri),
      futureCredit: num(r.pool?.future_credit),
    },
  };
}

export interface CrewStripView {
  ownRemaining: number;
  commissionRemaining: number;
  /** The headline: own wages + commission still to pay. */
  stillToPay: number;
  totalPaid: number;
  totalEarned: number;
  /** 0..100, rounded; capped at 100 (drives a progress bar). */
  pctPaid: number;
  isSettled: boolean;
  /** Pool money (excess / lumps) already counted toward the mesthri — the chip. */
  poolAbsorbed: number;
}

/** Below this, a residue is float noise rather than real debt (mesthriStripMath). */
const SETTLED_EPSILON = 0.5;

export function computeCrewStripView(m: CrewMesthriBlock): CrewStripView {
  const stillToPay = m.ownRemaining + m.commissionRemaining;
  const totalPaid = m.ownPaid + m.commissionPaid;
  const totalEarned = m.ownGross + m.commissionAccrued;
  return {
    ownRemaining: m.ownRemaining,
    commissionRemaining: m.commissionRemaining,
    stillToPay,
    totalPaid,
    totalEarned,
    pctPaid: totalEarned > 0 ? Math.min(100, Math.round((totalPaid / totalEarned) * 100)) : 0,
    isSettled: totalEarned > 0 && stillToPay <= SETTLED_EPSILON,
    poolAbsorbed: m.poolAbsorbed,
  };
}

export interface WeekAllocation {
  weekStart: string;
  amount: number;
}

const round2Down = (n: number) => Math.floor(n * 100) / 100;

/**
 * Split a hand-payment total across owed weeks, oldest first. Never overshoots
 * the total or a week's unpaid; the server clamp is still authoritative.
 */
export function allocatePayAllOwed(
  total: number,
  weeks: Array<{ weekStart: string; unpaid: number }>,
): WeekAllocation[] {
  let remaining = round2Down(Math.max(total, 0));
  const out: WeekAllocation[] = [];
  const ordered = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  for (const w of ordered) {
    if (remaining <= 0) break;
    const amount = round2Down(Math.min(remaining, Math.max(w.unpaid, 0)));
    if (amount <= 0) continue;
    out.push({ weekStart: w.weekStart, amount });
    remaining = round2Down(remaining - amount);
  }
  return out;
}
