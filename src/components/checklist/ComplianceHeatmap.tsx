"use client";

import {
  Box,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import {
  DONE_STATUSES,
  type ChecklistComplianceRow,
} from "@/types/checklist.types";

interface Subject {
  key: string;
  user_name: string;
  site_name: string | null;
}

function cellColorKey(rowsForCell: ChecklistComplianceRow[]):
  | "success"
  | "warning"
  | "error"
  | "empty"
  | "pending" {
  if (rowsForCell.length === 0) return "empty";
  const total = rowsForCell.length;
  const done = rowsForCell.filter((r) => DONE_STATUSES.includes(r.status)).length;
  const missed = rowsForCell.filter((r) => r.status === "missed").length;
  if (done === total) return "success";
  if (missed > 0) return "error";
  if (done > 0) return "warning";
  return "pending";
}

/**
 * Per-person × day completion grid. Each cell summarizes that person's day
 * (green = all done, amber = partial, red = something missed). Click a cell to
 * drill into that day's full grid.
 */
export default function ComplianceHeatmap({
  rows,
  dates,
  onSelectDate,
}: {
  rows: ChecklistComplianceRow[];
  dates: string[]; // ascending YYYY-MM-DD
  onSelectDate: (date: string) => void;
}) {
  const theme = useTheme();

  const subjMap = new Map<string, Subject>();
  for (const r of rows) {
    const key = `${r.user_id}:${r.site_id ?? "u"}`;
    if (!subjMap.has(key))
      subjMap.set(key, { key, user_name: r.user_name, site_name: r.site_name });
  }
  const subjects = [...subjMap.values()].sort(
    (a, b) =>
      a.user_name.localeCompare(b.user_name) ||
      (a.site_name ?? "").localeCompare(b.site_name ?? "")
  );

  const colorFor = (k: ReturnType<typeof cellColorKey>): string => {
    switch (k) {
      case "success":
        return theme.palette.success.main;
      case "warning":
        return theme.palette.warning.main;
      case "error":
        return theme.palette.error.main;
      case "pending":
        return alpha(theme.palette.text.disabled, 0.25);
      default:
        return "transparent";
    }
  };

  if (subjects.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        No checklist data in this range.
      </Typography>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, overflowX: "auto" }}>
      <Box sx={{ display: "inline-block", minWidth: "100%" }}>
        {/* date header */}
        <Stack direction="row" spacing={0.5} sx={{ ml: "200px", mb: 0.5 }}>
          {dates.map((d) => (
            <Box key={d} sx={{ width: 18, textAlign: "center" }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 9 }}>
                {d.slice(8)}
              </Typography>
            </Box>
          ))}
        </Stack>
        {subjects.map((s) => {
          const subjRows = rows.filter(
            (r) => `${r.user_id}:${r.site_id ?? "u"}` === s.key
          );
          return (
            <Stack key={s.key} direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
              <Box sx={{ width: 196, pr: 1, overflow: "hidden" }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {s.user_name}
                </Typography>
                {s.site_name && (
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {s.site_name}
                  </Typography>
                )}
              </Box>
              {dates.map((d) => {
                const cellRows = subjRows.filter((r) => r.business_date === d);
                const k = cellColorKey(cellRows);
                const done = cellRows.filter((r) => DONE_STATUSES.includes(r.status)).length;
                return (
                  <Tooltip
                    key={d}
                    title={
                      cellRows.length
                        ? `${d}: ${done}/${cellRows.length} done`
                        : `${d}: no data`
                    }
                    arrow
                  >
                    <Box
                      onClick={() => onSelectDate(d)}
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: 0.75,
                        cursor: "pointer",
                        bgcolor: colorFor(k),
                        border: k === "empty" ? `1px dashed ${theme.palette.divider}` : "none",
                        "&:hover": { outline: `2px solid ${theme.palette.primary.main}` },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Stack>
          );
        })}
      </Box>
    </Paper>
  );
}
