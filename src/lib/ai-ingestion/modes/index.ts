/**
 * Mode registry for AI ingestion. Returned as a fresh registry per call so
 * mode configs can close over runtime dependencies like the React Query
 * client (used for cache invalidation after commit).
 */

import type { QueryClient } from "@tanstack/react-query";

import type { AnyModeConfig, IngestionMode } from "@/lib/ai-ingestion/types";
import { createPurchaseMode } from "./purchase";

export type ModeRegistry = Partial<Record<IngestionMode, AnyModeConfig>>;

export function buildModeRegistry(queryClient: QueryClient): ModeRegistry {
  return {
    purchase: createPurchaseMode(queryClient) as AnyModeConfig,
    // quotation: createQuotationMode(queryClient) as AnyModeConfig,   // Phase D
    // warranty:  createWarrantyMode(queryClient)  as AnyModeConfig,   // Phase E
  };
}
