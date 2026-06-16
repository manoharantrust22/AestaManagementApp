/**
 * Pure display model for the "wallet settlement audit" dialog — how a
 * wallet-funded misc expense was funded (which deposit sources, in what order),
 * derived from its engineer_wallet_spend_allocations rows.
 *
 * Source rows render oldest-deposit-first (matching the FIFO allocator in
 * walletAllocation.ts); any unfunded "pending" portion sorts last.
 */
import { prettyPayerSource } from "@/components/wallet-v2/spendDetailHelpers";

/** One allocation row of a wallet spend, joined to its funding deposit's date. */
export interface AuditAllocation {
  payer_source: string;
  payer_name: string | null;
  amount: number;
  kind: "source" | "pending";
  /** transaction_date of the funding deposit; null for a pending gap. */
  deposit_date: string | null;
}

export interface FundedByRow {
  label: string;
  amount: number;
  depositDate: string | null;
  isPending: boolean;
}

export function buildFundedByRows(allocs: AuditAllocation[]): FundedByRow[] {
  const rows: FundedByRow[] = allocs.map((a) => ({
    label: prettyPayerSource(a.payer_source, a.payer_name),
    amount: a.amount,
    depositDate: a.deposit_date,
    isPending: a.kind === "pending",
  }));
  // Funded sources first (oldest deposit first); the pending gap always last.
  return rows.sort((a, b) => {
    if (a.isPending !== b.isPending) return a.isPending ? 1 : -1;
    const da = a.depositDate ?? "";
    const db = b.depositDate ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });
}
