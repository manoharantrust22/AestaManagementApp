/**
 * Weight Prediction Hook
 * Provides smart weight prediction for TMT bars based on historical purchase data
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type {
  WeightPredictionStats,
  PredictedWeight,
  WeightConfidenceLevel,
} from "@/types/material.types";
import { cacheKeys } from "@/lib/cache/keys";

/**
 * Fetch weight prediction statistics for a vendor/material/brand combination
 */
export function useWeightPrediction(
  vendorId: string | undefined,
  materialId: string | undefined,
  brandId: string | undefined | null
) {
  const supabase = createClient();

  return useQuery({
    queryKey: cacheKeys.weightPrediction(vendorId, materialId, brandId),
    queryFn: wrapQueryFn(async (): Promise<WeightPredictionStats | null> => {
      if (!vendorId || !materialId) return null;

      // Query the aggregated view for prediction stats
      // Note: Using 'as any' because v_weight_prediction_stats view is created by migration
      let query = (supabase as any)
        .from("v_weight_prediction_stats")
        .select("*")
        .eq("vendor_id", vendorId)
        .eq("material_id", materialId);

      // Handle brand_id - if null, look for null in DB; if defined, look for that value
      if (brandId === null || brandId === undefined) {
        query = query.is("brand_id", null);
      } else {
        query = query.eq("brand_id", brandId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("Error fetching weight prediction stats:", error);
        return null;
      }

      if (!data) return null;

      return {
        vendorId: data.vendor_id,
        materialId: data.material_id,
        brandId: data.brand_id,
        avgWeightPerPiece: Number(data.avg_weight_per_piece),
        sampleCount: Number(data.sample_count),
        totalPiecesSampled: Number(data.total_pieces_sampled),
        weightStddev: data.weight_stddev ? Number(data.weight_stddev) : null,
        minWeight: Number(data.min_weight),
        maxWeight: Number(data.max_weight),
        avgDeviationPercent: data.avg_deviation_percent
          ? Number(data.avg_deviation_percent)
          : null,
        lastRecordedDate: data.last_recorded_date,
      };
    }, { operationName: "useWeightPrediction" }),
    enabled: !!vendorId && !!materialId,
    staleTime: 5 * 60 * 1000, // 5 minutes - weight history doesn't change frequently
  });
}

/**
 * Calculate predicted weight for a given quantity
 * Uses historical data if available, falls back to standard weight
 */
export function calculatePredictedWeight(
  quantity: number,
  predictionStats: WeightPredictionStats | null | undefined,
  standardPieceWeight: number | null | undefined
): PredictedWeight {
  // Priority 1: Use historical data if available with sufficient samples
  if (predictionStats && predictionStats.sampleCount >= 1) {
    const totalWeight = quantity * predictionStats.avgWeightPerPiece;

    // Determine confidence based on sample count and variance
    let confidenceLevel: WeightConfidenceLevel = "low";
    if (predictionStats.sampleCount >= 5) {
      // High confidence: 5+ samples with low variance (stddev < 5% of avg)
      const stddevPercent = predictionStats.weightStddev
        ? (predictionStats.weightStddev / predictionStats.avgWeightPerPiece) *
          100
        : 0;
      confidenceLevel = stddevPercent < 5 ? "high" : "medium";
    } else if (predictionStats.sampleCount >= 3) {
      confidenceLevel = "medium";
    }

    return {
      source: "historical",
      weightPerPiece: predictionStats.avgWeightPerPiece,
      totalWeight,
      confidenceLevel,
      sampleCount: predictionStats.sampleCount,
      deviationFromStandard: predictionStats.avgDeviationPercent,
      displayText: `~${totalWeight.toFixed(1)} kg (based on ${predictionStats.sampleCount} purchase${predictionStats.sampleCount > 1 ? "s" : ""})`,
    };
  }

  // Priority 2: Fall back to standard weight
  if (standardPieceWeight && standardPieceWeight > 0) {
    const totalWeight = quantity * standardPieceWeight;
    return {
      source: "standard",
      weightPerPiece: standardPieceWeight,
      totalWeight,
      confidenceLevel: "none",
      sampleCount: 0,
      deviationFromStandard: null,
      displayText: `~${totalWeight.toFixed(1)} kg (standard weight)`,
    };
  }

  // No prediction possible
  return {
    source: "standard",
    weightPerPiece: 0,
    totalWeight: 0,
    confidenceLevel: "none",
    sampleCount: 0,
    deviationFromStandard: null,
    displayText: "Weight unknown",
  };
}

/**
 * Fetch weight history records for a specific vendor/material/brand
 * Useful for displaying detailed history to users
 */
export function useWeightHistory(
  vendorId: string | undefined,
  materialId: string | undefined,
  brandId: string | undefined | null,
  limit: number = 10
) {
  const supabase = createClient();

  return useQuery({
    queryKey: [...cacheKeys.weightPrediction(vendorId, materialId, brandId), "history", limit],
    queryFn: wrapQueryFn(async () => {
      if (!vendorId || !materialId) return [];

      // Note: Using 'as any' because tmt_weight_history table is created by migration
      let query = (supabase as any)
        .from("tmt_weight_history")
        .select(`
          *,
          source_po:purchase_orders!source_po_id(po_number, order_date)
        `)
        .eq("vendor_id", vendorId)
        .eq("material_id", materialId)
        .order("recorded_date", { ascending: false })
        .limit(limit);

      if (brandId === null || brandId === undefined) {
        query = query.is("brand_id", null);
      } else {
        query = query.eq("brand_id", brandId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching weight history:", error);
        return [];
      }

      return data || [];
    }, { operationName: "useWeightHistory" }),
    enabled: !!vendorId && !!materialId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get weight prediction for multiple items at once (batch query)
 * Useful when loading a PO with multiple TMT items
 */
export function useWeightPredictionBatch(
  items: Array<{
    vendorId: string;
    materialId: string;
    brandId: string | null;
  }>
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["weight-prediction", "batch", items.map(i => `${i.vendorId}-${i.materialId}-${i.brandId}`).join(",")],
    queryFn: wrapQueryFn(async (): Promise<Map<string, WeightPredictionStats>> => {
      const results = new Map<string, WeightPredictionStats>();

      if (items.length === 0) return results;

      // Fetch all predictions in one query using OR conditions
      // Note: Using 'as any' because v_weight_prediction_stats view is created by migration
      const { data, error } = await (supabase as any)
        .from("v_weight_prediction_stats")
        .select("*");

      if (error) {
        console.error("Error fetching batch weight predictions:", error);
        return results;
      }

      // Build lookup map
      for (const row of data || []) {
        const key = `${row.vendor_id}-${row.material_id}-${row.brand_id || "null"}`;
        results.set(key, {
          vendorId: row.vendor_id,
          materialId: row.material_id,
          brandId: row.brand_id,
          avgWeightPerPiece: Number(row.avg_weight_per_piece),
          sampleCount: Number(row.sample_count),
          totalPiecesSampled: Number(row.total_pieces_sampled),
          weightStddev: row.weight_stddev ? Number(row.weight_stddev) : null,
          minWeight: Number(row.min_weight),
          maxWeight: Number(row.max_weight),
          avgDeviationPercent: row.avg_deviation_percent
            ? Number(row.avg_deviation_percent)
            : null,
          lastRecordedDate: row.last_recorded_date,
        });
      }

      return results;
    }, { operationName: "useWeightPredictionBatch" }),
    enabled: items.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Helper to get prediction from batch results
 */
export function getPredictionFromBatch(
  batchResults: Map<string, WeightPredictionStats> | undefined,
  vendorId: string,
  materialId: string,
  brandId: string | null
): WeightPredictionStats | null {
  if (!batchResults) return null;
  const key = `${vendorId}-${materialId}-${brandId || "null"}`;
  return batchResults.get(key) || null;
}
