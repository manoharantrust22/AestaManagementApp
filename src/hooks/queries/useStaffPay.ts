"use client";

/**
 * Private staff pay ledger. RLS: admins see everything; a staff member sees
 * only their own payments/profile; per-site allocations are admin-only.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  RecordStaffPaymentInput,
  StaffMember,
  StaffPayment,
  StaffSalaryProfile,
} from "@/types/staff-pay.types";

const KEY = ["staff-pay"] as const;

function db() {
  return createClient() as any;
}

export function useStaffMembers() {
  const { userProfile } = useAuth();
  return useQuery({
    queryKey: [...KEY, "members"],
    enabled: userProfile?.role === "admin",
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await db()
        .from("users")
        .select("id, name, role, status, assigned_sites")
        .in("role", ["site_engineer", "office"])
        .order("name");
      if (error) throw error;
      return ((data ?? []) as Array<StaffMember & { status?: string }>).filter((u) => !u.status || u.status === "active");
    },
  });
}

/** Payments for one staff member, or (admin, no id) everyone. Own rows only for non-admins. */
export function useStaffPayments(staffUserId?: string | null, opts: { withAllocations?: boolean; from?: string } = {}) {
  const { userProfile } = useAuth();
  return useQuery({
    queryKey: [...KEY, "payments", staffUserId ?? "all", opts],
    enabled: !!userProfile?.id,
    queryFn: async (): Promise<StaffPayment[]> => {
      const select = opts.withAllocations ? "*, allocations:staff_payment_allocations(site_id, amount, site:sites(name))" : "*";
      let q = db().from("staff_payments").select(select).order("paid_on", { ascending: false }).limit(500);
      if (staffUserId) q = q.eq("staff_user_id", staffUserId);
      if (opts.from) q = q.gte("paid_on", opts.from);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as StaffPayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
    },
  });
}

export function useSalaryProfiles(staffUserId?: string | null) {
  const { userProfile } = useAuth();
  return useQuery({
    queryKey: [...KEY, "profiles", staffUserId ?? "all"],
    enabled: !!userProfile?.id,
    queryFn: async (): Promise<StaffSalaryProfile[]> => {
      let q = db().from("staff_salary_profiles").select("*").order("effective_from", { ascending: false });
      if (staffUserId) q = q.eq("staff_user_id", staffUserId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as StaffSalaryProfile[]).map((p) => ({ ...p, monthly_salary: Number(p.monthly_salary) }));
    },
  });
}

/** Salary in effect on a given date (latest profile with effective_from <= date). */
export function currentSalary(profiles: StaffSalaryProfile[], staffUserId: string, onDate: string): number | null {
  const p = profiles
    .filter((x) => x.staff_user_id === staffUserId && x.effective_from <= onDate)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  return p ? p.monthly_salary : null;
}

export function useRecordStaffPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordStaffPaymentInput): Promise<string> => {
      const { data, error } = await db().rpc("record_staff_payment", {
        p_staff_user_id: input.staff_user_id,
        p_payment_type: input.payment_type,
        p_amount: input.amount,
        p_paid_on: input.paid_on,
        p_period_month: input.period_month ?? null,
        p_payment_mode: input.payment_mode ?? "upi",
        p_notes: input.notes ?? null,
        p_allocation: input.allocation?.length ? input.allocation : null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteStaffPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("staff_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetMonthlySalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { staff_user_id: string; monthly_salary: number; effective_from: string }) => {
      const { error } = await db()
        .from("staff_salary_profiles")
        .upsert(input, { onConflict: "staff_user_id,effective_from" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Admin: staff cost charged to one site (by month). Non-admins get []. */
export function useSiteStaffCost(siteId: string | null | undefined) {
  const { userProfile } = useAuth();
  return useQuery({
    queryKey: [...KEY, "site-cost", siteId ?? "none"],
    enabled: !!siteId && userProfile?.role === "admin",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from("v_site_staff_costs").select("month, payment_type, amount").eq("site_id", siteId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ month: string; payment_type: string; amount: number }>;
      const total = rows.reduce((a, r) => a + Number(r.amount), 0);
      const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
      const monthTotal = rows.filter((r) => r.month.startsWith(thisMonth)).reduce((a, r) => a + Number(r.amount), 0);
      return { total, monthTotal };
    },
  });
}
