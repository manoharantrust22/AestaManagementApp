"use client";

/**
 * Review queue hooks (maker/checker).
 *
 * RLS (20261108110000_review_flags.sql): everyone sees flags for sites they can
 * access; anyone may raise one; only admin/office may resolve.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  FlaggedPurchaseSnapshot,
  ReviewEntityType,
  ReviewFlag,
  ReviewReason,
  ReviewStatus,
} from "@/types/review.types";

export const reviewFlagKeys = {
  all: ["review-flags"] as const,
  list: (status: ReviewStatus | "all") => ["review-flags", "list", status] as const,
  openCount: () => ["review-flags", "open-count"] as const,
  purchases: (ids: string[]) => ["review-flags", "purchases", ...ids] as const,
};

function db() {
  // review_flags is newer than the generated types; keep the cast local.
  return createClient() as any;
}

const FLAG_SELECT = `
  *,
  site:sites(id, name),
  raiser:users!review_flags_raised_by_fkey(id, name),
  resolver:users!review_flags_resolved_by_fkey(id, name)
`;

export function useReviewFlags(status: ReviewStatus | "all" = "open") {
  return useQuery({
    queryKey: reviewFlagKeys.list(status),
    queryFn: async (): Promise<ReviewFlag[]> => {
      let q = db()
        .from("review_flags")
        .select(FLAG_SELECT)
        .order("created_at", { ascending: false })
        .limit(200);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ReviewFlag[];
    },
    staleTime: 30_000,
  });
}

export function useOpenReviewFlagCount() {
  return useQuery({
    queryKey: reviewFlagKeys.openCount(),
    queryFn: async (): Promise<number> => {
      const { count, error } = await db()
        .from("review_flags")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}

/** Current values of flagged purchases, keyed by id. */
export function useFlaggedPurchases(ids: string[]) {
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: reviewFlagKeys.purchases(sorted),
    enabled: sorted.length > 0,
    queryFn: async (): Promise<Record<string, FlaggedPurchaseSnapshot>> => {
      const { data, error } = await db()
        .from("material_purchase_expenses")
        .select("id, ref_code, vendor_name, purchase_date, total_amount, amount_paid, transport_cost")
        .in("id", sorted);
      if (error) throw error;
      const map: Record<string, FlaggedPurchaseSnapshot> = {};
      for (const row of (data ?? []) as FlaggedPurchaseSnapshot[]) map[row.id] = row;
      return map;
    },
    staleTime: 30_000,
  });
}

export interface RaiseReviewFlagInput {
  entityType: ReviewEntityType;
  entityId: string;
  reason: ReviewReason;
  siteId?: string | null;
  details?: Record<string, unknown>;
}

/** Anyone may raise a flag (the maker side). */
export function useRaiseReviewFlag() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: RaiseReviewFlagInput) => {
      if (!userProfile?.id) throw new Error("Not signed in");
      const { error } = await db()
        .from("review_flags")
        .insert({
          entity_type: input.entityType,
          entity_id: input.entityId,
          reason: input.reason,
          site_id: input.siteId ?? null,
          details: input.details ?? {},
          raised_by: userProfile.id,
        });
      // 23505 = an open flag for this entity and reason already exists; treat as success.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewFlagKeys.all }),
  });
}

export interface ResolveReviewFlagInput {
  id: string;
  status: Exclude<ReviewStatus, "open">;
  note?: string;
}

/** Admin/office resolve a flag (the checker side). RLS enforces the role. */
export function useResolveReviewFlag() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status, note }: ResolveReviewFlagInput) => {
      if (!userProfile?.id) throw new Error("Not signed in");
      const { data, error } = await db()
        .from("review_flags")
        .update({
          status,
          resolution_note: note?.trim() || null,
          resolved_by: userProfile.id,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "open")
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Could not resolve: it may already be resolved, or you lack permission.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewFlagKeys.all }),
  });
}
