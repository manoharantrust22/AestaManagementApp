/**
 * Purchase mode — extracts a bill into a `material_purchase_expenses` row +
 * line items + price history + vendor_inventory upsert via the
 * `ingest_purchase_atomic` RPC.
 */

import type { QueryClient } from "@tanstack/react-query";

import {
  aiPurchaseOutputSchema,
  splitCategoryHint,
  type AiPurchaseOutput,
} from "@/lib/ai-ingestion/schemas";
import {
  matchMaterialClientSide,
  matchVendorClientSide,
} from "@/lib/ai-ingestion/fuzzyMatch";
import {
  commitPurchase,
  type PurchaseCommitResult,
} from "@/lib/services/aiIngestionService";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import { createClient } from "@/lib/supabase/client";
import type {
  ModeConfig,
  ResolvedPreview,
  ResolvedPreviewRow,
  RowPriceContext,
  VendorSummary,
} from "@/lib/ai-ingestion/types";

// Dedicated lightweight fetchers for AI fuzzy-matching.
// Uses only the fields fuzzyMatch needs — no JOINs — so Supabase executes a
// simple index scan and the Cloudflare Worker edge-caches the response (60s TTL).
export const AI_CATALOG_QUERY_KEYS = {
  vendors: ["vendors", "ai-catalog"] as const,
  materials: ["materials", "ai-catalog"] as const,
};
const CATALOG_STALE_TIME_MS = 30 * 60 * 1000;

export async function fetchVendorsForMatch() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name, city, phone, gst_number")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`Vendor catalog fetch failed: ${error.message}`);
  return data ?? [];
}

export async function fetchMaterialsForMatch() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("id, name, local_name, category_id, unit")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`Material catalog fetch failed: ${error.message}`);
  return data ?? [];
}

import { buildPurchasePrompt } from "./purchase.prompt";

