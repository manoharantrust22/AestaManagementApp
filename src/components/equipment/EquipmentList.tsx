"use client";

import { useMemo } from "react";
import {
  Box,
  Chip,
  IconButton,
  Typography,
  Tooltip,
  Avatar,
  CircularProgress,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  SwapHoriz as TransferIcon,
  Build as MaintenanceIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import type { MRT_Row } from "material-react-table";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatCurrency } from "@/lib/formatters";
import MaintenanceAlertBadge from "./MaintenanceAlertBadge";
import type { EquipmentWithDetails } from "@/types/equipment.types";
import {
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_COLORS,
  EQUIPMENT_CONDITION_LABELS,
  EQUIPMENT_CONDITION_COLORS,
  LOCATION_TYPE_LABELS,
} from "@/types/equipment.types";

interface EquipmentListProps {
  equipment: EquipmentWithDetails[];
  isLoading: boolean;
  onView: (equipment: EquipmentWithDetails) => void;
  onEdit?: (equipment: EquipmentWithDetails) => void;
  onTransfer?: (equipment: EquipmentWithDetails) => void;
  onMaintenance?: (equipment: EquipmentWithDetails) => void;
  onDelete?: (equipment: EquipmentWithDetails) => void;
}

export default function EquipmentList({
  equipment,
  isLoading,
  onView,
  onEdit,
  onTransfer,
  onMaintenance,
  onDelete,
}: EquipmentListProps) {
  const isMobile = useIsMobile();

  const columns = useMemo<MRT_ColumnDef<EquipmentWithDetails>[]>(
    () => [
      {
        accessorKey: "equipment_code",
        header: "Code",
        size: 100,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {row.original.primary_photo_url && (
              <Avatar
                src={row.original.primary_photo_url}
                alt={row.original.name}
                sx={{ width: 32, height: 32 }}
              />
            )}
            <Typography variant="body2" fontWeight="medium">
              {row.original.equipment_code}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        size: 200,
        Cell: ({ row }) => {
          const variantCount = row.original.variants?.length || 0;
          return (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Typography variant="body2">{row.original.name}</Typography>
                {variantCount > 0 && (
                  <Chip
                    label={`${variantCount} ${variantCount === 1 ? "size" : "sizes"}`}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                )}
              </Box>
              {row.original.brand && (
                <Typography variant="caption" color="text.secondary">
                  {row.original.brand}
                  {row.original.model_number && ` - ${row.original.model_number}`}
                </Typography>
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: "category.name",
        header: "Category",
        size: 120,
        Cell: ({ row }) => (
          <Chip
            label={row.original.category?.name || "Unknown"}
            size="small"
            variant="outlined"
          />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Chip
              label={EQUIPMENT_STATUS_LABELS[row.original.status]}
              color={EQUIPMENT_STATUS_COLORS[row.original.status]}
              size="small"
            />
            <MaintenanceAlertBadge equipment={row.original} />
          </Box>
        ),
      },
      {
        accessorKey: "condition",
        header: "Condition",
        size: 100,
        Cell: ({ row }) =>
          row.original.condition ? (
            <Chip
              label={EQUIPMENT_CONDITION_LABELS[row.original.condition]}
              color={EQUIPMENT_CONDITION_COLORS[row.original.condition]}
              size="small"
              variant="outlined"
            />
          ) : (
            <Typography variant="caption" color="text.secondary">
              -
            </Typography>
          ),
      },
      {
        accessorKey: "current_location_type",
        header: "Location",
        size: 150,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2">
              {row.original.current_location_type === "site"
                ? row.original.current_site?.name || "Site"
                : row.original.warehouse_location || "Warehouse"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {LOCATION_TYPE_LABELS[row.original.current_location_type]}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "responsible_user.name",
        header: "Responsible",
        size: 150,
        Cell: ({ row }) => {
          const user = row.original.responsible_user;
          const laborer = row.original.responsible_laborer;
          if (user) return <Typography variant="body2">{user.name}</Typography>;
          if (laborer) return <Typography variant="body2">{laborer.name}</Typography>;
          return (
            <Typography variant="caption" color="text.secondary">
              Not assigned
            </Typography>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        size: 150,
        enableColumnActions: false,
        enableSorting: false,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="View Details">
              <IconButton size="small" onClick={() => onView(row.original)}>
                <ViewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {onEdit && (
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => onEdit(row.original)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {onTransfer && (
              <Tooltip title="Transfer">
                <IconButton
                  size="small"
                  onClick={() => onTransfer(row.original)}
                  disabled={row.original.status === "lost" || row.original.status === "disposed"}
                >
                  <TransferIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {onMaintenance && (
              <Tooltip title="Record Maintenance">
                <IconButton
                  size="small"
                  onClick={() => onMaintenance(row.original)}
                  color={
                    row.original.maintenance_status === "overdue"
                      ? "error"
                      : row.original.maintenance_status === "due_soon"
                      ? "warning"
                      : "default"
                  }
                >
                  <MaintenanceIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => onDelete(row.original)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ),
      },
    ],
    [onEdit, onView, onTransfer, onMaintenance, onDelete]
  );

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <DataTable
        columns={columns}
        data={equipment}
        isLoading={isLoading}
        enableRowSelection={false}
        enableExpanding
        renderDetailPanel={({ row }: { row: MRT_Row<EquipmentWithDetails> }) => {
          const variants = row.original.variants || [];
          if (variants.length === 0) return null;
          return (
            <Box sx={{ px: 2, py: 1.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Sizes
              </Typography>
              {variants.map((v) => (
                <Box
                  key={v.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    maxWidth: 360,
                  }}
                >
                  <Typography variant="body2">
                    {v.variant_label || v.name}
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {v.purchase_cost != null ? formatCurrency(v.purchase_cost) : "—"}
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        }}
        muiExpandButtonProps={({ row }: { row: MRT_Row<EquipmentWithDetails> }) => ({
          sx: {
            display: (row.original.variants?.length || 0) > 0 ? undefined : "none",
          },
        })}
        initialState={{
          columnVisibility: {
            condition: !isMobile,
            "responsible_user.name": !isMobile,
          },
        }}
      />
    </Box>
  );
}
