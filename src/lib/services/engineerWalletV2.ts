/**
 * Engineer Wallet v2 — Service
 *
 * Single source of truth for wallet reads + writes in the v2 model.
 *
 * Reads:
 *   - getWalletBalance       → from v_engineer_wallet_balance view
 *   - getWalletLedger        → keyset-paginated from site_engineer_transactions
 *   - getWalletEnabledEngineers → company_members.wallet_enabled = true × users × balance view
 *
 * Writes:
 *   - recordDeposit / recordReturn → direct INSERT, with mode/proof validation
 *   - recordSpend → wraps atomic_record_wallet_spend RPC (per-engineer advisory lock + balance check)
 *   - cancelTransaction → soft-cancel a row by setting cancelled_at
 *
 * Direct UI code never calls recordSpend; only domain settlement services do.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WalletBalance,
  EngineerSiteBalance,
  WalletEnabledEngineer,
  WalletLedgerEntry,
  WalletLedgerFilters,
  WalletLedgerPage,
  RecordDepositInput,
  RecordReturnInput,
  RecordSpendInput,
} from "@/types/engineer-wallet-v2.types";
import {
  WalletValidationError,
  WalletInsufficientBalanceError,
} from "@/types/engineer-wallet-v2.types";

const DEFAULT_LEDGER_PAGE = 30;

// ------------------------------------------------------------------
// Reads
// ------------------------------------------------------------------

export async function getWalletBalance(
  supabase: SupabaseClient,
  userId: string,
  siteId: string
): Promise<WalletBalance> {
  const { data, error } = await supabase
    .from("v_engineer_wallet_balance")
    .select(
      "user_id, site_id, balance, last_txn_at, deposit_count, spend_count, return_count, total_deposited, total_spent, total_returned"
    )
    .eq("user_id", userId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      user_id: userId,
      site_id: siteId,
      balance: 0,
      last_txn_at: null,
      deposit_count: 0,
      spend_count: 0,
      return_count: 0,
      total_deposited: 0,
      total_spent: 0,
      total_returned: 0,
    };
  }
  return data as WalletBalance;
}

/** All sites of the engineer's company, each row decorated with the engineer's
 *  current pool for that site (zero when no ledger row exists yet). The office
 *  detail panel renders one balance card per element. Inactive sites are excluded. */
