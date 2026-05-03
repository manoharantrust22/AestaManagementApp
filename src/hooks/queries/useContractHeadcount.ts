import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface RoleRate {
  roleId: string;
  roleName: string;
  dailyRate: number;
}

export interface HeadcountEntry {
  id: string;
  attendanceDate: string;
  roleId: string;
  units: number;
  note: string | null;
}

export interface ContractHeadcountSnapshot {
  /** Per-role rate card (joined with labor_roles for display name). */
  rates: RoleRate[];
  /** Recent headcount entries, newest first. */
  recent: HeadcountEntry[];
}

interface RawRateRow {
  role_id: string;
  daily_rate: number | string;
  role: { name: string } | null;
}

interface RawEntryRow {
  id: string;
  attendance_date: string;
  role_id: string;
  units: number | string;
  note: string | null;
}

/**
 * Loads the role rate card and recent headcount entries for a single contract.
 * Used by the inline HeadcountEntry form on the trade card (Plan 03 surface).
 */
export function useContractHeadcount(
  contractId: string | undefined,
  enabled = true
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["contract-headcount", contractId],
    enabled: !!contractId && enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ContractHeadcountSnapshot> => {
      if (!contractId) return { rates: [], recent: [] };
      const sb = supabase as any;

      const [ratesRes, entriesRes] = await Promise.all([
        sb
          .from("subcontract_role_rates")
          .select("role_id, daily_rate, role:labor_roles(name)")
          .eq("subcontract_id", contractId),
        sb
          .from("subcontract_headcount_attendance")
          .select("id, attendance_date, role_id, units, note")
          .eq("subcontract_id", contractId)
          .order("attendance_date", { ascending: false })
          .limit(60),
      ]);
      if (ratesRes.error) throw ratesRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const rates: RoleRate[] = (ratesRes.data ?? [] as RawRateRow[]).map(
        (r: RawRateRow) => ({
          roleId: r.role_id,
          roleName: r.role?.name ?? "Unnamed role",
          dailyRate: Number(r.daily_rate ?? 0),
        })
      );
      const recent: HeadcountEntry[] = (entriesRes.data ?? [] as RawEntryRow[]).map(
        (e: RawEntryRow) => ({
          id: e.id,
          attendanceDate: e.attendance_date,
          roleId: e.role_id,
          units: Number(e.units ?? 0),
          note: e.note,
        })
      );

      return { rates, recent };
    },
  });
}
