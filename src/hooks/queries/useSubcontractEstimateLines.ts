import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Ship 2a — multi-worker day-wage estimate lines for a task work (subcontract).
 *
 * Each line is one worker type (Mason ×2 × 6d × ₹900). The benchmark
 * Σ(worker_count × days × daily_rate) drives the expected-saving + over/under
 * monitor (see src/lib/workforce/taskWorkMonitor.ts).
 *
 * `subcontract_estimate_lines` is new (not in generated DB types yet) so the
 * client is cast to `any`, matching useSubcontractScopes / useWorkStages.
 */

export interface SubcontractEstimateLine {
  id: string;
  subcontract_id: string;
  role_id: string | null;
  role_label: string;
  worker_count: number;
  days: number;
  daily_rate: number;
  sort_order: number;
}

export interface SubcontractEstimateLineInput {
  role_id: string | null;
  role_label: string;
  worker_count: number;
  days: number;
  daily_rate: number;
  sort_order?: number;
}

const linesKey = (subcontractId: string | undefined) => [
  "subcontract-estimate-lines",
  subcontractId,
];

export function useSubcontractEstimateLines(subcontractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: linesKey(subcontractId),
    enabled: !!subcontractId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SubcontractEstimateLine[]> => {
      if (!subcontractId) return [];
      const { data, error } = await (supabase as any)
        .from("subcontract_estimate_lines")
        .select(
          "id, subcontract_id, role_id, role_label, worker_count, days, daily_rate, sort_order"
        )
        .eq("subcontract_id", subcontractId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        subcontract_id: r.subcontract_id,
        role_id: r.role_id,
        role_label: r.role_label,
        worker_count: Number(r.worker_count ?? 0),
        days: Number(r.days ?? 0),
        daily_rate: Number(r.daily_rate ?? 0),
        sort_order: r.sort_order ?? 0,
      }));
    },
  });
}

export function useAddSubcontractEstimateLine(
  subcontractId: string | undefined
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubcontractEstimateLineInput) => {
      if (!subcontractId) throw new Error("Missing task work id");
      const { error } = await (supabase as any)
        .from("subcontract_estimate_lines")
        .insert({
          subcontract_id: subcontractId,
          role_id: input.role_id,
          role_label: input.role_label.trim(),
          worker_count: input.worker_count || 0,
          days: input.days || 0,
          daily_rate: input.daily_rate || 0,
          sort_order: input.sort_order ?? 0,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linesKey(subcontractId) }),
  });
}

export function useUpdateSubcontractEstimateLine(
  subcontractId: string | undefined
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<SubcontractEstimateLineInput>;
    }) => {
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.role_id !== undefined) update.role_id = patch.role_id;
      if (patch.role_label !== undefined)
        update.role_label = patch.role_label.trim();
      if (patch.worker_count !== undefined)
        update.worker_count = patch.worker_count;
      if (patch.days !== undefined) update.days = patch.days;
      if (patch.daily_rate !== undefined) update.daily_rate = patch.daily_rate;
      if (patch.sort_order !== undefined) update.sort_order = patch.sort_order;
      const { error } = await (supabase as any)
        .from("subcontract_estimate_lines")
        .update(update)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linesKey(subcontractId) }),
  });
}

export function useDeleteSubcontractEstimateLine(
  subcontractId: string | undefined
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("subcontract_estimate_lines")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linesKey(subcontractId) }),
  });
}

/**
 * Replace the whole estimate for a task work in one save: delete the existing
 * lines, then batch-insert the provided ones. Estimate data is small and
 * non-critical (re-enterable), so this is simpler than a per-line diff. Blank
 * lines (no label and all-zero) are dropped.
 */
export function useReplaceSubcontractEstimate(subcontractId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lines: SubcontractEstimateLineInput[]) => {
      if (!subcontractId) throw new Error("Missing task work id");
      const clean = lines.filter(
        (l) =>
          l.role_label.trim() !== "" ||
          (l.worker_count || 0) > 0 ||
          (l.days || 0) > 0 ||
          (l.daily_rate || 0) > 0
      );
      const del = await (supabase as any)
        .from("subcontract_estimate_lines")
        .delete()
        .eq("subcontract_id", subcontractId);
      if (del.error) throw del.error;
      if (clean.length === 0) return;
      const rows = clean.map((l, i) => ({
        subcontract_id: subcontractId,
        role_id: l.role_id,
        role_label: l.role_label.trim() || "Worker",
        worker_count: l.worker_count || 0,
        days: l.days || 0,
        daily_rate: l.daily_rate || 0,
        sort_order: l.sort_order ?? i,
      }));
      const ins = await (supabase as any)
        .from("subcontract_estimate_lines")
        .insert(rows);
      if (ins.error) throw ins.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: linesKey(subcontractId) }),
  });
}
