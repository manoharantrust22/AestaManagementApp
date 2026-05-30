import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn, withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type {
  ConcretingTeam,
  ConcretingTeamFormData,
} from "@/types/concreting.types";

const LIST_KEY = ["concreting-teams", "list"] as const;

/**
 * Company-wide list of active concreting teams (the external concreting-gang
 * catalog). Used both by the /company/concreting-teams page and by the day-work
 * subcontract picker on /site/subcontracts.
 */
export function useConcretingTeams() {
  const supabase = createClient();

  return useQuery({
    queryKey: LIST_KEY,
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await supabase
          .from("concreting_teams")
          .select("*")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (error) throw error;
        return (data || []) as ConcretingTeam[];
      },
      { operationName: "useConcretingTeams" }
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/** Create a concreting team. Stamps created_by from the signed-in user. */
export function useCreateConcretingTeam() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (form: ConcretingTeamFormData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        name: form.name.trim(),
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        whatsapp_number: form.whatsapp_number || null,
        area: form.area || null,
        brings_own_machine: form.brings_own_machine ?? false,
        typical_rate: form.typical_rate ?? null,
        notes: form.notes || null,
        created_by: user?.id ?? null,
      };

      const { data, error } = await withTimeout(
        (async () =>
          supabase
            .from("concreting_teams")
            .insert(payload)
            .select("*")
            .single())(),
        TIMEOUTS.DATABASE_OPERATION,
        "Saving the concreting team timed out. Please try again."
      );

      if (error) throw error;
      return data as ConcretingTeam;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["concreting-teams"] });
    },
  });
}

/** Update an existing concreting team. */
export function useUpdateConcretingTeam() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data: form,
    }: {
      id: string;
      data: ConcretingTeamFormData;
    }) => {
      const payload = {
        name: form.name.trim(),
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        whatsapp_number: form.whatsapp_number || null,
        area: form.area || null,
        brings_own_machine: form.brings_own_machine ?? false,
        typical_rate: form.typical_rate ?? null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await withTimeout(
        (async () =>
          supabase.from("concreting_teams").update(payload).eq("id", id))(),
        TIMEOUTS.DATABASE_OPERATION,
        "Updating the concreting team timed out. Please try again."
      );

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["concreting-teams"] });
    },
  });
}

/** Soft-delete a concreting team (is_active = false), mirroring vendors. */
export function useDeleteConcretingTeam() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await withTimeout(
        (async () =>
          supabase
            .from("concreting_teams")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", id))(),
        TIMEOUTS.DATABASE_OPERATION,
        "Removing the concreting team timed out. Please try again."
      );

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["concreting-teams"] });
    },
  });
}
