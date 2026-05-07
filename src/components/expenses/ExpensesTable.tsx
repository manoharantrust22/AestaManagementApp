"use client";

import { useMemo } from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { Edit, Delete, Link as LinkIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { type ExpenseRow } from "@/hooks/queries/useExpensesData";

interface Props {
  rows: ExpenseRow[];
  isLoading: boolean;
  canEdit: boolean;
  onRefClick: (row: ExpenseRow) => void;
  onEdit: (row: ExpenseRow) => void;
  onDelete: (row: ExpenseRow) => void;
}

const TYPE_COLORS: Record<
  string,
  "primary" | "secondary" | "warning" | "info" | "success" | "default" | "error"
> = {
  "Daily Salary": "primary",
  "Contract Salary": "secondary",
  Advance: "warning",
  Excess: "warning",
  "Unlinked Salary": "error",
  "Direct Payment": "secondary",
  Material: "info",
  Machinery: "success",
  General: "default",
  Miscellaneous: "error",
  "Tea & Snacks": "warning",
};

export default function ExpensesTable({
  rows,
  isLoading,
  canEdit,
  onRefClick,
  onEdit,
  onDelete,
}: Props) {
  const columns = useMemo<MRT_ColumnDef<ExpenseRow>[]>(() => {
    return [
      {
        accessorKey: "settlement_reference",
        header: "Ref",
        size: 130,
        enablePinning: true,
        Cell: ({ row }) => {
          const ref = row.original.settlement_reference;
          if (!ref) return <Typography variant="body2" color="text.disabled">—</Typography>;
          const sourceType = row.original.source_type;
          const chipColor = ref.startsWith("MISC-")
            ? ("error" as const)
            : ref.startsWith("TSS-")
              ? ("warning" as const)
              : ref.startsWith("SCP-") || sourceType === "subcontract_payment"
                ? ("info" as const)
                : ("primary" as const);
          return (
            <Chip
              label={ref}
              size="small"
              color={chipColor}
              variant="outlined"
              clickable
              onClick={(e) => {
                e.stopPropagation();
                onRefClick(row.original);
              }}
              sx={{ fontFamily: "monospace", fontWeight: 600, cursor: "pointer" }}
            />
          );
        },
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 110,
        enablePinning: true,
        Cell: ({ cell }) => (
          <Typography variant="body2" sx={{ fontFeatureSettings: "'tnum'" }}>
            {dayjs(cell.getValue<string>()).format("DD MMM YYYY")}
          </Typography>
        ),
      },
      {
        accessorKey: "expense_type",
        header: "Type",
        size: 130,
        Cell: ({ cell }) => {
          const type = cell.getValue<string>();
          return (
            <Chip
              label={type || "Other"}
              size="small"
              color={TYPE_COLORS[type] || "default"}
              variant="outlined"
              sx={{ fontWeight: 500 }}
            />
          );
        },
      },
      {
        accessorKey: "description",
        header: "Description",
        size: 240,
        Cell: ({ cell }) => (
          <Typography variant="body2" noWrap title={cell.getValue<string>() || ""}>
            {cell.getValue<string>() || "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        muiTableHeadCellProps: { align: "right" },
        muiTableBodyCellProps: { align: "right" },
        Cell: ({ cell }) => (
          <Typography
            fontWeight={600}
            sx={{ fontFeatureSettings: "'tnum'" }}
          >
            ₹{cell.getValue<number>().toLocaleString("en-IN")}
          </Typography>
        ),
      },
      {
        accessorKey: "vendor_name",
        header: "Vendor",
        size: 150,
        Cell: ({ cell }) => (
          <Typography variant="body2" noWrap>
            {cell.getValue<string>() || "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "payer_name",
        header: "Paid By",
        size: 130,
        Cell: ({ cell }) => {
          const v = cell.getValue<string>();
          return v ? (
            <Chip label={v} size="small" variant="outlined" color="secondary" />
          ) : (
            <Typography variant="body2" color="text.disabled">—</Typography>
          );
        },
      },
      {
        accessorKey: "subcontract_title",
        header: "Subcontract",
        size: 160,
        Cell: ({ cell }) => {
          const v = cell.getValue<string>();
          return v ? (
            <Chip
              label={v}
              size="small"
              color="info"
              variant="outlined"
              icon={<LinkIcon fontSize="small" />}
            />
          ) : (
            <Chip
              label="Unlinked"
              size="small"
              variant="outlined"
              sx={{ color: "text.disabled", borderColor: "divider" }}
            />
          );
        },
      },
      {
        accessorKey: "is_cleared",
        header: "Status",
        size: 110,
        Cell: ({ cell, row }) => {
          const isCleared = cell.getValue<boolean>();
          const desc = row.original.description ?? "";
          const pendingCompany = !isCleared && desc.includes("Pending from Company");
          return (
            <Chip
              label={isCleared ? "CLEARED" : pendingCompany ? "PENDING CO." : "PENDING"}
              size="small"
              color={isCleared ? "success" : pendingCompany ? "error" : "warning"}
              sx={pendingCompany ? { fontWeight: 600 } : undefined}
            />
          );
        },
      },
      {
        id: "mrt-row-actions",
        header: "Actions",
        size: 100,
        enableColumnFilter: false,
        enableSorting: false,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="Edit">
              <span>
                <IconButton
                  size="small"
                  disabled={!canEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(row.original);
                  }}
                >
                  <Edit fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete">
              <span>
                <IconButton
                  size="small"
                  disabled={!canEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(row.original);
                  }}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ),
      },
    ];
  }, [canEdit, onRefClick, onEdit, onDelete]);

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        fillParent
        showRecordCount
        enableColumnPinning
        initialState={{
          columnPinning: { left: ["settlement_reference"], right: ["mrt-row-actions"] },
          pagination: { pageSize: 100, pageIndex: 0 },
        }}
      />
    </Box>
  );
}
