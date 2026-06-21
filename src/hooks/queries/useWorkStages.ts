import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { WorkStage, WorkStageInput } from "@/types/trade.types";

/**
 * Ship 1 (Workforce IA unification) — optional "Stage" grouping under a Contract.
 *
 * A Stage (e.g. "First Floor") groups task works within ONE trade on ONE site. It is
 * pure organisation: no money, no attendance. Task works (subcontracts rows) point at
 * a stage via `subcontracts.stage_id` (nullable — NULL means directly under the Contract).
 *
 * `work_stages` is new (not in generated DB types yet) so the client is cast to `any`,
 * matching the convention used by useSubcontractScopes.
 */

const stagesKey = (
  siteId: string | undefined,
  tradeCategoryId: string | undefined
) => ["work-stages", siteId, tradeCategoryId];

interface RawStageRow {
  id: string;
  site_id: string;
  trade_category_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
}

function mapStage(r: RawStageRow): WorkStage {
  return {
    id: r.id,
    siteId: r.site_id,
    tradeCategoryId: r.trade_category_id,
    name: r.name,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

/** All stages for one trade (Contract) on one site, ordered for display. */
export function useWorkStages(
  siteId: string | undefined,
  tradeCategoryId: string | undefined
) {
  const supabase = createClient();
  return useQuery({
    queryKey: stagesKey(siteId, tradeCategoryId),
    enabled: !!siteId && !!tradeCategoryId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<WorkStage[]> => {
      if (!siteId || !tradeCategoryId) return [];
      const { data, error } = await (supabase as any)
        .from("work_stages")
        .select("id, site_id, trade_category_id, name, sort_order, created_at")
        .eq("site_id", siteId)
        .eq("trade_category_id", tradeCategoryId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as RawStageRow[]).map(mapStage);
    },
  });
}

export function useAddWorkStage(
  siteId: string | undefined,
  tradeCategoryId: string | undefined
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WorkStageInput): Promise<WorkStage> => {
      if (!siteId || !tradeCategoryId)
        throw new Error("Missing site or trade for the stage");
      const { data, error } = await (supabase as any)
        .from("work_stages")
        .insert({
          site_id: siteId,
          trade_category_id: tradeCategoryId,
          name: input.name.trim(),
          sort_order: input.sortOrder ?? 0,
        })
        .select("id, site_id, trade_category_id, name, sort_order, created_at")
        .single();
      if (error) throw error;
      return mapStage(data as RawStageRow);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: stagesKey(siteId, tradeCategoryId) }),
  });
}

export function useUpdateWorkStage(
  siteId: string | undefined,
  tradeCategoryId: string | undefined
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<WorkStageInput>;
    }) => {
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.name !== undefined) update.name = patch.name.trim();
      if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
      const { error } = await (supabase as any)
        .from("work_stages")
        .update(update)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: stagesKey(siteId, tradeCategoryId) }),
  });
}

/**
 * Deletes a stage. Task works under it are NOT deleted — `subcontracts.stage_id`
 * is set NULL by the FK (ON DELETE SET NULL), so they fall back to "Ungrouped".
 */
export function useDeleteWorkStage(
  siteId: string | undefined,
  tradeCategoryId: string | undefined
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("work_stages")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stagesKey(siteId, tradeCategoryId) });
      // Task works may have lost their stage link — refresh the trade tree too.
      qc.invalidateQueries({ queryKey: ["trades", "site", siteId] });
    },
  });
}
