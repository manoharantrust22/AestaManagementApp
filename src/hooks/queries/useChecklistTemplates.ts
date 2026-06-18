"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys, cacheTTL } from "@/lib/cache/keys";
import type { ChecklistTemplate } from "@/types/checklist.types";

/** List checklist item templates for a company (optionally one role). */
export function useChecklistTemplates(
  companyId: string | undefined,
  role?: string | null
) {
  // checklist tables aren't in the generated DB types yet; loosen the client.
  const supabase: any = createClient();

  return useQuery({
    queryKey: queryKeys.checklist.templates(companyId ?? "none", role),
    queryFn: async () => {
      if (!companyId) return [] as ChecklistTemplate[];
      let query = supabase
        .from("checklist_templates")
        .select("*")
        .eq("company_id", companyId)
        .order("role", { ascending: true })
        .order("sort_order", { ascending: true });
      if (role) query = query.eq("role", role);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ChecklistTemplate[];
    },
    enabled: !!companyId,
    staleTime: cacheTTL.reference,
  });
}

export type ChecklistTemplateInput = Partial<
  Pick<
    ChecklistTemplate,
    | "role"
    | "item_key"
    | "label"
    | "description"
    | "detection_type"
    | "detection_source"
    | "deep_link_path"
    | "applies_scope"
    | "allow_defer"
    | "requires_defer_reason"
    | "sort_order"
    | "is_active"
  >
>;

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: ChecklistTemplateInput & { company_id: string }) => {
      await ensureFreshSession();
      // Manual items must never carry a detection_source (DB CHECK enforces this too).
      const payload = {
        ...input,
        detection_source:
          input.detection_type === "auto" ? input.detection_source ?? null : null,
      };
      const { error } = await supabase.from("checklist_templates").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.all });
    },
  });
}

export function useUpdateChecklistTemplate() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: { id: string } & ChecklistTemplateInput) => {
      await ensureFreshSession();
      const { id, ...rest } = input;
      const payload: ChecklistTemplateInput = { ...rest };
      if (payload.detection_type === "manual") payload.detection_source = null;
      const { error } = await supabase
        .from("checklist_templates")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.all });
    },
  });
}

/** Hard delete a template (its entries cascade). Prefer is_active=false to keep history. */
export function useDeleteChecklistTemplate() {
  const queryClient = useQueryClient();
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();
      const { error } = await supabase
        .from("checklist_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.all });
    },
  });
}
