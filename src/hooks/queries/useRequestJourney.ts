"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { RequestJourney, JourneyOverallStatus } from "@/types/journey.types";
import type {
  MaterialRequest,
  MaterialRequestItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Delivery,
  DeliveryItem,
  MaterialPurchaseExpense,
  BatchUsageRecord,
  InterSiteSettlement,
  InterSiteSettlementItem,
  InterSiteSettlementPayment,
} from "@/types/material.types";

// ============================================
// STATUS DERIVATION
// ============================================

function deriveOverallStatus(
  po: (PurchaseOrder & { items: PurchaseOrderItem[] }) | null,
  deliveries: (Delivery & { items: DeliveryItem[] })[],
  expense: MaterialPurchaseExpense | null,
  settlement: (InterSiteSettlement & {
    items: InterSiteSettlementItem[];
    payments: InterSiteSettlementPayment[];
  }) | null,
  isGroupPO: boolean
): JourneyOverallStatus {
  // No PO yet — request exists but not converted
  if (!po) return "pending_approval";

  // PO exists but no deliveries recorded
  if (deliveries.length === 0) return "ordered";

  // Check delivery verification state
  // Treat pending, disputed, and rejected as "not yet verified"
  const anyNotVerified = deliveries.some(
    (d) => d.verification_status !== "verified"
  );

  if (anyNotVerified) return "delivery_pending";

  // All deliveries verified (none are pending)
  if (!expense?.is_paid) return "delivery_verified";

  // Expense is paid
  if (isGroupPO) {
    if (!settlement) return "vendor_paid";
    if (settlement.status === "settled") return "settlement_done";
    return "vendor_paid";
  }

  // own-site: paid + all deliveries verified = complete
  return "complete";
}

// ============================================
// MAIN HOOK
// ============================================

/**
 * Fetches the complete journey for a single material request.
 * Chains queries sequentially: request → PO → deliveries + expense → batch usage → settlement → payments.
 */
