"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Paper,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
} from "@mui/material";
import {
  TrendingUp,
  People,
  AccountBalanceWallet,
  Business,
  Download,
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
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/layout/PageHeader";
import SettlementReportTab from "@/components/reports/settlements/SettlementReportTab";
import dayjs from "dayjs";

const COLORS = [
  "#1976d2",
  "#2e7d32",
  "#ed6c02",
  "#9c27b0",
  "#d32f2f",
  "#0288d1",
];

interface ReportData {
  totalLaborCost: number;
  totalLaborers: number;
  totalWorkDays: number;
  avgDailyRate: number;
  siteWiseData: Array<{ name: string; cost: number; laborers: number }>;
  categoryWiseData: Array<{ name: string; value: number }>;
  dailyTrend: Array<{ date: string; cost: number; laborers: number }>;
  topLaborers: Array<{ name: string; days: number; earnings: number }>;
}

export default function CompanyReportsPage() {
  const { userProfile } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"overview" | "settlements">("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reportType, setReportType] = useState<"monthly" | "weekly" | "custom">(
    "monthly"
  );
  const [startDate, setStartDate] = useState(
    dayjs().startOf("month").format("YYYY-MM-DD")
  );
  const [endDate, setEndDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  useEffect(() => {
    fetchSites();
  }, []);

  useEffect(() => {
    if (reportType === "monthly") {
      setStartDate(dayjs().startOf("month").format("YYYY-MM-DD"));
      setEndDate(dayjs().format("YYYY-MM-DD"));
    } else if (reportType === "weekly") {
      setStartDate(dayjs().subtract(7, "days").format("YYYY-MM-DD"));
      setEndDate(dayjs().format("YYYY-MM-DD"));
    }
  }, [reportType]);

  const fetchSites = async () => {
    const { data } = await supabase
      .from("sites")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    setSites(data || []);
  };

  const fetchReportData = async () => {
    try {
      setLoading(true);
      setError("");

      // Build query
      let query = supabase
        .from("daily_attendance")
        .select(
          `
          *,
          laborers!daily_attendance_laborer_id_fkey(name, category),
          sites(name)
        `
        )
        .gte("date", startDate)
        .lte("date", endDate);

      if (selectedSite !== "all") {
        query = query.eq("site_id", selectedSite);
      }

      const { data: attendance, error: attError } = await query;

      if (attError) throw attError;

      // Process data
      const attList = attendance as
        | {
            daily_earnings: number;
            work_days: number;
            laborer_id: string;
            date: string;
            sites?: any;
            laborers?: any;
          }[]
        | null;
      const totalLaborCost =
        attList?.reduce((sum, a) => sum + (a.daily_earnings || 0), 0) || 0;
      const totalWorkDays =
        attList?.reduce((sum, a) => sum + (a.work_days || 0), 0) || 0;
      const uniqueLaborers = new Set(attList?.map((a) => a.laborer_id));
      const avgDailyRate =
        totalWorkDays > 0 ? totalLaborCost / totalWorkDays : 0;

      // Site-wise breakdown
      const siteMap = new Map<
        string,
        { cost: number; laborers: Set<string> }
      >();
      attList?.forEach((a) => {
        const siteName = (a.sites as any)?.name || "Unknown";
        if (!siteMap.has(siteName)) {
          siteMap.set(siteName, { cost: 0, laborers: new Set() });
        }
        const site = siteMap.get(siteName)!;
        site.cost += a.daily_earnings || 0;
        site.laborers.add(a.laborer_id);
      });
      const siteWiseData = Array.from(siteMap.entries()).map(
        ([name, data]) => ({
          name: name.length > 15 ? name.substring(0, 15) + "..." : name,
          cost: data.cost,
          laborers: data.laborers.size,
        })
      );

      // Category-wise breakdown
      const categoryMap = new Map<string, number>();
      attList?.forEach((a) => {
        const category = (a.laborers as any)?.category || "General";
        categoryMap.set(
          category,
          (categoryMap.get(category) || 0) + (a.daily_earnings || 0)
        );
      });
      const categoryWiseData = Array.from(categoryMap.entries()).map(
        ([name, value]) => ({ name, value })
      );

      // Daily trend
      const dailyMap = new Map<
        string,
        { cost: number; laborers: Set<string> }
      >();
      attList?.forEach((a) => {
        if (!dailyMap.has(a.date)) {
          dailyMap.set(a.date, { cost: 0, laborers: new Set() });
        }
        const day = dailyMap.get(a.date)!;
        day.cost += a.daily_earnings || 0;
        day.laborers.add(a.laborer_id);
      });
      const dailyTrend = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date: dayjs(date).format("DD MMM"),
          cost: data.cost,
          laborers: data.laborers.size,
        }));

      // Top laborers
      const laborerMap = new Map<
        string,
        { name: string; days: number; earnings: number }
      >();
      attList?.forEach((a) => {
        const laborerName = (a.laborers as any)?.name || "Unknown";
        if (!laborerMap.has(a.laborer_id)) {
          laborerMap.set(a.laborer_id, {
            name: laborerName,
            days: 0,
            earnings: 0,
          });
        }
        const laborer = laborerMap.get(a.laborer_id)!;
        laborer.days += a.work_days || 0;
        laborer.earnings += a.daily_earnings || 0;
      });
      const topLaborers = Array.from(laborerMap.values())
        .sort((a, b) => b.earnings - a.earnings)
        .slice(0, 10);

      setReportData({
        totalLaborCost,
        totalLaborers: uniqueLaborers.size,
        totalWorkDays,
        avgDailyRate,
        siteWiseData,
        categoryWiseData,
        dailyTrend,
        topLaborers,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate, selectedSite]);

  const statsCards = useMemo(() => {
    if (!reportData) return [];
    return [
      {
        title: "Total Labor Cost",
        value: `₹${reportData.totalLaborCost.toLocaleString()}`,
        icon: <AccountBalanceWallet sx={{ fontSize: 40 }} />,
        color: "#1976d2",
        bgColor: "#e3f2fd",
      },
      {
        title: "Total Laborers",
        value: reportData.totalLaborers.toString(),
        icon: <People sx={{ fontSize: 40 }} />,
        color: "#2e7d32",
        bgColor: "#e8f5e9",
      },
      {
        title: "Total Work Days",
        value: reportData.totalWorkDays.toFixed(1),
        icon: <TrendingUp sx={{ fontSize: 40 }} />,
        color: "#ed6c02",
        bgColor: "#fff3e0",
      },
      {
        title: "Avg Daily Rate",
        value: `₹${reportData.avgDailyRate.toFixed(0)}`,
        icon: <Business sx={{ fontSize: 40 }} />,
        color: "#9c27b0",
        bgColor: "#f3e5f5",
      },
    ];
  }, [reportData]);

  return (
    <Box>
      <PageHeader
        title="Company Reports"
        subtitle="Analytics and reports across all sites"
      />

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="overview" label="Overview" />
        <Tab value="settlements" label="Settlements" />
      </Tabs>

      {activeTab === "settlements" && <SettlementReportTab />}

      {activeTab === "overview" && (
        <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Report Type</InputLabel>
              <Select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                label="Report Type"
              >
                <MenuItem value="weekly">Last 7 Days</MenuItem>
                <MenuItem value="monthly">This Month</MenuItem>
                <MenuItem value="custom">Custom Range</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Site</InputLabel>
              <Select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                label="Site"
              >
                <MenuItem value="all">All Sites</MenuItem>
                {sites.map((site) => (
                  <MenuItem key={site.id} value={site.id}>
                    {site.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {reportType === "custom" && (
            <>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Start Date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="End Date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
            </>
          )}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <Button
              variant="outlined"
              startIcon={<Download />}
              fullWidth
              disabled
            >
              Export
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statsCards.map((stat, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ borderRadius: 3 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      gutterBottom
                    >
                      {stat.title}
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {stat.value}
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

      {reportData && (
        <Grid container spacing={3}>
          {/* Daily Trend Chart */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Daily Cost Trend
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={reportData.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any) => `₹${value.toLocaleString()}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="Cost"
                    stroke="#1976d2"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Category Pie Chart */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Cost by Category
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={reportData.categoryWiseData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(props: any) =>
                      `${props.name} ${((props.percent || 0) * 100).toFixed(
                        0
                      )}%`
                    }
                  >
                    {reportData.categoryWiseData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => `₹${value.toLocaleString()}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Site-wise Bar Chart */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Cost by Site
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={reportData.siteWiseData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any) => `₹${value.toLocaleString()}`}
                  />
                  <Legend />
                  <Bar dataKey="cost" name="Cost" fill="#1976d2" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Top Laborers Table */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Top Earners
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Laborer</TableCell>
                      <TableCell align="right">Days</TableCell>
                      <TableCell align="right">Earnings</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reportData.topLaborers.map((laborer, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Chip
                              label={index + 1}
                              size="small"
                              color={index < 3 ? "primary" : "default"}
                            />
                            {laborer.name}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          {laborer.days.toFixed(1)}
                        </TableCell>
                        <TableCell align="right">
                          ₹{laborer.earnings.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      )}
        </>
      )}
    </Box>
  );
}
