"use client";

import {
  Box,
  Typography,
  Button,
  InputBase,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import Search from "@mui/icons-material/Search";
import type { WorkspaceModel } from "@/lib/workforce/workspaceModel";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import type { TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import { SiteSummaryTiles } from "./SiteSummaryTiles";
import { ContractTree } from "./ContractTree";

export function ContractListPane({
  siteId,
  siteName,
  model,
  openTrades,
  onToggleTrade,
  selectedTaskId,
  onSelectTask,
  selectedGroupKey,
  onSelectGroup,
  query,
  onQueryChange,
  packagesByTrade,
  onOpenPackage,
  onAddTaskWork,
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
  selectedGroupKey: string | null;
  onSelectGroup: (key: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  packagesByTrade: Map<string, TaskWorkPackageWithMeta[]>;
  onOpenPackage: (pkg: TaskWorkPackageWithMeta) => void;
  onAddTaskWork: (tradeCategoryId: string, stageId: string | null) => void;
  /** Opens the trade-picker Add menu (owned by the layout, shared with the mobile FAB). */
  onAddClick: (anchorEl: HTMLElement) => void;
  canEdit: boolean;
}) {
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
          <SiteSummaryTiles site={model.site} />
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
          selectedGroupKey={selectedGroupKey}
          onSelectGroup={onSelectGroup}
          openTrades={openTrades}
          onToggleTrade={onToggleTrade}
          query={query}
          packagesByTrade={packagesByTrade}
          onOpenPackage={onOpenPackage}
          onAddTaskWork={onAddTaskWork}
        />
      </Box>
    </Box>
  );
}
