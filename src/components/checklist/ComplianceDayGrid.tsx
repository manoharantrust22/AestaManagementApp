"use client";

import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ChecklistStatusChip from "./ChecklistStatusChip";
import {
  DONE_STATUSES,
  type ChecklistComplianceRow,
  type ChecklistRole,
} from "@/types/checklist.types";

const ROLE_ORDER: ChecklistRole[] = ["site_engineer", "office", "admin"];
const ROLE_LABEL: Record<ChecklistRole, string> = {
  site_engineer: "Site engineers",
  office: "Office",
  admin: "Admins",
};

function shortTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function cellTooltip(r: ChecklistComplianceRow): string {
  const bits: string[] = [];
  if (r.detected_at) bits.push(`Filled ${shortTime(r.detected_at)}`);
  if (r.status === "deferred_pending" && r.defer_reason) bits.push(`Deferred: ${r.defer_reason}`);
  if (r.note) bits.push(`Note: ${r.note}`);
  return bits.join(" · ");
}

interface Subject {
  key: string;
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
}

function uniqueItems(rows: ChecklistComplianceRow[]) {
  const map = new Map<string, { item_key: string; label: string; sort_order: number }>();
  for (const r of rows) {
    if (!map.has(r.item_key))
      map.set(r.item_key, { item_key: r.item_key, label: r.label, sort_order: r.sort_order });
  }
  return [...map.values()].sort((a, b) => a.sort_order - b.sort_order);
}

function uniqueSubjects(rows: ChecklistComplianceRow[]): Subject[] {
  const map = new Map<string, Subject>();
  for (const r of rows) {
    const key = `${r.user_id}:${r.site_id ?? "u"}`;
    if (!map.has(key))
      map.set(key, {
        key,
        user_id: r.user_id,
        user_name: r.user_name,
        site_id: r.site_id,
        site_name: r.site_name,
      });
  }
  return [...map.values()].sort(
    (a, b) =>
      a.user_name.localeCompare(b.user_name) ||
      (a.site_name ?? "").localeCompare(b.site_name ?? "")
  );
}

export default function ComplianceDayGrid({ rows }: { rows: ChecklistComplianceRow[] }) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        No checklist data for this day.
      </Typography>
    );
  }

  const roles = ROLE_ORDER.filter((role) => rows.some((r) => r.role === role));

  return (
    <Box>
      {roles.map((role) => {
        const roleRows = rows.filter((r) => r.role === role);
        const items = uniqueItems(roleRows);
        const subjects = uniqueSubjects(roleRows);
        return (
          <Box key={role} sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary">
              {ROLE_LABEL[role]}
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Person / Site</TableCell>
                    {items.map((it) => (
                      <TableCell key={it.item_key} align="center" sx={{ fontWeight: 700 }}>
                        {it.label}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: 700 }}>
                      Done
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subjects.map((s) => {
                    const subjectRows = roleRows.filter(
                      (r) => r.user_id === s.user_id && r.site_id === s.site_id
                    );
                    const done = subjectRows.filter((r) => DONE_STATUSES.includes(r.status)).length;
                    return (
                      <TableRow key={s.key} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {s.user_name}
                          </Typography>
                          {s.site_name && (
                            <Typography variant="caption" color="text.secondary">
                              {s.site_name}
                            </Typography>
                          )}
                        </TableCell>
                        {items.map((it) => {
                          const cell = subjectRows.find((r) => r.item_key === it.item_key);
                          return (
                            <TableCell key={it.item_key} align="center">
                              {cell ? (
                                <ChecklistStatusChip
                                  status={cell.status}
                                  tooltip={cellTooltip(cell) || undefined}
                                  showIcon={false}
                                />
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            color={done === subjectRows.length ? "success.main" : "text.secondary"}
                          >
                            {done}/{subjectRows.length}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        );
      })}
    </Box>
  );
}
