"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Description as ContractIcon,
  ExpandMore,
  ExpandLess,
  ChevronRight,
} from "@mui/icons-material";
import LaborGroupCard from "./LaborGroupCard";
import BuildingGroupCard from "./BuildingGroupCard";
import {
  groupExpenseBreakdown,
  formatINR,
  type GroupedBreakdown,
} from "@/lib/utils/expenseGrouping";
import { type ExpenseBreakdown } from "@/lib/utils/expenseBreakdown";
import { type ExpenseGroup } from "@/hooks/queries/useExpensesData";
import { type SubcontractTotals } from "@/lib/services/subcontractService";

interface Props {
  total: number;
  totalCount: number;
  breakdown: ExpenseBreakdown;
  group: ExpenseGroup;
  activeTypes: string[];
  onSelectGroup: (group: ExpenseGroup) => void;
  onSelectTypes: (types: string[]) => void;
  /** Pre-loaded subcontract totals for the inline summary, or null if not yet loaded. */
  subcontracts: SubcontractTotals[] | null;
  /** Triggers the lazy load + opens the drawer. */
  onOpenSubcontracts: () => void;
  subcontractsLoading?: boolean;
  /** Persisted collapse key in localStorage. */
  storageKey?: string;
}

export default function ExpensesSummaryBand({
  total,
  totalCount,
  breakdown,
  group,
  activeTypes,
  onSelectGroup,
  onSelectTypes,
  subcontracts,
  onOpenSubcontracts,
  subcontractsLoading,
  storageKey = "expenses_summary_band_collapsed",
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setCollapsed(true);
    } catch {
      // localStorage may be unavailable (incognito, server) — fail open
    }
  }, [storageKey]);

  const setCollapsedAndPersist = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  const grouped: GroupedBreakdown = groupExpenseBreakdown(breakdown);

  const subcontractValue = subcontracts?.reduce((s, sc) => s + sc.totalValue, 0) ?? 0;
  const subcontractPaid = subcontracts?.reduce((s, sc) => s + sc.totalPaid, 0) ?? 0;
  const subcontractBalance = subcontracts?.reduce((s, sc) => s + sc.balance, 0) ?? 0;

  return (
    <Box
      sx={{
        flexShrink: 0,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {/* Compact header row: total + collapse + subcontracts entry point */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          px: { xs: 2, md: 2.5 },
          py: 1.25,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, minWidth: 0, flexWrap: "wrap" }}>
          <Typography variant="h5" fontWeight={700} sx={{ fontFeatureSettings: "'tnum'", lineHeight: 1.1 }}>
            {formatINR(total)}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600 }}
          >
            Total · {totalCount} records
          </Typography>
          {collapsed ? (
            <Box sx={{ display: "flex", gap: 1.25, alignItems: "baseline", color: "text.secondary" }}>
              <Typography variant="caption" sx={{ fontSize: 11.5 }}>
                Labor <strong style={{ fontFeatureSettings: "'tnum'" }}>{formatINR(grouped.laborTotal.amount)}</strong>
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 11.5 }}>
                Building <strong style={{ fontFeatureSettings: "'tnum'" }}>{formatINR(grouped.buildingTotal.amount)}</strong>
              </Typography>
            </Box>
          ) : null}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {subcontracts && subcontracts.length > 0 ? (
            <Box
              onClick={onOpenSubcontracts}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenSubcontracts();
                }
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.25,
                py: 0.5,
                borderRadius: 1,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                "&:focus-visible": {
                  outline: "2px solid",
                  outlineColor: "primary.main",
                  outlineOffset: 1,
                },
              }}
            >
              <ContractIcon sx={{ fontSize: 16, color: "primary.main" }} />
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}
                >
                  Subcontracts
                </Typography>
                <Typography variant="body2" sx={{ fontFeatureSettings: "'tnum'" }}>
                  {formatINR(subcontractValue)}
                </Typography>
                <Typography variant="caption" color="success.main" sx={{ fontSize: 11, fontFeatureSettings: "'tnum'" }}>
                  {formatINR(subcontractPaid)} paid
                </Typography>
                <Typography variant="caption" color="warning.main" sx={{ fontSize: 11, fontFeatureSettings: "'tnum'" }}>
                  {formatINR(subcontractBalance)} bal
                </Typography>
              </Box>
              <ChevronRight sx={{ fontSize: 16, color: "text.secondary" }} />
            </Box>
          ) : (
            <Tooltip title="Subcontract totals are loaded on demand to keep this page fast">
              <Button
                variant="text"
                size="small"
                startIcon={<ContractIcon />}
                onClick={onOpenSubcontracts}
                disabled={subcontractsLoading}
                sx={{ textTransform: "none", fontWeight: 500 }}
              >
                {subcontractsLoading ? "Loading…" : "Subcontracts"}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={collapsed ? "Show breakdown" : "Hide breakdown"}>
            <IconButton size="small" onClick={() => setCollapsedAndPersist(!collapsed)}>
              {collapsed ? <ExpandMore /> : <ExpandLess />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {!collapsed ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: { xs: 2, md: 3 },
            px: { xs: 2, md: 2.5 },
            pb: 2,
            alignItems: "flex-start",
          }}
        >
          <LaborGroupCard
            grouped={grouped}
            group={group}
            activeTypes={activeTypes}
            onSelectGroup={() => onSelectGroup(group === "labor" ? "all" : "labor")}
            onSelectTypes={onSelectTypes}
          />
          <BuildingGroupCard
            grouped={grouped}
            group={group}
            activeTypes={activeTypes}
            onSelectGroup={() => onSelectGroup(group === "building" ? "all" : "building")}
            onSelectTypes={onSelectTypes}
          />
        </Box>
      ) : null}
    </Box>
  );
}
