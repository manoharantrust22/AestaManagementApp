/**
 * Bill Verification Hook
 * Provides functionality for verifying vendor bills against purchase orders
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { BillVerificationStatus, PurchaseOrder } from "@/types/material.types";
import { ensureFreshSession } from "@/lib/supabase/client";

/**
 * Get bill verification status for a purchase order
 */
export function useBillVerificationStatus(poId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.billVerification.byPO(poId || ""),
    queryFn: wrapQueryFn(async (): Promise<BillVerificationStatus | null> => {
      if (!poId) return null;

      const { data, error } = await (supabase as any)
        .from("purchase_orders")
        .select("vendor_bill_url, bill_verified, bill_verified_by, bill_verified_at, bill_verification_notes")
        .eq("id", poId)
        .single();

      if (error) {
        console.error("Error fetching bill verification status:", error);
        return null;
      }

      const billData = data as {
        vendor_bill_url: string | null;
        bill_verified: boolean | null;
        bill_verified_by: string | null;
        bill_verified_at: string | null;
        bill_verification_notes: string | null;
      };

      return {
        hasVendorBill: !!billData.vendor_bill_url,
        isVerified: billData.bill_verified || false,
        verifiedBy: billData.bill_verified_by,
        verifiedAt: billData.bill_verified_at,
        verificationNotes: billData.bill_verification_notes,
      };
    }, { operationName: "useBillVerificationStatus" }),
    enabled: !!poId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Verify a bill for a purchase order
 */
export function useVerifyBill() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      poId,
      userId,
      notes,
    }: {
      poId: string;
      userId: string;
      notes?: string;
    }) => {
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("purchase_orders")
        .update({
          bill_verified: true,
          bill_verified_by: userId,
          bill_verified_at: new Date().toISOString(),
          bill_verification_notes: notes || null,
        })
        .eq("id", poId);

      if (error) throw error;

      return { poId };
    },
    onSuccess: (result) => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.billVerification.byPO(result.poId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.all,
      });
      // Also invalidate material purchases (material settlements page uses this)
      queryClient.invalidateQueries({
        queryKey: queryKeys.materialPurchases.all,
      });
    },
  });
}

/**
 * Upload vendor bill URL to a purchase order
 */
export function useUploadVendorBill() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      poId,
      billUrl,
    }: {
      poId: string;
      billUrl: string;
    }) => {
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("purchase_orders")
        .update({
          vendor_bill_url: billUrl,
        })
        .eq("id", poId);

      if (error) throw error;

      return { poId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.billVerification.byPO(result.poId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.all,
      });
    },
  });
}

/**
 * Remove bill verification (for re-verification)
 */
export function useUnverifyBill() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ poId }: { poId: string }) => {
      await ensureFreshSession();

      const { error } = await (supabase as any)
        .from("purchase_orders")
        .update({
          bill_verified: false,
          bill_verified_by: null,
          bill_verified_at: null,
          bill_verification_notes: null,
        })
        .eq("id", poId);

      if (error) throw error;

      return { poId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.billVerification.byPO(result.poId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.all,
      });
    },
  });
}

/**
 * Fetch unverified POs with bills for a site (verification dashboard)
 */
export function useUnverifiedPOsWithBills(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.billVerification.unverified(siteId || ""),
    queryFn: wrapQueryFn(async () => {
      if (!siteId) return [];

      const { data, error } = await (supabase as any)
        .from("purchase_orders")
        .select(`
          id,
          po_number,
          vendor_id,
          total_amount,
          order_date,
          status,
          vendor_bill_url,
          bill_verified,
          vendors!vendor_id(name)
        `)
        .eq("site_id", siteId)
        .not("vendor_bill_url", "is", null)
        .eq("bill_verified", false)
        .in("status", ["ordered", "partial_delivered", "delivered"])
        .order("order_date", { ascending: false });

      if (error) {
        console.error("Error fetching unverified POs:", error);
        return [];
      }

      return data || [];
    }, { operationName: "useUnverifiedPOsWithBills" }),
    enabled: !!siteId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Helper to get the effective bill URL from various sources
 * Priority: PO vendor_bill_url > Delivery invoice_url > Material purchase expense bill_url
 */
export function getEffectiveBillUrl(
  purchaseOrder?: Pick<PurchaseOrder, "vendor_bill_url"> | null,
  delivery?: { invoice_url?: string | null } | null,
  materialPurchaseExpense?: { bill_url?: string | null } | null
): string | null {
  return (
    purchaseOrder?.vendor_bill_url ||
    delivery?.invoice_url ||
    materialPurchaseExpense?.bill_url ||
    null
  );
}

/**
 * Check if bill verification is needed before settlement
 */
export function needsBillVerification(
  purchaseOrder?: Pick<PurchaseOrder, "vendor_bill_url" | "bill_verified"> | null
): boolean {
  if (!purchaseOrder) return false;
  // Need verification if there's a bill but it's not verified
  return !!purchaseOrder.vendor_bill_url && !purchaseOrder.bill_verified;
}
