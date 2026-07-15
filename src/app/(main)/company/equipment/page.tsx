"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  Tabs,
  Tab,
  Fab,
  Snackbar,
  Alert,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { hasEditPermission } from "@/lib/permissions";
import {
  useEquipmentList,
  useEquipmentCategories,
  useDeleteEquipment,
  usePendingTransfers,
  useMaintenanceAlerts,
} from "@/hooks/queries/useEquipment";
import {
  EquipmentDialog,
  EquipmentList,
  EquipmentDetailsDrawer,
  EquipmentTransferDialog,
  EquipmentReceiveDialog,
  MaintenanceDialog,
  EquipmentFilterBar,
} from "@/components/equipment";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import type {
  EquipmentWithDetails,
  EquipmentFilterState,
  EquipmentTransferWithDetails,
} from "@/types/equipment.types";

// Category tabs for filtering
const CATEGORY_TABS = [
  { id: "all", label: "All Equipment" },
  { id: "surveillance", label: "Cameras" },
  { id: "tools", label: "Tools" },
  { id: "machinery", label: "Machinery" },
  { id: "phones", label: "Phones" },
  { id: "electronics", label: "Electronics" },
  { id: "vehicles", label: "Vehicles" },
  { id: "safety", label: "Safety" },
  { id: "office", label: "Office" },
];

// Map tab IDs to category codes
const TAB_CATEGORY_MAPPING: Record<string, string | undefined> = {
  all: undefined,
  surveillance: "CAM",
  tools: "TOOL",
  machinery: "MACH",
  phones: "PHN",
  electronics: "ELEC",
  vehicles: "VEH",
  safety: "SAFE",
  office: "OFFC",
};

