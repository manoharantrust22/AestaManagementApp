import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Phase 5 — parent contract + child SCOPES.
 *
 * A subcontract can optionally have child "scopes" (e.g. floors). They are a
 * breakdown only: payments and attendance stay on the parent contract. Each scope
 * carries an estimated value + sqft now, and an actual sqft captured at close for
 * the end-of-project reconciliation (actual value = rate x actual_sqft, where the
 * rate is implied by estimated_value / estimated_sqft).
 */
export interface SubcontractScope {
  id: string;
  contract_id: string;
  name: string;
  estimated_value: number;
  estimated_sqft: number | null;
  actual_sqft: number | null;
  actual_value: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SubcontractScopeInput {
  name: string;
  estimated_value: number;
  estimated_sqft: number | null;
  actual_sqft?: number | null;
  actual_value?: number | null;
  sort_order?: number;
}

const scopesKey = (contractId: string | undefined) => [
  "subcontract-scopes",
  contractId,
];

/** Implied per-sqft rate for a scope (estimated_value / estimated_sqft), or null. */
export function scopeImpliedRate(scope: SubcontractScope): number | null {
  if (!scope.estimated_sqft || scope.estimated_sqft <= 0) return null;
  return scope.estimated_value / scope.estimated_sqft;
}

/**
 * Reconciled value of a scope at close: prefer an explicit actual_value, else
 * derive from actual_sqft x implied rate, else fall back to the estimate.
 */
export function scopeReconciledValue(scope: SubcontractScope): number {
  if (scope.actual_value != null) return scope.actual_value;
  const rate = scopeImpliedRate(scope);
  if (scope.actual_sqft != null && rate != null) return rate * scope.actual_sqft;
  return scope.estimated_value;
}

export function useSubcontractScopes(contractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: scopesKey(contractId),
    enabled: !!contractId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SubcontractScope[]> => {
      if (!contractId) return [];
      // subcontract_scopes is new (not in generated DB types yet) — cast the client.
      const { data, error } = await (supabase as any)
        .from("subcontract_scopes")
        .select("*")
        .eq("contract_id", contractId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubcontractScope[];
    },
  });
}

export function useAddSubcontractScope(contractId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubcontractScopeInput) => {
      if (!contractId) throw new Error("Missing contract id");
      const { error } = await (supabase as any).from("subcontract_scopes").insert({
        contract_id: contractId,
        name: input.name,
        estimated_value: input.estimated_value || 0,
        estimated_sqft: input.estimated_sqft ?? null,
        actual_sqft: input.actual_sqft ?? null,
        actual_value: input.actual_value ?? null,
        sort_order: input.sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scopesKey(contractId) }),
  });
}

export function useUpdateSubcontractScope(contractId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<SubcontractScopeInput>;
    }) => {
      const { error } = await (supabase as any).from("subcontract_scopes")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scopesKey(contractId) }),
  });
}

export function useDeleteSubcontractScope(contractId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("subcontract_scopes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scopesKey(contractId) }),
  });
}
