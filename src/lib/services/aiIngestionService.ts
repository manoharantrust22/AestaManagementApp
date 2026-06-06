/**
 * Glue between the AI ingestion dialog and the Postgres atomic-commit RPCs.
 *
 * The dialog hands a fully resolved payload here; this module converts it to
 * the JSONB shape the RPC expects, calls `ingest_purchase_atomic` (or one of
 * its siblings), and invalidates the React Query caches that observers rely
 * on. Bill upload happens in the dialog's ContextPicker step before commit,
 * so by the time we get here the URL is already in `ctx.billUrls[0]`.
 */

import { QueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { splitCategoryHint } from "@/lib/ai-ingestion/schemas";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { AiPurchaseOutput } from "@/lib/ai-ingestion/schemas";
import type {
  CommitState,
  IngestionContext,
  ResolvedPreview,
  ResolvedPreviewRow,
} from "@/lib/ai-ingestion/types";

export interface PurchaseCommitResult {
  /** Null when catalog-only ingest (recordAsSiteExpense=false). */
  purchase_id: string | null;
  /** Null when catalog-only ingest. */
  ref_code: string | null;
  vendor_id: string;
  /** Empty array for catalog-only ingest. */
  item_ids: string[];
  items_count: number;
  /** True when a material_purchase_expenses row was created. */
  expense_created: boolean;
}

interface CommitArgs {
  parsed: AiPurchaseOutput;
  preview: ResolvedPreview;
  ctx: IngestionContext;
  queryClient: QueryClient;
  onPhaseChange: (state: CommitState) => void;
}

/**
 * Build the JSONB payload `ingest_purchase_atomic` expects from the parsed
 * AI output and the user's preview overrides.
 */
function buildPurchasePayload(args: {
  parsed: AiPurchaseOutput;
  preview: ResolvedPreview;
  ctx: IngestionContext;
}): Record<string, unknown> {
  const { parsed, preview, ctx } = args;

  const vendorId = preview.overrideVendorId
    ? preview.overrideVendorId
    : preview.vendorMatch.kind === "matched"
      ? preview.vendorMatch.entity.id
      : null;

  const vendor = {
    id: vendorId,
    name: parsed.vendor.name,
    phone: parsed.vendor.phone ?? null,
    gst_number: parsed.vendor.gst_number ?? null,
    city: parsed.vendor.city ?? null,
  };

  const items = preview.rows.map((row, idx) => {
    const aiItem = parsed.items[row.index] ?? parsed.items[idx];
    const materialId = resolveMaterialId(row);
    const materialName = resolveMaterialName(row, aiItem.name);
    const { parent_name, child_name } = splitCategoryHint(row.rawCategoryHint ?? null);
    return {
      material_id: materialId,
      name: materialName,
      local_name: row.rawLocalName ?? null,
      category: materialId
        ? null
        : { id: null, parent_name, child_name },
      brand: row.rawBrand
        ? { id: null, name: row.rawBrand }
        : null,
      quantity: row.quantity,
      unit: row.unit,
      unit_price: row.unitPrice,
      hsn_code: row.hsnCode ?? null,
      gst_rate: row.gstRate ?? null,
      notes: row.notes ?? null,
    };
  });

  return {
    site_id: ctx.siteId,
    // The user can edit the date on the Preview step (preview.effectiveDate);
    // fall back to the AI's bill date, then the Context default.
    purchase_date: preview.effectiveDate ?? parsed.purchase_date ?? ctx.defaultDate,
    total_amount: parsed.total_amount,
    transport_cost: parsed.transport_cost ?? 0,
    invoice_no: parsed.invoice_no ?? null,
    bill_url: ctx.billUrls[0] ?? null,
    payment_mode: null,
    purchase_type: "own_site",
    source: "ai_ingest",
    notes: null,
    vendor,
    items,
  };
}

function resolveMaterialId(row: ResolvedPreviewRow): string | null {
  if (row.overrideMaterialId) return row.overrideMaterialId;
  if (row.overrideMaterialName) return null; // user explicitly chose NEW
  if (row.materialMatch.kind === "matched") return row.materialMatch.entity.id;
  return null;
}

function resolveMaterialName(row: ResolvedPreviewRow, aiName: string): string {
  if (row.overrideMaterialId) return aiName; // not used by RPC when material_id set
  if (row.overrideMaterialName) return row.overrideMaterialName;
  return aiName;
}

export async function commitPurchase(args: CommitArgs): Promise<PurchaseCommitResult> {
  const { ctx, queryClient, onPhaseChange } = args;
  const supabase = createClient();

  // The toggle defaults to OFF on the company flow → catalog-only ingest with
  // siteId null. The toggle is bypassed on the site flow → siteId is locked.
  // Throw only when the user explicitly enabled the toggle (recordAsSiteExpense
  // === true) but never picked a site — defense in depth behind the UI gate.
  if (!ctx.siteId && ctx.recordAsSiteExpense === true) {
    throw new Error("Site is required when 'Also record as site expense' is enabled.");
  }

  onPhaseChange({ phase: "rpc", message: "Saving to database…" });

  const payload = buildPurchasePayload(args);

  // The RPC fans out across ~5 tables in one transaction. Bound it with a
  // generous-but-finite timeout so a stalled Cloudflare-proxy upgrade
  // doesn't leave the dialog spinning indefinitely. On timeout the throw
  // bubbles to useAIIngestion.commit's catch which dispatches COMMIT_FAILED
  // and routes the dialog to the "error" step with a "Try again" CTA.
  const rpcResult = await withTimeout(
    (supabase as any)
      .rpc("ingest_purchase_atomic", { p_payload: payload })
      .then((r: { data: unknown; error: unknown }) => r),
    TIMEOUTS.DATABASE_OPERATION,
    `Save timed out after ${TIMEOUTS.DATABASE_OPERATION / 1000}s. The bill upload succeeded; safe to retry the save.`,
  ) as { data: unknown; error: { message?: string } | null };
  const { data, error } = rpcResult;

  if (error) {
    throw new Error(error.message ?? "ingest_purchase_atomic failed");
  }
  if (!data || typeof data !== "object") {
    throw new Error("RPC returned an unexpected response.");
  }

  onPhaseChange({ phase: "invalidating", message: "Refreshing catalog…" });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.materials.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.materialPurchases.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.vendorInventory.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.priceHistory.all }),
  ]);

  onPhaseChange({ phase: "complete", message: "Done" });

  return data as PurchaseCommitResult;
}
