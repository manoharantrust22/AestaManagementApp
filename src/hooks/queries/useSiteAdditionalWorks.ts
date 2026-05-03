"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  SiteAdditionalWork,
  SiteAdditionalWorkInsert,
  SiteAdditionalWorkUpdate,
} from "@/types/site.types";

const KEY = (siteId: string | undefined) => ["site-additional-works", siteId];

export function useSiteAdditionalWorks(siteId: string | undefined) {
  return useQuery({
    queryKey: KEY(siteId),
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async (): Promise<SiteAdditionalWork[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("site_additional_works")
        .select("*")
        .eq("site_id", siteId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SiteAdditionalWork[];
    },
  });
}

export function useCreateSiteAdditionalWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SiteAdditionalWorkInsert) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("site_additional_works")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as SiteAdditionalWork;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: KEY(row.site_id) });
      qc.invalidateQueries({ queryKey: ["site-financial-summary", row.site_id] });
    },
  });
}

export function useUpdateSiteAdditionalWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: { id: string; siteId: string; patch: SiteAdditionalWorkUpdate },
    ) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("site_additional_works")
        .update(args.patch)
        .eq("id", args.id)
        .select()
        .single();
      if (error) throw error;
      return data as SiteAdditionalWork;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: KEY(vars.siteId) });
      qc.invalidateQueries({ queryKey: ["site-financial-summary", vars.siteId] });
    },
  });
}

export function useDeleteSiteAdditionalWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; siteId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("site_additional_works")
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
