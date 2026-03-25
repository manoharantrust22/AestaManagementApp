import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import dayjs from "dayjs";

interface DashboardStats {
  todayLaborers: number;
  todayCost: number;
  weekTotal: number;
  pendingSalaries: number;
  activeLaborers: number;
  pendingPaymentAmount: number;
}

interface RecentAttendance {
  date: string;
  laborer_name: string;
  work_days: number;
  daily_earnings: number;
}

interface PendingSalary {
  laborer_name: string;
  week_ending: string;
  balance_due: number;
  status: string;
}

interface WeeklyTrendData {
  date: string;
  labor: number;
  expenses: number;
}

interface ExpenseBreakdown {
  name: string;
  value: number;
  [key: string]: string | number;
}

// Fetch dashboard stats with optimized queries
async function fetchDashboardStats(siteId: string): Promise<DashboardStats> {
  const supabase = createClient();
  const today = dayjs().format("YYYY-MM-DD");
  const weekStart = dayjs().subtract(7, "days").format("YYYY-MM-DD");

  // Run all queries in parallel for better performance
  const [todayResult, weekResult, laborersResult, pendingSalaryResult] =
    await Promise.all([
      // Today's attendance
      supabase
        .from("daily_attendance")
        .select("work_days, daily_earnings")
        .eq("site_id", siteId)
        .eq("date", today),

      // Week's attendance (single query instead of 7)
      supabase
        .from("daily_attendance")
        .select("daily_earnings")
        .eq("site_id", siteId)
        .gte("date", weekStart)
        .lte("date", today),

      // Active laborers count
      supabase
        .from("laborers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),

      // Pending salaries
      supabase
        .from("salary_periods")
        .select("balance_due, status")
        .in("status", ["calculated", "partial"]),
    ]);

  const todayAttendance = todayResult.data as
    | { work_days: number; daily_earnings: number }[]
    | null;
  const weekAttendance = weekResult.data as { daily_earnings: number }[] | null;
  const pendingSalaryData = pendingSalaryResult.data as
    | { balance_due: number; status: string }[]
    | null;

  return {
    todayLaborers: todayAttendance?.length || 0,
    todayCost:
      todayAttendance?.reduce((sum, a) => sum + (a.daily_earnings || 0), 0) ||
      0,
    weekTotal:
      weekAttendance?.reduce((sum, a) => sum + (a.daily_earnings || 0), 0) || 0,
    pendingSalaries: pendingSalaryData?.length || 0,
    activeLaborers: laborersResult.count || 0,
    pendingPaymentAmount:
      pendingSalaryData?.reduce((sum, s) => sum + (s.balance_due || 0), 0) || 0,
  };
}

// Fetch recent attendance
async function fetchRecentAttendance(
  siteId: string
): Promise<RecentAttendance[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("v_active_attendance")
    .select("date, laborer_name, work_days, daily_earnings")
    .eq("site_id", siteId)
    .order("date", { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data || []).map((d) => ({
    date: d.date || "",
    laborer_name: d.laborer_name || "",
    work_days: d.work_days || 0,
    daily_earnings: d.daily_earnings || 0,
  }));
}

// Fetch pending salaries
async function fetchPendingSalaries(siteId: string): Promise<PendingSalary[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("v_salary_periods_detailed")
    .select("laborer_name, week_ending, balance_due, status")
    .in("status", ["calculated", "partial"])
    .order("week_ending", { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data || []).map((d) => ({
    laborer_name: d.laborer_name || "",
    week_ending: d.week_ending || "",
    balance_due: d.balance_due || 0,
    status: d.status || "",
  }));
}

// Optimized: Fetch weekly trend data with 2 queries instead of 14
async function fetchWeeklyTrendData(
  siteId: string
): Promise<WeeklyTrendData[]> {
  const supabase = createClient();
  const today = dayjs();
  const weekStart = today.subtract(6, "days").format("YYYY-MM-DD");
  const todayStr = today.format("YYYY-MM-DD");

  // Fetch all attendance and expenses for the week in 2 queries (not 14!)
  const [attendanceResult, expensesResult] = await Promise.all([
    supabase
      .from("daily_attendance")
      .select("date, daily_earnings")
      .eq("site_id", siteId)
      .gte("date", weekStart)
      .lte("date", todayStr),

    supabase
      .from("expenses")
      .select("date, amount")
      .eq("site_id", siteId)
      .gte("date", weekStart)
      .lte("date", todayStr),
  ]);

  const attendanceData = attendanceResult.data as
    | { date: string; daily_earnings: number }[]
    | null;
  const expensesData = expensesResult.data as
    | { date: string; amount: number }[]
    | null;

  // Group by date in JavaScript (much faster than 14 separate queries)
  const attendanceByDate: Record<string, number> = {};
  const expensesByDate: Record<string, number> = {};

  attendanceData?.forEach((row) => {
    attendanceByDate[row.date] =
      (attendanceByDate[row.date] || 0) + (row.daily_earnings || 0);
  });

  expensesData?.forEach((row) => {
    expensesByDate[row.date] =
      (expensesByDate[row.date] || 0) + (row.amount || 0);
  });

  // Build trend data for last 7 days
  const trendData: WeeklyTrendData[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = today.subtract(i, "days");
    const dateStr = date.format("YYYY-MM-DD");
    trendData.push({
      date: date.format("DD MMM"),
      labor: attendanceByDate[dateStr] || 0,
      expenses: expensesByDate[dateStr] || 0,
    });
  }

  return trendData;
}

// Fetch expense breakdown
async function fetchExpenseBreakdown(
  siteId: string
): Promise<ExpenseBreakdown[]> {
  const supabase = createClient();
  const thirtyDaysAgo = dayjs().subtract(30, "days").format("YYYY-MM-DD");

  const { data, error } = await supabase
    .from("expenses")
    .select("module, amount")
    .eq("site_id", siteId)
    .gte("date", thirtyDaysAgo);

  if (error) throw error;

  const typedData = data as { module: string; amount: number }[] | null;

  // Group by module
  const expensesByModule: Record<string, number> = {};
  typedData?.forEach((exp) => {
    expensesByModule[exp.module] =
      (expensesByModule[exp.module] || 0) + exp.amount;
  });

  return Object.entries(expensesByModule).map(([module, amount]) => ({
    name: module.charAt(0).toUpperCase() + module.slice(1),
    value: amount,
  }));
}

// React Query hooks
export function useDashboardStats(siteId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.site(siteId || ""), "stats"],
    queryFn: () => fetchDashboardStats(siteId!),
    enabled: !!siteId,
    staleTime: 3 * 60 * 1000, // 3 minutes - dashboard summary data
  });
}

export function useRecentAttendance(siteId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.site(siteId || ""), "recent-attendance"],
    queryFn: () => fetchRecentAttendance(siteId!),
    enabled: !!siteId,
    staleTime: 3 * 60 * 1000,
  });
}

export function usePendingSalaries(siteId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.site(siteId || ""), "pending-salaries"],
    queryFn: () => fetchPendingSalaries(siteId!),
    enabled: !!siteId,
    staleTime: 3 * 60 * 1000,
  });
}

export function useWeeklyTrendData(siteId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.site(siteId || ""), "weekly-trend"],
    queryFn: () => fetchWeeklyTrendData(siteId!),
    enabled: !!siteId,
    staleTime: 3 * 60 * 1000,
  });
}

export function useExpenseBreakdown(siteId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.site(siteId || ""), "expense-breakdown"],
    queryFn: () => fetchExpenseBreakdown(siteId!),
    enabled: !!siteId,
    staleTime: 3 * 60 * 1000,
  });
}
