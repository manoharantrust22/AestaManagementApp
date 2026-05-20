"use client";

import { useMemo } from "react";
import { Box, Tooltip } from "@mui/material";
import { Warning as WarningIcon } from "@mui/icons-material";
import DataTable from "@/components/common/DataTable";
import type { MRT_ColumnDef } from "material-react-table";
import type { SettlementReportRow } from "@/types/settlementReport.types";

const fmt = (n: number) =>
  n === 0 ? "" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

export interface SettlementReportLongTableProps {
  rows: SettlementReportRow[];
  isLoading?: boolean;
  onRowClick: (row: SettlementReportRow) => void;
}

export default function SettlementReportLongTable(props: SettlementReportLongTableProps) {
  const { rows, isLoading, onRowClick } = props;

  const sorted = useMemo(
    () => [...rows].sort((a, b) =>
      a.week_start.localeCompare(b.week_start) ||
      a.site_name.localeCompare(b.site_name) ||
      a.subcontract_title.localeCompare(b.subcontract_title)
    ),
    [rows]
  );

  const columns = useMemo<MRT_ColumnDef<SettlementReportRow>[]>(() => [
    {
      accessorKey: "week_start",
      header: "Week",
      Cell: ({ row }) => `${row.original.week_start} → ${row.original.week_end}`,
      size: 180,
    },
    { accessorKey: "site_name", header: "Site", size: 160 },
    {
      accessorKey: "category_name",
      header: "Trade",
      size: 110,
      Cell: ({ row }) => row.original.category_name ?? "—",
    },
    { accessorKey: "subcontract_title", header: "Subcontract", size: 220 },
    {
      accessorKey: "paid_amount",
      header: "Paid",
      size: 100,
      Cell: ({ row }) => fmt(row.original.paid_amount),
      muiTableBodyCellProps: { align: "right" },
    },
    {
      accessorKey: "calc_amount",
      header: "Calc",
      size: 100,
      Cell: ({ row }) => {
        const r = row.original;
        // Suppress diff icon when calc=0 (no system value) or paid=0 (unsettled).
        const showDiff =
          r.paid_amount > 0 &&
          r.calc_amount > 0 &&
          Math.abs(r.paid_amount - r.calc_amount) > 0.005;
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
            <span>{fmt(r.calc_amount)}</span>
            {showDiff && (
              <Tooltip title={`Diff: ${fmt(r.paid_amount - r.calc_amount)}`}>
                <WarningIcon fontSize="inherit" color="warning" />
              </Tooltip>
            )}
          </Box>
        );
      },
      muiTableBodyCellProps: { align: "right" },
    },
    {
      accessorKey: "notes_concat",
      header: "Notes",
      Cell: ({ row }) => row.original.notes_concat ?? "",
    },
  ], []);

  return (
    <DataTable<SettlementReportRow>
      columns={columns}
      data={sorted}
      isLoading={isLoading}
      muiTableBodyRowProps={({ row }) => ({
        onClick: () => onRowClick(row.original),
        sx: { cursor: "pointer", "&:hover": { bgcolor: "action.hover" } },
      })}
    />
  );
}
