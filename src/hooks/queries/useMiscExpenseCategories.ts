"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys, cacheTTL } from "@/lib/cache/keys";

/**
 * Miscellaneous expense categories (`expense_categories` WHERE module='miscellaneous').
 *
 * These power the misc-expense entry dialog, the /site/expenses filter chips, AND the
 * "category" dropdown baked into the legacy bulk-upload Excel template (see
 * src/lib/mass-upload/xlsxTemplate.ts — it reads active misc categories live on every
 * download). Categories are GLOBAL: the table has no company_id/site_id, so anything
 * added here is shared across every company and site.
 */
export interface MiscExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  module: string;
}

export const MISC_MODULE = "miscellaneous" as const;

/** A category still referenced by misc_expenses cannot be hard-deleted — deactivate instead. */
export class CategoryInUseError extends Error {
  count: number;
  constructor(count: number) {
    super(`This category is used by ${count} expense${count === 1 ? "" : "s"}.`);
    this.name = "CategoryInUseError";
    this.count = count;
  }
}

/** List miscellaneous categories. Pass activeOnly=false (default) to include disabled ones. */
export function useMiscExpenseCategories(activeOnly = false) {
  // expense_categories isn't in the generated DB types; loosen the client.
  const supabase: any = createClient();

  return useQuery({
    queryKey: [...queryKeys.expenseCategories.byModule(MISC_MODULE), { activeOnly }] as const,
    queryFn: async () => {
      let query = supabase
        .from("expense_categories")
        .select("id, name, description, display_order, is_active, module")
        .eq("module", MISC_MODULE)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MiscExpenseCategory[];
    },
    staleTime: cacheTTL.reference,
  });
}

export interface MiscExpenseCategoryInput {
  name: string;
  description?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export function useCreateMiscExpenseCategory() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: MiscExpenseCategoryInput) => {
      await ensureFreshSession();
      const payload = {
        module: MISC_MODULE,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        display_order: input.display_order ?? 0,
        is_active: input.is_active ?? true,
      };
      const { error } = await supabase.from("expense_categories").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenseCategories.all });
    },
  });
}

export function useUpdateMiscExpenseCategory() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (
      input: { id: string } & Partial<MiscExpenseCategoryInput>
    ) => {
      await ensureFreshSession();
      const { id, ...rest } = input;
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (rest.name !== undefined) payload.name = rest.name.trim();
      if (rest.description !== undefined) payload.description = rest.description?.trim() || null;
      if (rest.display_order !== undefined) payload.display_order = rest.display_order;
      if (rest.is_active !== undefined) payload.is_active = rest.is_active;
      const { error } = await supabase.from("expense_categories").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenseCategories.all });
    },
  });
}

/**
 * Hard delete — only allowed when no misc_expenses reference the category (FK has no
 * ON DELETE rule, so deleting an in-use one would fail anyway). Throws CategoryInUseError
 * when in use so the UI can offer "deactivate instead". Prefer is_active=false to keep history.
 */
export function useDeleteMiscExpenseCategory() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();
      const { count, error: countError } = await supabase
        .from("misc_expenses")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id);
      if (countError) throw countError;
      if ((count ?? 0) > 0) throw new CategoryInUseError(count ?? 0);
      const { error } = await supabase.from("expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenseCategories.all });
    },
  });
}