export default function EquipmentPage() {
  const searchParams = useSearchParams();
  const { userProfile } = useAuth();
  const isMobile = useIsMobile();
  const canEdit = hasEditPermission(userProfile?.role);

  // Get initial tab from URL params
  const initialTab = searchParams.get("tab") || "all";

  // State
  const [selectedTab, setSelectedTab] = useState(initialTab);
  const [filters, setFilters] = useState<EquipmentFilterState>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentWithDetails | null>(null);
  const [variantParentId, setVariantParentId] = useState<string | undefined>(undefined);
  const [viewingEquipment, setViewingEquipment] = useState<EquipmentWithDetails | null>(null);
  const [transferEquipment, setTransferEquipment] = useState<EquipmentWithDetails | null>(null);
  const [maintenanceEquipment, setMaintenanceEquipment] = useState<EquipmentWithDetails | null>(null);
  const [receiveTransfer, setReceiveTransfer] = useState<EquipmentTransferWithDetails | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; equipment: EquipmentWithDetails | null }>({
    open: false,
    equipment: null,
  });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  // Get category ID for selected tab
  const { data: categories = [] } = useEquipmentCategories();

  const selectedCategoryId = useMemo(() => {
    const categoryCode = TAB_CATEGORY_MAPPING[selectedTab];
    if (!categoryCode) return undefined;
    const category = categories.find((c) => c.code_prefix === categoryCode);
    return category?.id;
  }, [selectedTab, categories]);

  // Build filter state with tab selection
  const effectiveFilters = useMemo<EquipmentFilterState>(() => ({
    ...filters,
    category_id: selectedCategoryId,
  }), [filters, selectedCategoryId]);

  // Data fetching
  const { data: equipmentList = [], isLoading } = useEquipmentList(effectiveFilters);
  const { data: pendingTransfers = [] } = usePendingTransfers();
  const { data: maintenanceAlerts } = useMaintenanceAlerts();
  const deleteEquipment = useDeleteEquipment();

  // Handlers
  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: string) => {
    setSelectedTab(newValue);
    // Update URL without navigation
    const params = new URLSearchParams(window.location.search);
    if (newValue === "all") {
      params.delete("tab");
    } else {
      params.set("tab", newValue);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, []);

  const handleFilterChange = useCallback((newFilters: EquipmentFilterState) => {
    setFilters(newFilters);
  }, []);

  const handleOpenDialog = useCallback((equipment?: EquipmentWithDetails) => {
    if (equipment) {
      setEditingEquipment(equipment);
    } else {
      setEditingEquipment(null);
    }
    setVariantParentId(undefined);
    setDialogOpen(true);
  }, []);

  const handleAddVariant = useCallback((parent: EquipmentWithDetails) => {
    setEditingEquipment(null);
    setVariantParentId(parent.id);
    setViewingEquipment(null);
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingEquipment(null);
    setVariantParentId(undefined);
  }, []);

  const handleView = useCallback((equipment: EquipmentWithDetails) => {
    setViewingEquipment(equipment);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setViewingEquipment(null);
  }, []);

  const handleTransfer = useCallback((equipment: EquipmentWithDetails) => {
    setTransferEquipment(equipment);
  }, []);

  const handleCloseTransfer = useCallback(() => {
    setTransferEquipment(null);
  }, []);

  const handleMaintenance = useCallback((equipment: EquipmentWithDetails) => {
    setMaintenanceEquipment(equipment);
  }, []);

  const handleCloseMaintenance = useCallback(() => {
    setMaintenanceEquipment(null);
  }, []);

  const handleReceive = useCallback((transfer: EquipmentTransferWithDetails) => {
    setReceiveTransfer(transfer);
  }, []);

  const handleCloseReceive = useCallback(() => {
    setReceiveTransfer(null);
  }, []);

  const handleDeleteClick = useCallback((equipment: EquipmentWithDetails) => {
    setDeleteConfirm({ open: true, equipment });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm.equipment) return;
    const equipmentName = deleteConfirm.equipment.name;
    try {
      await deleteEquipment.mutateAsync(deleteConfirm.equipment.id);
      setDeleteConfirm({ open: false, equipment: null });
      setSnackbar({
        open: true,
        message: `"${equipmentName}" deleted successfully`,
        severity: "success",
      });
    } catch (error) {
      console.error("Failed to delete equipment:", error);
      setDeleteConfirm({ open: false, equipment: null });
      setSnackbar({
        open: true,
        message: `Failed to delete equipment: ${error instanceof Error ? error.message : "Unknown error"}`,
        severity: "error",
      });
    }
  }, [deleteConfirm.equipment, deleteEquipment]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ open: false, equipment: null });
  }, []);

  const handleSnackbarClose = useCallback(() => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  // Count badges for tabs
  const pendingCount = pendingTransfers.length;
  const overdueCount = maintenanceAlerts?.overdue_count || 0;

  return (
    <Box>
      <PageHeader
        title="Equipment"
        subtitle={`${equipmentList.length} equipment items`}
        actions={
          !isMobile && canEdit ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              Add Equipment
            </Button>
          ) : null
        }
      />

      {/* Category Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ "& .MuiTabs-scrollButtons.Mui-disabled": { opacity: 0.25 } }}
        >
          {CATEGORY_TABS.map((tab) => (
            <Tab key={tab.id} value={tab.id} label={tab.label} />
          ))}
        </Tabs>
      </Box>

      {/* Filters */}
      <EquipmentFilterBar
        filters={filters}
        onChange={handleFilterChange}
      />

      {/* Equipment List */}
      <EquipmentList
        equipment={equipmentList}
        isLoading={isLoading}
        onView={handleView}
        onEdit={canEdit ? handleOpenDialog : undefined}
        onTransfer={canEdit ? handleTransfer : undefined}
        onMaintenance={canEdit ? handleMaintenance : undefined}
        onDelete={canEdit ? handleDeleteClick : undefined}
      />

      {/* Mobile FAB */}
      {isMobile && canEdit && (
        <Fab
          color="primary"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={() => handleOpenDialog()}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Equipment Dialog */}
      <EquipmentDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        equipment={editingEquipment}
        defaultVariantParentId={variantParentId}
      />

      {/* Equipment Details Drawer */}
      <EquipmentDetailsDrawer
        open={!!viewingEquipment}
        onClose={handleCloseDrawer}
        equipment={viewingEquipment}
        onEdit={canEdit ? handleOpenDialog : undefined}
        onTransfer={canEdit ? handleTransfer : undefined}
        onMaintenance={canEdit ? handleMaintenance : undefined}
        onAddVariant={canEdit ? handleAddVariant : undefined}
      />

      {/* Transfer Dialog */}
      <EquipmentTransferDialog
        open={!!transferEquipment}
        onClose={handleCloseTransfer}
        equipment={transferEquipment}
      />

      {/* Receive Dialog */}
      <EquipmentReceiveDialog
        open={!!receiveTransfer}
        onClose={handleCloseReceive}
        transfer={receiveTransfer}
      />

      {/* Maintenance Dialog */}
      <MaintenanceDialog
        open={!!maintenanceEquipment}
        onClose={handleCloseMaintenance}
        equipment={maintenanceEquipment}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Equipment"
        message={`Are you sure you want to delete "${deleteConfirm.equipment?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteEquipment.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
