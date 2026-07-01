"use client";

import React from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Skeleton,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  Warning as OutstandingIcon,
  People as PeopleIcon,
  CheckCircle as PaidIcon,
  TrendingUp as ProgressIcon,
  AccountBalance as MaestriIcon,
} from "@mui/icons-material";
import type { ContractLaborerPaymentView, MaestriEarningsResult } from "@/types/payment.types";

interface ContractLaborerSummaryDashboardProps {
  laborers: ContractLaborerPaymentView[];
  loading?: boolean;
  maestriEarnings?: MaestriEarningsResult | null;
}

export default function ContractLaborerSummaryDashboard({
  laborers,
  loading = false,
  maestriEarnings,
}: ContractLaborerSummaryDashboardProps) {
  const formatCurrency = (amount: number) => {
    if (amount >= 100000) {
      return `Rs.${(amount / 100000).toFixed(1)}L`;
    }
    return `Rs.${amount.toLocaleString()}`;
  };

  // Calculate aggregate metrics
  const totalOutstanding = laborers.reduce((sum, l) => sum + Math.max(0, l.outstanding), 0);
  const laborersWithDue = laborers.filter((l) => l.outstanding > 0).length;
  const totalPaid = laborers.reduce((sum, l) => sum + l.totalPaid, 0);
  const totalSalary = laborers.reduce((sum, l) => sum + l.totalEarned, 0); // Total salary due
  const paymentProgress = totalSalary > 0 ? Math.round((totalPaid / totalSalary) * 100) : 0;

  // Determine progress color: red < 50%, orange 50-80%, green >= 80%
  const getProgressColor = (progress: number): "error" | "warning" | "success" => {
    if (progress < 50) return "error";
    if (progress < 80) return "warning";
    return "success";
  };
  const progressColor = getProgressColor(paymentProgress);

  if (loading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
              <Card sx={{ borderLeft: 4, borderColor: "grey.300" }}>
                <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Skeleton variant="circular" width={20} height={20} />
                    <Skeleton variant="text" width="60%" height={16} />
                  </Box>
                  <Skeleton variant="text" width="80%" height={32} sx={{ mb: 1 }} />
                  <Skeleton variant="rounded" width={80} height={24} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={2}>
        {/* Total Outstanding */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              bgcolor: totalOutstanding > 0 ? "error.50" : "grey.50",
              borderLeft: 4,
              borderColor: totalOutstanding > 0 ? "error.main" : "grey.400",
            }}
          >
            <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <OutstandingIcon
                  color={totalOutstanding > 0 ? "error" : "disabled"}
                  fontSize="small"
                />
                <Typography variant="caption" color="text.secondary">
                  Total Outstanding
                </Typography>
              </Box>
              <Typography
                variant="h5"
                fontWeight={600}
                color={totalOutstanding > 0 ? "error.dark" : "text.secondary"}
              >
                {formatCurrency(totalOutstanding)}
              </Typography>
              <Chip
                label={`${laborersWithDue} laborer${laborersWithDue !== 1 ? "s" : ""} with due`}
                size="small"
                color={laborersWithDue > 0 ? "error" : "default"}
                variant="outlined"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Total Laborers */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              bgcolor: "info.50",
              borderLeft: 4,
              borderColor: "info.main",
            }}
          >
            <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <PeopleIcon color="info" fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  Company Laborers
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={600} color="info.dark">
                {laborers.length}
              </Typography>
              <Chip
                label={`Rs.${Math.round(totalSalary / Math.max(laborers.length, 1)).toLocaleString()} avg salary`}
                size="small"
                color="info"
                variant="outlined"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Total Paid */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card
            sx={{
              bgcolor: "success.50",
              borderLeft: 4,
              borderColor: "success.main",
            }}
          >
            <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <PaidIcon color="success" fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  Total Paid
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={600} color="success.dark">
                {formatCurrency(totalPaid)}
              </Typography>
              <Chip
                label={totalSalary > 0 ? `${Math.round((totalPaid / totalSalary) * 100)}% of salary` : "0%"}
                size="small"
                color="success"
                variant="outlined"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Payment Progress */}
        <Grid size={{ xs: 12, sm: 6, md: maestriEarnings ? 2.4 : 3 }}>
          <Card
            sx={{
              bgcolor: `${progressColor}.50`,
              borderLeft: 4,
              borderColor: `${progressColor}.main`,
            }}
          >
            <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <ProgressIcon color={progressColor} fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  Payment Progress
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ position: "relative", display: "inline-flex" }}>
                  <CircularProgress
                    variant="determinate"
                    value={Math.min(paymentProgress, 100)}
                    size={56}
                    thickness={5}
                    color={progressColor}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: "absolute",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      component="div"
                      fontWeight={600}
                      color={`${progressColor}.dark`}
                    >
                      {paymentProgress}%
                    </Typography>
                  </Box>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(totalPaid)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    of {formatCurrency(totalSalary)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Maestri Earnings - Only shown if configured */}
        {maestriEarnings && maestriEarnings.marginPerDay > 0 && (
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <Card
              sx={{
                bgcolor: "secondary.50",
                borderLeft: 4,
                borderColor: "secondary.main",
              }}
            >
              <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <MaestriIcon color="secondary" fontSize="small" />
                  <Tooltip title="Maestri earns this margin per laborer per day worked">
                    <Typography variant="caption" color="text.secondary" sx={{ cursor: "help" }}>
                      Maestri Earnings
                    </Typography>
                  </Tooltip>
                </Box>
                <Typography variant="h5" fontWeight={600} color="secondary.dark">
                  {formatCurrency(maestriEarnings.totalMaestriEarnings)}
                </Typography>
                <Chip
                  label={`Rs.${maestriEarnings.marginPerDay}/day/laborer`}
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ mt: 1 }}
                />
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
