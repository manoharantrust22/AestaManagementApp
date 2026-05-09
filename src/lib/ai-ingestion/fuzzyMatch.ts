/**
 * Fuzzy match wrapper for AI ingest preview.
 *
 * Server-first via two Postgres trigram RPCs (`match_material_by_name`,
 * `match_vendor_by_name`) added in migration 20260509100100. Client-side
 * Levenshtein fallback handles the dev-server case where the migration
 * hasn't been applied yet — best-effort only.
 *
 * Score buckets (consumed by the preview table):
 *   matched   — top hit's score >= 0.7 → auto-pick
 *   ambiguous — top hit between 0.5 and 0.7 → user picks from a dropdown
 *   new       — no candidates >= 0.5 → pre-fill a create-form draft
 */

import { createClient } from "@/lib/supabase/client";

export const MATCH_THRESHOLD_AUTO = 0.7;
export const MATCH_THRESHOLD_AMBIGUOUS = 0.5;

export type MaterialMatchCandidate = {
  id: string;
  name: string;
  local_name: string | null;
  category_id: string | null;
  unit: string;
  score: number;
};

export type VendorMatchCandidate = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  gst_number: string | null;
  score: number;
};

export type MatchResult<T> =
  | { status: "matched"; entity: T; score: number; candidates: T[] }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "new" };

function bucketCandidates<T extends { score: number }>(candidates: T[]): MatchResult<T> {
  if (candidates.length === 0) return { status: "new" };
  const top = candidates[0];
  if (top.score >= MATCH_THRESHOLD_AUTO) {
    return { status: "matched", entity: top, score: top.score, candidates };
  }
  if (top.score >= MATCH_THRESHOLD_AMBIGUOUS) {
    return { status: "ambiguous", candidates };
  }
  return { status: "new" };
}

/**
 * Match a material name against the catalog. Optionally constrain to a category.
 */
export async function matchMaterial(
  query: string,
  options: { categoryId?: string | null; limit?: number } = {},
): Promise<MatchResult<MaterialMatchCandidate>> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "new" };

  const supabase = createClient();
  const { data, error } = await (supabase as any).rpc("match_material_by_name", {
    p_query: trimmed,
    p_category_id: options.categoryId ?? null,
    p_threshold: 0.3,
    p_limit: options.limit ?? 5,
  });

  if (error) {
    // RPC missing (e.g. migration not yet applied locally) → caller falls back.
    throw new FuzzyMatchRpcError(error.message ?? "match_material_by_name failed");
  }

  const candidates = (data ?? []) as MaterialMatchCandidate[];
  return bucketCandidates(candidates);
}

/**
 * Match a vendor name against the catalog.
 */
export async function matchVendor(
  query: string,
  options: { limit?: number } = {},
): Promise<MatchResult<VendorMatchCandidate>> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "new" };

  const supabase = createClient();
  const { data, error } = await (supabase as any).rpc("match_vendor_by_name", {
    p_query: trimmed,
    p_threshold: 0.3,
    p_limit: options.limit ?? 5,
  });

  if (error) {
    throw new FuzzyMatchRpcError(error.message ?? "match_vendor_by_name failed");
  }

  const candidates = (data ?? []) as VendorMatchCandidate[];
  return bucketCandidates(candidates);
}

export class FuzzyMatchRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FuzzyMatchRpcError";
  }
}

// ============================================================================
// Client-side fallback (Levenshtein-based) — used only when the RPC is missing.
// ============================================================================

/**
 * Normalised similarity = 1 - levenshtein(a, b) / max(len(a), len(b)).
 * Case-insensitive. Returns 0 for empty inputs.
 */
export function clientSimilarity(a: string, b: string): number {
  const A = a.trim().toLowerCase();
  const B = b.trim().toLowerCase();
  if (!A || !B) return 0;
  if (A === B) return 1;
  const distance = levenshtein(A, B);
  const longest = Math.max(A.length, B.length);
  return 1 - distance / longest;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Client-side ranking against a pre-fetched list. Use as fallback when the
 * RPC is unavailable. Returns top-N candidates above the auto threshold.
 */
export function rankClientSide<T extends { id: string; name: string }>(
  query: string,
  rows: readonly T[],
  options: { limit?: number; minScore?: number } = {},
): Array<T & { score: number }> {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.3;
  const ranked = rows
    .map((row) => ({ ...row, score: clientSimilarity(query, row.name) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked;
}
