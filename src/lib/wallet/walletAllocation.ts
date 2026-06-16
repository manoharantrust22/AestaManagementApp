/**
 * Engineer-wallet source allocation — pure, deterministic spec.
 *
 * This is the authoritative model for "which deposited money source funded
 * which spend". The live Postgres RPCs (atomic_record_wallet_spend +
 * atomic_record_wallet_deposit/heal_pending_allocations) and the one-time
 * re-derivation migration all MIRROR this logic; the unit tests here pin the
 * exact expected behaviour with concrete numbers so the SQL can be validated
 * against it.
 *
 * Model (FIFO waterfall + deposit-time healing):
 *   - A SPEND draws from deposited source pools oldest-deposit-first, fully
 *     draining one deposit before spilling to the next. This keeps most spends
 *     on a single clean source and makes spills clean (Amma 150 + Trust 30,
 *     not a pro-rata 135.71 + 44.29).
 *   - Any portion of a spend that exceeds all available pools is PENDING
 *     (the engineer effectively fronted it) — never an "overdraft", never a
 *     fake source.
 *   - A later DEPOSIT first HEALS the oldest pending gaps (regardless of the
 *     deposit's source label), converting pending into a real source backed by
 *     that deposit; the remainder stays available for future spends.
 *
 * Amounts are money with paise; all internal arithmetic is in integer paise to
 * avoid floating-point dust (e.g. 150.05 - 100.1).
 */

export type WalletEvent =
  | {
      kind: "deposit";
      id: string;
      source: string;
      name?: string | null;
      amount: number;
    }
  | { kind: "spend"; id: string; amount: number };

export interface AllocationRow {
  spendId: string;
  /** The deposit this portion is funded by; null for a pending gap. */
  depositId: string | null;
  kind: "source" | "pending";
  /** Deposit source key, or the literal "pending" for an unfunded gap. */
  source: string;
  name: string | null;
  amount: number;
}

interface DepositState {
  id: string;
  source: string;
  name: string | null;
  remaining: number; // paise
}

interface PendingState {
  spendId: string;
  amount: number; // paise
}

const toPaise = (n: number): number => Math.round(n * 100);
const fromPaise = (p: number): number => p / 100;

/**
 * Replay a chronologically-ordered list of wallet events (deposits + spends,
 * cancelled rows already excluded, ordered by transaction_date then created_at)
 * into the full set of allocation rows. Live processing of a single new event
 * against current state produces the same rows incrementally.
 */
export function deriveAllocations(events: WalletEvent[]): AllocationRow[] {
  const deposits: DepositState[] = [];
  const pending: PendingState[] = [];
  const sourceRows: AllocationRow[] = [];

  for (const ev of events) {
    if (ev.kind === "deposit") {
      const dep: DepositState = {
        id: ev.id,
        source: ev.source,
        name: ev.name ?? null,
        remaining: toPaise(ev.amount),
      };
      deposits.push(dep);

      // Heal the oldest outstanding gaps first with this deposit's funds.
      for (const p of pending) {
        if (dep.remaining <= 0) break;
        if (p.amount <= 0) continue;
        const take = Math.min(dep.remaining, p.amount);
        sourceRows.push({
          spendId: p.spendId,
          depositId: dep.id,
          kind: "source",
          source: dep.source,
          name: dep.name,
          amount: fromPaise(take),
        });
        p.amount -= take;
        dep.remaining -= take;
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].amount <= 0) pending.splice(i, 1);
      }
    } else {
      let need = toPaise(ev.amount);
      for (const dep of deposits) {
        if (need <= 0) break;
        if (dep.remaining <= 0) continue;
        const take = Math.min(dep.remaining, need);
        sourceRows.push({
          spendId: ev.id,
          depositId: dep.id,
          kind: "source",
          source: dep.source,
          name: dep.name,
          amount: fromPaise(take),
        });
        dep.remaining -= take;
        need -= take;
      }
      if (need > 0) {
        pending.push({ spendId: ev.id, amount: need });
      }
    }
  }

  // Still-unfunded gaps, appended in spend order.
  const pendingRows: AllocationRow[] = pending.map((p) => ({
    spendId: p.spendId,
    depositId: null,
    kind: "pending",
    source: "pending",
    name: null,
    amount: fromPaise(p.amount),
  }));

  return [...sourceRows, ...pendingRows];
}

export interface SourceBreakdown {
  source: string;
  name: string | null;
  amount: number;
}

/**
 * Collapse per-deposit allocation rows into a per-source breakdown for display
 * (merging multiple deposits of the same source), with any pending portion
 * listed last. Used by the misc-expense list/detail, Material Hub and wallet.
 */
export function aggregateBySource(rows: AllocationRow[]): SourceBreakdown[] {
  const order: string[] = [];
  const map = new Map<string, SourceBreakdown>();
  for (const r of rows) {
    const key = `${r.source}|${r.name ?? ""}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { source: r.source, name: r.name, amount: 0 };
      map.set(key, entry);
      order.push(key);
    }
    entry.amount = Math.round((entry.amount + r.amount) * 100) / 100;
  }
  const entries = order.map((k) => map.get(k) as SourceBreakdown);
  // Pending always sorts last; everything else keeps first-seen order.
  return entries.sort(
    (a, b) =>
      (a.source === "pending" ? 1 : 0) - (b.source === "pending" ? 1 : 0),
  );
}
