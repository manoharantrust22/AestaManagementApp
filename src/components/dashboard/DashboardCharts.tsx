"use client";

import { Box, Typography, Paper, Grid, Skeleton } from "@mui/material";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

interface DashboardChartsProps {
  weeklyTrendData: WeeklyTrendData[];
  expenseBreakdown: ExpenseBreakdown[];
  trendLoading: boolean;
  expenseLoading: boolean;
}

const COLORS = ["#1976d2", "#2e7d32", "#ed6c02", "#9c27b0"];

export default function DashboardCharts({
  weeklyTrendData,
  expenseBreakdown,
  trendLoading,
  expenseLoading,
}: DashboardChartsProps) {
  return (
    <>
      {/* Weekly Trend Chart */}
      <Grid size={{ xs: 12, md: 8 }}>
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Weekly Cost Trend
          </Typography>
          {trendLoading ? (
            <Skeleton variant="rectangular" height={300} />
          ) : weeklyTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <RechartsTooltip
                  formatter={(value: number) => `₹${value.toLocaleString()}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="labor"
                  stroke="#1976d2"
                  strokeWidth={2}
                  name="Labor Cost"
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#d32f2f"
                  strokeWidth={2}
                  name="Expenses"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                No data available for the last 7 days
              </Typography>
            </Box>
          )}
        </Paper>
      </Grid>

      {/* Expense Breakdown */}
      <Grid size={{ xs: 12, md: 4 }}>
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Expense Breakdown (30 days)
          </Typography>
          {expenseLoading ? (
            <Skeleton
              variant="circular"
              width={200}
              height={200}
              sx={{ mx: "auto" }}
            />
          ) : expenseBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={expenseBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name || ""}: ${((percent || 0) * 100).toFixed(0)}%`
                  }
                >
                  {expenseBreakdown.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: number) => `₹${value.toLocaleString()}`}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                No expenses recorded
              </Typography>
            </Box>
          )}
        </Paper>
      </Grid>
    </>
  );
}
