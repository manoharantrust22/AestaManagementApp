import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import dayjs from "dayjs";

interface CompanyStats {
  totalSites: number;
  activeSites: number;
  totalLaborers: number;
  activeLaborers: number;
  totalTeams: number;
  pendingPayments: number;
  pendingPaymentAmount: number;
  monthlyExpenses: number;
}

interface SiteSummary {
  id: string;
  name: string;
  status: string;
  todayLaborers: number;
  todayCost: number;
  weekCost: number;
}

// Fetch company stats with optimized parallel queries
async function fetchCompanyStats(): Promise<CompanyStats> {
  const supabase = createClient();
  const today = dayjs().format("YYYY-MM-DD");
  const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");

  // Run all queries in parallel
  const [
    sitesResult,
    laborersResult,
    teamsResult,
    pendingResult,
    monthlyResult,
  ] = await Promise.all([
    // Sites
    supabase.from("sites").select("id, status"),

    // Laborers
    supabase.from("laborers").select("id, status"),

    // Teams count
    supabase.from("teams").select("id", { count: "exact", head: true }),

    // Pending payments
    supabase
      .from("salary_periods")
      .select("balance_due")
      .in("status", ["calculated", "partial"]),

    // Monthly expenses
    supabase
      .from("daily_attendance")
      .select("daily_earnings")
      .gte("date", monthStart)
      .lte("date", today),
  ]);

  const sites = sitesResult.data as { id: string; status: string }[] | null;
  const laborers = laborersResult.data as
    | { id: string; status: string }[]
    | null;
  const pendingList = pendingResult.data as { balance_due: number }[] | null;
  const monthlyExpList = monthlyResult.data as
    | { daily_earnings: number }[]
    | null;

  return {
    totalSites: sites?.length || 0,
    activeSites: sites?.filter((s) => s.status === "active").length || 0,
    totalLaborers: laborers?.length || 0,
    activeLaborers: laborers?.filter((l) => l.status === "active").length || 0,
    totalTeams: teamsResult.count || 0,
    pendingPayments: pendingList?.length || 0,
    pendingPaymentAmount:
      pendingList?.reduce((sum, p) => sum + (p.balance_due || 0), 0) || 0,
    monthlyExpenses:
      monthlyExpList?.reduce((sum, a) => sum + (a.daily_earnings || 0), 0) || 0,
  };
}

// Optimized: Fetch site summaries with batch queries instead of per-site queries
async function fetchSiteSummaries(): Promise<SiteSummary[]> {
  const supabase = createClient();
  const today = dayjs().format("YYYY-MM-DD");
  const weekStart = dayjs().subtract(7, "days").format("YYYY-MM-DD");

  // First, get all active sites
  const { data: sites, error: sitesError } = await supabase
    .from("sites")
    .select("id, name, status")
    .eq("status", "active");

  if (sitesError) throw sitesError;

  const typedSites = sites as
    | { id: string; name: string; status: string }[]
    | null;
  if (!typedSites || typedSites.length === 0) return [];

  const siteIds = typedSites.map((s) => s.id);

  // Batch fetch all attendance data for all sites in 2 queries (not N*2)
  const [todayResult, weekResult] = await Promise.all([
    // Today's attendance for all sites
    supabase
      .from("daily_attendance")
      .select("site_id, daily_earnings")
      .in("site_id", siteIds)
      .eq("date", today),

    // Week's attendance for all sites
    supabase
      .from("daily_attendance")
      .select("site_id, daily_earnings")
      .in("site_id", siteIds)
      .gte("date", weekStart)
      .lte("date", today),
  ]);

  const todayData = todayResult.data as
    | { site_id: string; daily_earnings: number }[]
    | null;
  const weekData = weekResult.data as
    | { site_id: string; daily_earnings: number }[]
    | null;

  // Group data by site_id in JavaScript (much faster than N queries)
  const todayBySite: Record<string, { count: number; total: number }> = {};
  const weekBySite: Record<string, number> = {};

  todayData?.forEach((row) => {
    if (!todayBySite[row.site_id]) {
      todayBySite[row.site_id] = { count: 0, total: 0 };
    }
    todayBySite[row.site_id].count += 1;
    todayBySite[row.site_id].total += row.daily_earnings || 0;
  });

  weekData?.forEach((row) => {
    weekBySite[row.site_id] =
      (weekBySite[row.site_id] || 0) + (row.daily_earnings || 0);
  });

  // Build summaries
  return typedSites.map((site) => ({
    id: site.id,
    name: site.name,
    status: site.status,
    todayLaborers: todayBySite[site.id]?.count || 0,
    todayCost: todayBySite[site.id]?.total || 0,
    weekCost: weekBySite[site.id] || 0,
  }));
}

// React Query hooks
export function useCompanyStats() {
  return useQuery({
    queryKey: queryKeys.stats.company(),
    queryFn: wrapQueryFn(fetchCompanyStats, { operationName: "useCompanyStats" }),
  });
}

export function useSiteSummaries() {
  return useQuery({
    queryKey: queryKeys.dashboard.company(),
    queryFn: wrapQueryFn(fetchSiteSummaries, { operationName: "useSiteSummaries" }),
  });
}
