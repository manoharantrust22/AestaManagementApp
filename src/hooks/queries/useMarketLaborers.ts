import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { Database } from "@/types/database.types";

type MarketLaborerAttendance = Database["public"]["Tables"]["market_laborer_attendance"]["Row"];

interface MarketLaborerWithCategory extends MarketLaborerAttendance {
  labor_categories: {
    name: string;
  } | null;
}

interface MarketLaborerInput {
  site_id: string;
  section_id?: string | null;
  date: string;
  category_id: string;
  count: number;
  work_hours: number;
  work_days: number;
  rate_per_person: number;
  total_cost: number;
  notes?: string | null;
  entered_by: string;
  entered_by_user_id?: string | null;
}

// Fetch market laborer attendance for a specific date and site
export function useMarketLaborerAttendance(
  siteId: string | undefined,
  date: string | undefined
) {
  const supabase = createClient();

  return useQuery({
    queryKey:
      siteId && date
        ? queryKeys.marketAttendance.byDate(siteId, date)
        : ["market-attendance", "unknown"],
    queryFn: wrapQueryFn(async () => {
      if (!siteId || !date) return [];

      // Cast to any because table may not exist yet
      const { data, error } = await (
        supabase.from("market_laborer_attendance") as any
      )
        .select(
          `
          *,
          labor_categories(name)
        `
        )
        .eq("site_id", siteId)
        .eq("date", date)
        .order("created_at", { ascending: true });

      if (error) {
        // Table might not exist yet - return empty array
        if (error.code === "42P01") {
          console.warn("market_laborer_attendance table does not exist yet");
          return [];
        }
        throw error;
      }

      return (data as MarketLaborerWithCategory[]) || [];
    }, { operationName: "useMarketLaborerAttendance" }),
    enabled: !!siteId && !!date,
  });
}

// Fetch market laborer summary for a date range (for dashboard/reports)
export function useMarketLaborerSummary(
  siteId: string | undefined,
  dateFrom: string,
  dateTo: string
) {
  const supabase = createClient();

  return useQuery({
    queryKey: siteId
      ? queryKeys.marketAttendance.dateRange(siteId, dateFrom, dateTo)
      : ["market-attendance", "summary"],
    queryFn: wrapQueryFn(async () => {
      if (!siteId) return { totalCount: 0, totalCost: 0, byCategory: {} };

      // Cast to any because table may not exist yet
      const { data, error } = await (
        supabase.from("market_laborer_attendance") as any
      )
        .select(
          `
          category_id,
          count,
          total_cost,
          labor_categories(name)
        `
        )
        .eq("site_id", siteId)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      if (error) {
        if (error.code === "42P01") {
          return { totalCount: 0, totalCost: 0, byCategory: {} };
        }
        throw error;
      }

      const typedData = data as {
        category_id: string;
        count: number;
        total_cost: number;
        labor_categories: { name: string } | null;
      }[];

      // Aggregate by category
      const byCategory: Record<string, { count: number; cost: number }> = {};
      let totalCount = 0;
      let totalCost = 0;

      typedData?.forEach((row) => {
        const categoryName = row.labor_categories?.name || "Unknown";
        if (!byCategory[categoryName]) {
          byCategory[categoryName] = { count: 0, cost: 0 };
        }
        byCategory[categoryName].count += row.count;
        byCategory[categoryName].cost += row.total_cost;
        totalCount += row.count;
        totalCost += row.total_cost;
      });

      return { totalCount, totalCost, byCategory };
    }, { operationName: "useMarketLaborerSummary" }),
    enabled: !!siteId,
  });
}

// Save market laborer attendance (upsert)
export function useSaveMarketLaborers() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (records: MarketLaborerInput[]) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      if (records.length === 0) return [];

      // Use upsert to handle both insert and update
      // Cast to any because table may not exist yet
      const { data, error } = await (
        supabase.from("market_laborer_attendance") as any
      )
        .upsert(
          records.map((r) => ({
            site_id: r.site_id,
            section_id: r.section_id || null,
            date: r.date,
            category_id: r.category_id,
            count: r.count,
            work_hours: r.work_hours,
            work_days: r.work_days,
            rate_per_person: r.rate_per_person,
            total_cost: r.total_cost,
            notes: r.notes || null,
            entered_by: r.entered_by,
            entered_by_user_id: r.entered_by_user_id || null,
          })),
          {
            onConflict: "site_id,date,category_id",
            ignoreDuplicates: false,
          }
        )
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate queries for the affected dates
      const dates = [...new Set(variables.map((r) => r.date))];
      const siteIds = [...new Set(variables.map((r) => r.site_id))];

      siteIds.forEach((siteId) => {
        dates.forEach((date) => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.marketAttendance.byDate(siteId, date),
          });
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.marketAttendance.all,
        });
      });
    },
  });
}

// Delete market laborer attendance record
export function useDeleteMarketLaborer() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      siteId,
      date,
    }: {
      id: string;
      siteId: string;
      date: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Cast to any because table may not exist yet
      const { error } = await (
        supabase.from("market_laborer_attendance") as any
      )
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { id, siteId, date };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.marketAttendance.byDate(result.siteId, result.date),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.marketAttendance.all,
      });
    },
  });
}
