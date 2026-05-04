"use client";

import React, { useMemo } from "react";
import { Box, Button, Chip, IconButton, Typography, useTheme } from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { entityKey, type InspectEntity } from "@/components/common/InspectPane/types";

// ---------------------------------------------------------------------------
// Row shape — one entry per ledger row, paid or pending. Powered by
// usePaymentsLedger() which calls the get_payments_ledger RPC.
// ---------------------------------------------------------------------------
export interface PaymentsLedgerRow {
  id: string;
  settlementRef: string | null;
  type: "daily-market" | "weekly";
  subtype: string;               // 'daily-market' | 'salary-waterfall' | 'advance' | 'adjustment' | 'unclassified'
  date: string;                  // YYYY-MM-DD
  weekEnd?: string;              // YYYY-MM-DD (only for paid weekly rows)
  forLabel: string;
  amount: number;
  isPaid: boolean;
  isPending: boolean;
  laborerId?: string;
  siteId: string;
  /** 'legacy' or 'current' — populated by get_payments_ledger. Non-auditing
   *  sites always get 'current'. Used to bucket rows into legacy/current bands. */
  period: "legacy" | "current";
  // Set on synthetic parent rows produced by the same-week + same-subtype
  // grouping below. Children retain their original flat shape.
  subRows?: PaymentsLedgerRow[];
}

function isGroupParent(r: PaymentsLedgerRow): boolean {
  return Array.isArray(r.subRows) && r.subRows.length > 0;
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

  // Collapse weekly rows that share the same week + subtype into one
  // expandable parent row. Daily/market rows and singleton weekly rows
  // pass through unchanged.
  const treeRows = useMemo<PaymentsLedgerRow[]>(() => {
    const groups = new Map<string, PaymentsLedgerRow[]>();
    const passthrough: PaymentsLedgerRow[] = [];
    for (const r of rows) {
      if (r.type !== "weekly" || !r.weekEnd) {
        passthrough.push(r);
        continue;
      }
      const key = `${r.date}|${r.weekEnd}|${r.subtype}`;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    const out: PaymentsLedgerRow[] = [...passthrough];
    for (const [key, children] of groups) {
      if (children.length < 2) {
        out.push(...children);
        continue;
      }
      const first = children[0];
      out.push({
        id: `group:${key}`,
        settlementRef: null,
        type: "weekly",
        subtype: first.subtype,
        date: first.date,
        weekEnd: first.weekEnd,
        forLabel: `${children.length} entries · ${first.subtype}`,
        amount: children.reduce((s, c) => s + c.amount, 0),
        isPaid: children.every((c) => c.isPaid),
        isPending: children.some((c) => c.isPending),
        laborerId: undefined,
        siteId: first.siteId,
        // All grouped children share a date+weekEnd, so they share a period.
        period: first.period,
        subRows: children,
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  const columns = useMemo<MRT_ColumnDef<PaymentsLedgerRow>[]>(
    () => [
      {
        accessorKey: "settlementRef",
        header: "Ref",
        size: 130,
        Cell: ({ row }) => {
          const r = row.original;
          if (isGroupParent(r)) {
            return (
              <Chip
                label={`× ${r.subRows!.length}`}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  bgcolor: theme.palette.action.selected,
                  color: theme.palette.text.secondary,
                  border: "none",
                }}
              />
            );
          }
          const ref = r.settlementRef;
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
          const r = row.original;
          const isDM = r.type === "daily-market";
          const label = isGroupParent(r)
            ? `Weekly (${r.subRows!.length})`
            : isDM
              ? "Daily + Mkt"
              : "Weekly";
          return (
            <Chip
              label={label}
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
          // Group parent with mixed paid/pending children → distinct "Mixed"
          // pill so the user knows expanding will reveal both states.
          const isMixed =
            isGroupParent(r) &&
            r.subRows!.some((c) => c.isPaid) &&
            r.subRows!.some((c) => c.isPending);
          if (isMixed) {
            return (
              <Chip
                label="Mixed"
                size="small"
                sx={{
                  fontWeight: 600,
                  bgcolor: theme.palette.info.main + "1a",
                  color: theme.palette.info.dark,
                  border: "none",
                }}
              />
            );
          }
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
          // Parent rows: no row-level action; user must drill in to act on
          // a specific child (avoids ambiguous bulk settle).
          if (isGroupParent(r)) return null;
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
      data={treeRows}
      isLoading={isLoading}
      enableActions={false}
      fillParent
      enableExpanding
      getSubRows={(row) => row.subRows}
      paginateExpandedRows={false}
      positionExpandColumn="first"
      getRowId={(row) => row.id}
      initialState={{
        sorting: [{ id: "date", desc: true }],
      }}
      muiTableBodyRowProps={({ row }) => {
        const r = row.original;
        if (isGroupParent(r)) {
          // Group header: clicking the row toggles expansion only — never
          // opens the InspectPane on a synthetic entity. Visually distinct
          // background so the header reads as a container.
          return {
            onClick: row.getToggleExpandedHandler(),
            sx: {
              cursor: "pointer",
              bgcolor: theme.palette.action.hover,
              borderLeft: "3px solid transparent",
              "& > td": { fontWeight: 600 },
              "&:hover": { bgcolor: theme.palette.action.selected },
            },
          };
        }
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
