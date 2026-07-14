/**
 * Weekly Payout Console service — thin wrappers over the fan-out RPCs
 * (pay_laborer_weekly_payout / reverse_laborer_payout, migration 20260714100300).
 *
 * All money math is server-side (both RPCs clamp); this layer only builds the
 * deterministic idempotency key so a re-submit (proxy stall, double tap, two
 * tabs) replays the SAME batch instead of paying twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureFreshSession } from "@/lib/auth/sessionManager";
import { deterministicSettlementKey } from "@/lib/settlement/deterministicKey";
import { bucketsHash } from "@/lib/payouts/allocation";
import type {
  PayLaborerPayoutConfig,
  PayLaborerPayoutResult,
} from "@/types/payout.types";

export async function payLaborerWeeklyPayout(
  supabase: SupabaseClient,
  config: PayLaborerPayoutConfig
): Promise<PayLaborerPayoutResult> {
  await ensureFreshSession();

  const total = config.buckets.reduce((s, b) => s + b.amount, 0);
  const idempotencyKey = await deterministicSettlementKey({
    siteId: config.laborerId, // hash input — the payout is laborer-scoped, not site-scoped
    recordIds: config.buckets.map(
      (b) => `${b.siteId}|${b.kind}|${b.contractRefKind ?? ""}|${b.contractRefId ?? ""}`
    ),
    amount: total,
    paymentChannel: "direct",
    date: config.paymentDate,
    extra: `weekly-payout:${config.weekStart}:${bucketsHash(
      config.buckets.map((b) => ({
        key: `${b.siteId}|${b.kind}|${b.contractRefKind ?? ""}|${b.contractRefId ?? ""}`,
        amount: b.amount,
      }))
    )}`,
  });

  const { data, error } = await (supabase as any).rpc("pay_laborer_weekly_payout", {
    p_laborer_id: config.laborerId,
    p_week_start: config.weekStart,
    p_week_end: config.weekEnd,
    p_payment_date: config.paymentDate,
    p_payment_mode: config.paymentMode,
    p_notes: config.notes ?? null,
    p_proof_urls: config.proofUrls?.length ? config.proofUrls : null,
    p_buckets: config.buckets.map((b) => ({
      site_id: b.siteId,
      kind: b.kind,
      contract_ref_kind: b.contractRefKind ?? null,
      contract_ref_id: b.contractRefId ?? null,
      amount: b.amount,
      payer_source: b.payerSource,
      payer_name: b.payerName ?? null,
    })),
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;
  return data as PayLaborerPayoutResult;
}

export async function reverseLaborerPayout(
  supabase: SupabaseClient,
  batchId: string,
  reason?: string
): Promise<{ batch_id: string; already_reversed: boolean; reversed_groups: number }> {
  await ensureFreshSession();
  const { data, error } = await (supabase as any).rpc("reverse_laborer_payout", {
    p_batch_id: batchId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data;
}
