import { useMemo } from "react";
import { useSiteTrades } from "./useTrades";

/**
 * Resolve the company's "Civil" labor_categories.id for a given site.
 *
 * Holidays treat Civil as a real workspace scope (a holiday tagged with the Civil
 * category id belongs to Civil only; trade_category_id NULL means "all workspaces").
 * Returns null while the trades query loads, or if no "Civil" category exists for the
 * company — in which case callers fall back to a null scope (legacy behaviour: only
 * NULL/"all" holidays show). Backed by the already-cached useSiteTrades query.
 */
export function useCivilCategoryId(siteId: string | undefined): string | null {
  const { data: trades } = useSiteTrades(siteId);
  return useMemo(
    () => trades?.find((t) => t.category.name === "Civil")?.category.id ?? null,
    [trades]
  );
}
