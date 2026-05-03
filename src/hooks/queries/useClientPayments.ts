"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type ClientPaymentRow = Database["public"]["Tables"]["client_payments"]["Row"];

export interface RecordClientPaymentInput {
  siteId: string;
  amount: number;
  paymentDate: string;             // YYYY-MM-DD
  paymentMode: "cash" | "upi" | "bank_transfer" | "cheque";
  notes?: string | null;
  receiptUrl?: string | null;
  /** Optional — tag this payment to a base-contract phase. Mutually exclusive with taggedAdditionalWorkId (DB-enforced). */
  paymentPhaseId?: string | null;
  /** Optional — tag this payment to an additional work. Mutually exclusive with paymentPhaseId (DB-enforced). */
  taggedAdditionalWorkId?: string | null;
}

export interface UpdateClientPaymentInput extends Partial<RecordClientPaymentInput> {
  id: string;
  siteId: string; // needed for cache invalidation
}

const KEY = (siteId: string | undefined) => ["client-payments", siteId];

export function useClientPayments(siteId: string | undefined) {
  return useQuery({
    queryKey: KEY(siteId),
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async (): Promise<ClientPaymentRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_payments")
        .select("*")
        .eq("site_id", siteId!)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientPaymentRow[];
    },
  });
}

export function useCreateClientPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordClientPaymentInput) => {
      const supabase = createClient();
      const payload = {
        site_id: input.siteId,
        amount: input.amount,
        payment_date: input.paymentDate,
        payment_mode: input.paymentMode,
        notes: input.notes ?? null,
        receipt_url: input.receiptUrl ?? null,
        payment_phase_id: input.paymentPhaseId ?? null,
        tagged_additional_work_id: input.taggedAdditionalWorkId ?? null,
      };
      const { data, error } = await supabase
        .from("client_payments")
        .insert(payload)
        .select()
        .single();
      if (error) {
        // Surface the DB mutex error (client_payments_tag_mutex) as a friendly message.
        if (typeof error.message === "string" && error.message.includes("client_payments_tag_mutex")) {
          throw new Error("A payment can be tagged to a contract phase OR an additional work, not both.");
        }
        throw error;
      }
      return data as ClientPaymentRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: KEY(row.site_id) });
      qc.invalidateQueries({ queryKey: ["site-financial-summary", row.site_id] });
    },
  });
}

export function useUpdateClientPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateClientPaymentInput) => {
      const supabase = createClient();
      const patch: Record<string, unknown> = {};
      if (input.amount               !== undefined) patch.amount = input.amount;
      if (input.paymentDate          !== undefined) patch.payment_date = input.paymentDate;
      if (input.paymentMode          !== undefined) patch.payment_mode = input.paymentMode;
      if (input.notes                !== undefined) patch.notes = input.notes ?? null;
      if (input.receiptUrl           !== undefined) patch.receipt_url = input.receiptUrl ?? null;
      if (input.paymentPhaseId       !== undefined) patch.payment_phase_id = input.paymentPhaseId ?? null;
      if (input.taggedAdditionalWorkId !== undefined) patch.tagged_additional_work_id = input.taggedAdditionalWorkId ?? null;

      const { data, error } = await supabase
        .from("client_payments")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) {
        if (typeof error.message === "string" && error.message.includes("client_payments_tag_mutex")) {
          throw new Error("A payment can be tagged to a contract phase OR an additional work, not both.");
        }
        throw error;
      }
      return data as ClientPaymentRow;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: KEY(vars.siteId) });
      qc.invalidateQueries({ queryKey: ["site-financial-summary", vars.siteId] });
    },
  });
}

export function useDeleteClientPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; siteId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("client_payments")
        .delete()
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: KEY(vars.siteId) });
      qc.invalidateQueries({ queryKey: ["site-financial-summary", vars.siteId] });
    },
  });
}
