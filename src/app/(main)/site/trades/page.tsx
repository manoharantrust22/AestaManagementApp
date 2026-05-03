"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Grid,
  Skeleton,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useSelectedSite } from "@/contexts/SiteContext";
import { createClient } from "@/lib/supabase/client";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import {
  useSiteTradeReconciliations,
  useSiteTradeActivity,
} from "@/hooks/queries/useTradeReconciliations";
import { TradeCard } from "@/components/trades/TradeCard";
import { TradesEmptyState } from "@/components/trades/TradesEmptyState";
import { QuickCreateContractDialog } from "@/components/trades/QuickCreateContractDialog";
import PageHeader from "@/components/layout/PageHeader";

export default function TradesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = createClient();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;

  const { data: trades, isLoading, error } = useSiteTrades(siteId);
  const { data: reconciliations } = useSiteTradeReconciliations(siteId);
  const { data: activity } = useSiteTradeActivity(siteId);

  // Lookup map: tradeCategoryId -> tradeName, used by the create dialog
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trades ?? []) map.set(t.category.id, t.category.name);
    return map;
  }, [trades]);

  const [createCtx, setCreateCtx] = useState<{
    tradeCategoryId: string;
    tradeName: string;
  } | null>(null);

  // Single-expanded state across all trade cards
  const [expandedContractId, setExpandedContractId] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // Cross-page sync: invalidate when /site/subcontracts (or any other writer)
  // posts on the subcontracts-changed BroadcastChannel.
  useEffect(() => {
    if (!siteId || typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("subcontracts-changed");
    bc.onmessage = (e) => {
      // Optional siteId match — invalidate either way to be safe with multi-tab edits
      const msgSiteId = (e.data as { siteId?: string } | undefined)?.siteId;
      if (msgSiteId && msgSiteId !== siteId) return;
      queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] });
      queryClient.invalidateQueries({
        queryKey: ["trade-reconciliations", "site", siteId],
      });
      queryClient.invalidateQueries({
        queryKey: ["trade-activity", "site", siteId],
      });
    };
    return () => bc.close();
  }, [siteId, queryClient]);

  // Click on contract row: toggle expand/collapse in-place. Power-users can
  // still open the full Subcontracts page via the 3-dot menu's "Open in
  // Subcontracts page" action (handled by handleContractView below).
  const handleContractClick = (contractId: string) => {
    setExpandedContractId((curr) => (curr === contractId ? null : contractId));
  };

  const handleAddClick = (tradeCategoryId: string) => {
    if (!siteId) return;
    const tradeName = categoryNameById.get(tradeCategoryId) ?? "Trade";
    setCreateCtx({ tradeCategoryId, tradeName });
  };

  const handleContractView = (contractId: string) => {
    router.push(`/site/subcontracts?contractId=${contractId}`);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !siteId) return;
    setDeleting(true);
    try {
      const result = await (supabase.from("subcontracts") as any)
        .delete()
        .eq("id", pendingDelete);
      if (result.error) throw result.error;

      // Invalidate + broadcast so /site/subcontracts also refreshes if open
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
        queryClient.invalidateQueries({
          queryKey: ["trade-reconciliations", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-activity", "site", siteId],
        }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, at: Date.now() });
        bc.close();
      }

      setSnackbar({
        open: true,
        message: "Contract deleted",
        severity: "success",
      });
      setPendingDelete(null);
    } catch (e: any) {
      setSnackbar({
        open: true,
        message: `Delete failed: ${e.message ?? String(e)}`,
        severity: "error",
      });
    } finally {
      setDeleting(false);
    }
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
                reconciliations={reconciliations}
                activity={activity}
                expandedContractId={expandedContractId}
                onContractClick={handleContractClick}
                onAddClick={handleAddClick}
                onContractView={handleContractView}
                onContractDelete={(id) => setPendingDelete(id)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {createCtx && siteId && (
        <QuickCreateContractDialog
          open={!!createCtx}
          onClose={() => setCreateCtx(null)}
          onCreated={(newId) => {
            setSnackbar({
              open: true,
              message: "Contract created",
              severity: "success",
            });
            // Stay on /site/trades — the new card appears via invalidation.
            // Power users can click it to open /site/subcontracts for full edit.
            void newId;
          }}
          siteId={siteId}
          tradeCategoryId={createCtx.tradeCategoryId}
          tradeName={createCtx.tradeName}
        />
      )}

      <Dialog
        open={!!pendingDelete}
        onClose={deleting ? undefined : () => setPendingDelete(null)}
      >
        <DialogTitle>Delete this contract?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently removes the subcontract row. Attendance and
            settlement history that referenced this contract will be left in
            place but will lose their contract link. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
