"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys, cacheTTL } from "@/lib/cache/keys";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";
import { decideTradeDelete } from "@/lib/workforce/tradeDeleteGuard";

/**
 * Trade categories (`labor_categories`) — the trades shown in the Workforce
 * workspace (Civil, Electrical, Painting, …). Company-scoped (company_id NOT NULL,
 * RLS = admin writes). System-seed rows can be disabled but never deleted.
 * `useSiteTrades` shows a trade when is_active OR it has a contract, so edits here
 * flow straight into /site/trades.
 */
export interface LaborCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  is_system_seed: boolean;
  company_id: string | null;
}

/** A custom trade still referenced somewhere can't be hard-deleted — disable it instead. */
export class TradeInUseError extends Error {
  blockers: string[];
  constructor(blockers: string[]) {
    super(`This trade is still in use (${blockers.join(", ")}).`);
    this.name = "TradeInUseError";
    this.blockers = blockers;
  }
}

/** Built-in (system-seed) trades can never be deleted. */
export class SystemSeedTradeError extends Error {
  constructor() {
    super("Built-in trades can't be deleted — disable it instead.");
    this.name = "SystemSeedTradeError";
  }
}

function invalidateAll(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.laborCategories.all });
  // The workspace reads trades under ["trades","site",siteId] — invalidate the
  // broad prefix so every open site workspace refreshes.
  queryClient.invalidateQueries({ queryKey: ["trades"] });
}

export function useLaborCategories(activeOnly = false) {
  const supabase: any = createClient();
  return useQuery({
    queryKey: [...queryKeys.laborCategories.list(), { activeOnly }] as const,
    queryFn: async () => {
      let query = supabase
        .from("labor_categories")
        .select("id, name, description, display_order, is_active, is_system_seed, company_id")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as LaborCategory[];
    },
    staleTime: cacheTTL.reference,
  });
}

export interface LaborCategoryInput {
  name: string;
  description?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export function useCreateLaborCategory() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async (input: LaborCategoryInput) => {
      await ensureFreshSession();
      if (!selectedCompany?.id) throw new Error("Select a company first.");
      const { error } = await supabase.from("labor_categories").insert({
        company_id: selectedCompany.id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        display_order: input.display_order ?? 0,
        is_active: input.is_active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUpdateLaborCategory() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: { id: string } & Partial<LaborCategoryInput>) => {
      await ensureFreshSession();
      const { id, ...rest } = input;
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (rest.name !== undefined) payload.name = rest.name.trim();
      if (rest.description !== undefined) payload.description = rest.description?.trim() || null;
      if (rest.display_order !== undefined) payload.display_order = rest.display_order;
      if (rest.is_active !== undefined) payload.is_active = rest.is_active;
      const { error } = await supabase.from("labor_categories").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(queryClient),
  });
}

/**
 * Guarded hard delete. System-seed → SystemSeedTradeError. Referenced by any
 * laborer / role / contract / package / team → TradeInUseError (UI offers
 * "disable instead"). Only an unused custom trade is removed.
 */
export function useDeleteLaborCategory() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();
      const { data: row, error: rowErr } = await supabase
        .from("labor_categories")
        .select("is_system_seed")
        .eq("id", id)
        .single();
      if (rowErr) throw rowErr;

      const [lab, roles, subs, pkgs, teams] = await Promise.all([
        supabase.from("laborers").select("id", { count: "exact", head: true }).eq("category_id", id),
        supabase.from("labor_roles").select("id", { count: "exact", head: true }).eq("trade_category_id", id),
        supabase.from("subcontracts").select("id", { count: "exact", head: true }).eq("trade_category_id", id),
        supabase.from("task_work_packages").select("id", { count: "exact", head: true }).eq("labor_category_id", id),
        supabase.from("teams").select("id", { count: "exact", head: true }).eq("category_id", id),
      ]);

      const decision = decideTradeDelete({
        isSystemSeed: !!row?.is_system_seed,
        laborers: lab.count ?? 0,
        roles: roles.count ?? 0,
        subcontracts: subs.count ?? 0,
        packages: pkgs.count ?? 0,
        teams: teams.count ?? 0,
      });

      if (decision.action === "blocked-system") throw new SystemSeedTradeError();
      if (decision.action === "disable") throw new TradeInUseError(decision.blockers);

      const { error } = await supabase.from("labor_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(queryClient),
  });
}
