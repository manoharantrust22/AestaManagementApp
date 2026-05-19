"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useAuth } from "@/contexts/AuthContext";
import type { EstimateItem } from "@/contexts/EstimateBasketContext";

// Table type isn't in the generated Supabase schema yet (migration just landed).
// Until types are regenerated, talk to the table via an `any`-typed handle.
type AnySupabase = {
  from: (table: string) => any;
};

export interface EstimateBasketDraft {
  id: string;
  user_id: string;
  name: string;
  items: EstimateItem[];
  item_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ["estimateBasketDrafts"] as const;

export function useEstimateBasketDrafts() {
  const supabase = createClient() as unknown as AnySupabase;
  const { userProfile } = useAuth();

  return useQuery({
    queryKey: [...QUERY_KEY, userProfile?.id],
    enabled: !!userProfile?.id,
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await supabase
          .from("estimate_basket_drafts")
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as EstimateBasketDraft[];
      },
      { operationName: "useEstimateBasketDrafts" },
    ),
    staleTime: 30 * 1000,
  });
}

export function useSaveEstimateBasketDraft() {
  const supabase = createClient() as unknown as AnySupabase;
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async (args: {
      id?: string;
      name: string;
      items: EstimateItem[];
      notes?: string | null;
    }) => {
      if (!userProfile?.id) throw new Error("Not signed in");
      const payload = {
        user_id: userProfile.id,
        name: args.name.trim(),
        items: args.items,
        item_count: args.items.length,
        notes: args.notes ?? null,
      };
      if (args.id) {
        const { data, error } = await supabase
          .from("estimate_basket_drafts")
          .update(payload)
          .eq("id", args.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as EstimateBasketDraft;
      }
      const { data, error } = await supabase
        .from("estimate_basket_drafts")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as EstimateBasketDraft;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteEstimateBasketDraft() {
  const supabase = createClient() as unknown as AnySupabase;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("estimate_basket_drafts")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
