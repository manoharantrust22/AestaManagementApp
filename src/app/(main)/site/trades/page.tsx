"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Box, Alert } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useSiteTrades,
  UNCATEGORIZED_TRADE_ID,
  UNCATEGORIZED_CATEGORY,
} from "@/hooks/queries/useTrades";
import {
  useSiteTradeReconciliations,
  useSiteTradeActivity,
} from "@/hooks/queries/useTradeReconciliations";
import { useSiteWorkStages } from "@/hooks/queries/useWorkStages";
import { WorkspaceLayout } from "@/components/workforce/WorkspaceLayout";
import { QuickCreateContractDialog } from "@/components/trades/QuickCreateContractDialog";
import { useTaskWorkPackages } from "@/hooks/queries/useTaskWorkPackages";
import { useSiteTaskWorkProfitability } from "@/hooks/queries/useTaskWorkProfitability";
import TaskWorkDetailDrawer from "@/components/task-work/TaskWorkDetailDrawer";
import TaskWorkPackageDialog from "@/components/task-work/TaskWorkPackageDialog";
import type {
  TaskWorkPackage,
  TaskWorkPackageWithMeta,
} from "@/types/taskWork.types";

export default function TradesPage() {
  const queryClient = useQueryClient();
  const { selectedSite } = useSelectedSite();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);
  const siteId = selectedSite?.id;

  const { data: trades, isLoading } = useSiteTrades(siteId);
  const { data: reconciliations } = useSiteTradeReconciliations(siteId);
  const { data: activity } = useSiteTradeActivity(siteId);
  const { data: stages } = useSiteWorkStages(siteId);
  const { data: taskWorkPackages = [] } = useTaskWorkPackages(siteId, "all");
  const { data: packageProfitability = [] } = useSiteTaskWorkProfitability(siteId);

  // paid-to-date per package (Σ non-deleted task_work_payments, via v_task_work_profitability).
  const paidByPackage = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of packageProfitability) map.set(row.package_id, Number(row.paid ?? 0));
    return map;
  }, [packageProfitability]);

  // Group legacy fixed-price packages under their trade (labor_category_id), with their
  // paid-to-date merged on so the workforce rollup can fold them into the parent contract.
  // Packages with no work type land in the "Other / Uncategorized" node (same
  // key the trades hook uses for trade-less contracts) so they stay visible and
  // openable instead of being silently dropped.
  const packagesByTrade = useMemo(() => {
    const map = new Map<string, TaskWorkPackageWithMeta[]>();
    for (const p of taskWorkPackages) {
      const key = p.labor_category_id ?? UNCATEGORIZED_TRADE_ID;
      const arr = map.get(key) ?? [];
      arr.push({ ...p, paid: paidByPackage.get(p.id) ?? 0 });
      map.set(key, arr);
    }
    return map;
  }, [taskWorkPackages, paidByPackage]);

  // The trades hook only emits the "Other / Uncategorized" node when a *contract*
  // has no trade. If only a fixed-price package is uncategorized, add an empty
  // node so that package still has a home to render under.
  const tradesForModel = useMemo(() => {
    const base = trades ?? [];
    const needsUncat =
      packagesByTrade.has(UNCATEGORIZED_TRADE_ID) &&
      !base.some((t) => t.category.id === UNCATEGORIZED_TRADE_ID);
    return needsUncat
      ? [...base, { category: UNCATEGORIZED_CATEGORY, contracts: [] }]
      : base;
  }, [trades, packagesByTrade]);

  // Lookup: tradeCategoryId -> tradeName, for the create dialog.
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trades ?? []) map.set(t.category.id, t.category.name);
    return map;
  }, [trades]);

  // Create dialog ctx. `parentSubcontractId` nests the new row under a Contract/Section
  // (null = a fresh top-level Contract); `tier` is what we're creating.
  const [createCtx, setCreateCtx] = useState<{
    tradeCategoryId: string;
    tradeName: string;
    parentSubcontractId: string | null;
    tier: "contract" | "section" | "task";
    initialStatus: "draft" | "active";
  } | null>(null);

  // Legacy task-work package detail drawer + edit dialog.
  const [detailPkg, setDetailPkg] = useState<TaskWorkPackageWithMeta | null>(null);
  const [editingPkg, setEditingPkg] = useState<TaskWorkPackage | null>(null);
  const [pkgDialogOpen, setPkgDialogOpen] = useState(false);
  // When a package is created from a row's "+", the originating parent so it
  // auto-nests (the dialog hides its picker). Null = opened from the top "Add".
  const [pkgParentId, setPkgParentId] = useState<string | null>(null);

  // Cross-page sync: refresh when /site/subcontracts (or any writer) broadcasts.
  useEffect(() => {
    if (!siteId || typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("subcontracts-changed");
    bc.onmessage = (e) => {
      const msgSiteId = (e.data as { siteId?: string } | undefined)?.siteId;
      if (msgSiteId && msgSiteId !== siteId) return;
      queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] });
      queryClient.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] });
      queryClient.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] });
    };
    return () => bc.close();
  }, [siteId, queryClient]);

  const handleAddTaskWork = (
    tradeCategoryId: string,
    ctx: { parentId: string | null; tier: "contract" | "section" | "task" },
    initialStatus: "draft" | "active" = "active"
  ) => {
    if (!siteId) return;
    setCreateCtx({
      tradeCategoryId,
      tradeName: categoryNameById.get(tradeCategoryId) ?? "Contract",
      parentSubcontractId: ctx.parentId,
      tier: ctx.tier,
      initialStatus,
    });
  };

  if (!selectedSite || !siteId) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">Select a site from the top bar to view the workforce.</Alert>
      </Box>
    );
  }

  return (
    <>
      <WorkspaceLayout
        siteId={siteId}
        siteName={selectedSite.name}
        trades={tradesForModel}
        reconciliations={reconciliations}
        activity={activity}
        stages={stages}
        loading={isLoading}
        canEdit={canEdit}
        packagesByTrade={packagesByTrade}
        onOpenPackage={(pkg) => setDetailPkg(pkg)}
        onAddTaskWork={handleAddTaskWork}
      />

      {createCtx && (
        <QuickCreateContractDialog
          open={!!createCtx}
          onClose={() => setCreateCtx(null)}
          onCreated={() => {
            // New task work appears via query invalidation.
          }}
          siteId={siteId}
          tradeCategoryId={createCtx.tradeCategoryId}
          tradeName={createCtx.tradeName}
          parentSubcontractId={createCtx.parentSubcontractId}
          tier={createCtx.tier}
          initialStatus={createCtx.initialStatus}
          onCreatePackage={() => {
            // Carry the originating parent so the package nests under it (the
            // dialog hides its picker). Capture before clearing createCtx.
            setPkgParentId(createCtx.parentSubcontractId);
            setCreateCtx(null);
            setEditingPkg(null);
            setPkgDialogOpen(true);
          }}
        />
      )}

      <TaskWorkDetailDrawer
        open={!!detailPkg}
        onClose={() => setDetailPkg(null)}
        pkg={detailPkg}
        onEdit={(p) => {
          setDetailPkg(null);
          setEditingPkg(p);
          setPkgDialogOpen(true);
        }}
      />

      <TaskWorkPackageDialog
        open={pkgDialogOpen}
        onClose={() => {
          setPkgDialogOpen(false);
          setPkgParentId(null);
        }}
        siteId={siteId}
        editing={editingPkg}
        parentSubcontractId={editingPkg ? null : pkgParentId}
      />
    </>
  );
}
