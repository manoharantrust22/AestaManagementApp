/**
 * Engineer Wallet v2 — React Query hooks.
 *
 * Read hooks: balance, infinite ledger, wallet-enabled engineer list.
 * Cross-tab invalidation: BroadcastChannel("engineer-wallet-changed") fires after any wallet
 * mutation (deposit / spend / return / cancel) so other open tabs refresh.
 */

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import {
  getCompanyWalletLedger,
  getEngineerSiteBalances,
  getLatestDepositPayerSource,
  getWalletBalance,
  getWalletEnabledEngineers,
  getWalletLedger,
} from "@/lib/services/engineerWalletV2";
import type {
  EngineerSiteBalance,
  WalletBalance,
  WalletEnabledEngineer,
  WalletLedgerFilters,
  WalletLedgerPage,
} from "@/types/engineer-wallet-v2.types";

export const ENGINEER_WALLET_KEYS = {
  all: ["engineer-wallet"] as const,
  balance: (userId: string, siteId: string) =>
    ["engineer-wallet", "balance", userId, siteId] as const,
  siteBalances: (userId: string, companyId: string) =>
    ["engineer-wallet", "site-balances", userId, companyId] as const,
  ledger: (userId: string, filters: WalletLedgerFilters) =>
    ["engineer-wallet", "ledger", userId, filters] as const,
  companyLedger: (companyId: string, userIds: string[], filters: WalletLedgerFilters) =>
    ["engineer-wallet", "company-ledger", companyId, userIds.slice().sort().join(","), filters] as const,
  enabledEngineers: (companyId: string) =>
    ["engineer-wallet", "enabled-engineers", companyId] as const,
  pools: (userId: string, siteId: string) =>
    ["engineer-wallet", "pools", userId, siteId] as const,
};

/** One row of v_engineer_wallet_pools — per-source pool balance per (engineer, site). */
export interface WalletPool {
  user_id: string;
  site_id: string;
  payer_source: string;
  kind: "source" | "overdraft";
  deposited: number;
  spent: number;
  available: number;
}

export const ENGINEER_WALLET_BROADCAST = "engineer-wallet-changed";

function useCrossTabInvalidate(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(ENGINEER_WALLET_BROADCAST);
    bc.onmessage = () => {
      qc.invalidateQueries({ queryKey: ENGINEER_WALLET_KEYS.all });
    };
    return () => bc.close();
  }, [qc]);
}

/**
 * Live balance + activity counters for an engineer's pool at one specific site.
 * Returns 0 / nulls when the user has no ledger rows for that site yet.
 */
export function useEngineerWalletBalance(
  userId: string | undefined,
  siteId: string | undefined
) {
  useCrossTabInvalidate();
  const supabase = createClient();
  const enabled = Boolean(userId && siteId);
  return useQuery<WalletBalance>({
    queryKey: enabled
      ? ENGINEER_WALLET_KEYS.balance(userId as string, siteId as string)
      : ["engineer-wallet", "balance", "_disabled"],
    enabled,
    staleTime: 30_000,
    queryFn: wrapQueryFn(
      () => getWalletBalance(supabase, userId as string, siteId as string),
      { operationName: "useEngineerWalletBalance" }
    ),
  });
}

/**
 * Per-source pool balances for an engineer at one site. Drives the
 * WalletSourcePoolsCard breakdown on /site/my-wallet — one row per
 * payer_source (amma_money, client_money, trust_account, …) plus an optional
 * 'overdraft' pseudo-row.
 */
export function useEngineerWalletPools(
  userId: string | undefined,
  siteId: string | undefined
) {
  useCrossTabInvalidate();
  const supabase = createClient();
  const enabled = Boolean(userId && siteId);
  return useQuery<WalletPool[]>({
    queryKey: enabled
      ? ENGINEER_WALLET_KEYS.pools(userId as string, siteId as string)
      : ["engineer-wallet", "pools", "_disabled"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      // Cast to any until supabase.generated.ts is regenerated to include
      // v_engineer_wallet_pools (shipped 2026-05-21 in migration 20260521100000).
      // Same pattern as MiscellaneousExpensesPage's expense_categories fetch.
      const { data, error } = await (supabase as any)
        .from("v_engineer_wallet_pools")
        .select("user_id, site_id, payer_source, kind, deposited, spent, available")
        .eq("user_id", userId as string)
        .eq("site_id", siteId as string);
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        user_id: r.user_id as string,
        site_id: r.site_id as string,
        payer_source: r.payer_source as string,
        kind: r.kind as "source" | "overdraft",
        deposited: Number(r.deposited ?? 0),
        spent: Number(r.spent ?? 0),
        available: Number(r.available ?? 0),
      }));
    },
  });
}

/**
 * All sites of the engineer's company decorated with the engineer's per-site balance.
 * Used by /company/engineer-wallet to render one balance card per site (stacked).
 */
