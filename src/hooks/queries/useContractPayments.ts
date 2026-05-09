import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

export type ContractPaymentType =
  | "weekly_advance"
  | "milestone"
  | "part_payment"
  | "final_settlement";

export type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque" | "other";

export type PaymentChannel =
  | "via_site_engineer"
  | "mesthri_at_office"
  | "company_direct_online";

/** Source identifies where a ledger entry originated. The inline ledger
 *  renders all three together so the engineer sees every flow of money
 *  out toward this contract.
 *  - direct      = subcontract_payments (mesthri-direct payment / advance)
 *  - settlement  = settlement_groups (multi-laborer salary settlement
 *                  classified to this contract)
 *  - extra       = misc_expenses (snacks, fuel, small materials bought
 *                  with engineer/company cash, allocated to the contract) */
export type LedgerSource = "direct" | "settlement" | "extra";

export interface ContractLedgerEntry {
  id: string;
  source: LedgerSource;
  amount: number;
  paymentDate: string;
  /** subcontract_payments.payment_type or settlement_groups.payment_type. */
  paymentType: string;
  paymentMode: PaymentMode | null;
  paymentChannel: string | null;
  reference: string | null;
  notes: string | null;
}

interface RawPaymentRow {
  id: string;
  contract_id: string;
  amount: number | string;
  payment_date: string;
  payment_type: ContractPaymentType;
  payment_mode: PaymentMode | null;
  payment_channel: PaymentChannel | null;
  reference_number: string | null;
  comments: string | null;
  created_at: string;
}

interface RawSettlementRow {
  id: string;
  amount: number | string;
  date: string;
  payment_type: string | null;
  payment_mode: PaymentMode | null;
  payment_channel: string | null;
  settlement_reference: string | null;
}

interface RawExtraRow {
  id: string;
  amount: number | string;
  date: string;
  payment_mode: string | null;
  payer_source: string | null;
  reference_number: string | null;
  description: string | null;
  notes: string | null;
  category_id: string | null;
  category_name?: string | null;
}

/**
 * Unified ledger for a single contract: subcontract_payments + non-cancelled
 * settlement_groups + non-cancelled misc_expenses (extras like snacks,
 * paint thinner, fuel) merged into one chronological timeline (newest
 * first). Used by the inline payments list on the trade card.
 */
export function useContractPayments(contractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["contract-payments", contractId],
    enabled: !!contractId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<ContractLedgerEntry[]> => {
      if (!contractId) return [];
      const sb = supabase as any;

      const [paymentsRes, settlementsRes, extrasRes] = await Promise.all([
        sb
          .from("subcontract_payments")
          .select(
            "id, contract_id, amount, payment_date, payment_type, payment_mode, payment_channel, reference_number, comments, created_at"
          )
          .eq("contract_id", contractId)
          .eq("is_deleted", false),
        sb
          .from("settlement_groups")
          .select(
            "id, total_amount, settlement_date, payment_type, payment_mode, payment_channel, settlement_reference"
          )
          .eq("subcontract_id", contractId)
          .eq("is_cancelled", false),
        sb
          .from("misc_expenses")
          .select(
            "id, amount, date, payment_mode, payer_source, reference_number, description, notes, category_id, category:expense_categories(name)"
          )
          .eq("subcontract_id", contractId)
          .eq("is_cancelled", false),
      ]);
      if (paymentsRes.error) throw paymentsRes.error;
      if (settlementsRes.error) throw settlementsRes.error;
      if (extrasRes.error) throw extrasRes.error;

      const direct: ContractLedgerEntry[] = (
        (paymentsRes.data ?? []) as RawPaymentRow[]
      ).map((r) => ({
        id: `sp:${r.id}`,
        source: "direct" as const,
        amount: Number(r.amount ?? 0),
        paymentDate: r.payment_date,
        paymentType: r.payment_type,
        paymentMode: r.payment_mode,
        paymentChannel: r.payment_channel,
        reference: r.reference_number,
        notes: r.comments,
      }));

      const settlements: ContractLedgerEntry[] = (
        (settlementsRes.data ?? [] as Array<RawSettlementRow & { total_amount: number | string; settlement_date: string }>)
      ).map((r: any) => ({
        id: `sg:${r.id}`,
        source: "settlement" as const,
        amount: Number(r.total_amount ?? 0),
        paymentDate: r.settlement_date,
        paymentType: r.payment_type ?? "salary",
        paymentMode: r.payment_mode,
        paymentChannel: r.payment_channel,
        reference: r.settlement_reference,
        notes: null,
      }));

      const extras: ContractLedgerEntry[] = (
        (extrasRes.data ?? []) as Array<RawExtraRow & { category: { name: string } | null }>
      ).map((r) => ({
        id: `me:${r.id}`,
        source: "extra" as const,
        amount: Number(r.amount ?? 0),
        paymentDate: r.date,
        // Use the category name as the display "type" so a chip says
        // "Tea & Snacks" or "Food & Meals" instead of an opaque "Extra".
        paymentType: r.category?.name ?? "Other",
        paymentMode: (r.payment_mode as PaymentMode) ?? null,
        paymentChannel: r.payer_source,
        reference: r.reference_number,
        notes: r.description ?? r.notes,
      }));

      return [...direct, ...settlements, ...extras].sort((a, b) => {
        if (a.paymentDate !== b.paymentDate) {
          return a.paymentDate < b.paymentDate ? 1 : -1;
        }
        return 0;
      });
    }, { operationName: "useContractPayments" }),
  });
}
