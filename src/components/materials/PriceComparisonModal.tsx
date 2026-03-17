"use client";

import { useState, useMemo } from "react";
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
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Stack,
  Grid,
  Autocomplete,
  TextField,
  Tooltip,
  Divider,
} from "@mui/material";
import {
  Close as CloseIcon,
  EmojiEvents as TrophyIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  CompareArrows as CompareIcon,
  ShoppingCart as CartIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useMaterialVendors,
  useMaterialPriceHistory,
} from "@/hooks/queries/useVendorInventory";
import PriceHistoryChart from "./PriceHistoryChart";
import type {
  MaterialWithDetails,
  MaterialBrand,
  VendorInventoryWithDetails,
  PriceHistoryWithDetails,
} from "@/types/material.types";

interface PriceComparisonModalProps {
  open: boolean;
  onClose: () => void;
  material: MaterialWithDetails;
  onSelectVendor?: (vendorId: string, vendorName: string) => void;
}

// Format currency
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Get relative time
const getRelativeTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
};

export default function PriceComparisonModal({
  open,
  onClose,
  material,
  onSelectVendor,
}: PriceComparisonModalProps) {
  const isMobile = useIsMobile();
  const [selectedBrand, setSelectedBrand] = useState<MaterialBrand | null>(null);

  const { data: vendorInventory = [], isLoading: inventoryLoading } =
    useMaterialVendors(material.id);
  const { data: priceHistory = [], isLoading: historyLoading } =
    useMaterialPriceHistory(material.id);

  const isLoading = inventoryLoading || historyLoading;
  const brands = material.brands?.filter((b) => b.is_active) || [];

  // Filter by selected brand
  const filteredInventory = useMemo(() => {
    if (!selectedBrand) return vendorInventory;
    return vendorInventory.filter((v) => v.brand_id === selectedBrand.id);
  }, [vendorInventory, selectedBrand]);

  const filteredHistory = useMemo(() => {
    if (!selectedBrand) return priceHistory;
    return priceHistory.filter((p) => p.brand_id === selectedBrand.id);
  }, [priceHistory, selectedBrand]);

  // Transform for chart
  const chartData = useMemo(() => {
    return filteredHistory.map((record) => ({
      id: record.id,
      effective_date: record.recorded_date,
      price: record.price,
      vendor_name: record.vendor?.name,
    }));
  }, [filteredHistory]);

  // Find best price vendor
  const bestPriceVendor = useMemo(() => {
    if (filteredInventory.length === 0) return null;
    return filteredInventory.reduce((best, current) => {
      const bestPrice = best.total_landed_cost || best.current_price || Infinity;
      const currentPrice =
        current.total_landed_cost || current.current_price || Infinity;
      return currentPrice < bestPrice ? current : best;
    }, filteredInventory[0]);
  }, [filteredInventory]);

  // Calculate savings compared to average
  const priceStats = useMemo(() => {
    if (filteredInventory.length === 0) return null;

    const prices = filteredInventory
      .map((v) => v.total_landed_cost || v.current_price || 0)
      .filter((p) => p > 0);

    if (prices.length === 0) return null;

    const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const savingsPercent = avg > 0 ? ((avg - min) / avg) * 100 : 0;

    return { avg, min, max, savingsPercent };
  }, [filteredInventory]);

  // Vendor comparison data with price history stats
  const vendorComparison = useMemo(() => {
    return filteredInventory
      .map((inv) => {
        // Get price history for this vendor
        const vendorHistory = filteredHistory.filter(
          (p) => p.vendor_id === inv.vendor_id
        );

        // Calculate trend
        let trend = 0;
        let trendDirection: "up" | "down" | "flat" = "flat";
        if (vendorHistory.length >= 2) {
          const sorted = [...vendorHistory].sort(
            (a, b) =>
              new Date(a.recorded_date).getTime() -
              new Date(b.recorded_date).getTime()
          );
          const first = sorted[0].price;
          const last = sorted[sorted.length - 1].price;
          trend = first > 0 ? ((last - first) / first) * 100 : 0;
          trendDirection = trend > 2 ? "up" : trend < -2 ? "down" : "flat";
        }

        const isBest = bestPriceVendor?.id === inv.id;
        const savings =
          priceStats && priceStats.avg > 0
            ? ((priceStats.avg -
                (inv.total_landed_cost || inv.current_price || 0)) /
                priceStats.avg) *
              100
            : 0;

        return {
          ...inv,
          historyCount: vendorHistory.length,
          trend,
          trendDirection,
          isBest,
          savings,
        };
      })
      .sort((a, b) => {
        const aPrice = a.total_landed_cost || a.current_price || Infinity;
        const bPrice = b.total_landed_cost || b.current_price || Infinity;
        return aPrice - bPrice;
      });
  }, [filteredInventory, filteredHistory, bestPriceVendor, priceStats]);

  const handleSelectVendor = (vendorId: string, vendorName: string) => {
    if (onSelectVendor) {
      onSelectVendor(vendorId, vendorName);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="lg"
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CompareIcon color="primary" />
          <Typography component="span" variant="h6">
            Price Comparison: {material.name}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading ? (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={60} />
            <Skeleton variant="rounded" height={200} />
            <Skeleton variant="rounded" height={300} />
          </Stack>
        ) : vendorInventory.length === 0 ? (
          <Alert severity="info">
            No vendor pricing available for this material yet. Add vendors in
            the &quot;Brands &amp; Pricing&quot; tab.
          </Alert>
        ) : (
          <Stack spacing={3}>
            {/* Brand Filter */}
            {brands.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Autocomplete
                      options={[
                        { id: "", brand_name: "All Brands" } as MaterialBrand,
                        ...brands,
                      ]}
                      getOptionLabel={(brand) =>
                        brand.id === ""
                          ? "All Brands"
                          : brand.variant_name
                          ? `${brand.brand_name} ${brand.variant_name}`
                          : brand.brand_name
                      }
                      value={selectedBrand}
                      onChange={(_, value) => {
                        setSelectedBrand(value?.id === "" ? null : value);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Filter by Brand"
                          size="small"
                        />
                      )}
                      isOptionEqualToValue={(option, value) =>
                        option.id === value?.id
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 8 }}>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {brands.slice(0, 5).map((brand) => (
                        <Chip
                          key={brand.id}
                          label={brand.brand_name}
                          size="small"
                          variant={
                            selectedBrand?.id === brand.id
                              ? "filled"
                              : "outlined"
                          }
                          color={
                            selectedBrand?.id === brand.id
                              ? "primary"
                              : "default"
                          }
                          onClick={() =>
                            setSelectedBrand(
                              selectedBrand?.id === brand.id ? null : brand
                            )
                          }
                        />
                      ))}
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            )}

            {/* Stats Summary */}
            {priceStats && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      textAlign: "center",
                      bgcolor: "success.50",
                      borderColor: "success.main",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Best Price
                    </Typography>
                    <Typography
                      variant="h5"
                      fontWeight={600}
                      color="success.main"
                    >
                      {formatCurrency(priceStats.min)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      /{material.unit}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                      Average Price
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {formatCurrency(priceStats.avg)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      /{material.unit}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      textAlign: "center",
                      bgcolor: "error.50",
                      borderColor: "error.main",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Highest Price
                    </Typography>
                    <Typography variant="h5" fontWeight={600} color="error.main">
                      {formatCurrency(priceStats.max)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      /{material.unit}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      textAlign: "center",
                      bgcolor: "primary.50",
                      borderColor: "primary.main",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Potential Savings
                    </Typography>
                    <Typography
                      variant="h5"
                      fontWeight={600}
                      color="primary.main"
                    >
                      {priceStats.savingsPercent.toFixed(1)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      vs average
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {/* Price Trend Chart */}
            {chartData.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                  Price Trend (All Vendors)
                </Typography>
                <PriceHistoryChart
                  data={chartData}
                  height={200}
                  showAverage
                  materialUnit={material.unit}
                />
              </Paper>
            )}

            {/* Vendor Comparison Table */}
            <Paper variant="outlined">
              <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Vendor Price Comparison ({vendorComparison.length} vendors)
                </Typography>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell></TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell>Brand</TableCell>
                    <TableCell align="right">Base Price</TableCell>
                    <TableCell align="right">Landed Cost</TableCell>
                    <TableCell>Trend</TableCell>
                    <TableCell>Last Updated</TableCell>
                    {onSelectVendor && <TableCell align="center">Action</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vendorComparison.map((vendor, index) => (
                    <TableRow
                      key={vendor.id}
                      sx={{
                        bgcolor: vendor.isBest ? "success.50" : undefined,
                      }}
                    >
                      <TableCell>
                        {vendor.isBest && (
                          <Tooltip title="Best Price">
                            <TrophyIcon fontSize="small" color="warning" />
                          </Tooltip>
                        )}
                        {index === 0 && !vendor.isBest && (
                          <Typography variant="caption" color="text.secondary">
                            #{index + 1}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={vendor.isBest ? 600 : 400}
                        >
                          {vendor.vendor?.name}
                        </Typography>
                        {vendor.historyCount > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            {vendor.historyCount} price records
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {vendor.brand ? (
                          <Chip
                            label={
                              vendor.brand.variant_name
                                ? `${vendor.brand.brand_name} ${vendor.brand.variant_name}`
                                : vendor.brand.brand_name
                            }
                            size="small"
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Generic
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {formatCurrency(vendor.current_price)}
                          {vendor.price_includes_gst && (
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                            >
                              {" "}
                              (incl. GST)
                            </Typography>
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight={vendor.isBest ? 600 : 400}
                          color={vendor.isBest ? "success.main" : "inherit"}
                        >
                          {formatCurrency(
                            vendor.total_landed_cost || vendor.current_price
                          )}
                        </Typography>
                        {vendor.savings > 0 && (
                          <Typography
                            variant="caption"
                            color="success.main"
                            display="block"
                          >
                            Save {vendor.savings.toFixed(1)}%
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                        >
                          {vendor.trendDirection === "up" && (
                            <TrendingUpIcon fontSize="small" color="error" />
                          )}
                          {vendor.trendDirection === "down" && (
                            <TrendingDownIcon fontSize="small" color="success" />
                          )}
                          {vendor.trendDirection === "flat" && (
                            <TrendingFlatIcon fontSize="small" color="disabled" />
                          )}
                          <Typography
                            variant="caption"
                            color={
                              vendor.trendDirection === "up"
                                ? "error.main"
                                : vendor.trendDirection === "down"
                                ? "success.main"
                                : "text.secondary"
                            }
                          >
                            {vendor.trend > 0 ? "+" : ""}
                            {vendor.trend.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {getRelativeTime(vendor.last_price_update)}
                        </Typography>
                      </TableCell>
                      {onSelectVendor && (
                        <TableCell align="center">
                          <Button
                            size="small"
                            variant={vendor.isBest ? "contained" : "outlined"}
                            color={vendor.isBest ? "success" : "primary"}
                            startIcon={<CartIcon />}
                            onClick={() =>
                              handleSelectVendor(
                                vendor.vendor_id,
                                vendor.vendor?.name || ""
                              )
                            }
                          >
                            Select
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
