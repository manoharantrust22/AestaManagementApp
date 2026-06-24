"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import HomeRounded from "@mui/icons-material/HomeRounded";
import type { TradeNode } from "@/lib/workforce/workspaceModel";
import { moveTargetsForNode } from "@/lib/workforce/moveTargets";
import { tierMeta, wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { ResponsiveSheet } from "./ResponsiveSheet";

/**
 * "Move to…" destination picker — the reliable, cross-device path for re-parenting a
 * node (the desktop drag-and-drop is a delight layer on top of the same move). Lists every
 * valid destination in the trade (excluding the node's own subtree and its current parent),
 * plus a "Top level" option. Picking one re-points the node's parent; tier re-labels itself.
 */
export function MoveNodeSheet({
  open,
  onClose,
  trade,
  nodeId,
  nodeTitle,
  currentParentId,
  onMove,
}: {
  open: boolean;
  onClose: () => void;
  trade: TradeNode | null;
  nodeId: string | null;
  nodeTitle: string;
  currentParentId: string | null;
  /** newParentId = null → make it a top-level Contract. */
  onMove: (newParentId: string | null) => void;
}) {
  const targets = useMemo(
    () => (trade && nodeId ? moveTargetsForNode(trade, nodeId) : []),
    [trade, nodeId]
  );
  const canTopLevel = currentParentId !== null;

  const pick = (newParentId: string | null) => {
    onMove(newParentId);
    onClose();
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title="Move to…"
      subtitle={nodeTitle ? `Re-home “${nodeTitle}” under another contract or section` : undefined}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, py: 1 }}>
        {canTopLevel && (
          <Box
            onClick={() => pick(null)}
            sx={rowSx}
          >
            <Box sx={{ ...iconBoxSx, bgcolor: "#eef2f7" }}>
              <HomeRounded sx={{ fontSize: 18, color: wsColors.ink2 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: wsColors.ink }}>
                Top level
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: wsColors.muted }}>
                Make it a standalone contract in this trade
              </Typography>
            </Box>
          </Box>
        )}

        {targets.length === 0 && !canTopLevel ? (
          <Typography sx={{ fontSize: 12.5, color: wsColors.muted, px: 1, py: 2, textAlign: "center" }}>
            Nowhere to move this — it&apos;s the only node in the trade.
          </Typography>
        ) : (
          targets.map((tgt) => {
            const m = tierMeta[tgt.tier];
            const Icon = m.icon;
            return (
              <Box
                key={tgt.id}
                onClick={() => pick(tgt.id)}
                sx={{ ...rowSx, pl: `${8 + Math.min(tgt.depth, 4) * 16}px` }}
              >
                <Box sx={{ ...iconBoxSx, bgcolor: m.bg }}>
                  <Icon sx={{ fontSize: 18, color: m.color }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: wsColors.ink }}>
                    {tgt.title}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
                    {m.label} · {tgt.who}
                  </Typography>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </ResponsiveSheet>
  );
}

const rowSx = {
  display: "flex",
  alignItems: "center",
  gap: 1.25,
  px: 1,
  py: 0.9,
  borderRadius: `${wsRadius.row}px`,
  cursor: "pointer",
  "&:hover": { bgcolor: wsColors.canvas },
} as const;

const iconBoxSx = {
  width: 34,
  height: 34,
  borderRadius: `${wsRadius.avatar}px`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;
