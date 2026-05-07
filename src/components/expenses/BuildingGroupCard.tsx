"use client";

import { Box, Typography } from "@mui/material";
import {
  Foundation,
  PrecisionManufacturing,
  Receipt,
  MoreHoriz,
} from "@mui/icons-material";
import ExpenseTile from "./ExpenseTile";
import { type GroupedBreakdown, formatINR } from "@/lib/utils/expenseGrouping";
import { type ExpenseGroup } from "@/hooks/queries/useExpensesData";

interface Props {
  grouped: GroupedBreakdown;
  group: ExpenseGroup;
  activeTypes: string[];
  onSelectGroup: () => void;
  onSelectTypes: (types: string[]) => void;
}

const MATERIAL = ["Material"];
const MACHINERY = ["Machinery"];
const GENERAL = ["General"];
const MISC = ["Miscellaneous"];

const matches = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return [...a].sort().join("|") === [...b].sort().join("|");
};

export default function BuildingGroupCard({
  grouped,
  group,
  activeTypes,
  onSelectGroup,
  onSelectTypes,
}: Props) {
  const isGroupActive = group === "building";
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
          borderColor: isGroupActive && noTypeFilter ? "secondary.main" : "divider",
          cursor: "pointer",
          transition: "border-color 120ms",
          "&:hover": { borderColor: "secondary.main" },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "secondary.main",
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
            color: "secondary.main",
          }}
        >
          Building
        </Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
          <Typography variant="body2" fontWeight={700} sx={{ fontFeatureSettings: "'tnum'" }}>
            {formatINR(grouped.buildingTotal.amount)}
          </Typography>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontSize: 10.5, letterSpacing: 0.2, fontFeatureSettings: "'tnum'" }}
          >
            {grouped.buildingTotal.count}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        <ExpenseTile
          label="Material"
          amount={grouped.material?.amount ?? 0}
          count={grouped.material?.count ?? 0}
          icon={<Foundation sx={{ fontSize: 14 }} />}
          active={matches(activeTypes, MATERIAL)}
          muted={(grouped.material?.count ?? 0) === 0}
          onClick={() =>
            onSelectTypes(matches(activeTypes, MATERIAL) ? [] : MATERIAL)
          }
        />
        <ExpenseTile
          label="Machinery"
          amount={grouped.machinery?.amount ?? 0}
          count={grouped.machinery?.count ?? 0}
          icon={<PrecisionManufacturing sx={{ fontSize: 14 }} />}
          active={matches(activeTypes, MACHINERY)}
          muted={(grouped.machinery?.count ?? 0) === 0}
          onClick={() =>
            onSelectTypes(matches(activeTypes, MACHINERY) ? [] : MACHINERY)
          }
        />
        <ExpenseTile
          label="General"
          amount={grouped.general?.amount ?? 0}
          count={grouped.general?.count ?? 0}
          icon={<Receipt sx={{ fontSize: 14 }} />}
          active={matches(activeTypes, GENERAL)}
          muted={(grouped.general?.count ?? 0) === 0}
          onClick={() =>
            onSelectTypes(matches(activeTypes, GENERAL) ? [] : GENERAL)
          }
        />
        <ExpenseTile
          label="Miscellaneous"
          amount={grouped.miscellaneous?.amount ?? 0}
          count={grouped.miscellaneous?.count ?? 0}
          icon={<MoreHoriz sx={{ fontSize: 14 }} />}
          active={matches(activeTypes, MISC)}
          muted={(grouped.miscellaneous?.count ?? 0) === 0}
          onClick={() =>
            onSelectTypes(matches(activeTypes, MISC) ? [] : MISC)
          }
        />
      </Box>
    </Box>
  );
}
