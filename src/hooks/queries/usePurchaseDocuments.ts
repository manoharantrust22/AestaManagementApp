"use client";

/**
 * Bill Inbox (purchase_documents) hooks.
 *
 * RLS (20261114100000_purchase_documents.sql): anyone with access to the site
 * may capture, read and complete a bill; only admin/office may delete.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BILL_BUCKET, requestRead } from "@/lib/bill-inbox/queue";
import { reviewFlagKeys } from "@/hooks/queries/useReviewFlags";
import type { PurchaseDocument, PurchaseDocumentStatus } from "@/types/bill-inbox.types";

export type BillInboxTab = "to_check" | "saved" | "rejected";

const TAB_STATUSES: Record<BillInboxTab, PurchaseDocumentStatus[]> = {
  to_check: ["uploaded", "extracting", "needs_review", "failed"],
  saved: ["confirmed"],
  rejected: ["rejected"],
};

export const purchaseDocumentKeys = {
  all: ["purchase-documents"] as const,
  list: (siteId: string | null | undefined, tab: BillInboxTab) => ["purchase-documents", "list", siteId ?? "none", tab] as const,
  counts: (siteId: string | null | undefined) => ["purchase-documents", "counts", siteId ?? "none"] as const,
  detail: (id: string) => ["purchase-documents", "detail", id] as const,
};

const SELECT = `
  *,
  uploader:users!purchase_documents_uploaded_by_fkey(id, name),
  purchase:material_purchase_expenses!purchase_documents_purchase_expense_id_fkey(id, ref_code)
`;

/** Public URL for a stored file (the bucket is public-read). */
export function billFileUrl(path: string | null | undefined, bucket = BILL_BUCKET): string | null {
  if (!path) return null;
  return createClient().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function usePurchaseDocuments(siteId: string | null | undefined, tab: BillInboxTab) {
  return useQuery({
    queryKey: purchaseDocumentKeys.list(siteId, tab),
    enabled: !!siteId,
    queryFn: async (): Promise<PurchaseDocument[]> => {
      const { data, error } = await createClient()
        .from("purchase_documents")
        .select(SELECT)
        .eq("site_id", siteId!)
        .in("status", TAB_STATUSES[tab])
        .order("captured_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseDocument[];
    },
    staleTime: 15_000,
    // While anything is being read, poll so the card flips to "Ready to check" on its own.
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as PurchaseDocument[];
      return rows.some((r) => r.status === "uploaded" || r.status === "extracting") ? 5_000 : false;
    },
  });
}

/** Number of bills waiting to be checked for a site (for badges on entry points). */
export function useBillInboxCount(siteId: string | null | undefined) {
  return useQuery({
    queryKey: purchaseDocumentKeys.counts(siteId),
    enabled: !!siteId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await createClient()
        .from("purchase_documents")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId!)
        .in("status", TAB_STATUSES.to_check);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}

export function usePurchaseDocument(id: string | null | undefined) {
  return useQuery({
    queryKey: purchaseDocumentKeys.detail(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<PurchaseDocument> => {
      const { data, error } = await createClient().from("purchase_documents").select(SELECT).eq("id", id!).single();
      if (error) throw error;
      return data as unknown as PurchaseDocument;
    },
  });
}

/** Ask the server to (re)read a bill. */
export function useReadBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const res = await requestRead(documentId);
      if (!res.ok) throw new Error(res.error ?? "Could not read the bill");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: purchaseDocumentKeys.all });
      qc.invalidateQueries({ queryKey: reviewFlagKeys.all });
    },
  });
}

export interface UpdateBillInput {
  id: string;
  patch: Partial<
    Pick<
      PurchaseDocument,
      "vendor_name" | "vendor_id" | "notes" | "doc_kind" | "status" | "invoice_no" | "invoice_date" | "total_amount"
    >
  >;
}

/** Edit header fields. Filling a pending shop name raises a review flag (DB trigger). */
export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateBillInput) => {
      const { error } = await createClient().from("purchase_documents").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchaseDocumentKeys.all });
      qc.invalidateQueries({ queryKey: reviewFlagKeys.all });
    },
  });
}

/** Link a confirmed bill to the purchase that was just saved from it. */
export function useMarkBillConfirmed() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      purchaseExpenseId: string | null;
      vendorId: string | null;
      vendorName: string;
      invoiceNo: string | null;
      invoiceDate: string | null;
      totalAmount: number;
    }) => {
      const { error } = await createClient()
        .from("purchase_documents")
        .update({
          status: "confirmed",
          purchase_expense_id: input.purchaseExpenseId,
          vendor_id: input.vendorId,
          vendor_name: input.vendorName,
          invoice_no: input.invoiceNo,
          invoice_date: input.invoiceDate,
          total_amount: input.totalAmount,
          confirmed_by: userProfile?.id ?? null,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchaseDocumentKeys.all });
      qc.invalidateQueries({ queryKey: reviewFlagKeys.all });
    },
  });
}
