/**
 * Multi-bill batch mode — a thin orchestrator over the single-bill `purchase`
 * mode. It reuses that mode's matching (`resolvePreview`) and commit logic per
 * bill, so the batch path never diverges from single-bill behavior (the
 * per-bill date card, inline editing, price history, vendor upsert, product
 * photos all work unchanged). Bills commit independently — the good ones save
 * even if one fails ("save the good ones", no all-or-nothing).
 */

import type { QueryClient } from "@tanstack/react-query";

import {
  aiPurchaseBatchOutputSchema,
  type AiPurchaseBatchOutput,
  type AiPurchaseOutput,
} from "@/lib/ai-ingestion/schemas";
import type {
  BatchBill,
  BatchCommitItem,
  BatchResolvedPreview,
  ModeConfig,
  ResolvedPreview,
} from "@/lib/ai-ingestion/types";
import type { PurchaseCommitResult } from "@/lib/services/aiIngestionService";

import { createPurchaseMode } from "./purchase";
import { buildPurchaseBatchPrompt } from "./purchase.batch.prompt";

export interface BatchCommitResult {
  total: number;
  savedCount: number;
  failedCount: number;
  failures: Array<{ index: number; label: string; error: string }>;
  results: PurchaseCommitResult[];
}

export function createPurchaseBatchMode(
  queryClient: QueryClient,
): ModeConfig<AiPurchaseBatchOutput, BatchCommitResult, BatchResolvedPreview> {
  const single = createPurchaseMode(queryClient);

  return {
    mode: "purchase_batch",
    label: "Purchase Bills (batch)",
    description:
      "Several bills at once — each recorded as its own purchase, expense, and price history. The good ones save even if one fails.",
    buildPrompt: buildPurchaseBatchPrompt,
    schema: aiPurchaseBatchOutputSchema,

    async resolvePreview(parsed, ctx): Promise<BatchResolvedPreview> {
      const bills: BatchBill[] = [];
      // Sequential (not Promise.all) to keep catalog-fetch load gentle and
      // preserve order; resolvePreview is cache-aware so this is fast.
      for (let i = 0; i < parsed.purchases.length; i++) {
        const purchase = parsed.purchases[i] as AiPurchaseOutput;
        const preview = await single.resolvePreview(purchase, ctx);
        bills.push({ id: i, preview, billUrl: ctx.billUrls[i] ?? null });
      }
      return { bills };
    },

    async commit({ parsed, preview, ctx, onPhaseChange }): Promise<BatchCommitResult> {
      const items: BatchCommitItem[] = preview.bills.map((bill, i) => ({
        label: billLabel(parsed.purchases[i] as AiPurchaseOutput, bill.preview),
        status: "pending",
      }));
      const results: PurchaseCommitResult[] = [];
      const failures: Array<{ index: number; label: string; error: string }> = [];

      const emit = (phase: "rpc" | "complete", message: string) =>
        onPhaseChange({ phase, message, items: items.map((it) => ({ ...it })) });

      for (let i = 0; i < preview.bills.length; i++) {
        items[i] = { ...items[i], status: "saving" };
        emit("rpc", `Saving bill ${i + 1} of ${preview.bills.length}…`);
        try {
          const bill = preview.bills[i];
          const perBillCtx = { ...ctx, billUrls: bill.billUrl ? [bill.billUrl] : [] };
          const result = await single.commit({
            parsed: parsed.purchases[i] as AiPurchaseOutput,
            preview: bill.preview,
            ctx: perBillCtx,
            // Per-bill RPC phases are swallowed — the batch reports its own progress.
            onPhaseChange: () => {},
          });
          results.push(result);
          items[i] = { ...items[i], status: "done" };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          items[i] = { ...items[i], status: "failed", error };
          failures.push({ index: i, label: items[i].label, error });
        }
      }

      emit("complete", `${results.length} of ${preview.bills.length} saved`);

      return {
        total: preview.bills.length,
        savedCount: results.length,
        failedCount: failures.length,
        failures,
        results,
      };
    },

    summary(parsed) {
      const n = parsed.purchases.length;
      const total = parsed.purchases.reduce(
        (sum, p) => sum + (typeof p.total_amount === "number" ? p.total_amount : 0),
        0,
      );
      return `${n} bill${n === 1 ? "" : "s"} · ₹${formatNumber(total)} total`;
    },
  };
}

function billLabel(parsed: AiPurchaseOutput, preview: ResolvedPreview): string {
  const vendor = parsed.vendor?.name || preview.vendorRawName || "Bill";
  const date = preview.effectiveDate ?? parsed.purchase_date ?? null;
  return date ? `${vendor} · ${date}` : vendor;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
