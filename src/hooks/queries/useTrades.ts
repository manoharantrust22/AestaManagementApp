import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  ContractStatus,
  LaborTrackingMode,
  Trade,
  TradeCategory,
  TradeContract,
} from "@/types/trade.types";

/**
 * Pure grouping function — extracted so it's testable without Supabase.
 * Returns one Trade per visible category. A category is visible when
 * `isActive` is true OR it has at least one contract on this site.
 * In-house Civil is always placed first; the rest follow alphabetically.
 */
export function groupContractsByTrade(
  categories: TradeCategory[],
  contracts: TradeContract[]
): Trade[] {
  const byCategoryId = new Map<string, TradeContract[]>();
  for (const c of contracts) {
    if (!c.tradeCategoryId) continue; // legacy unmigrated
    const arr = byCategoryId.get(c.tradeCategoryId) ?? [];
    arr.push(c);
    byCategoryId.set(c.tradeCategoryId, arr);
  }

  const visible = categories
    .filter(
      (cat) => cat.isActive || (byCategoryId.get(cat.id)?.length ?? 0) > 0
    )
    .sort((a, b) => {
      if (a.name === "Civil") return -1;
      if (b.name === "Civil") return 1;
      return a.name.localeCompare(b.name);
    });

  return visible.map((category) => ({
    category,
    contracts: byCategoryId.get(category.id) ?? [],
  }));
}

interface RawCategoryRow {
  id: string;
  name: string;
  is_system_seed: boolean;
  is_active: boolean;
}

interface RawContractRow {
  id: string;
  site_id: string;
  trade_category_id: string | null;
  title: string;
  labor_tracking_mode: string | null;
  is_in_house: boolean;
  contract_type: "mesthri" | "specialist";
  status: ContractStatus;
  total_value: number | string | null;
  created_at: string;
  team: { leader_name: string | null } | null;
  laborer: { name: string | null } | null;
}

export function useSiteTrades(siteId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["trades", "site", siteId],
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Trade[]> => {
      if (!siteId) return [];

      const [catsRes, contractsRes] = await Promise.all([
        supabase
          .from("labor_categories")
          .select("id, name, is_system_seed, is_active"),
        supabase
          .from("subcontracts")
          .select(
            `
            id, site_id, trade_category_id, title,
            labor_tracking_mode, is_in_house, contract_type, status, total_value, created_at,
            team:teams(leader_name),
            laborer:laborers(name)
          `
          )
          .eq("site_id", siteId)
          .in("status", ["draft", "active", "on_hold"]),
      ]);

      if (catsRes.error) throw catsRes.error;
      if (contractsRes.error) throw contractsRes.error;

      const categories: TradeCategory[] = ((catsRes.data ?? []) as unknown as RawCategoryRow[]).map(
        (r) => ({
          id: r.id,
          name: r.name,
          isSystemSeed: r.is_system_seed,
          isActive: r.is_active,
        })
      );

      const contracts: TradeContract[] = ((contractsRes.data ?? []) as unknown as RawContractRow[]).map(
        (r) => ({
          id: r.id,
          siteId: r.site_id,
          tradeCategoryId: r.trade_category_id,
          title: r.title,
          laborTrackingMode: (r.labor_tracking_mode ?? "detailed") as LaborTrackingMode,
          isInHouse: r.is_in_house,
          contractType: r.contract_type,
          status: r.status,
          totalValue: Number(r.total_value ?? 0),
          mesthriOrSpecialistName:
            r.team?.leader_name ?? r.laborer?.name ?? null,
          createdAt: r.created_at,
        })
      );

      return groupContractsByTrade(categories, contracts);
    },
  });
}