export function useRequestJourney(requestId: string | null | undefined): {
  journey: RequestJourney | null;
  isLoading: boolean;
  error: Error | null;
} {
  const supabase = createClient() as any;

  // ── 1. Fetch the request + items ──────────────────────────────────────────
  const requestQuery = useQuery({
    queryKey: ["journey", "request", requestId ?? "none"],
    queryFn: wrapQueryFn(async () => {
      if (!requestId) return null;
      const { data, error } = await supabase
        .from("material_requests")
        .select(
          `
          *,
          items:material_request_items(*)
        `
        )
        .eq("id", requestId)
        .single();
      if (error) throw error;
      return data as MaterialRequest & { items: MaterialRequestItem[] };
    }),
    enabled: !!requestId,
    staleTime: 60_000,
  });

  const request = requestQuery.data ?? null;
  const poId = request?.converted_to_po_id ?? null;

  // ── 1b. Fallback PO lookup via source_request_id when converted_to_po_id is null ─
  // The link is bidirectional but often only the PO side stores the reference.
  const fallbackPoIdQuery = useQuery({
    queryKey: ["journey", "po-by-request", requestId ?? "none"],
    queryFn: wrapQueryFn(async () => {
      if (!requestId) return null;
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("source_request_id", requestId)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string) ?? null;
    }),
    enabled: !!request && !poId,
    staleTime: 60_000,
  });

  const effectivePoId = poId ?? fallbackPoIdQuery.data ?? null;

  // ── 2. Fetch the PO + items (enabled once we have a PO id) ───────────────
  const poQuery = useQuery({
    queryKey: ["journey", "po", effectivePoId ?? "none"],
    queryFn: wrapQueryFn(async () => {
      if (!effectivePoId) return null;
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          *,
          items:purchase_order_items(*)
        `
        )
        .eq("id", effectivePoId)
        .single();
      if (error) throw error;
      return data as PurchaseOrder & { items: PurchaseOrderItem[] };
    }),
    enabled: !!effectivePoId,
    staleTime: 60_000,
  });

  const po = poQuery.data ?? null;
  // purchase_type lives on the material request (not the PO type)
  const isGroupPO = request?.purchase_type === "group_stock";

  // ── 3a. Fetch deliveries (enabled once we have PO.id) ────────────────────
  const deliveriesQuery = useQuery({
    queryKey: ["journey", "deliveries", po?.id ?? "none"],
    queryFn: wrapQueryFn(async () => {
      if (!po?.id) return [] as (Delivery & { items: DeliveryItem[] })[];
      const { data, error } = await supabase
        .from("deliveries")
        .select(
          `
          *,
          items:delivery_items(*)
        `
        )
        .eq("po_id", po.id);
      if (error) throw error;
      return (data ?? []) as (Delivery & { items: DeliveryItem[] })[];
    }),
    enabled: !!po?.id,
    staleTime: 60_000,
  });

  // ── 3b. Fetch expense (enabled once we have PO.id) ───────────────────────
  const expenseQuery = useQuery({
    queryKey: ["journey", "expense", po?.id ?? "none"],
    queryFn: wrapQueryFn(async () => {
      if (!po?.id) return null;
      const { data, error } = await supabase
        .from("material_purchase_expenses")
        .select("*")
        .eq("purchase_order_id", po.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MaterialPurchaseExpense | null;
    }),
    enabled: !!po?.id,
    staleTime: 60_000,
  });

  const expense = expenseQuery.data ?? null;
  // expense.ref_code is the batch reference; batch_usage_records.batch_ref_code points to it
  const batchRefCode = expense?.ref_code ?? null;

  // ── 4. Fetch batch usage records (enabled when we have a batch ref code) ─
  const batchUsageQuery = useQuery({
    queryKey: ["journey", "batch-usage", batchRefCode ?? "none"],
    queryFn: wrapQueryFn(async () => {
      if (!batchRefCode) return [] as BatchUsageRecord[];
      const { data, error } = await supabase
        .from("batch_usage_records")
        .select("*")
        .eq("batch_ref_code", batchRefCode);
      if (error) throw error;
      return (data ?? []) as BatchUsageRecord[];
    }),
    enabled: !!batchRefCode,
    staleTime: 60_000,
  });

  const batchUsage = batchUsageQuery.data ?? [];

  // ── 5. Find settlement id from batch usage records ────────────────────────
  // Any non-null settlement_id in batch usage records links to the settlement
  const settlementId =
    batchUsage.find((r) => r.settlement_id)?.settlement_id ?? null;

  // ── 6. Fetch the settlement (enabled when batchUsage has at least one record) ─
  const settlementQuery = useQuery({
    queryKey: ["journey", "settlement", settlementId ?? "none"],
    queryFn: wrapQueryFn(async () => {
      if (!settlementId) return null;
      const { data, error } = await supabase
        .from("inter_site_material_settlements")
        .select(
          `
          *,
          items:inter_site_settlement_items(*),
          payments:inter_site_settlement_payments(*)
        `
        )
        .eq("id", settlementId)
        .single();
      if (error) throw error;
      return data as InterSiteSettlement & {
        items: InterSiteSettlementItem[];
        payments: InterSiteSettlementPayment[];
      };
    }),
    enabled: batchUsage.length > 0 && !!settlementId,
    staleTime: 60_000,
  });

  const settlement = settlementQuery.data ?? null;

  // ── Loading / error aggregation ───────────────────────────────────────────
  const isLoading =
    requestQuery.isLoading ||
    (!!request && !poId && fallbackPoIdQuery.isLoading) ||
    (!!effectivePoId && poQuery.isLoading) ||
    (!!po?.id && (deliveriesQuery.isLoading || expenseQuery.isLoading)) ||
    (!!batchRefCode && batchUsageQuery.isLoading) ||
    (batchUsage.length > 0 && !!settlementId && settlementQuery.isLoading);

  const error =
    (requestQuery.error as Error | null) ??
    (fallbackPoIdQuery.error as Error | null) ??
    (poQuery.error as Error | null) ??
    (deliveriesQuery.error as Error | null) ??
    (expenseQuery.error as Error | null) ??
    (batchUsageQuery.error as Error | null) ??
    (settlementQuery.error as Error | null);

  // ── Assemble the journey ──────────────────────────────────────────────────
  if (!requestId || !request) {
    return { journey: null, isLoading: requestQuery.isLoading, error };
  }

  const deliveries = deliveriesQuery.data ?? [];

  const overallStatus = deriveOverallStatus(
    po,
    deliveries,
    expense,
    settlement,
    isGroupPO
  );

  const journey: RequestJourney = {
    request,
    po,
    deliveries,
    expense,
    batchUsage,
    settlement,
    overallStatus,
    isGroupPO,
  };

  return { journey, isLoading, error };
}
