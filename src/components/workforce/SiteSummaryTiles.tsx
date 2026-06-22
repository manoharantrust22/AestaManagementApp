"use client";

import { Box, Typography } from "@mui/material";
import type { WorkspaceModel } from "@/lib/workforce/workspaceModel";
import { statusBucket, type StatusTab } from "@/lib/workforce/statusTabs";
import type { TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCompactINR } from "@/lib/formatters";

const AT_RISK_AMBER_THRESHOLD = 50000;

function Tile({
  label,
  value,
  valueColor,
  bg,
  sub,
}: {
  label: string;
  value: string;
  valueColor: string;
  bg?: string;
  sub?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        bgcolor: bg ?? wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.row}px`,
        px: 1.25,
        py: 1,
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: wsColors.muted,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 16.5,
          fontWeight: 800,
          letterSpacing: "-.02em",
          color: valueColor,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.25,
        }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: 10.5, color: wsColors.muted, lineHeight: 1.2 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Site-level tiles above the contract tree, scoped to the active status tab.
 *  - Active   → Paid · Work done · At risk (the live exposure view).
 *  - Completed→ Completed value · Paid · Items.
 *  - Future   → Planned value · Paid · Items.
 *
 * All money figures use `model.siteByTab` (de-duped — a parent counts once) plus the
 * lump-sum packages that fall in the same tab.
 */
export function SiteSummaryTiles({
  model,
  packagesByTrade,
  activeTab,
}: {
  model: WorkspaceModel;
  packagesByTrade: Map<string, TaskWorkPackageWithMeta[]>;
  activeTab: StatusTab;
}) {
  const r = model.siteByTab[activeTab];

  // Tab-scoped package totals + item count (contracts in this tab + packages in it).
  let pkgValue = 0;
  let itemCount = 0;
  for (const node of model.trades)
    for (const t of node.tasks) if (statusBucket(t.status) === activeTab) itemCount += 1;
  for (const arr of packagesByTrade.values())
    for (const p of arr)
      if (statusBucket(p.status) === activeTab) {
        pkgValue += Number(p.total_value ?? 0);
        itemCount += 1;
      }

  if (activeTab === "active") {
    const atRiskHigh = r.atRisk > AT_RISK_AMBER_THRESHOLD;
    return (
      <Box sx={{ display: "flex", gap: 1 }}>
        <Tile label="Paid" value={formatCompactINR(r.paid)} valueColor={wsColors.primary} />
        <Tile
          label="Work done"
          value={formatCompactINR(r.workValue)}
          valueColor={wsColors.ink}
          sub={r.untrackedCount > 0 ? `${r.untrackedCount} not tracked` : undefined}
        />
        <Tile
          label="At risk"
          value={formatCompactINR(r.atRisk)}
          valueColor={atRiskHigh ? wsColors.amber : wsColors.green}
          bg={atRiskHigh ? wsColors.amberBg : wsColors.greenBg}
        />
      </Box>
    );
  }

  const isCompleted = activeTab === "completed";
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Tile
        label={isCompleted ? "Completed value" : "Planned value"}
        value={formatCompactINR(r.quoted + pkgValue)}
        valueColor={isCompleted ? wsColors.green : wsColors.ink}
        bg={isCompleted ? wsColors.greenBg : undefined}
      />
      <Tile label="Paid" value={formatCompactINR(r.paid)} valueColor={wsColors.primary} />
      <Tile label="Items" value={String(itemCount)} valueColor={wsColors.ink} />
    </Box>
  );
}
