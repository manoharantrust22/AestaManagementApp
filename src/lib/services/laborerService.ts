/**
 * laborerService
 *
 * Thin client wrappers around the laborer rate cascade RPCs added in
 * 20260501100000_laborer_rate_cascade.sql. Used by the RateCascadeDialog
 * (Edit Laborer flow) to preview the impact of a rate change before
 * committing, and to apply it atomically across laborers, daily_attendance,
 * and settlement_groups in a single transaction.
 *
 * On successful commit we also broadcast on the existing
 * "subcontracts-changed" channel so payments / inspect-pane / mestri-settle
 * surfaces refresh without needing a manual reload.
 */

import { createClient } from "@/lib/supabase/client";

export interface LaborerRateCascadeResult {
  old_rate: number;
  new_rate: number;
  affected_attendance: number;
  overridden_skipped: number;
  affected_settlements: number;
  cancelled_skipped: number;
  total_delta: number;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalize(raw: any): LaborerRateCascadeResult {
  return {
    old_rate: toNumber(raw?.old_rate),
    new_rate: toNumber(raw?.new_rate),
    affected_attendance: toNumber(raw?.affected_attendance),
    overridden_skipped: toNumber(raw?.overridden_skipped),
    affected_settlements: toNumber(raw?.affected_settlements),
    cancelled_skipped: toNumber(raw?.cancelled_skipped),
    total_delta: toNumber(raw?.total_delta),
  };
}

export async function previewLaborerRateCascade(
  laborerId: string,
  newRate: number
): Promise<LaborerRateCascadeResult> {
  const supabase = createClient();
  const { data, error } = await (supabase as any).rpc(
    "preview_laborer_rate_cascade",
    { p_laborer_id: laborerId, p_new_rate: newRate }
  );
  if (error) throw error;
  return normalize(data);
}

export async function updateLaborerRateCascade(
  laborerId: string,
  newRate: number
): Promise<LaborerRateCascadeResult> {
  const supabase = createClient();
  const { data, error } = await (supabase as any).rpc(
    "update_laborer_rate_cascade",
    { p_laborer_id: laborerId, p_new_rate: newRate }
  );
  if (error) throw error;

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel("subcontracts-changed");
      bc.postMessage({ kind: "laborer-rate-cascaded", laborer_id: laborerId });
      bc.close();
    } catch {
      // best-effort
    }
  }

  return normalize(data);
}
