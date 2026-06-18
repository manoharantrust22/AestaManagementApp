"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import type { OverlayStatus } from "@/types/checklist.types";

export interface SetChecklistEntryInput {
  templateId: string;
  itemKey: string;
  userId: string;
  siteId: string | null;
  businessDate: string;
  status: OverlayStatus;
  deferredTo?: string | null;
  deferReason?: string | null;
  note?: string | null;
}

/**
 * Create/update the engineer's overlay row for one (item × site × date).
 * Read-modify-write rather than upsert, because the table's uniqueness is
 * enforced by two PARTIAL indexes (site / no-site) that PostgREST's on_conflict
 * can't reliably target.
 */
export function useSetChecklistEntry() {
  const queryClient = useQueryClient();
  // checklist tables aren't in the generated DB types yet; loosen the client.
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: SetChecklistEntryInput) => {
      await ensureFreshSession();

      const completedAt = input.status === "done" ? new Date().toISOString() : null;

      // Find an existing overlay row for this scope.
      let query = supabase
        .from("checklist_entries")
        .select("id")
        .eq("template_id", input.templateId)
        .eq("user_id", input.userId)
        .eq("business_date", input.businessDate);
      query = input.siteId
        ? query.eq("site_id", input.siteId)
        : query.is("site_id", null);

      const { data: existing, error: selErr } = await query.maybeSingle();
      if (selErr) throw selErr;

      const payload = {
        template_id: input.templateId,
        item_key: input.itemKey,
        user_id: input.userId,
        site_id: input.siteId,
        business_date: input.businessDate,
        status: input.status,
        completed_at: completedAt,
        deferred_to: input.deferredTo ?? null,
        defer_reason: input.deferReason ?? null,
        note: input.note ?? null,
        created_by: input.userId,
      };

      if (existing) {
        const { error } = await supabase
          .from("checklist_entries")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", (existing as { id: string }).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("checklist_entries").insert(payload);
        if (error) throw error;
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.all });
    },
  });
}

/** Remove an overlay row (e.g. "undo" a manual mark). */
export function useClearChecklistEntry() {
  const queryClient = useQueryClient();
  // checklist tables aren't in the generated DB types yet; loosen the client.
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      userId: string;
      siteId: string | null;
      businessDate: string;
    }) => {
      await ensureFreshSession();
      let query = supabase
        .from("checklist_entries")
        .delete()
        .eq("template_id", input.templateId)
        .eq("user_id", input.userId)
        .eq("business_date", input.businessDate);
      query = input.siteId
        ? query.eq("site_id", input.siteId)
        : query.is("site_id", null);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.all });
    },
  });
}

export interface ConfirmStockInput {
  siteId: string;
  businessDate: string;
  confirmedBy: string;
  stockMatches: boolean;
  discrepancyNote?: string | null;
}

/**
 * Record the morning physical-vs-system stock confirmation.
 * Backs the stock_confirmation auto-detected checklist item.
 */
export function useConfirmStock() {
  const queryClient = useQueryClient();
  // checklist tables aren't in the generated DB types yet; loosen the client.
  const supabase: any = createClient();

  return useMutation({
    mutationFn: async (input: ConfirmStockInput) => {
      await ensureFreshSession();

      const { data: existing, error: selErr } = await supabase
        .from("daily_stock_confirmations")
        .select("id")
        .eq("site_id", input.siteId)
        .eq("business_date", input.businessDate)
        .maybeSingle();
      if (selErr) throw selErr;

      const payload = {
        site_id: input.siteId,
        business_date: input.businessDate,
        confirmed_by: input.confirmedBy,
        confirmed_at: new Date().toISOString(),
        stock_matches: input.stockMatches,
        discrepancy_note: input.discrepancyNote ?? null,
      };

      if (existing) {
        const { error } = await supabase
          .from("daily_stock_confirmations")
          .update(payload)
          .eq("id", (existing as { id: string }).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("daily_stock_confirmations")
          .insert(payload);
        if (error) throw error;
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.all });
    },
  });
}
