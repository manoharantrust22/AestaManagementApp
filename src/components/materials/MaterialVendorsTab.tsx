"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  History as HistoryIcon,
  EmojiEvents as TrophyIcon,
  Phone as PhoneIcon,
} from "@mui/icons-material";
import { type MRT_ColumnDef } from "material-react-table";
import DataTable from "@/components/common/DataTable";
import {
  useMaterialVendors,
  useDeleteVendorInventory,
} from "@/hooks/queries/useVendorInventory";
import VendorInventoryDialog from "./VendorInventoryDialog";
import PriceHistoryDialog from "./PriceHistoryDialog";
import { VENDOR_TYPE_LABELS } from "@/types/material.types";
import type {
  MaterialWithDetails,
  VendorInventoryWithDetails,
} from "@/types/material.types";

interface MaterialVendorsTabProps {
  material: MaterialWithDetails;
}

// Format currency
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function MaterialVendorsTab({ material }: MaterialVendorsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VendorInventoryWithDetails | null>(null);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [historyVendor, setHistoryVendor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<VendorInventoryWithDetails | null>(null);

  const { data: vendors = [], isLoading, error } = useMaterialVendors(material.id);
  const deleteInventory = useDeleteVendorInventory();

  // Create a map of best prices by brand (brand_id represents brand + variant combination)
  // Best price comparison should only compare vendors with the same brand
  const bestPriceByBrand = useMemo(() => {
    const brandMap = new Map<string, VendorInventoryWithDetails>();

    vendors.forEach(vendor => {
      const brandKey = vendor.brand_id || 'no-brand';
      const existing = brandMap.get(brandKey);

      const vendorCost = vendor.total_landed_cost || Infinity;
      const existingCost = existing?.total_landed_cost || Infinity;

      if (!existing || vendorCost < existingCost) {
        brandMap.set(brandKey, vendor);
      }
    });

    return brandMap;
  }, [vendors]);

  // Check if a vendor has the best price for its brand
  const isBestPriceForBrand = useCallback((vendor: VendorInventoryWithDetails) => {
    const brandKey = vendor.brand_id || 'no-brand';
    const bestForBrand = bestPriceByBrand.get(brandKey);
    // Only show "Best" if there are multiple vendors for this brand
    const vendorsForBrand = vendors.filter(v => (v.brand_id || 'no-brand') === brandKey);
    return vendorsForBrand.length > 1 && bestForBrand?.id === vendor.id;
  }, [bestPriceByBrand, vendors]);

  const handleAdd = useCallback(() => {
    setSelectedItem(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((item: VendorInventoryWithDetails) => {
    setSelectedItem(item);
    setDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((item: VendorInventoryWithDetails) => {
    setDeleteConfirm(item);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await deleteInventory.mutateAsync({
        id: deleteConfirm.id,
        vendorId: deleteConfirm.vendor_id,
        materialId: material.id,
      });
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, deleteInventory, material]);

  const handleViewPriceHistory = useCallback((item: VendorInventoryWithDetails) => {
    if (item.vendor) {
      setHistoryVendor({
        id: item.vendor_id,
        name: item.vendor.name,
      });
      setPriceHistoryOpen(true);
    }
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedItem(null);
  }, []);

  const columns = useMemo<MRT_ColumnDef<VendorInventoryWithDetails>[]>(
    () => [
      {
        accessorKey: "vendor.name",
        header: "Vendor",
        size: 200,
        Cell: ({ row }) => {
          const isBestPrice = isBestPriceForBrand(row.original);
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {isBestPrice && (
                <Tooltip title="Best Price for this Brand">
                  <TrophyIcon color="warning" fontSize="small" />
                </Tooltip>
              )}
              <Box>
                <Typography variant="body2" fontWeight={isBestPrice ? 600 : 500}>
                  {row.original.vendor?.name || "-"}
                </Typography>
                {row.original.vendor?.vendor_type && (
                  <Chip
                    label={VENDOR_TYPE_LABELS[row.original.vendor.vendor_type] || row.original.vendor.vendor_type}
                    size="small"
                    variant="outlined"
                    sx={{ mt: 0.5, height: 18, fontSize: "0.65rem" }}
                  />
                )}
              </Box>
            </Box>
          );
        },
      },
      {
        accessorKey: "brand.brand_name",
        header: "Brand",
        size: 120,
        Cell: ({ row }) =>
          row.original.brand?.brand_name ? (
            <Chip label={row.original.brand.brand_name} size="small" variant="outlined" />
          ) : (
            <Typography variant="caption" color="text.secondary">
              Any
            </Typography>
          ),
      },
      {
        accessorKey: "current_price",
        header: "Unit Price",
        size: 100,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {formatCurrency(row.original.current_price)}
            </Typography>
            {row.original.price_includes_gst && (
              <Typography variant="caption" color="text.secondary">
                incl. GST
              </Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: "total_landed_cost",
        header: "Total Cost",
        size: 110,
        Cell: ({ row }) => {
          const isBestPrice = isBestPriceForBrand(row.original);
          return (
            <Typography
              variant="body2"
              color={isBestPrice ? "success.main" : "primary.main"}
              fontWeight={isBestPrice ? 700 : 600}
            >
              {formatCurrency(row.original.total_landed_cost)}
              {isBestPrice && (
                <Typography component="span" variant="caption" color="success.main" sx={{ ml: 0.5 }}>
                  Best
                </Typography>
              )}
            </Typography>
          );
        },
      },
      {
        accessorKey: "min_order_qty",
        header: "MOQ",
        size: 80,
        Cell: ({ row }) => row.original.min_order_qty || "-",
      },
      {
        accessorKey: "lead_time_days",
        header: "Lead Time",
        size: 100,
        Cell: ({ row }) =>
          row.original.lead_time_days
            ? `${row.original.lead_time_days} day${row.original.lead_time_days > 1 ? "s" : ""}`
            : "-",
      },
      {
        accessorKey: "is_available",
        header: "Status",
        size: 100,
        Cell: ({ row }) =>
          row.original.is_available ? (
            <Chip
              icon={<CheckCircleIcon />}
              label="Available"
              size="small"
              color="success"
              variant="outlined"
            />
          ) : (
            <Chip
              icon={<CancelIcon />}
              label="N/A"
              size="small"
              color="default"
              variant="outlined"
            />
          ),
      },
      {
        accessorKey: "vendor.phone",
        header: "Contact",
        size: 120,
        Cell: ({ row }) =>
          row.original.vendor?.phone ? (
            <Tooltip title={`Call ${row.original.vendor.phone}`}>
              <Chip
                icon={<PhoneIcon />}
                label={row.original.vendor.phone}
                size="small"
                variant="outlined"
                component="a"
                href={`tel:${row.original.vendor.phone}`}
                clickable
              />
            </Tooltip>
          ) : (
            "-"
          ),
      },
    ],
    [isBestPriceForBrand]
  );

  if (error) {
    return (
      <Alert severity="error">
        Failed to load vendors: {(error as Error).message}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Stack>
          <Typography variant="h6">Vendors & Pricing</Typography>
          <Typography variant="body2" color="text.secondary">
            {vendors.length} vendor{vendors.length !== 1 ? "s" : ""} supply this material
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
          size="small"
        >
          Add Vendor
        </Button>
      </Box>

      {/* Vendors Table */}
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : vendors.length === 0 ? (
        <Alert severity="info">
          No vendors added yet. Click &quot;Add Vendor&quot; to add vendors who supply this material.
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={vendors}
          enableRowActions
          renderRowActions={({ row }) => (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Tooltip title="Price History">
                <IconButton
                  size="small"
                  onClick={() => handleViewPriceHistory(row.original)}
                >
                  <HistoryIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => handleEdit(row.original)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDeleteClick(row.original)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          enablePagination={vendors.length > 10}
          pageSize={10}
          showRecordCount={false}
        />
      )}

      {/* Add/Edit Dialog - note: for material context, we need vendor selection */}
      <VendorInventoryDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        material={material}
        inventoryItem={selectedItem}
      />

      {/* Remove Vendor Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onClose={(_event, reason) => { if (reason !== "backdropClick") setDeleteConfirm(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Remove Vendor</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove <strong>{deleteConfirm?.vendor?.name || "this vendor"}</strong> from <strong>{material.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This vendor will no longer appear in the pricing list for this material.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Price History Dialog */}
      {historyVendor && (
        <PriceHistoryDialog
          open={priceHistoryOpen}
          onClose={() => {
            setPriceHistoryOpen(false);
            setHistoryVendor(null);
          }}
          materialId={material.id}
          vendorId={historyVendor.id}
          materialName={material.name}
          materialUnit={material.unit || "unit"}
        />
      )}
    </Box>
  );
}
