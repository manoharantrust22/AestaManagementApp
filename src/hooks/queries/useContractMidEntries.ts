import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

/**
 * Mid-mode entries: one row per (contract, date) holding the crew roster
 * (laborer_ids[]) + day total ₹ + work done units. Read all entries for a
 * contract in one query (small N — typically < 200 rows even for long-
 * running contracts), then group/filter client-side as needed.
 */
export interface MidEntry {
  id: string;
  attendanceDate: string;
  laborerIds: string[];
  dayTotalAmount: number;
  workDoneUnits: number;
  note: string | null;
}

interface RawMidEntry {
  id: string;
  attendance_date: string;
  laborer_ids: string[] | null;
  day_total_amount: number | string | null;
  work_done_units: number | string | null;
  note: string | null;
}

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v);

export function useContractMidEntries(contractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["contract-mid-entries", contractId],
    enabled: !!contractId,
    staleTime: 30 * 1000,
    queryFn: wrapQueryFn(async (): Promise<MidEntry[]> => {
      if (!contractId) return [];
      const sb = supabase as any;
      const { data, error } = await sb
        .from("subcontract_mid_entries")
        .select("id, attendance_date, laborer_ids, day_total_amount, work_done_units, note")
        .eq("subcontract_id", contractId)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as RawMidEntry[]).map((r) => ({
        id: r.id,
        attendanceDate: r.attendance_date,
        laborerIds: r.laborer_ids ?? [],
        dayTotalAmount: num(r.day_total_amount),
        workDoneUnits: num(r.work_done_units),
        note: r.note,
      }));
    }, { operationName: "useContractMidEntries" }),
  });
}

interface UpsertMidEntryInput {
  contractId: string;
  attendanceDate: string;
  laborerIds: string[];
  dayTotalAmount: number;
  workDoneUnits: number;
  note?: string | null;
}

/**
 * Upsert one (contract, date) entry. Conflict on the unique constraint
 * means the supervisor edited an existing day — we replace the row.
 */
export function useSaveMidEntry() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertMidEntryInput) => {
      const sb = supabase as any;
      const { error } = await sb
        .from("subcontract_mid_entries")
        .upsert(
          {
            subcontract_id: input.contractId,
            attendance_date: input.attendanceDate,
            laborer_ids: input.laborerIds,
            day_total_amount: input.dayTotalAmount,
            work_done_units: input.workDoneUnits,
            note: input.note ?? null,
          },
          { onConflict: "subcontract_id,attendance_date" }
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["contract-mid-entries", vars.contractId],
      });
      queryClient.invalidateQueries({
        queryKey: ["trade-attendance-summary", vars.contractId],
      });
    },
  });
}
