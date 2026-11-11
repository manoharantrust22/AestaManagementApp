"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { Database } from "@/types/database.types";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

/**
 * A client person on a site's roster (owner, spouse, family member who
 * approves extras, ...). `id` is the `clients.id` — that's what other tables
 * reference (client_approved_by_id, received_from_client_id). `linkId` is the
 * `site_clients` row, used for site-specific fields (role, primary).
 */
export interface SiteClient {
  id: string;
  linkId: string;
  name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  role: string | null;
  is_primary: boolean;
}

export interface SiteClientInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  photo_url?: string | null;
  role?: string | null;
  is_primary?: boolean;
}

export const siteClientsKey = (siteId: string | undefined) => ["site-clients", siteId];

export function useSiteClients(siteId: string | undefined) {
  return useQuery({
    queryKey: siteClientsKey(siteId),
    enabled: Boolean(siteId),
    staleTime: 5 * 60_000,
    queryFn: wrapQueryFn(async (): Promise<SiteClient[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("site_clients")
        .select("id, role, is_primary_client, created_at, client:clients(id, name, phone, email, photo_url)")
        .eq("site_id", siteId!)
        .order("is_primary_client", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      type Row = {
        id: string;
        role: string | null;
        is_primary_client: boolean | null;
        client: Pick<ClientRow, "id" | "name" | "phone" | "email" | "photo_url"> | null;
      };
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.client)
        .map((r) => ({
          id: r.client!.id,
          linkId: r.id,
          name: r.client!.name,
          phone: r.client!.phone,
          email: r.client!.email,
          photo_url: r.client!.photo_url,
          role: r.role,
          is_primary: Boolean(r.is_primary_client),
        }));
    }, { operationName: "useSiteClients" }),
  });
}

function clean(v: string | null | undefined) {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Only one primary client per site. */
async function clearOtherPrimaries(siteId: string, keepLinkId?: string) {
  const supabase = createClient();
  let q = supabase
    .from("site_clients")
    .update({ is_primary_client: false })
    .eq("site_id", siteId)
    .eq("is_primary_client", true);
  if (keepLinkId) q = q.neq("id", keepLinkId);
  const { error } = await q;
  if (error) throw error;
}

/** Creates the client person and adds them to the site's roster. */
export function useCreateSiteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { siteId: string; input: SiteClientInput }): Promise<SiteClient> => {
      const supabase = createClient();
      const { input } = args;
      const { data: client, error } = await supabase
        .from("clients")
        .insert({
          name: input.name.trim(),
          phone: clean(input.phone),
          email: clean(input.email),
          photo_url: input.photo_url ?? null,
        })
        .select("id, name, phone, email, photo_url")
        .single();
      if (error) throw error;

      if (input.is_primary) await clearOtherPrimaries(args.siteId);
      const { data: link, error: linkError } = await supabase
        .from("site_clients")
        .insert({
          site_id: args.siteId,
          client_id: client.id,
          role: clean(input.role),
          is_primary_client: Boolean(input.is_primary),
        })
        .select("id")
        .single();
      if (linkError) {
        // Don't leave an orphan client behind if the link fails.
        await supabase.from("clients").delete().eq("id", client.id);
        throw linkError;
      }
      return {
        ...client,
        linkId: link.id,
        role: clean(input.role),
        is_primary: Boolean(input.is_primary),
      };
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: siteClientsKey(vars.siteId) });
    },
  });
}

export function useUpdateSiteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { siteId: string; client: SiteClient; input: SiteClientInput }) => {
      const supabase = createClient();
      const { client, input } = args;
      const { error } = await supabase
        .from("clients")
        .update({
          name: input.name.trim(),
          phone: clean(input.phone),
          email: clean(input.email),
          photo_url: input.photo_url ?? null,
        })
        .eq("id", client.id);
      if (error) throw error;

      if (input.is_primary) await clearOtherPrimaries(args.siteId, client.linkId);
      const { error: linkError } = await supabase
        .from("site_clients")
        .update({ role: clean(input.role), is_primary_client: Boolean(input.is_primary) })
        .eq("id", client.linkId);
      if (linkError) throw linkError;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: siteClientsKey(vars.siteId) });
    },
  });
}

/**
 * Removes the person from this site's roster. The `clients` row is kept so
 * past approvals/payments that reference it still show the right name.
 */
export function useRemoveSiteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { siteId: string; linkId: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("site_clients").delete().eq("id", args.linkId);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: siteClientsKey(vars.siteId) });
    },
  });
}
