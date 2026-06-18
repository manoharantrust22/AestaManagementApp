import type { SupabaseClient } from "@supabase/supabase-js";
import type { WalletSpendSourceType } from "@/components/wallet-v2/spendDetailHelpers";

/** Result of get_wallet_spend_source — which source a wallet spend came from. */
export interface WalletSpendSource {
  source_type: WalletSpendSourceType;
  source_id: string | null;
  is_settled: boolean;
  rental_kind?: "advance" | "settlement";
}

export async function getWalletSpendSource(
  supabase: SupabaseClient,
  spendId: string
): Promise<WalletSpendSource> {
  const { data, error } = await supabase.rpc("get_wallet_spend_source", {
    p_spend_id: spendId,
  });
  if (error) throw new Error(error.message);
  return data as WalletSpendSource;
}

export type WalletReverseMode = "undo" | "company_paid";

export interface ReverseWalletSpendResult {
  spend_id: string;
  source_type?: string;
  source_id?: string;
  mode?: WalletReverseMode;
  cancelled?: boolean;
  already_cancelled?: boolean;
}

/**
 * Reverse a non-salary wallet spend via the reverse_wallet_spend RPC.
 * mode='undo' un-settles the source (re-settleable / voided); mode='company_paid'
 * keeps it paid but reclassifies to company/direct. The spend is soft-cancelled
 * either way. Authorization (admin/office or recorder) is enforced in the RPC.
 */
export async function reverseWalletSpend(
  supabase: SupabaseClient,
  args: { spendId: string; mode: WalletReverseMode; reason?: string | null }
): Promise<ReverseWalletSpendResult> {
  const { data, error } = await supabase.rpc("reverse_wallet_spend", {
    p_spend_id: args.spendId,
    p_mode: args.mode,
    p_reason: args.reason ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ReverseWalletSpendResult;
}

export interface DeleteOrphanWalletSpendResult {
  deleted_spend_id: string;
  deleted_allocations: number;
  amount: number;
  user_id: string;
  site_id: string | null;
}

/**
 * Admin-only HARD delete of an ORPHAN wallet spend (a spend row with no linked
 * expense/settlement). Use only for stuck phantom debits — reverse_wallet_spend
 * is the right tool for any spend still linked to a source. The RPC enforces
 * admin role and refuses linked spends; it writes an audit_log breadcrumb before
 * physically deleting the spend and its allocation rows.
 */
export async function deleteOrphanWalletSpend(
  supabase: SupabaseClient,
  args: { spendId: string; reason?: string | null }
): Promise<DeleteOrphanWalletSpendResult> {
  const { data, error } = await supabase.rpc("delete_orphan_wallet_spend", {
    p_spend_id: args.spendId,
    p_reason: args.reason ?? null,
  });
  if (error) throw new Error(error.message);
  return data as DeleteOrphanWalletSpendResult;
}
