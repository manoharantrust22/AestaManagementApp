"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";

/** Result of preview_trade_contract_payments_migration — what a turn-ON will move. */
export interface TradeMigrationPreview {
  contractCount: number;
  paymentCount: number;
  totalAmount: number;
  /** Non-null when a detailed contract-with-payments has no laborer to attribute to. */
  blockerReason: string | null;
}

/**
 * Toggle a trade's workspace at a site, WITH the contract-payment migration.
 *
 * Turning ON routes attendance-tracked ('detailed') contracts' money to Salary
 * Settlements: it migrates any contract-page payments into settlement_groups first
 * (reversibly), then flips has_workspace=true. Turning OFF reverses those migrated
 * payments (undo) then flips has_workspace=false, restoring direct contract-page entry.
 *
 * The caller (SiteTradeWorkspacesManager, the trades-page shortcut) shows a preview /
 * confirmation and handles the OFF-lock (genuine attendance can't be switched off).
 */
export function useToggleTradeWorkspace(siteId: string | undefined) {
  const supabase: any = createClient();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    if (!siteId) return;
    queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] });
    queryClient.invalidateQueries({ queryKey: ["site-trade-settings", siteId] });
    queryClient.invalidateQueries({ queryKey: ["site-trade-workspace-usage", siteId] });
    queryClient.invalidateQueries({ queryKey: ["site-trade-migration-usage", siteId] });
    queryClient.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] });
    queryClient.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] });
    queryClient.invalidateQueries({ queryKey: ["settlements-list", siteId] });
    // Per-contract money keys (unknown ids) — refetch the merged ledger + fixed payments.
    queryClient.invalidateQueries({ queryKey: ["contract-payments"] });
    queryClient.invalidateQueries({ queryKey: ["subcontract-payments"] });
  }, [queryClient, siteId]);

  const preview = useCallback(
    async (tradeCategoryId: string): Promise<TradeMigrationPreview> => {
      const { data, error } = await supabase.rpc("preview_trade_contract_payments_migration", {
        p_site_id: siteId,
        p_trade_category_id: tradeCategoryId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        contractCount: Number(row?.contract_count ?? 0),
        paymentCount: Number(row?.payment_count ?? 0),
        totalAmount: Number(row?.total_amount ?? 0),
        blockerReason: row?.blocker_reason ?? null,
      };
    },
    [supabase, siteId]
  );

  /** Migrate detailed contract payments → workspace, then set has_workspace=true. */
  const turnOn = useCallback(
    async (tradeCategoryId: string): Promise<string | null> => {
      if (!siteId) throw new Error("No site selected");
      await ensureFreshSession();
      const { data: batchId, error: migErr } = await supabase.rpc(
        "migrate_trade_contract_payments_to_workspace",
        { p_site_id: siteId, p_trade_category_id: tradeCategoryId }
      );
      if (migErr) throw migErr;
      const { error: upErr } = await supabase
        .from("site_trade_settings")
        .upsert(
          { site_id: siteId, trade_category_id: tradeCategoryId, has_workspace: true, updated_at: new Date().toISOString() },
          { onConflict: "site_id,trade_category_id" }
        );
      if (upErr) throw upErr;
      invalidate();
      return (batchId as string) ?? null;
    },
    [supabase, siteId, invalidate]
  );

  /** Reverse migrated payments, then set has_workspace=false (restores contract-page entry). */
  const turnOff = useCallback(
    async (tradeCategoryId: string): Promise<void> => {
      if (!siteId) throw new Error("No site selected");
      await ensureFreshSession();
      const { error: undoErr } = await supabase.rpc("undo_trade_contract_payments_migration", {
        p_site_id: siteId,
        p_trade_category_id: tradeCategoryId,
      });
      if (undoErr) throw undoErr;
      const { error: upErr } = await supabase
        .from("site_trade_settings")
        .upsert(
          { site_id: siteId, trade_category_id: tradeCategoryId, has_workspace: false, updated_at: new Date().toISOString() },
          { onConflict: "site_id,trade_category_id" }
        );
      if (upErr) throw upErr;
      invalidate();
    },
    [supabase, siteId, invalidate]
  );

  /** Undo a single migration batch (immediate Undo snackbar after a turn-ON). */
  const undoBatch = useCallback(
    async (batchId: string): Promise<void> => {
      await ensureFreshSession();
      const { error } = await supabase.rpc("undo_contract_payments_migration", { p_batch_id: batchId });
      if (error) throw error;
      invalidate();
    },
    [supabase, invalidate]
  );

  return { preview, turnOn, turnOff, undoBatch };
}
