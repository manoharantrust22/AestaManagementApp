"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Box, Grid, Skeleton, Alert } from "@mui/material";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { TradeCard } from "@/components/trades/TradeCard";
import { TradesEmptyState } from "@/components/trades/TradesEmptyState";
import PageHeader from "@/components/layout/PageHeader";

export default function TradesPage() {
  const router = useRouter();
  const { selectedSite } = useSelectedSite();
  const { data: trades, isLoading, error } = useSiteTrades(selectedSite?.id);

  // Bridge: route to existing /site/subcontracts page until Plan 02 ships
  // the dedicated trade workspace.
  const handleContractClick = (contractId: string) => {
    router.push(`/site/subcontracts?contractId=${contractId}`);
  };

  const handleAddClick = (_tradeCategoryId: string) => {
    router.push(`/site/subcontracts?action=new`);
  };

  if (!selectedSite) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          Select a site from the top bar to view trades.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      <PageHeader
        title="Trades"
        subtitle={`Per-trade workspaces for ${selectedSite.name}`}
        showBack={false}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load trades:{" "}
          {error instanceof Error ? error.message : String(error)}
        </Alert>
      )}

      {isLoading && (
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Skeleton variant="rectangular" height={180} />
            </Grid>
          ))}
        </Grid>
      )}

      {!isLoading && trades && trades.length === 0 && <TradesEmptyState />}

      {!isLoading && trades && trades.length > 0 && (
        <Grid container spacing={2}>
          {trades.map((trade) => (
            <Grid key={trade.category.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <TradeCard
                trade={trade}
                onContractClick={handleContractClick}
                onAddClick={handleAddClick}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