export function useEngineerSiteBalances(
  userId: string | undefined,
  companyId: string | undefined
) {
  useCrossTabInvalidate();
  const supabase = createClient();
  const enabled = Boolean(userId && companyId);
  return useQuery<EngineerSiteBalance[]>({
    queryKey: enabled
      ? ENGINEER_WALLET_KEYS.siteBalances(userId as string, companyId as string)
      : ["engineer-wallet", "site-balances", "_disabled"],
    enabled,
    staleTime: 30_000,
    queryFn: wrapQueryFn(
      () => getEngineerSiteBalances(supabase, userId as string, companyId as string),
      { operationName: "useEngineerSiteBalances" }
    ),
  });
}

/**
 * Cursor-paginated transaction history. Use with the standard
 * useInfiniteQuery render pattern: data.pages.flatMap(p => p.rows).
 */
export function useEngineerWalletLedger(
  userId: string | undefined,
  filters: Omit<WalletLedgerFilters, "cursor"> = {}
) {
  useCrossTabInvalidate();
  const supabase = createClient();
  return useInfiniteQuery<WalletLedgerPage, Error, InfiniteData<WalletLedgerPage>>({
    queryKey: userId ? ENGINEER_WALLET_KEYS.ledger(userId, filters) : ["engineer-wallet", "ledger", "_disabled"],
    enabled: Boolean(userId),
    staleTime: 30_000,
    initialPageParam: null as WalletLedgerPage["next_cursor"],
    queryFn: ({ pageParam }) =>
      getWalletLedger(supabase, userId as string, {
        ...filters,
        cursor: pageParam as WalletLedgerPage["next_cursor"],
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}

/**
 * Combined ledger across all wallet-enabled engineers in a company.
 * Powers the All Engineers overview on /company/engineer-wallet.
 *
 * Pass the cached engineer IDs from useWalletEnabledEngineers — this hook does
 * not refetch the member list. Disabled until userIds is non-empty.
 */
export function useCompanyWalletLedger(
  companyId: string | undefined,
  userIds: string[],
  filters: Omit<WalletLedgerFilters, "cursor"> = {}
) {
  useCrossTabInvalidate();
  const supabase = createClient();
  const enabled = Boolean(companyId) && userIds.length > 0;
  return useInfiniteQuery<WalletLedgerPage, Error, InfiniteData<WalletLedgerPage>>({
    queryKey: enabled
      ? ENGINEER_WALLET_KEYS.companyLedger(companyId as string, userIds, filters)
      : ["engineer-wallet", "company-ledger", "_disabled"],
    enabled,
    staleTime: 30_000,
    initialPageParam: null as WalletLedgerPage["next_cursor"],
    queryFn: ({ pageParam }) =>
      getCompanyWalletLedger(supabase, userIds, {
        ...filters,
        cursor: pageParam as WalletLedgerPage["next_cursor"],
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}

/**
 * List of wallet-enabled members for the company-wallet overview page
 * and the EngineerWalletPicker autocomplete in settlement dialogs.
 */
export function useWalletEnabledEngineers(companyId: string | undefined) {
  useCrossTabInvalidate();
  const supabase = createClient();
  return useQuery<WalletEnabledEngineer[]>({
    queryKey: companyId
      ? ENGINEER_WALLET_KEYS.enabledEngineers(companyId)
      : ["engineer-wallet", "enabled-engineers", "_disabled"],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: wrapQueryFn(
      () => getWalletEnabledEngineers(supabase, companyId as string),
      { operationName: "useWalletEnabledEngineers" }
    ),
  });
}

/**
 * Fetch the most-recent deposit's payer_source for LIFO attribution during wage settlement.
 * Returns null if no deposits exist.
 */
export function useLatestDepositSource(
  userId: string | undefined,
  siteId: string | undefined
) {
  useCrossTabInvalidate();
  const supabase = createClient();
  const enabled = Boolean(userId && siteId);
  return useQuery<{ payer_source: string | null; transaction_date: string | null }>({
    queryKey: enabled
      ? [...ENGINEER_WALLET_KEYS.all, "latest-deposit-source", userId, siteId]
      : ["engineer-wallet", "latest-deposit-source", "_disabled"],
    enabled,
    staleTime: 2 * 60_000,
    queryFn: wrapQueryFn(
      () => getLatestDepositPayerSource(supabase, userId as string, siteId as string),
      { operationName: "useLatestDepositSource" }
    ),
  });
}

/**
 * Check if the current user has wallet_enabled = true in the company members registry.
 * Used to determine if the engineer can settle wages via their own wallet.
 */
export function useCurrentUserWalletEnabled(
  userId: string | undefined,
  companyId: string | undefined
) {
  useCrossTabInvalidate();
  const supabase = createClient();
  const enabled = Boolean(userId && companyId);
  return useQuery<boolean>({
    queryKey: enabled
      ? [...ENGINEER_WALLET_KEYS.all, "is-wallet-enabled", userId, companyId]
      : ["engineer-wallet", "is-wallet-enabled", "_disabled"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("wallet_enabled")
        .eq("user_id", userId as string)
        .eq("company_id", companyId as string)
        .maybeSingle();
      return (data as any)?.wallet_enabled ?? false;
    },
  });
}

/** Notifies other tabs to refetch wallet data. Call after any successful mutation. */
export function broadcastWalletChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const bc = new BroadcastChannel(ENGINEER_WALLET_BROADCAST);
  bc.postMessage({ at: Date.now() });
  bc.close();
}
