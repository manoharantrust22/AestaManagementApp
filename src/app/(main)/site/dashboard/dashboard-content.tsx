"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";

const DashboardCharts = dynamic(
  () => import("@/components/dashboard/DashboardCharts"),
  { ssr: false }
);
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  Divider,
  Alert,
  Skeleton,
  Fab,
  Tooltip,
} from "@mui/material";
import {
  People,
  AccountBalanceWallet,
  TrendingUp,
  CalendarToday,
  Payment,
  ArrowForward,
  LocalCafe as TeaIcon,
  Receipt as ExpenseIcon,
  Warning as WarningIcon,
  EventNote as AttendanceIcon,
} from "@mui/icons-material";
// recharts is lazy-loaded via DashboardCharts component above
import { useSelectedSite, useSitesData } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import { createClient } from "@/lib/supabase/client";
import dayjs from "dayjs";
import {
  useDashboardStats,
  useRecentAttendance,
  usePendingSalaries,
  useWeeklyTrendData,
  useExpenseBreakdown,
} from "@/hooks/queries/useDashboardData";
import { useQueryClient } from "@tanstack/react-query";
import type { DashboardData, ProjectCosts } from "@/lib/data/dashboard";
import DashboardSkeleton from "./dashboard-skeleton";

interface DashboardContentProps {
  serverSiteId: string | null;
  initialData: DashboardData | null;
}

