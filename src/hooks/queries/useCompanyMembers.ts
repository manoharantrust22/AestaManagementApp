"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSelectedCompany } from "@/contexts/CompanyContext";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: string;
  is_primary: boolean;
  joined_at: string;
  user?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
  };
}

export interface CompanyInvite {
  id: string;
  company_id: string;
  invited_by: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  token: string;
  created_at: string;
  expires_at: string;
  inviter?: {
    name: string;
  };
}

export function useCompanyMembers() {
  const { selectedCompany } = useSelectedCompany();
  const companyId = selectedCompany?.id;

  return useQuery({
    queryKey: queryKeys.companyMembers?.list(companyId || "") || ["company-members", companyId],
    queryFn: wrapQueryFn(async () => {
      if (!companyId) return [];

      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("company_members")
        .select(`
          id,
          company_id,
          user_id,
          role,
          is_primary,
          joined_at,
          user:users(id, name, email, phone, status)
        `)
        .eq("company_id", companyId)
        .order("joined_at", { ascending: true });

      if (error) {
        console.error("Error fetching company members:", error);
        throw error;
      }

      return (data || []) as CompanyMember[];
    }, { operationName: "useCompanyMembers" }),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCompanyInvites() {
  const { selectedCompany } = useSelectedCompany();
  const companyId = selectedCompany?.id;

  return useQuery({
    queryKey: queryKeys.companyInvites?.list(companyId || "") || ["company-invites", companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("company_invites")
        .select(`
          id,
          company_id,
          invited_by,
          email,
          phone,
          role,
          status,
          token,
          created_at,
          expires_at,
          inviter:users!invited_by(name)
        `)
        .eq("company_id", companyId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching company invites:", error);
        throw error;
      }

      return (data || []) as CompanyInvite[];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("company_members")
        .update({ role })
        .eq("id", memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyMembers?.list(selectedCompany?.id || "") || ["company-members"]
      });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyMembers?.list(selectedCompany?.id || "") || ["company-members"]
      });
    },
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async ({ email, phone, role, invitedBy }: {
      email?: string;
      phone?: string;
      role: string;
      invitedBy: string;
    }) => {
      if (!selectedCompany?.id) throw new Error("No company selected");

      const supabase = createClient() as any;

      // Generate a random token
      const token = crypto.randomUUID().replace(/-/g, "");

      const { data, error } = await supabase
        .from("company_invites")
        .insert({
          company_id: selectedCompany.id,
          invited_by: invitedBy,
          email: email || null,
          phone: phone || null,
          role,
          status: "pending",
          token,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyInvites?.list(selectedCompany?.id || "") || ["company-invites"]
      });
    },
  });
}

export function useCancelInvite() {
  const queryClient = useQueryClient();
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("company_invites")
        .update({ status: "cancelled" })
        .eq("id", inviteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyInvites?.list(selectedCompany?.id || "") || ["company-invites"]
      });
    },
  });
}
