"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";
import type { TechnicianFormData, TechnicianRow } from "@/types/directory.types";

/**
 * Live list of active technicians (the editable directory source).
 *
 * Fetched app-wide like the other company-wide catalogs (laborers/vendors);
 * `initialData` from the server loader gives an instant first paint, and the
 * cache takes over after the first mutation.
 */
export function useTechnicians(initialData?: TechnicianRow[]) {
  return useQuery({
    queryKey: queryKeys.technicians.list(),
    queryFn: wrapQueryFn(
      async () => {
        const supabase = createClient();
        const { data, error } = await (
          supabase.from("technicians" as any) as any
        )
          .select("*")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        return (data ?? []) as TechnicianRow[];
      },
      { operationName: "useTechnicians" }
    ),
    initialData,
  });
}

export function useCreateTechnician() {
  const queryClient = useQueryClient();
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async (form: TechnicianFormData) => {
      await ensureFreshSession();
      const supabase = createClient();
      if (!selectedCompany?.id) {
        throw new Error("No company selected — cannot save technician.");
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await (supabase.from("technicians" as any) as any)
        .insert({
          ...form,
          company_id: selectedCompany.id,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TechnicianRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.technicians.list(),
      });
    },
  });
}

export function useUpdateTechnician() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<TechnicianFormData>;
    }) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { data: row, error } = await (
        supabase.from("technicians" as any) as any
      )
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return row as TechnicianRow;
    },
    onSuccess: (_row, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.technicians.list(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.technicians.byId(variables.id),
      });
    },
  });
}

export function useDeleteTechnician() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { error } = await (supabase.from("technicians" as any) as any)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.technicians.list(),
      });
    },
  });
}
