"use client";

import { useMemo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { Warning as WarningIcon } from "@mui/icons-material";
import DataTable from "@/components/common/DataTable";
import type { MRT_ColumnDef } from "material-react-table";
import type { SettlementReportRow, WidePivotRow } from "@/types/settlementReport.types";
import { pivotToWide } from "@/lib/utils/settlementReportPivot";

const fmt = (n: number) =>
  n === 0 ? "" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

export interface SettlementReportWideTableProps {
  rows: SettlementReportRow[];
  isLoading?: boolean;
  onRowClick: (row: WidePivotRow) => void;
}

export default function SettlementReportWideTable(props: SettlementReportWideTableProps) {
  const { rows, isLoading, onRowClick } = props;

  const pivot = useMemo(() => pivotToWide(rows), [rows]);

  const columns = useMemo<MRT_ColumnDef<WidePivotRow>[]>(() => {
    const cols: MRT_ColumnDef<WidePivotRow>[] = [
      {
        accessorKey: "week_start",
        header: "Week",
        size: 180,
        Cell: ({ row }) =>
          row.original.week_start
            ? `${row.original.week_start} → ${row.original.week_end}`
            : <Typography fontWeight={700}>Totals</Typography>,
      },
    ];
    for (const site of pivot.sites) {
      cols.push({
        id: `${site.id}-paid`,
        accessorFn: (row) => row.bySite[site.id]?.paid ?? 0,
        header: `${site.name} Paid`,
        size: 110,
        Cell: ({ row }) => {
          const cell = row.original.bySite[site.id];
          if (!cell) return "";
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
              <span>{fmt(cell.paid)}</span>
              {cell.hasDiff && (
                <Tooltip title={`Calc ${fmt(cell.calc)} ≠ Paid ${fmt(cell.paid)}`}>
                  <WarningIcon fontSize="inherit" color="warning" />
                </Tooltip>
              )}
            </Box>
          );
        },
        muiTableBodyCellProps: { align: "right" },
      });
      cols.push({
        id: `${site.id}-calc`,
        accessorFn: (row) => row.bySite[site.id]?.calc ?? 0,
        header: `${site.name} Calc`,
        size: 110,
        Cell: ({ row }) => fmt(row.original.bySite[site.id]?.calc ?? 0),
        muiTableBodyCellProps: { align: "right" },
      });
    }
    cols.push({
      accessorKey: "totalPaid",
      header: "Total Paid",
      size: 110,
      Cell: ({ row }) => <Typography fontWeight={600}>{fmt(row.original.totalPaid)}</Typography>,
      muiTableBodyCellProps: { align: "right" },
    });
    cols.push({
      accessorKey: "totalCalc",
      header: "Total Calc",
      size: 110,
      Cell: ({ row }) => <Typography fontWeight={600}>{fmt(row.original.totalCalc)}</Typography>,
      muiTableBodyCellProps: { align: "right" },
    });
    return cols;
  }, [pivot.sites]);

  const data = useMemo(() => {
    if (pivot.rows.length === 0) return [];
    return [...pivot.rows, pivot.totalsRow];
  }, [pivot]);

  return (
    <DataTable<WidePivotRow>
      columns={columns}
      data={data}
      isLoading={isLoading}
      enablePagination={false}
      muiTableBodyRowProps={({ row }) => ({
        onClick: () => {
          if (!row.original.week_start) return; // skip totals row
          onRowClick(row.original);
        },
        sx: row.original.week_start
          ? { cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }
          : { fontWeight: 700, bgcolor: "action.selected" },
      })}
    />
  );
}
