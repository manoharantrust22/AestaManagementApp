"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Stack,
  Tabs,
  Tab,
  Divider,
} from "@mui/material";
import {
  Close as CloseIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  TableChart as TableIcon,
  ShowChart as ChartIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePriceHistory } from "@/hooks/queries/useVendorInventory";
import PriceHistoryChart from "./PriceHistoryChart";
import type { PriceSource } from "@/types/material.types";
import { PRICE_SOURCE_LABELS } from "@/types/material.types";

interface PriceHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  materialId: string;
  vendorId: string;
  materialName: string;
  materialUnit?: string;
}

type ViewMode = "chart" | "table";

// Format currency
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "N/A";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format date
const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Calculate price trend
const calculateTrend = (
  prices: { price: number; recorded_date: string }[]
) => {
  if (prices.length < 2) return { direction: "flat" as const, change: 0 };

  const recent = prices[0].price;
  const older = prices[prices.length - 1].price;
  const change = ((recent - older) / older) * 100;

  if (change > 2) return { direction: "up" as const, change };
  if (change < -2) return { direction: "down" as const, change };
  return { direction: "flat" as const, change };
};

export default function PriceHistoryDialog({
  open,
  onClose,
  materialId,
  vendorId,
  materialName,
  materialUnit = "unit",
}: PriceHistoryDialogProps) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>("chart");

  const { data: priceHistory = [], isLoading } = usePriceHistory(
    vendorId,
    materialId
  );

  // Transform data for chart
  const chartData = useMemo(() => {
    return priceHistory.map((record) => ({
      id: record.id,
      effective_date: record.recorded_date,
      price: record.price,
      change_percentage: undefined, // Will be calculated by chart component
      change_reason: undefined,
    }));
  }, [priceHistory]);

  // Calculate stats
  const stats = useMemo(() => {
    if (priceHistory.length === 0) {
      return {
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0,
        trend: { direction: "flat" as const, change: 0 },
      };
    }

    const prices = priceHistory.map((p) => p.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const trend = calculateTrend(
      priceHistory.map((p) => ({
        price: p.price,
        recorded_date: p.recorded_date,
      }))
    );

    return { avgPrice, minPrice, maxPrice, trend };
  }, [priceHistory]);

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h6" component="span">Price History: {materialName}</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading ? (
          <Stack spacing={2}>
            <Skeleton height={100} variant="rounded" />
            <Skeleton height={300} variant="rounded" />
          </Stack>
        ) : priceHistory.length === 0 ? (
          <Alert severity="info">
            No price history found for this material from this vendor.
          </Alert>
        ) : (
          <Stack spacing={2}>
            {/* View Mode Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tabs
                value={viewMode}
                onChange={(_, newValue) => setViewMode(newValue)}
                aria-label="price history view mode"
              >
                <Tab
                  value="chart"
                  label="Chart View"
                  icon={<ChartIcon />}
                  iconPosition="start"
                  sx={{ minHeight: 48 }}
                />
                <Tab
                  value="table"
                  label="Table View"
                  icon={<TableIcon />}
                  iconPosition="start"
                  sx={{ minHeight: 48 }}
                />
              </Tabs>
            </Box>

            {/* Chart View */}
            {viewMode === "chart" && (
              <Box>
                <PriceHistoryChart
                  data={chartData}
                  height={300}
                  showAverage
                  materialUnit={materialUnit}
                />
              </Box>
            )}

            {/* Table View */}
            {viewMode === "table" && (
              <>
                {/* Summary Stats */}
                <Box
                  sx={{
                    display: "flex",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary">
                      Average Price
                    </Typography>
                    <Typography variant="h6">
                      {formatCurrency(stats.avgPrice)}
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary">
                      Min Price
                    </Typography>
                    <Typography variant="h6" color="success.main">
                      {formatCurrency(stats.minPrice)}
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary">
                      Max Price
                    </Typography>
                    <Typography variant="h6" color="error.main">
                      {formatCurrency(stats.maxPrice)}
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary">
                      Trend
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {stats.trend.direction === "up" && (
                        <TrendingUpIcon color="error" fontSize="small" />
                      )}
                      {stats.trend.direction === "down" && (
                        <TrendingDownIcon color="success" fontSize="small" />
                      )}
                      {stats.trend.direction === "flat" && (
                        <TrendingFlatIcon color="disabled" fontSize="small" />
                      )}
                      <Typography
                        variant="h6"
                        color={
                          stats.trend.direction === "up"
                            ? "error.main"
                            : stats.trend.direction === "down"
                            ? "success.main"
                            : "text.primary"
                        }
                      >
                        {stats.trend.direction === "up"
                          ? `+${stats.trend.change.toFixed(1)}%`
                          : stats.trend.direction === "down"
                          ? `${stats.trend.change.toFixed(1)}%`
                          : "Stable"}
                      </Typography>
                    </Box>
                  </Paper>
                </Box>

                <Divider />

                {/* Price Records Table */}
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Transport</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell>Reference</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {priceHistory.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{formatDate(record.recorded_date)}</TableCell>
                          <TableCell align="right">
                            {formatCurrency(record.price)}
                          </TableCell>
                          <TableCell align="right">
                            {record.transport_cost
                              ? formatCurrency(record.transport_cost)
                              : "-"}
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(record.total_landed_cost)}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={
                                PRICE_SOURCE_LABELS[record.source as PriceSource] ||
                                record.source
                              }
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            {record.source_reference || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Total records */}
                <Typography variant="caption" color="text.secondary">
                  Showing {priceHistory.length} price records
                </Typography>
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
