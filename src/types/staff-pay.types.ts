/** Mirrors supabase/migrations/20261108100300_staff_pay.sql */

export type StaffPaymentType = "salary" | "incentive" | "bonus" | "advance" | "other";
export type StaffPaymentMode = "cash" | "upi" | "bank";
export type StaffAllocationMode = "equal_assigned" | "custom" | "none";

export interface StaffPayment {
  id: string;
  staff_user_id: string;
  payment_type: StaffPaymentType;
  amount: number;
  paid_on: string;
  period_month: string | null;
  payment_mode: StaffPaymentMode;
  notes: string | null;
  proof_path: string | null;
  allocation_mode: StaffAllocationMode;
  created_by: string | null;
  created_at: string;
  allocations?: Array<{ site_id: string; amount: number; site?: { name: string } | null }>;
}

export interface StaffSalaryProfile {
  id: string;
  staff_user_id: string;
  monthly_salary: number;
  effective_from: string;
  notes: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  assigned_sites: string[] | null;
}

export interface RecordStaffPaymentInput {
  staff_user_id: string;
  payment_type: StaffPaymentType;
  amount: number;
  paid_on: string;
  period_month?: string | null;
  payment_mode?: StaffPaymentMode;
  notes?: string | null;
  /** null → equal split across assigned sites. */
  allocation?: Array<{ site_id: string; pct: number }> | null;
}

export const PAYMENT_TYPE_LABEL: Record<StaffPaymentType, string> = {
  salary: "Salary",
  incentive: "Incentive",
  bonus: "Bonus",
  advance: "Advance",
  other: "Other",
};

export const PAYMENT_MODE_LABEL: Record<StaffPaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
};
