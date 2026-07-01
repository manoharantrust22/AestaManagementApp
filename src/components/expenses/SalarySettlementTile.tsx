"use client";

import { Box, Typography } from "@mui/material";
import ExpenseTile from "./ExpenseTile";
import { type SalarySettlementGroup, formatINR } from "@/lib/utils/expenseGrouping";

interface Props {
  group: SalarySettlementGroup;
  /** Currently selected expense_types (from filter state). */
  activeTypes: string[];
  onSelectTypes: (types: string[]) => void;
}

const DAILY_TYPES = ["Daily Salary"];
const CONTRACT_TYPES = ["Contract Salary", "Advance"];
const ALL_SALARY_TYPES = ["Daily Salary", "Contract Salary", "Advance"];

function activeMatches(active: string[], target: string[]): boolean {
  if (active.length !== target.length) return false;
  const a = [...active].sort().join("|");
  const b = [...target].sort().join("|");
  return a === b;
}

export default function SalarySettlementTile({ group, activeTypes, onSelectTypes }: Props) {
  const dailyAmount = group.daily?.amount ?? 0;
  const dailyCount = group.daily?.count ?? 0;
  const contractAmount = group.contract?.amount ?? 0;
  const contractCount = group.contract?.count ?? 0;
  const advanceCount = group.contract?.advanceCount;

  const isAllSalaryActive = activeMatches(activeTypes, ALL_SALARY_TYPES);
  const isDailyActive = activeMatches(activeTypes, DAILY_TYPES);
  const isContractActive = activeMatches(activeTypes, CONTRACT_TYPES);

  return (
    <Box
      sx={{
        border: 1,
        borderColor: isAllSalaryActive ? "primary.main" : "divider",
        borderRadius: 1.5,
        bgcolor: "background.paper",
        overflow: "hidden",
        flex: "0 0 auto",
        alignSelf: "flex-start",
        width: "100%",
        maxWidth: 480,
      }}
    >
      <Box
        onClick={() => onSelectTypes(isAllSalaryActive ? [] : ALL_SALARY_TYPES)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectTypes(isAllSalaryActive ? [] : ALL_SALARY_TYPES);
          }
        }}
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 1,
          px: 1.5,
          py: 1.25,
          cursor: "pointer",
          bgcolor: isAllSalaryActive ? "primary.lighter" : "action.hover",
          transition: "background-color 120ms",
          "&:hover": { bgcolor: isAllSalaryActive ? "primary.lighter" : "action.selected" },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: -2,
          },
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontSize: 11,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Salary Settlement
        </Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontFeatureSettings: "'tnum'", lineHeight: 1.2 }}>
            {formatINR(group.total.amount)}
          </Typography>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontSize: 10.5, letterSpacing: 0.2, fontFeatureSettings: "'tnum'" }}
          >
            {group.total.count}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", p: 0.5, gap: 0.25 }}>
        <ExpenseTile
          variant="subrow"
          label="Daily wages"
          amount={dailyAmount}
          count={dailyCount}
          active={isDailyActive}
          muted={dailyCount === 0}
          onClick={() => onSelectTypes(isDailyActive ? [] : DAILY_TYPES)}
          tooltip="Per-settlement_group rows. Counts now match /site/payments."
        />
        <ExpenseTile
          variant="subrow"
          label="Company"
          amount={contractAmount}
          count={contractCount}
          meta={advanceCount != null ? `${advanceCount} advance` : undefined}
          active={isContractActive}
          muted={contractCount === 0}
          onClick={() => onSelectTypes(isContractActive ? [] : CONTRACT_TYPES)}
          tooltip="Contract labor settlements (advances folded in)."
        />
      </Box>
    </Box>
  );
}