export async function getEngineerSiteBalances(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<EngineerSiteBalance[]> {
  const [{ data: sites, error: sitesErr }, { data: balances, error: balErr }] =
    await Promise.all([
      supabase
        .from("sites")
        .select("id, name, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("name", { ascending: true }),
      supabase
        .from("v_engineer_wallet_balance")
        .select(
          "site_id, balance, last_txn_at, total_deposited, total_spent, total_returned"
        )
        .eq("user_id", userId),
    ]);

  if (sitesErr) throw sitesErr;
  if (balErr) throw balErr;

  const balanceMap = new Map<string, EngineerSiteBalance>();
  for (const b of balances ?? []) {
    balanceMap.set(b.site_id as string, {
      site_id: b.site_id as string,
      site_name: "", // filled below from sites
      balance: Number(b.balance ?? 0),
      last_txn_at: (b.last_txn_at as string | null) ?? null,
      total_deposited: Number(b.total_deposited ?? 0),
      total_spent: Number(b.total_spent ?? 0),
      total_returned: Number(b.total_returned ?? 0),
    });
  }

  return (sites ?? []).map((s) => {
    const existing = balanceMap.get(s.id as string);
    return existing
      ? { ...existing, site_name: s.name as string }
      : {
          site_id: s.id as string,
          site_name: s.name as string,
          balance: 0,
          last_txn_at: null,
          total_deposited: 0,
          total_spent: 0,
          total_returned: 0,
        };
  });
}

export async function getWalletLedger(
  supabase: SupabaseClient,
  userId: string,
  filters: WalletLedgerFilters = {}
): Promise<WalletLedgerPage> {
  const limit = filters.limit ?? DEFAULT_LEDGER_PAGE;

  let query = supabase
    .from("site_engineer_transactions")
    .select("*")
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .order("transaction_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1); // +1 to detect next page

  if (filters.type && filters.type !== "all") {
    query = query.eq("transaction_type", filters.type);
  }
  if (filters.date_from) query = query.gte("transaction_date", filters.date_from);
  if (filters.date_to) query = query.lte("transaction_date", filters.date_to);
  if (filters.site_id) query = query.eq("site_id", filters.site_id);

  if (filters.cursor) {
    // Keyset: rows older than cursor (transaction_date, id desc)
    const { transaction_date, id } = filters.cursor;
    query = query.or(
      `transaction_date.lt.${transaction_date},and(transaction_date.eq.${transaction_date},id.lt.${id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as WalletLedgerEntry[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const next_cursor = hasMore && last
    ? { transaction_date: last.transaction_date, id: last.id }
    : null;

  return { rows: page, next_cursor };
}

export async function getWalletEnabledEngineers(
  supabase: SupabaseClient,
  companyId: string
): Promise<WalletEnabledEngineer[]> {
  const [
    { data: members, error: membersErr },
    { data: sites, error: sitesErr },
  ] = await Promise.all([
    supabase
      .from("company_members")
      .select("user_id, company_id, users:users!inner(id, name, email, avatar_url)")
      .eq("company_id", companyId)
      .eq("wallet_enabled", true),
    supabase
      .from("sites")
      .select("id, name, status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("name", { ascending: true }),
  ]);

  if (membersErr) throw membersErr;
  if (sitesErr) throw sitesErr;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);

  const { data: balances, error: balErr } = await supabase
    .from("v_engineer_wallet_balance")
    .select(
      "user_id, site_id, balance, last_txn_at, total_deposited, total_spent, total_returned"
    )
    .in("user_id", userIds);
  if (balErr) throw balErr;

  // Build a per-engineer site balance map, defaulting every active site to zero.
  const siteList = (sites ?? []) as { id: string; name: string }[];
  const perEngineerSites = new Map<string, Map<string, EngineerSiteBalance>>();

  for (const m of members) {
    const init = new Map<string, EngineerSiteBalance>();
    for (const s of siteList) {
      init.set(s.id, {
        site_id: s.id,
        site_name: s.name,
        balance: 0,
        last_txn_at: null,
        total_deposited: 0,
        total_spent: 0,
        total_returned: 0,
      });
    }
    perEngineerSites.set(m.user_id, init);
  }

  for (const b of balances ?? []) {
    const userMap = perEngineerSites.get(b.user_id as string);
    if (!userMap) continue;
    const existing = userMap.get(b.site_id as string);
    const siteName =
      siteList.find((s) => s.id === b.site_id)?.name ?? existing?.site_name ?? "";
    userMap.set(b.site_id as string, {
      site_id: b.site_id as string,
      site_name: siteName,
      balance: Number(b.balance ?? 0),
      last_txn_at: (b.last_txn_at as string | null) ?? null,
      total_deposited: Number(b.total_deposited ?? 0),
      total_spent: Number(b.total_spent ?? 0),
      total_returned: Number(b.total_returned ?? 0),
    });
  }

  return members.map((m) => {
    const u = (Array.isArray(m.users) ? m.users[0] : m.users) as
      | { id: string; name: string; email: string | null; avatar_url: string | null }
      | null;
    const sitesArr = Array.from(perEngineerSites.get(m.user_id)?.values() ?? []);
    const total = sitesArr.reduce((s, x) => s + x.balance, 0);
    const lastTxnAt = sitesArr
      .map((x) => x.last_txn_at)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;
    return {
      user_id: m.user_id,
      name: u?.name ?? "Unknown",
      email: u?.email ?? null,
      avatar_url: u?.avatar_url ?? null,
      company_id: m.company_id,
      total_balance: total,
      last_txn_at: lastTxnAt,
      sites: sitesArr,
    };
  });
}

// ------------------------------------------------------------------
// Writes — Deposit / Return
// ------------------------------------------------------------------

function validateProofForUpi(
  payment_mode: string,
  proof_url: string | null | undefined,
  txnType: string
): void {
  if (payment_mode === "upi" && (!proof_url || proof_url.trim() === "")) {
    throw new WalletValidationError(
      "UPI_PROOF_REQUIRED",
      `UPI ${txnType} requires a proof screenshot`
    );
  }
}

export async function recordDeposit(
  supabase: SupabaseClient,
  input: RecordDepositInput
): Promise<{ id: string }> {
  if (!input.engineer_id) {
    throw new WalletValidationError("MISSING_ENGINEER", "Engineer is required");
  }
  if (!input.site_id) {
    throw new WalletValidationError("MISSING_SITE", "Site is required for deposits");
  }
  if (!input.amount || input.amount <= 0) {
    throw new WalletValidationError("INVALID_AMOUNT", "Amount must be positive");
  }
  if (!input.payer_source) {
    throw new WalletValidationError("MISSING_PAYER_SOURCE", "Money source is required for deposits");
  }
  validateProofForUpi(input.payment_mode, input.proof_url, "deposit");

  const { data, error } = await supabase
    .from("site_engineer_transactions")
    .insert({
      user_id: input.engineer_id,
      transaction_type: "deposit",
      amount: input.amount,
      transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
      site_id: input.site_id,
      description: input.description ?? null,
      payment_mode: input.payment_mode,
      proof_url: input.proof_url ?? null,
      payer_source: input.payer_source,
      payer_name: input.payer_name ?? null,
      notes: input.notes ?? null,
      recorded_by: input.recorded_by,
      recorded_by_user_id: input.recorded_by_user_id,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data!.id as string };
}

export async function recordReturn(
  supabase: SupabaseClient,
  input: RecordReturnInput
): Promise<{ id: string }> {
  if (!input.engineer_id) {
    throw new WalletValidationError("MISSING_ENGINEER", "Engineer is required");
  }
  if (!input.site_id) {
    throw new WalletValidationError("MISSING_SITE", "Site is required for returns");
  }
  if (!input.amount || input.amount <= 0) {
    throw new WalletValidationError("INVALID_AMOUNT", "Amount must be positive");
  }
  validateProofForUpi(input.payment_mode, input.proof_url, "return");

  // Block negative balance: a return greater than current site pool is operator error.
  const balance = await getWalletBalance(supabase, input.engineer_id, input.site_id);
  if (input.amount > balance.balance) {
    throw new WalletInsufficientBalanceError(balance.balance, input.amount);
  }

  const { data, error } = await supabase
    .from("site_engineer_transactions")
    .insert({
      user_id: input.engineer_id,
      transaction_type: "return",
      amount: input.amount,
      transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
      site_id: input.site_id,
      description: input.description ?? null,
      payment_mode: input.payment_mode,
      proof_url: input.proof_url ?? null,
      notes: input.notes ?? null,
      recorded_by: input.recorded_by,
      recorded_by_user_id: input.recorded_by_user_id,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data!.id as string };
}

// ------------------------------------------------------------------
// Writes — Spend (RPC, internal use)
// ------------------------------------------------------------------

export async function recordSpend(
  supabase: SupabaseClient,
  input: RecordSpendInput
): Promise<{ id: string }> {
  if (!input.engineer_id) {
    throw new WalletValidationError("MISSING_ENGINEER", "Engineer is required");
  }
  if (!input.site_id) {
    throw new WalletValidationError("MISSING_SITE", "Site is required for spends");
  }
  if (!input.amount || input.amount <= 0) {
    throw new WalletValidationError("INVALID_AMOUNT", "Amount must be positive");
  }

  const { data, error } = await supabase.rpc("atomic_record_wallet_spend", {
    p_engineer_id: input.engineer_id,
    p_site_id: input.site_id,
    p_amount: input.amount,
    p_transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
    p_payment_mode: input.payment_mode,
    p_proof_url: input.proof_url ?? null,
    p_notes: input.notes ?? null,
    p_recorded_by: input.recorded_by,
    p_recorded_by_user_id: input.recorded_by_user_id,
    p_description: input.description ?? null,
  });

  if (error) {
    // Postgres exception with code WLT01 = insufficient balance.
    const code = (error as { code?: string }).code;
    if (code === "WLT01" || /insufficient wallet balance/i.test(error.message ?? "")) {
      const match = /have\s+([\d.]+),\s+need\s+([\d.]+)/i.exec(error.message ?? "");
      const have = match ? parseFloat(match[1]) : 0;
      const need = match ? parseFloat(match[2]) : input.amount;
      throw new WalletInsufficientBalanceError(have, need);
    }
    throw error;
  }

  return { id: data as string };
}

// ------------------------------------------------------------------
// Cancel
// ------------------------------------------------------------------

export async function cancelTransaction(
  supabase: SupabaseClient,
  args: {
    id: string;
    reason: string;
    cancelled_by: string;
    cancelled_by_user_id: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("site_engineer_transactions")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: args.cancelled_by,
      cancelled_by_user_id: args.cancelled_by_user_id,
      cancellation_reason: args.reason,
    })
    .eq("id", args.id)
    .is("cancelled_at", null);

  if (error) throw error;
}
