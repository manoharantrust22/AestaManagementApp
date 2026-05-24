"use client";

/**
 * Material Hub table view — sortable, filterable alternative to the cards
 * layout. Reuses the codebase's DataTable primitive (Material React Table).
 *
 * Mirrors `ProtoHubTable` in docs/MaterialHub_Redesign/proto-table.jsx.
 */

import { useMemo } from "react";
import { Box } from "@mui/material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr, fmtDateShort } from "@/lib/material-hub/formatters";
import { stagePillSpec } from "@/lib/material-hub/stageHelpers";
import ThreadActionButton from "./ThreadActionButton";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export interface MaterialHubTableProps {
  threads: MaterialThread[];
  onAction: (thread: MaterialThread) => void;
  onRowClick?: (thread: MaterialThread) => void;
}

export default function MaterialHubTable({
  threads,
  onAction,
  onRowClick,
}: MaterialHubTableProps) {
  const columns = useMemo<MRT_ColumnDef<MaterialThread>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Request #",
        size: 140,
        Cell: ({ row }) => (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <Box sx={{ fontFamily: hubTokens.mono, fontSize: 11, color: hubTokens.subtle }}>
              {row.original.id}
            </Box>
            <Box sx={{ fontSize: 11, color: hubTokens.muted }}>
              {fmtDateShort(row.original.requested_at)}
            </Box>
          </Box>
        ),
      },
      {
        accessorKey: "stage",
        header: "Stage",
        size: 130,
        Cell: ({ row }) => {
          const spec = stagePillSpec(row.original.stage);
          return (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px 8px",
                borderRadius: "6px",
                background: spec.bg,
                color: spec.fg,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.4px",
              }}
            >
              {spec.label}
            </Box>
          );
        },
      },
      {
        accessorKey: "material_name",
        header: "Material",
        size: 220,
      },
      {
        accessorKey: "qty",
        header: "Qty",
        size: 90,
        muiTableHeadCellProps: { align: "right" },
        muiTableBodyCellProps: { align: "right" },
        Cell: ({ row }) => (
          <Box sx={{ fontFamily: hubTokens.mono, fontWeight: 600 }}>
            {row.original.qty} {row.original.material_unit}
          </Box>
        ),
      },
      {
        accessorKey: "section",
        header: "Section",
        size: 140,
        Cell: ({ row }) => row.original.section ?? "—",
      },
      {
        id: "type",
        accessorFn: (t) => {
          const parts: string[] = [];
          parts.push(t.kind === "group" ? "Group" : "Own");
          if (t.advance) parts.push("Advance");
          if (t.purchase_type === "spot") parts.push("Spot");
          return parts.join(" · ");
        },
        header: "Type",
        size: 130,
      },
      {
        id: "vendor",
        header: "Vendor",
        size: 150,
        accessorFn: (t) =>
          t.purchase_type === "spot"
            ? t.spot?.vendor_name ?? "—"
            : t.po?.vendor_name ?? "—",
      },
      {
        id: "amount",
        header: "Amount",
        size: 110,
        muiTableHeadCellProps: { align: "right" },
        muiTableBodyCellProps: { align: "right" },
        accessorFn: (t) =>
          t.purchase_type === "spot" ? t.spot?.amount ?? 0 : t.po?.amount ?? 0,
        Cell: ({ row }) => {
          const amount =
            row.original.purchase_type === "spot"
              ? row.original.spot?.amount ?? 0
              : row.original.po?.amount ?? 0;
          return (
            <Box sx={{ fontFamily: hubTokens.mono, fontWeight: 600 }}>
              {amount > 0 ? inr(amount) : "—"}
            </Box>
          );
        },
      },
      {
        accessorKey: "need_by",
        header: "Need by",
        size: 110,
        Cell: ({ row }) =>
          row.original.need_by ? fmtDateShort(row.original.need_by) : "—",
      },
      {
        id: "action",
        header: "",
        size: 140,
        enableSorting: false,
        enableColumnFilter: false,
        Cell: ({ row }) => (
          <ThreadActionButton
            thread={row.original}
            accent={row.original.kind === "group" ? hubTokens.pink : hubTokens.primary}
            onAction={onAction}
          />
        ),
      },
    ],
    [onAction]
  );

  return (
    <DataTable
      columns={columns}
      data={threads}
      enableActions={false}
      pageSize={100}
      muiTableBodyRowProps={({ row }) => ({
        onClick: () => onRowClick?.(row.original),
        sx: { cursor: onRowClick ? "pointer" : "default" },
      })}
      initialState={{
        sorting: [{ id: "id", desc: true }],
      }}
    />
  );
}
