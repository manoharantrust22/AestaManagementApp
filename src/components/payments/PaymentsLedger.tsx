"use client";

import React, { useMemo } from "react";
import { Box, Button, Chip, IconButton, Typography, useTheme } from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import type { InspectEntity } from "@/components/common/InspectPane/types";

// ---------------------------------------------------------------------------
// Row shape — one entry per ledger row, paid or pending. Powered by
// usePaymentsLedger() which calls the get_payments_ledger RPC.
// ---------------------------------------------------------------------------
export interface PaymentsLedgerRow {
  id: string;
  settlementRef: string | null;
  type: "daily-market" | "weekly";
  date: string;                  // YYYY-MM-DD
  weekEnd?: string;              // YYYY-MM-DD (only for paid weekly rows)
  forLabel: string;
  amount: number;
  isPaid: boolean;
  isPending: boolean;
  laborerId?: string;
  siteId: string;
}

// entityKey() must match useInspectPane.ts byte-for-byte so selection
// comparison stays consistent across the two sites where it's used.
function entityKey(e: InspectEntity): string {
  if (e.kind === "daily-date") return `d:${e.siteId}:${e.date}`;
  return `w:${e.siteId}:${e.laborerId}:${e.weekStart}`;
}

function rowToEntity(r: PaymentsLedgerRow): InspectEntity {
  if (r.type === "daily-market") {
    return {
      kind: "daily-date",
      siteId: r.siteId,
      date: r.date,
      settlementRef: r.settlementRef ?? null,
    };
  }
  // Weekly: laborerId may be null for group settlements; the InspectPane
  // entity requires one. Fall back to an empty string so the key is still
  // deterministic; downstream consumers should null-check before opening
  // the per-laborer-week shape.
  return {
    kind: "weekly-week",
    siteId: r.siteId,
    laborerId: r.laborerId ?? "",
    weekStart: r.date,
    weekEnd: r.weekEnd ?? r.date,
    settlementRef: r.settlementRef ?? null,
  };
}

interface PaymentsLedgerProps {
  rows: PaymentsLedgerRow[];
  isLoading: boolean;
  selectedEntity: InspectEntity | null;
  onRowClick: (entity: InspectEntity) => void;
  onSettleClick: (entity: InspectEntity) => void;
}

export default function PaymentsLedger({
  rows,
  isLoading,
  selectedEntity,
  onRowClick,
  onSettleClick,
}: PaymentsLedgerProps) {
  const theme = useTheme();
  const selectedKey = selectedEntity ? entityKey(selectedEntity) : null;

  const columns = useMemo<MRT_ColumnDef<PaymentsLedgerRow>[]>(
    () => [
      {
        accessorKey: "settlementRef",
        header: "Ref",
        size: 130,
        Cell: ({ row }) => {
          const ref = row.original.settlementRef;
          if (!ref) {
            return (
              <Typography variant="caption" color="text.disabled">
                —
              </Typography>
            );
          }
          return (
            <Chip
              label={ref}
              size="small"
              variant="outlined"
              sx={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.7rem",
                fontWeight: 600,
              }}
            />
          );
        },
      },
      {
        accessorKey: "date",
        header: "Date / Period",
        size: 140,
        Cell: ({ row }) => {
          const r = row.original;
          if (r.type === "weekly" && r.weekEnd && r.weekEnd !== r.date) {
            return (
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {r.date} → {r.weekEnd}
              </Typography>
            );
          }
          return (
            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {r.date}
            </Typography>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 130,
        Cell: ({ row }) => {
          const isDM = row.original.type === "daily-market";
          return (
            <Chip
              label={isDM ? "Daily + Mkt" : "Weekly"}
              size="small"
              sx={{
                fontWeight: 600,
                bgcolor: isDM
                  ? theme.palette.info.main + "1a" // ~10% blue tint
                  : theme.palette.warning.main + "1a",
                color: isDM ? theme.palette.info.dark : theme.palette.warning.dark,
                border: "none",
              }}
            />
          );
        },
      },
      {
        accessorKey: "forLabel",
        header: "For",
        size: 200,
        Cell: ({ row }) => (
          <Typography variant="body2" noWrap>
            {row.original.forLabel}
          </Typography>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        muiTableHeadCellProps: { align: "right" },
        muiTableBodyCellProps: { align: "right" },
        Cell: ({ row }) => {
          const r = row.original;
          return (
            <Typography
              variant="body2"
              sx={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                color: r.isPending ? theme.palette.warning.dark : theme.palette.text.primary,
              }}
            >
              ₹{r.amount.toLocaleString("en-IN")}
            </Typography>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        size: 110,
        Cell: ({ row }) => {
          const r = row.original;
          return (
            <Chip
              label={r.isPaid ? "Paid" : "Pending"}
              size="small"
              sx={{
                fontWeight: 600,
                bgcolor: r.isPaid
                  ? theme.palette.success.main + "1a"
                  : theme.palette.warning.main + "1a",
                color: r.isPaid ? theme.palette.success.dark : theme.palette.warning.dark,
                border: "none",
              }}
            />
          );
        },
      },
      {
        id: "action",
        header: "",
        size: 100,
        enableSorting: false,
        enableColumnFilter: false,
        Cell: ({ row }) => {
          const r = row.original;
          if (r.isPending) {
            return (
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={(e) => {
                  e.stopPropagation();
                  onSettleClick(rowToEntity(r));
                }}
                sx={{ textTransform: "none", fontSize: "0.7rem", py: 0.25, px: 1 }}
              >
                Settle
              </Button>
            );
          }
          return (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                // Reserved for completed-row context menu (cancel, edit, etc).
                // Wired up in Task 3.6.
              }}
              aria-label="Row actions"
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          );
        },
      },
    ],
    [theme, onSettleClick],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      enableActions={false}
      initialState={{
        sorting: [{ id: "date", desc: true }],
      }}
      muiTableBodyRowProps={({ row }) => {
        const r = row.original;
        const rowKey = entityKey(rowToEntity(r));
        const isSelected = rowKey === selectedKey;
        return {
          onClick: () => onRowClick(rowToEntity(r)),
          sx: {
            cursor: "pointer",
            bgcolor: r.isPending
              ? theme.palette.warning.main + "12" // ~7% amber tint
              : "inherit",
            borderLeft: isSelected
              ? `3px solid ${theme.palette.primary.main}`
              : "3px solid transparent",
            "&:hover": {
              bgcolor: r.isPending
                ? theme.palette.warning.main + "1f"
                : theme.palette.action.hover,
            },
          },
        };
      }}
    />
  );
}