export default function DashboardContent({
  serverSiteId,
  initialData,
}: DashboardContentProps) {
  const { selectedSite } = useSelectedSite();
  const { loading: siteLoading } = useSitesData();
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Use client-side siteId (may differ if user switched sites after page load)
  const siteId = selectedSite?.id;

  // Check if we should use server data (siteIds match)
  const useServerData = serverSiteId === siteId && initialData !== null;

  // Project costs state (for client-side fetching when site changes)
  const [projectCosts, setProjectCosts] = useState<ProjectCosts>(
    useServerData && initialData
      ? initialData.projectCosts
      : {
          teaShopCount: 0,
          teaShopTotal: 0,
          expensesCount: 0,
          expensesTotal: 0,
          totalUnlinked: 0,
        }
  );
  const [projectCostsLoading, setProjectCostsLoading] = useState(!useServerData);

  // Seed React Query cache with server data if siteIds match
  useMemo(() => {
    if (useServerData && initialData && siteId) {
      // Seed the query cache with initial data
      queryClient.setQueryData(
        ["dashboard", "site", siteId, "stats"],
        initialData.stats
      );
      queryClient.setQueryData(
        ["dashboard", "site", siteId, "recent-attendance"],
        initialData.recentAttendance
      );
      queryClient.setQueryData(
        ["dashboard", "site", siteId, "pending-salaries"],
        initialData.pendingSalaries
      );
      queryClient.setQueryData(
        ["dashboard", "site", siteId, "weekly-trend"],
        initialData.weeklyTrendData
      );
      queryClient.setQueryData(
        ["dashboard", "site", siteId, "expense-breakdown"],
        initialData.expenseBreakdown
      );
    }
  }, [useServerData, initialData, siteId, queryClient]);

  // Use React Query hooks - they will use seeded cache data or fetch fresh
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useDashboardStats(siteId);

  const { data: recentAttendance = [], isLoading: attendanceLoading } =
    useRecentAttendance(siteId);

  const { data: pendingSalaries = [], isLoading: salariesLoading } =
    usePendingSalaries(siteId);

  const { data: weeklyTrendData = [], isLoading: trendLoading } =
    useWeeklyTrendData(siteId);

  const { data: expenseBreakdown = [], isLoading: expenseLoading } =
    useExpenseBreakdown(siteId);

  const loading =
    statsLoading ||
    attendanceLoading ||
    salariesLoading ||
    trendLoading ||
    expenseLoading;

  // Fetch project costs when site changes and we don't have server data
  useEffect(() => {
    const fetchProjectCosts = async () => {
      if (!siteId) return;

      // Skip if we have valid server data
      if (useServerData && initialData) {
        setProjectCosts(initialData.projectCosts);
        setProjectCostsLoading(false);
        return;
      }

      setProjectCostsLoading(true);

      try {
        const [teaShopsResult, expensesResult] = await Promise.all([
          supabase.from("tea_shop_accounts").select("id").eq("site_id", siteId),
          supabase.from("expenses").select("amount").eq("site_id", siteId).is("contract_id", null),
        ]);

        const teaShopIds = (teaShopsResult.data || []).map((t: any) => t.id);

        let teaSettlements: any[] = [];
        if (teaShopIds.length > 0) {
          const { data } = await supabase
            .from("tea_shop_settlements")
            .select("amount_paid")
            .in("tea_shop_id", teaShopIds);
          teaSettlements = data || [];
        }

        const teaTotal = teaSettlements.reduce(
          (sum: number, t: any) => sum + (t.amount_paid || 0),
          0
        );
        const expenseTotal = (expensesResult.data || []).reduce(
          (sum: number, e: any) => sum + (e.amount || 0),
          0
        );

        setProjectCosts({
          teaShopCount: teaSettlements.length,
          teaShopTotal: teaTotal,
          expensesCount: (expensesResult.data || []).length,
          expensesTotal: expenseTotal,
          totalUnlinked: teaTotal + expenseTotal,
        });
      } catch (err) {
        console.error("Error fetching project costs:", err);
      } finally {
        setProjectCostsLoading(false);
      }
    };

    fetchProjectCosts();
  }, [siteId, useServerData, initialData, supabase]);

  const statsCards = [
    {
      title: "Today's Laborers",
      value: (stats?.todayLaborers || 0).toString(),
      subtitle: `${stats?.activeLaborers || 0} total active`,
      icon: <People sx={{ fontSize: 40 }} />,
      color: "#1976d2",
      bgColor: "#e3f2fd",
    },
    {
      title: "Today's Cost",
      value: `₹${(stats?.todayCost || 0).toLocaleString()}`,
      subtitle: "Labor expenses",
      icon: <AccountBalanceWallet sx={{ fontSize: 40 }} />,
      color: "#2e7d32",
      bgColor: "#e8f5e9",
    },
    {
      title: "Week Total",
      value: `₹${(stats?.weekTotal || 0).toLocaleString()}`,
      subtitle: "Last 7 days",
      icon: <TrendingUp sx={{ fontSize: 40 }} />,
      color: "#9c27b0",
      bgColor: "#f3e5f5",
    },
    {
      title: "Pending Payments",
      value: `₹${(stats?.pendingPaymentAmount || 0).toLocaleString()}`,
      subtitle: `${stats?.pendingSalaries || 0} salary periods`,
      icon: <Payment sx={{ fontSize: 40 }} />,
      color: "#d32f2f",
      bgColor: "#ffebee",
    },
  ];

  // Trust server data when available - skip waiting for contexts
  const hasServerData = initialData !== null;

  // Only show skeleton when we have NO data AND contexts are initializing
  if (!hasServerData && (siteLoading || authLoading)) {
    return <DashboardSkeleton />;
  }

  // Use server-provided siteId as fallback while context loads
  const effectiveSiteId = selectedSite?.id ?? serverSiteId;

  if (!effectiveSiteId) {
    return (
      <Box>
        <PageHeader
          title="Site Dashboard"
          subtitle={`Welcome back, ${userProfile?.name || "User"}`}
          showBack={false}
        />
        <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Typography variant="h6" color="text.secondary">
            Please select a site to view dashboard
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Site Dashboard"
        subtitle={`${selectedSite?.name || "Loading..."} • Welcome back, ${userProfile?.name || "User"}`}
        showBack={false}
      />

      {statsError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {(statsError as Error).message}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statsCards.map((stat, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              sx={{
                height: "100%",
                borderRadius: 3,
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                },
              }}
            >
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      gutterBottom
                    >
                      {stat.title}
                    </Typography>
                    {statsLoading ? (
                      <Skeleton
                        variant="text"
                        width="60%"
                        height={40}
                        sx={{ mb: 0.5 }}
                      />
                    ) : (
                      <Typography variant="h4" fontWeight={600} sx={{ mb: 0.5 }}>
                        {stat.value}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {stat.subtitle}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      bgcolor: stat.bgColor,
                      color: stat.color,
                      p: 1.5,
                      borderRadius: 2,
                    }}
                  >
                    {stat.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Content Grid */}
      <Grid container spacing={3}>
        {/* Recent Attendance */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: "100%" }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6" fontWeight={600}>
                Recent Attendance
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowForward />}
                onClick={() => router.push("/site/attendance")}
              >
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {attendanceLoading ? (
              <Box>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={60} sx={{ mb: 1 }} />
                ))}
              </Box>
            ) : recentAttendance.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", py: 4 }}
              >
                No recent attendance records
              </Typography>
            ) : (
              <List>
                {recentAttendance.map((record, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      px: 0,
                      borderBottom:
                        index < recentAttendance.length - 1
                          ? "1px solid"
                          : "none",
                      borderColor: "divider",
                    }}
                  >
                    <ListItemText
                      primary={record.laborer_name}
                      secondary={dayjs(record.date).format("DD MMM YYYY")}
                    />
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="body2" fontWeight={600}>
                        ₹{record.daily_earnings.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {record.work_days} day(s)
                      </Typography>
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Pending Salaries */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: "100%" }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6" fontWeight={600}>
                Pending Salary Payments
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowForward />}
                onClick={() => router.push("/company/salary")}
              >
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {salariesLoading ? (
              <Box>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={60} sx={{ mb: 1 }} />
                ))}
              </Box>
            ) : pendingSalaries.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", py: 4 }}
              >
                No pending salary payments
              </Typography>
            ) : (
              <List>
                {pendingSalaries.map((salary, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      px: 0,
                      borderBottom:
                        index < pendingSalaries.length - 1
                          ? "1px solid"
                          : "none",
                      borderColor: "divider",
                    }}
                  >
                    <ListItemText
                      primary={salary.laborer_name}
                      secondary={`Week ending ${dayjs(salary.week_ending).format(
                        "DD MMM"
                      )}`}
                    />
                    <Box sx={{ textAlign: "right" }}>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        color="error.main"
                      >
                        ₹{salary.balance_due.toLocaleString()}
                      </Typography>
                      <Chip
                        label={salary.status.toUpperCase()}
                        size="small"
                        color={
                          salary.status === "calculated" ? "error" : "warning"
                        }
                        sx={{ height: 20, fontSize: "0.7rem" }}
                      />
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Charts - lazy loaded to reduce initial bundle size */}
        <DashboardCharts
          weeklyTrendData={weeklyTrendData}
          expenseBreakdown={expenseBreakdown}
          trendLoading={trendLoading}
          expenseLoading={expenseLoading}
        />

        {/* Project Costs (Unlinked Payments) */}
        {projectCosts.totalUnlinked > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper
              sx={{
                p: 3,
                borderRadius: 3,
                bgcolor: "warning.50",
                border: "1px solid",
                borderColor: "warning.200",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <WarningIcon color="warning" />
                <Typography variant="h6" fontWeight={600}>
                  Unlinked Project Costs
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These payments are not linked to any subcontract and are treated
                as general project costs.
              </Typography>

              {projectCostsLoading ? (
                <Skeleton variant="rectangular" height={100} />
              ) : (
                <Box>
                  {projectCosts.teaShopCount > 0 && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                        p: 1.5,
                        bgcolor: "background.paper",
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <TeaIcon fontSize="small" color="secondary" />
                        <Typography variant="body2">Tea/Snacks</Typography>
                        <Chip label={projectCosts.teaShopCount} size="small" />
                      </Box>
                      <Typography fontWeight={600}>
                        ₹{projectCosts.teaShopTotal.toLocaleString()}
                      </Typography>
                    </Box>
                  )}

                  {projectCosts.expensesCount > 0 && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                        p: 1.5,
                        bgcolor: "background.paper",
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <ExpenseIcon fontSize="small" color="error" />
                        <Typography variant="body2">Other Expenses</Typography>
                        <Chip label={projectCosts.expensesCount} size="small" />
                      </Box>
                      <Typography fontWeight={600}>
                        ₹{projectCosts.expensesTotal.toLocaleString()}
                      </Typography>
                    </Box>
                  )}

                  <Divider sx={{ my: 1.5 }} />

                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={600}>
                      Total Unlinked
                    </Typography>
                    <Typography variant="h6" fontWeight={700} color="warning.dark">
                      ₹{projectCosts.totalUnlinked.toLocaleString()}
                    </Typography>
                  </Box>

                  <Button
                    size="small"
                    sx={{ mt: 2 }}
                    onClick={() => router.push("/site/subcontracts")}
                  >
                    Link to Subcontracts
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>
        )}

        {/* Quick Actions */}
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Quick Actions
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<CalendarToday />}
                  onClick={() => router.push("/site/attendance")}
                  sx={{ py: 1.5 }}
                >
                  Record Attendance
                </Button>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AccountBalanceWallet />}
                  onClick={() => router.push("/site/expenses")}
                  sx={{ py: 1.5 }}
                >
                  Add Expense
                </Button>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<People />}
                  onClick={() => router.push("/company/laborers")}
                  sx={{ py: 1.5 }}
                >
                  Manage Laborers
                </Button>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<TrendingUp />}
                  onClick={() => router.push("/site/reports")}
                  sx={{ py: 1.5 }}
                >
                  View Reports
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Floating Action Button for Quick Attendance */}
      <Tooltip title="Record Attendance" placement="left">
        <Fab
          color="primary"
          onClick={() => router.push("/site/attendance")}
          sx={{
            position: "fixed",
            bottom: { xs: 150, md: 90 },
            right: { xs: 16, md: 24 },
            zIndex: 1000,
          }}
        >
          <AttendanceIcon />
        </Fab>
      </Tooltip>
    </Box>
  );
}
