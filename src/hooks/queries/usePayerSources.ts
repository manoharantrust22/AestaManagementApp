import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import {
  buildCustomSourceRow,
  reorderVisible,
} from "@/lib/settlement/payerSourceAdmin";

export interface PayerSourceRow {
  id: string;
  site_id: string;
  key: string;
  label: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  requires_name: boolean;
  is_built_in: boolean;
  is_hidden: boolean;
}

export interface ResolvedPayerSource {
  label: string;
  icon: string | null;
  color: string | null;
  requires_name: boolean;
}

function humanizeKey(key: string): string {
  // "site_cash" -> "Site Cash", "amma_money" -> "Amma Money"
  return key
    .split("_")
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Fetch the visible payer sources for a site, ordered by sort_order.
 * 5-minute staleTime; invalidates on the BroadcastChannel
 * "payer-sources-changed" so cross-tab edits (Slice 2 settings page)
 * propagate without a hard refresh. Disabled when siteId is undefined.
 */
export function usePayerSources(siteId: string | undefined) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Cross-tab invalidation. Slice 2's settings page will post
  // BroadcastChannel("payer-sources-changed") after writes.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("payer-sources-changed");
    bc.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["payer-sources"] });
    };
    return () => bc.close();
  }, [queryClient]);

  return useQuery<PayerSourceRow[]>({
    queryKey: ["payer-sources", siteId],
    enabled: Boolean(siteId),
    staleTime: 5 * 60_000,
    queryFn: wrapQueryFn(async () => {
      // (supabase as any) is needed here because payer_sources is not yet in
      // database.types.ts — the Slice 1 migration adds the table but types are
      // regenerated in Slice 2. Without the cast TypeScript throws "type
      // instantiation excessively deep" on the unknown table name.
      const { data, error } = await (supabase as any)
        .from("payer_sources")
        .select("*")
        .eq("site_id", siteId as string)
        .eq("is_hidden", false)
        .order("sort_order", { ascending: true });
      if (error) throw error as Error;
      return (data ?? []) as PayerSourceRow[];
    }, { operationName: "usePayerSources" }),
  });
}

/**
 * Resolve a (siteId, key) pair to display metadata. Returns the
 * matching registry row's label/icon/color/requires_name when found;
 * falls back to a humanized form of the key otherwise. The fallback
 * only fires for transient states (registry not yet loaded, key
 * deleted on another tab). Slice 1's self-healing migration ensures
 * all live data has a matching row in steady state.
 */
export function useResolvePayerSource(
  siteId: string | undefined,
  key: string | null,
): ResolvedPayerSource {
  const { data: rows, isSuccess } = usePayerSources(siteId);

  if (!key) {
    return { label: "", icon: null, color: null, requires_name: false };
  }

  const match = rows?.find((r) => r.key === key);
  if (match) {
    return {
      label: match.label,
      icon: match.icon,
      color: match.color,
      requires_name: match.requires_name,
    };
  }

  // While the query is still loading, return empty label so callers
  // can distinguish "loading" from "key not in registry". Once settled
  // (isSuccess = true, no match found) the key is genuinely unknown
  // and we humanize it as a graceful fallback. The gate is also
  // load-bearing for tests: without it, humanizeKey("amma_money") ===
  // "Amma Money" (the registry label), so a waitFor() assertion on
  // the matched-row case would resolve on the loading fallback before
  // the mock query settles, making the test order-of-resolution flaky.
  return {
    label: isSuccess ? humanizeKey(key) : "",
    icon: null,
    color: null,
    requires_name: false,
  };
}

/**
 * Post on the cross-tab channel that picker hooks listen to, so an edit
 * in the settings tab (or the inline +Add) refreshes open dialogs without
 * a hard reload. No-op where BroadcastChannel is unavailable (SSR/tests).
 */
export function broadcastPayerSourcesChanged(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const bc = new BroadcastChannel("payer-sources-changed");
  bc.postMessage({ type: "changed" });
  bc.close();
}

/**
 * Manager-only read: returns ALL of a site's payer sources, including
 * hidden ones, ordered by sort_order. The picker hook (usePayerSources)
 * filters out hidden rows; the settings editor needs to see them to be
 * able to un-hide. Separate query key so the two caches don't collide.
 */
export function usePayerSourcesAdmin(siteId: string | undefined) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("payer-sources-changed");
    bc.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["payer-sources-admin"] });
    };
    return () => bc.close();
  }, [queryClient]);

  return useQuery<PayerSourceRow[]>({
    queryKey: ["payer-sources-admin", siteId],
    enabled: Boolean(siteId),
    staleTime: 60_000,
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await (supabase as any)
          .from("payer_sources")
          .select("*")
          .eq("site_id", siteId as string)
          .order("sort_order", { ascending: true });
        if (error) throw error as Error;
        return (data ?? []) as PayerSourceRow[];
      },
      { operationName: "usePayerSourcesAdmin" },
    ),
  });
}

/**
 * Write operations on a site's payer sources (admin/office only — the
 * authorization gate lives in the UI, mirroring the rest of the app).
 * Every mutation invalidates both the picker and admin caches and posts
 * the cross-tab refresh. Pure decisions (key derivation, sort_order,
 * reorder) come from @/lib/settlement/payerSourceAdmin so they stay unit
 * tested; this hook is the thin Supabase wiring around them.
 */
export function usePayerSourceMutations(siteId: string | undefined) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["payer-sources"] });
    queryClient.invalidateQueries({ queryKey: ["payer-sources-admin"] });
    broadcastPayerSourcesChanged();
  };

  async function addCustomSource(args: {
    label: string;
    requiresName?: boolean;
    existingRows: PayerSourceRow[];
  }): Promise<PayerSourceRow> {
    if (!siteId) throw new Error("siteId is required to add a source");
    const payload = buildCustomSourceRow({
      siteId,
      label: args.label,
      requiresName: args.requiresName,
      existingRows: args.existingRows,
    });
    const { data, error } = await (supabase as any)
      .from("payer_sources")
      .insert(payload)
      .select()
      .single();
    if (error) throw error as Error;
    invalidate();
    return data as PayerSourceRow;
  }

  async function updateSource(
    id: string,
    patch: { label?: string; requires_name?: boolean },
  ): Promise<void> {
    const { error } = await (supabase as any)
      .from("payer_sources")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error as Error;
    invalidate();
  }

  async function setHidden(id: string, hidden: boolean): Promise<void> {
    const { error } = await (supabase as any)
      .from("payer_sources")
      .update({ is_hidden: hidden, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error as Error;
    invalidate();
  }

  async function moveSource(
    rows: PayerSourceRow[],
    id: string,
    direction: "up" | "down",
  ): Promise<void> {
    const updates = reorderVisible(rows, id, direction);
    if (!updates || updates.length === 0) return;
    const stamp = new Date().toISOString();
    for (const u of updates) {
      const { error } = await (supabase as any)
        .from("payer_sources")
        .update({ sort_order: u.sort_order, updated_at: stamp })
        .eq("id", u.id);
      if (error) throw error as Error;
    }
    invalidate();
  }

  async function deleteSource(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("payer_sources")
      .delete()
      .eq("id", id);
    if (error) throw error as Error;
    invalidate();
  }

  return { addCustomSource, updateSource, setHidden, moveSource, deleteSource };
}
