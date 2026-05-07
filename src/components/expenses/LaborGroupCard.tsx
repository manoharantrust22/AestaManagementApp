"use client";

import { Box, Typography } from "@mui/material";
import { WarningAmber, LocalCafe, HandshakeOutlined } from "@mui/icons-material";
import ExpenseTile from "./ExpenseTile";
import SalarySettlementTile from "./SalarySettlementTile";
import { type GroupedBreakdown, formatINR } from "@/lib/utils/expenseGrouping";
import { type ExpenseGroup } from "@/hooks/queries/useExpensesData";

interface Props {
  grouped: GroupedBreakdown;
  group: ExpenseGroup;
  activeTypes: string[];
  onSelectGroup: () => void;
  onSelectTypes: (types: string[]) => void;
}

const TEA_TYPES = ["Tea & Snacks"];
const DIRECT_TYPES = ["Direct Payment"];
const EXCESS_TYPES = ["Excess"];
const UNLINKED_TYPES = ["Unlinked Salary"];

const matches = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return [...a].sort().join("|") === [...b].sort().join("|");
};

export default function LaborGroupCard({
  grouped,
  group,
  activeTypes,
  onSelectGroup,
  onSelectTypes,
}: Props) {
  const isGroupActive = group === "labor";
  const noTypeFilter = activeTypes.length === 0;

  return (
    <Box
      sx={{
        flex: "1 1 360px",
        minWidth: 320,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
      }}
    >
      <Box
        onClick={onSelectGroup}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectGroup();
          }
        }}
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          pb: 0.5,
          borderBottom: 2,
          borderColor: isGroupActive && noTypeFilter ? "info.main" : "divider",
          cursor: "pointer",
          transition: "border-color 120ms",
          "&:hover": { borderColor: "info.main" },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "info.main",
            outlineOffset: 2,
            borderRadius: 1,
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "info.main",
          }}
        >
          Labor
        </Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
          <Typography variant="body2" fontWeight={700} sx={{ fontFeatureSettings: "'tnum'" }}>
            {formatINR(grouped.laborTotal.amount)}
          </Typography>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontSize: 10.5, letterSpacing: 0.2, fontFeatureSettings: "'tnum'" }}
          >
            {grouped.laborTotal.count}
          </Typography>
        </Box>
      </Box>

      <SalarySettlementTile
        group={grouped.salarySettlement}
        activeTypes={activeTypes}
        onSelectTypes={onSelectTypes}
      />

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        <ExpenseTile
          label="Tea & Snacks"
          amount={grouped.teaSnacks?.amount ?? 0}
          count={grouped.teaSnacks?.count ?? 0}
          icon={<LocalCafe sx={{ fontSize: 14 }} />}
          active={matches(activeTypes, TEA_TYPES)}
          muted={(grouped.teaSnacks?.count ?? 0) === 0}
          onClick={() =>
            onSelectTypes(matches(activeTypes, TEA_TYPES) ? [] : TEA_TYPES)
          }
        />
        {grouped.directPayment && grouped.directPayment.count > 0 ? (
          <ExpenseTile
            label="Direct Contract"
            amount={grouped.directPayment.amount}
            count={grouped.directPayment.count}
            icon={<HandshakeOutlined sx={{ fontSize: 14 }} />}
            active={matches(activeTypes, DIRECT_TYPES)}
            onClick={() =>
              onSelectTypes(matches(activeTypes, DIRECT_TYPES) ? [] : DIRECT_TYPES)
            }
            tooltip="Subcontract direct payments (paid outside settlement_groups)."
          />
        ) : null}
        {grouped.excess && grouped.excess.count > 0 ? (
          <ExpenseTile
            label="Excess"
            amount={grouped.excess.amount}
            count={grouped.excess.count}
            tone="warning"
            icon={<WarningAmber sx={{ fontSize: 14 }} />}
            active={matches(activeTypes, EXCESS_TYPES)}
            onClick={() =>
              onSelectTypes(matches(activeTypes, EXCESS_TYPES) ? [] : EXCESS_TYPES)
            }
            tooltip="Overpayment settlements. Investigate and reconcile."
          />
        ) : null}
        {grouped.unlinkedSalary && grouped.unlinkedSalary.count > 0 ? (
          <ExpenseTile
            label="Unlinked Salary"
            amount={grouped.unlinkedSalary.amount}
            count={grouped.unlinkedSalary.count}
            tone="warning"
            icon={<WarningAmber sx={{ fontSize: 14 }} />}
            active={matches(activeTypes, UNLINKED_TYPES)}
            onClick={() =>
              onSelectTypes(matches(activeTypes, UNLINKED_TYPES) ? [] : UNLINKED_TYPES)
            }
            tooltip="Salary settlements with no attendance link — clean up over time."
          />
        ) : null}
      </Box>
    </Box>
  );
}
