"use client";

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
  ListItemAvatar,
  Avatar,
  Button,
  Divider,
  Alert,
  Skeleton,
} from "@mui/material";
import {
  People,
  AccountBalanceWallet,
  Domain,
  Groups,
  TrendingUp,
  Payment,
  ArrowForward,
  Business,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import dayjs from "dayjs";
import { useCompanyStats, useSiteSummaries } from "@/hooks/queries/useCompanyData";
import { useQueryClient } from "@tanstack/react-query";
import DailyPeekSection from "@/components/dashboard/DailyPeekSection";
import ComplianceTodayCard from "@/components/checklist/ComplianceTodayCard";

export default function CompanyDashboardPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Use React Query hooks for data fetching with caching
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useCompanyStats();

  const { data: siteSummaries = [], isLoading: summariesLoading } =
    useSiteSummaries();

  const loading = statsLoading || summariesLoading;

  // Refresh all company data
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["companyStats"] });
    queryClient.invalidateQueries({ queryKey: ["siteSummaries"] });
  };

  // Create comparison chart data
  const siteComparisonData = siteSummaries.map((s) => ({
    name: s.name.length > 15 ? s.name.substring(0, 15) + "..." : s.name,
    Today: s.todayCost,
    "This Week": s.weekCost,
  }));

  const statsCards = [
    {
      title: "Active Sites",
      value: loading ? "..." : (stats?.activeSites || 0).toString(),
      subtitle: `${stats?.totalSites || 0} total sites`,
      icon: <Domain sx={{ fontSize: 40 }} />,
      color: "#1976d2",
      bgColor: "#e3f2fd",
    },
    {
      title: "Active Laborers",
      value: loading ? "..." : (stats?.activeLaborers || 0).toString(),
      subtitle: `${stats?.totalLaborers || 0} total registered`,
      icon: <People sx={{ fontSize: 40 }} />,
      color: "#2e7d32",
      bgColor: "#e8f5e9",
    },
    {
      title: "Teams",
      value: loading ? "..." : (stats?.totalTeams || 0).toString(),
      subtitle: "Contractor teams",
      icon: <Groups sx={{ fontSize: 40 }} />,
      color: "#9c27b0",
      bgColor: "#f3e5f5",
    },
    {
      title: "Pending Payments",
      value: loading
        ? "..."
        : `₹${(stats?.pendingPaymentAmount || 0).toLocaleString()}`,
      subtitle: `${stats?.pendingPayments || 0} pending`,
      icon: <Payment sx={{ fontSize: 40 }} />,
      color: "#d32f2f",
      bgColor: "#ffebee",
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Company Dashboard"
        subtitle={`Overview of all sites and resources • Welcome, ${userProfile?.name}`}
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
                    <Typography variant="h4" fontWeight={600} sx={{ mb: 0.5 }}>
                      {stat.value}
                    </Typography>
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

      {/* Daily Site Peek — multi-site daily attendance overview */}
      <DailyPeekSection />

      {/* Daily compliance — who completed their checklist today */}
      <Box sx={{ mb: 3 }}>
        <ComplianceTodayCard />
      </Box>

      {/* Monthly Summary Card */}
      <Paper
        sx={{
          p: 3,
          borderRadius: 3,
          mb: 3,
          bgcolor: "primary.main",
          color: "white",
        }}
      >
        <Grid container alignItems="center" spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Typography variant="h6" fontWeight={600}>
              This Month&apos;s Labor Cost
            </Typography>
            <Typography variant="h3" fontWeight={700}>
              ₹{(stats?.monthlyExpenses || 0).toLocaleString()}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              {dayjs().format("MMMM YYYY")} • Across all sites
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }} sx={{ textAlign: { md: "right" } }}>
            <Button
              variant="contained"
              sx={{
                bgcolor: "background.paper",
                color: "primary.main",
                "&:hover": { bgcolor: "action.selected" },
              }}
              endIcon={<ArrowForward />}
              onClick={() => router.push("/company/reports")}
            >
              View Full Report
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        {/* Site-wise Summary */}
        <Grid size={{ xs: 12, md: 5 }}>
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
                Active Sites
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowForward />}
                onClick={() => router.push("/company/sites")}
              >
                Manage
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {summariesLoading ? (
              <Box>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={70} sx={{ mb: 1 }} />
                ))}
              </Box>
            ) : siteSummaries.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", py: 4 }}
              >
                No active sites
              </Typography>
            ) : (
              <List>
                {siteSummaries.map((site, index) => (
                  <ListItem
                    key={site.id}
                    sx={{
                      px: 0,
                      borderBottom:
                        index < siteSummaries.length - 1 ? "1px solid" : "none",
                      borderColor: "divider",
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: "primary.light" }}>
                        <Business />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={site.name}
                      secondary={`${site.todayLaborers} laborers today`}
                    />
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="body2" fontWeight={600}>
                        ₹{site.todayCost.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Today
                      </Typography>
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Site Comparison Chart */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Site-wise Cost Comparison
            </Typography>
            {summariesLoading ? (
              <Skeleton variant="rectangular" height={300} />
            ) : siteComparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={siteComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => `₹${value.toLocaleString()}`}
                  />
                  <Legend />
                  <Bar dataKey="Today" fill="#1976d2" />
                  <Bar dataKey="This Week" fill="#2e7d32" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  No data available
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

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
                  startIcon={<Groups />}
                  onClick={() => router.push("/company/teams")}
                  sx={{ py: 1.5 }}
                >
                  Manage Teams
                </Button>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AccountBalanceWallet />}
                  onClick={() => router.push("/company/salary")}
                  sx={{ py: 1.5 }}
                >
                  Salary & Payments
                </Button>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<TrendingUp />}
                  onClick={() => router.push("/company/reports")}
                  sx={{ py: 1.5 }}
                >
                  Company Reports
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
