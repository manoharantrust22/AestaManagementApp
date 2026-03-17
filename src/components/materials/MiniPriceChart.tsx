"use client";

import { useMemo } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import PriceHistoryChart from "./PriceHistoryChart";
import { useMaterialPriceHistory } from "@/hooks/queries/useVendorInventory";

interface MiniPriceChartProps {
  materialId: string;
  materialName?: string;
  enabled?: boolean;
}

export default function MiniPriceChart({
  materialId,
  materialName,
  enabled = true,
}: MiniPriceChartProps) {
  const { data: priceHistory, isLoading } = useMaterialPriceHistory(
    enabled ? materialId : undefined
  );

  // Transform price_history data to PriceDataPoint format for PriceHistoryChart
  const chartData = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return [];

    return priceHistory.map((record: any) => ({
      id: record.id,
      effective_date: record.recorded_date,
      price: record.price,
      vendor_name: record.vendor?.name,
      change_percentage: record.change_percentage,
      change_reason: record.change_reason_text,
    }));
  }, [priceHistory]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (chartData.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: "center" }}>
        <Typography variant="caption" color="text.secondary">
          No price history available for {materialName || "this material"}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 1 }}>
      {materialName && (
        <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
          Price Trend: {materialName}
        </Typography>
      )}
      <PriceHistoryChart
        data={chartData}
        height={150}
        showAverage={true}
        materialUnit="kg"
      />
    </Box>
  );
}