export function createPurchaseMode(
  queryClient: QueryClient,
): ModeConfig<AiPurchaseOutput, PurchaseCommitResult> {
  return {
    mode: "purchase",
    label: "Purchase Bill",
    description:
      "An actual buy from a vendor. Records the expense, line items, price history, and refreshes vendor pricing.",
    buildPrompt: buildPurchasePrompt,
    schema: aiPurchaseOutputSchema,

    async resolvePreview(parsed): Promise<ResolvedPreview> {
      // fetchQuery is cache-aware: returns immediately if the prefetch (fired
      // at dialog-open time) has already completed, or joins the in-flight
      // request if it's still running. Uses JOIN-free selects so Supabase
      // executes a fast index scan and the Cloudflare Worker can edge-cache.
      const [allVendors, allMaterials] = await withTimeout(
        Promise.all([
          queryClient.fetchQuery({
            queryKey: AI_CATALOG_QUERY_KEYS.vendors,
            queryFn: fetchVendorsForMatch,
            staleTime: CATALOG_STALE_TIME_MS,
          }),
          queryClient.fetchQuery({
            queryKey: AI_CATALOG_QUERY_KEYS.materials,
            queryFn: fetchMaterialsForMatch,
            staleTime: CATALOG_STALE_TIME_MS,
          }),
        ]),
        TIMEOUTS.QUERY,
        "Catalog fetch timed out. Please close and reopen the dialog to retry.",
      );

      const supabase = createClient();

      const vendorMatch = matchVendorClientSide(
        parsed.vendor.name,
        allVendors as Parameters<typeof matchVendorClientSide>[1],
      );
      const matchedVendorId =
        vendorMatch.status === "matched" ? vendorMatch.entity.id : null;

      // First pass: build rows + collect matched material ids (for price-context lookup)
      const matchedMaterialIds: string[] = [];
      const baseRows = parsed.items.map((item, index) => {
        const match = matchMaterialClientSide(
          item.name,
          allMaterials as Parameters<typeof matchMaterialClientSide>[1],
        );
        if (match.status === "matched") matchedMaterialIds.push(match.entity.id);
        return { item, index, match };
      });

      // Price intelligence (best-effort — failures degrade to null priceContext rather than blocking the preview)
      // Existing-image lookup: for matched rows, fetch the catalog's current
      // image_url so PreviewTable can warn before overwriting on commit.
      const [priceCtxRes, vendorSummaryRes, existingImagesRes] = await Promise.all([
        matchedMaterialIds.length > 0
          ? (supabase as any).rpc("get_purchase_price_context", {
              p_material_ids: matchedMaterialIds,
              p_vendor_id: matchedVendorId,
            })
          : Promise.resolve({ data: [], error: null }),
        matchedVendorId
          ? (supabase as any).rpc("get_vendor_recent_summary", {
              p_vendor_id: matchedVendorId,
              p_days: 30,
            })
          : Promise.resolve({ data: null, error: null }),
        matchedMaterialIds.length > 0
          ? supabase
              .from("materials")
              .select("id, image_url")
              .in("id", matchedMaterialIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const existingImageByMaterialId = new Map<string, string | null>();
      if (!existingImagesRes.error && Array.isArray(existingImagesRes.data)) {
        for (const row of existingImagesRes.data as Array<{ id: string; image_url: string | null }>) {
          existingImageByMaterialId.set(row.id, row.image_url);
        }
      }

      const priceCtxByMaterialId = new Map<string, RowPriceContext>();
      if (!priceCtxRes.error && Array.isArray(priceCtxRes.data)) {
        const today = new Date();
        for (const row of priceCtxRes.data as Array<{
          material_id: string;
          last_same_vendor_price: number | null;
          last_same_vendor_date: string | null;
          last_any_vendor_price: number | null;
          last_any_vendor_id: string | null;
          last_any_vendor_name: string | null;
          last_any_vendor_date: string | null;
        }>) {
          const lastSame =
            row.last_same_vendor_price != null && row.last_same_vendor_date
              ? {
                  price: Number(row.last_same_vendor_price),
                  date: row.last_same_vendor_date,
                  daysAgo: daysBetween(row.last_same_vendor_date, today),
                }
              : null;
          const lastAny =
            row.last_any_vendor_price != null && row.last_any_vendor_date
              ? {
                  price: Number(row.last_any_vendor_price),
                  vendorId: row.last_any_vendor_id ?? "",
                  vendorName: row.last_any_vendor_name ?? "Unknown vendor",
                  date: row.last_any_vendor_date,
                }
              : null;
          priceCtxByMaterialId.set(row.material_id, {
            lastFromSameVendor: lastSame,
            lastFromAnyVendor: lastAny,
            deltaPctVsSameVendor: null, // filled per-row using current bill price
          });
        }
      } else if (priceCtxRes.error) {
        console.warn("[ai-ingest] price context lookup failed:", priceCtxRes.error);
      }

      const rows: ResolvedPreviewRow[] = baseRows.map(({ item, index, match }) => {
        const warnings: string[] = [];

        // Sanity warning: catalog unit vs bill unit mismatch
        if (match.status === "matched" && match.entity.unit && match.entity.unit !== item.unit) {
          warnings.push(`catalog says ${match.entity.unit}, bill says ${item.unit}`);
        }

        const total =
          typeof item.unit_price === "number" && typeof item.quantity === "number"
            ? item.quantity * item.unit_price
            : null;

        // Compute per-row price context with delta vs same vendor
        let priceContext: RowPriceContext | null = null;
        if (match.status === "matched") {
          const ctx = priceCtxByMaterialId.get(match.entity.id);
          if (ctx) {
            const deltaPct =
              ctx.lastFromSameVendor && typeof item.unit_price === "number"
                ? ((item.unit_price - ctx.lastFromSameVendor.price) /
                    ctx.lastFromSameVendor.price) *
                  100
                : null;
            priceContext = { ...ctx, deltaPctVsSameVendor: deltaPct };
          }
        }

        const existingImageUrl =
          match.status === "matched"
            ? existingImageByMaterialId.get(match.entity.id) ?? null
            : null;

        return {
          index,
          rawName: item.name,
          rawLocalName: item.local_name ?? null,
          rawCategoryHint: item.category_hint ?? null,
          rawBrand: item.brand ?? null,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unit_price,
          totalPrice: total,
          hsnCode: item.hsn_code ?? null,
          gstRate: item.gst_rate ?? null,
          notes: null,
          materialMatch:
            match.status === "matched"
              ? { kind: "matched", entity: match.entity, score: match.score, candidates: match.candidates }
              : match.status === "ambiguous"
                ? { kind: "ambiguous", candidates: match.candidates, chosenId: null }
                : { kind: "new", suggestedName: item.name },
          overrideMaterialId: null,
          overrideMaterialName: null,
          warnings,
          priceContext,
          productPhotoUrl: null,
          existingImageUrl,
        };
      });

      // Build vendor summary (best-effort)
      let vendorSummary: VendorSummary | null = null;
      if (
        vendorMatch.status === "matched" &&
        !vendorSummaryRes.error &&
        Array.isArray(vendorSummaryRes.data) &&
        vendorSummaryRes.data.length > 0
      ) {
        const s = vendorSummaryRes.data[0] as {
          bill_count: number;
          total_amount: number;
          avg_amount: number;
        };
        if (Number(s.bill_count) > 0) {
          vendorSummary = {
            vendorId: vendorMatch.entity.id,
            vendorName: vendorMatch.entity.name,
            last30Days: {
              billCount: Number(s.bill_count),
              totalAmount: Number(s.total_amount),
              avgAmount: Number(s.avg_amount),
            },
            thisBill: { totalAmount: Number(parsed.total_amount) },
          };
        }
      } else if (vendorSummaryRes.error) {
        console.warn("[ai-ingest] vendor summary lookup failed:", vendorSummaryRes.error);
      }

      return {
        vendorRawName: parsed.vendor.name,
        vendorMatch:
          vendorMatch.status === "matched"
            ? {
                kind: "matched",
                entity: vendorMatch.entity,
                score: vendorMatch.score,
                candidates: vendorMatch.candidates,
              }
            : vendorMatch.status === "ambiguous"
              ? { kind: "ambiguous", candidates: vendorMatch.candidates, chosenId: null }
              : { kind: "new", suggestedName: parsed.vendor.name },
        overrideVendorId: null,
        rows,
        vendorSummary,
      };
    },

    async commit({ parsed, preview, ctx, onPhaseChange }) {
      // Defensive: surface the date used so the user sees what was sent
      const _ = splitCategoryHint; // keep import alive (used by service)
      void _;
      const result = await commitPurchase({
        parsed,
        preview,
        ctx,
        queryClient,
        onPhaseChange,
      });

      // Post-commit: for any preview row with a uploaded product photo,
      // stamp it onto materials.image_url. Resolution order per row:
      //   matched / override-id rows → use that material_id directly.
      //   NEW rows → look up the most recently-created material whose name
      //   equals the chosen name (commitPurchase just created it via the
      //   resolve_material RPC; created_at within the last 60s).
      // Failures are logged but do NOT roll back the commit — the bill,
      // line items, and price history are already saved; the photo patch
      // is decorative.
      const rowsWithPhoto = preview.rows.filter((r) => r.productPhotoUrl);
      if (rowsWithPhoto.length > 0) {
        const supabase = createClient();
        for (const row of rowsWithPhoto) {
          try {
            let materialId: string | null = row.overrideMaterialId ?? null;
            if (!materialId && row.materialMatch.kind === "matched") {
              materialId = row.materialMatch.entity.id;
            }
            if (!materialId) {
              const lookupName = row.overrideMaterialName ?? row.rawName;
              const { data: lookup } = await supabase
                .from("materials")
                .select("id")
                .eq("name", lookupName)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              materialId = (lookup as { id?: string } | null)?.id ?? null;
            }
            if (!materialId) {
              console.warn(
                "[ai-ingest] photo patch skipped: could not resolve material_id for row",
                row.index,
              );
              continue;
            }
            const { error: imgErr } = await (supabase as any)
              .from("materials")
              .update({ image_url: row.productPhotoUrl })
              .eq("id", materialId);
            if (imgErr) {
              console.warn(
                "[ai-ingest] photo patch failed for material",
                materialId,
                imgErr.message,
              );
            }
          } catch (err) {
            console.warn("[ai-ingest] photo patch threw for row", row.index, err);
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["materials"] });
      }

      return result;
    },

    summary(parsed) {
      const items = parsed.items.length;
      return `${parsed.vendor.name} · ${items} item${items === 1 ? "" : "s"} · ₹${formatNumber(
        parsed.total_amount,
      )}`;
    },
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function daysBetween(isoDate: string, today: Date): number {
  const past = new Date(isoDate);
  const ms = today.getTime() - past.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}
