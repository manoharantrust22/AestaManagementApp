"use client";

import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add as AddIcon,
  KeyboardReturn,
  LocationOn,
  CheckCircle,
  ReceiptLong,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { EngineerSiteBalance } from "@/types/engineer-wallet-v2.types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

interface AllocationAcrossSitesTableProps {
  rows: EngineerSiteBalance[] | undefined;
  isLoading: boolean;
  selectedSiteId: string | null;
  onSelect: (siteId: string | null) => void;
  /** When provided, each row shows per-row Add Funds / Return CTAs (Mode B). */
  onAdd?: (siteId: string) => void;
  onReturn?: (siteId: string) => void;
  /** When provided (Mode B — engineer known), each row shows a "Statement" CTA. */
  onStatement?: (siteId: string) => void;
  /** When false, the table renders without the Held column's "currently held" label
   *  context — used in aggregate mode where it still applies. Reserved for future. */
  emptyMessage?: string;
}

export default function AllocationAcrossSitesTable({
  rows,
  isLoading,
  selectedSiteId,
  onSelect,
  onAdd,
  onReturn,
  onStatement,
  emptyMessage = "No active sites yet.",
}: AllocationAcrossSitesTableProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (isLoading) {
    return (
      <Stack spacing={1}>
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
      </Stack>
    );
  }

  if (!rows || rows.length === 0) {
    return <Alert severity="info">{emptyMessage}</Alert>;
  }

  // Sort: selected site first, then by balance desc (most-funded first).
  const sorted = [...rows].sort((a, b) => {
    if (a.site_id === selectedSiteId) return -1;
    if (b.site_id === selectedSiteId) return 1;
    return b.balance - a.balance;
  });

  if (isMobile) {
    return (
      <Stack spacing={1}>
        {sorted.map((r) => (
          <SiteAllocationCard
            key={r.site_id}
            row={r}
            isSelected={r.site_id === selectedSiteId}
            onClick={() => onSelect(r.site_id === selectedSiteId ? null : r.site_id)}
            onAdd={onAdd ? () => onAdd(r.site_id) : undefined}
            onReturn={onReturn ? () => onReturn(r.site_id) : undefined}
            onStatement={onStatement ? () => onStatement(r.site_id) : undefined}
          />
        ))}
      </Stack>
    );
  }

  return (
    <TableContainer
      component={Box}
      sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}
    >
      <Table size="small" sx={{ "& td, & th": { borderColor: "divider" } }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "action.hover" }}>
            <TableCell sx={{ fontWeight: 700 }}>Site</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Held</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Deposited</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Spent</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Last activity</TableCell>
            {(onAdd || onReturn || onStatement) && (
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((r) => {
            const isSelected = r.site_id === selectedSiteId;
            return (
              <TableRow
                key={r.site_id}
                hover
                onClick={() => onSelect(isSelected ? null : r.site_id)}
                sx={{
                  cursor: "pointer",
                  bgcolor: isSelected ? "primary.50" : undefined,
                  borderLeft: isSelected ? "3px solid" : "3px solid transparent",
                  borderLeftColor: isSelected ? "primary.main" : "transparent",
                  "&:last-child td, &:last-child th": { border: 0 },
                }}
              >
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {isSelected ? (
                      <CheckCircle fontSize="small" color="primary" />
                    ) : (
                      <LocationOn fontSize="small" sx={{ color: "text.disabled" }} />
                    )}
                    <Typography variant="body2" fontWeight={600}>
                      {r.site_name}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    color={
                      r.balance < 0
                        ? "warning.main"
                        : r.balance === 0
                        ? "text.disabled"
                        : "text.primary"
                    }
                  >
                    ₹{fmt(r.balance)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="text.secondary">
                    ₹{fmt(r.total_deposited ?? 0)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="text.secondary">
                    ₹{fmt(r.total_spent ?? 0)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {r.last_txn_at ? dayjs(r.last_txn_at).format("D MMM YYYY") : "—"}
                  </Typography>
                </TableCell>
                {(onAdd || onReturn || onStatement) && (
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {onAdd && (
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<AddIcon fontSize="small" />}
                          onClick={() => onAdd(r.site_id)}
                          sx={{ textTransform: "none", minWidth: 0 }}
                        >
                          Add
                        </Button>
                      )}
                      {onReturn && (
                        <Button
                          size="small"
                          variant="text"
                          color="info"
                          startIcon={<KeyboardReturn fontSize="small" />}
                          onClick={() => onReturn(r.site_id)}
                          disabled={r.balance <= 0}
                          sx={{ textTransform: "none", minWidth: 0 }}
                        >
                          Return
                        </Button>
                      )}
                      {onStatement && (
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<ReceiptLong fontSize="small" />}
                          onClick={() => onStatement(r.site_id)}
                          sx={{ textTransform: "none", minWidth: 0, color: "text.secondary" }}
                        >
                          Statement
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function SiteAllocationCard({
  row,
  isSelected,
  onClick,
  onAdd,
  onReturn,
  onStatement,
}: {
  row: EngineerSiteBalance;
  isSelected: boolean;
  onClick: () => void;
  onAdd?: () => void;
  onReturn?: () => void;
  onStatement?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      elevation={0}
      sx={{
        border: 1,
        borderColor: isSelected ? "primary.main" : "divider",
        bgcolor: isSelected ? "primary.50" : "background.paper",
        borderRadius: 2,
        p: 1.5,
        cursor: "pointer",
        transition: "border-color 0.15s, background-color 0.15s",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          {isSelected ? (
            <CheckCircle fontSize="small" color="primary" />
          ) : (
            <LocationOn fontSize="small" sx={{ color: "text.disabled" }} />
          )}
          <Typography variant="body2" fontWeight={600} noWrap>
            {row.site_name}
          </Typography>
        </Stack>
        <Typography
          variant="body1"
          fontWeight={700}
          color={
            row.balance < 0
              ? "warning.main"
              : row.balance === 0
              ? "text.disabled"
              : "text.primary"
          }
        >
          ₹{fmt(row.balance)}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}>
        <Chip
          size="small"
          label={`In ₹${fmt(row.total_deposited ?? 0)}`}
          variant="outlined"
          sx={{ height: 22, fontSize: "0.7rem" }}
        />
        <Chip
          size="small"
          label={`Out ₹${fmt(row.total_spent ?? 0)}`}
          variant="outlined"
          sx={{ height: 22, fontSize: "0.7rem" }}
        />
        {row.last_txn_at && (
          <Chip
            size="small"
            label={dayjs(row.last_txn_at).format("D MMM")}
            variant="outlined"
            sx={{ height: 22, fontSize: "0.7rem", color: "text.secondary" }}
          />
        )}
      </Stack>
      {(onAdd || onReturn || onStatement) && (
        <Stack spacing={0.75} sx={{ mt: 1.25 }} onClick={(e) => e.stopPropagation()}>
          {(onAdd || onReturn) && (
            <Stack direction="row" spacing={1}>
              {onAdd && (
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={onAdd}
                  sx={{ textTransform: "none" }}
                >
                  Add funds
                </Button>
              )}
              {onReturn && (
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="info"
                  startIcon={<KeyboardReturn fontSize="small" />}
                  onClick={onReturn}
                  disabled={row.balance <= 0}
                  sx={{ textTransform: "none" }}
                >
                  Return
                </Button>
              )}
            </Stack>
          )}
          {onStatement && (
            <Button
              fullWidth
              size="small"
              variant="text"
              startIcon={<ReceiptLong fontSize="small" />}
              onClick={onStatement}
              sx={{ textTransform: "none", color: "text.secondary" }}
            >
              Statement
            </Button>
          )}
        </Stack>
      )}
    </Card>
  );
}
