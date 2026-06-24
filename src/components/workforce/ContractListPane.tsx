"use client";

import { useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  InputBase,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import Search from "@mui/icons-material/Search";
import type { WorkspaceModel } from "@/lib/workforce/workspaceModel";
import {
  statusBucket,
  STATUS_TABS,
  type StatusTab,
} from "@/lib/workforce/statusTabs";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import type { TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import { SiteSummaryTiles } from "./SiteSummaryTiles";
import { ContractTree, type AddTaskWork } from "./ContractTree";

export function ContractListPane({
  siteId,
  siteName,
  model,
  openTrades,
  onToggleTrade,
  selectedTaskId,
  onSelectTask,
  query,
  onQueryChange,
  activeTab,
  onTabChange,
  packagesByTrade,
  onOpenPackage,
  onAddTaskWork,
  onMoveNode,
  onAddClick,
  canEdit,
}: {
  siteId: string;
  siteName: string;
  model: WorkspaceModel;
  openTrades: Record<string, boolean>;
  onToggleTrade: (categoryId: string) => void;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  activeTab: StatusTab;
  onTabChange: (tab: StatusTab) => void;
  packagesByTrade: Map<string, TaskWorkPackageWithMeta[]>;
  onOpenPackage: (pkg: TaskWorkPackageWithMeta) => void;
  onAddTaskWork: AddTaskWork;
  /** Re-parent a node (newParentId = null → top-level). */
  onMoveNode?: (nodeId: string, newParentId: string | null) => void;
  /** Opens the trade-picker Add menu (owned by the layout, shared with the mobile FAB). */
  onAddClick: (anchorEl: HTMLElement) => void;
  canEdit: boolean;
}) {
  // Per-tab item counts (contracts + packages) for the segmented control badges.
  const tabCounts = useMemo(() => {
    const c: Record<StatusTab, number> = { future: 0, active: 0, completed: 0 };
    for (const node of model.trades)
      for (const t of node.tasks) {
        const b = statusBucket(t.status);
        if (b) c[b] += 1;
      }
    for (const arr of packagesByTrade.values())
      for (const p of arr) {
        const b = statusBucket(p.status);
        if (b) c[b] += 1;
      }
    return c;
  }, [model, packagesByTrade]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: wsColors.surface,
        borderRight: { md: `1px solid ${wsColors.hairline}` },
        minWidth: 0,
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, pt: 1.75, pb: 1.25, borderBottom: `1px solid ${wsColors.hairline2}` }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: wsColors.muted, letterSpacing: ".02em" }}>
          Workforce › Contracts
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mt: 0.25 }}>
          <Typography sx={{ fontSize: 19, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.02em" }} noWrap>
            {siteName}
          </Typography>
          {canEdit && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={(e) => onAddClick(e.currentTarget)}
              disableElevation
              sx={{
                bgcolor: wsColors.primary,
                borderRadius: `${wsRadius.input}px`,
                textTransform: "none",
                fontWeight: 700,
                boxShadow: wsShadow.raised,
                "&:hover": { bgcolor: "#2a60d6" },
              }}
            >
              Add
            </Button>
          )}
        </Box>

        <Box sx={{ mt: 1.25 }}>
          <SiteSummaryTiles
            model={model}
            packagesByTrade={packagesByTrade}
            activeTab={activeTab}
          />
        </Box>

        {/* Future / Active / Completed segmented control. */}
        <Box
          sx={{
            mt: 1.25,
            display: "flex",
            gap: 0.5,
            bgcolor: wsColors.canvas,
            border: `1px solid ${wsColors.hairline}`,
            borderRadius: `${wsRadius.input}px`,
            p: 0.4,
          }}
        >
          {STATUS_TABS.map((t) => {
            const sel = t.key === activeTab;
            return (
              <Box
                key={t.key}
                onClick={() => onTabChange(t.key)}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.6,
                  cursor: "pointer",
                  py: 0.55,
                  borderRadius: `${wsRadius.input - 3}px`,
                  bgcolor: sel ? wsColors.surface : "transparent",
                  boxShadow: sel ? wsShadow.card : "none",
                  color: sel ? wsColors.primary : wsColors.muted,
                  fontWeight: sel ? 800 : 700,
                  fontSize: 12.5,
                  transition: "background-color .15s, color .15s",
                  "&:hover": { color: sel ? wsColors.primary : wsColors.ink2 },
                }}
              >
                <span>{t.label}</span>
                <Box
                  component="span"
                  sx={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: sel ? wsColors.primary : wsColors.muted2,
                    bgcolor: sel ? wsColors.primaryTint : wsColors.hairline2,
                    borderRadius: 999,
                    px: 0.55,
                    minWidth: 16,
                    textAlign: "center",
                  }}
                >
                  {tabCounts[t.key]}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box
          sx={{
            mt: 1.25,
            display: "flex",
            alignItems: "center",
            gap: 1,
            bgcolor: wsColors.canvas,
            border: `1px solid ${wsColors.hairline}`,
            borderRadius: `${wsRadius.input}px`,
            px: 1.25,
            py: 0.75,
          }}
        >
          <Search sx={{ fontSize: 18, color: wsColors.muted }} />
          <InputBase
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search task work, mesthri…"
            sx={{ flex: 1, fontSize: 13.5, color: wsColors.ink }}
          />
        </Box>
      </Box>

      {/* Tree (scrolls) */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 1, py: 1 }}>
        <ContractTree
          siteId={siteId}
          canEdit={canEdit}
          trades={model.trades}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          openTrades={openTrades}
          onToggleTrade={onToggleTrade}
          query={query}
          activeTab={activeTab}
          packagesByTrade={packagesByTrade}
          onOpenPackage={onOpenPackage}
          onAddTaskWork={onAddTaskWork}
          onMoveNode={onMoveNode}
        />
      </Box>
    </Box>
  );
}
