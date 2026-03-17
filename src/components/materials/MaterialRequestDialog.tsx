"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  Autocomplete,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useSiteStock } from "@/hooks/queries/useStockInventory";
import {
  useCreateMaterialRequest,
  useUpdateMaterialRequest,
  useLinkedPOsCount,
  useRevertLinkedPOsToDraft,
  useEditMaterialRequestItems,
  useRequestItemDeliveryStatus,
} from "@/hooks/queries/useMaterialRequests";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  MaterialRequestWithDetails,
  MaterialRequestItemFormData,
  MaterialWithDetails,
  RequestPriority,
} from "@/types/material.types";

interface MaterialRequestDialogProps {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestWithDetails | null;
  siteId: string;
}

interface RequestItemRow extends MaterialRequestItemFormData {
  id?: string;
  materialName?: string;
  unit?: string;
  availableStock?: number;
}

const PRIORITY_OPTIONS: { value: RequestPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function MaterialRequestDialog({
  open,
  onClose,
  request,
  siteId,
}: MaterialRequestDialogProps) {
  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const { showError: showToastError } = useToast();
  const isEdit = !!request;

  const { data: materials = [] } = useMaterials();
  const { data: stockItems = [] } = useSiteStock(siteId);

  // Fetch building sections for this site
  const supabase = createClient();
  const { data: sections = [] } = useQuery({
    queryKey: ["buildingSections", siteId],
    queryFn: async () => {
      if (!siteId) return [];
      const { data, error } = await supabase
        .from("building_sections")
        .select("id, name, status, sequence_order")
        .eq("site_id", siteId)
        .order("sequence_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!siteId,
  });

  const createRequest = useCreateMaterialRequest();
  const updateRequest = useUpdateMaterialRequest();
  const revertPOsToDraft = useRevertLinkedPOsToDraft();
  const editItems = useEditMaterialRequestItems();

  // Check if this request has linked POs (only relevant for edit mode)
  const { data: linkedPOsData } = useLinkedPOsCount(
    isEdit ? request?.id : undefined
  );
  const linkedPOsCount = linkedPOsData?.total || 0;

  // Check which items have delivery records (cannot be removed)
  const { data: itemDeliveryStatus = {} } = useRequestItemDeliveryStatus(
    isEdit ? request?.id : undefined
  );

  const [error, setError] = useState("");
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RequestItemRow[]>([]);

  // New item form
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithDetails | null>(null);
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemNotes, setNewItemNotes] = useState("");

  // Ref to prevent double submissions (more reliable than state)
  const isSubmittingRef = useRef(false);

  // Get available stock for a material
  const getAvailableStock = (materialId: string) => {
    const stockItem = stockItems.find((s) => s.material_id === materialId);
    return stockItem?.available_qty || 0;
  };

  // Reset form when dialog opens/closes or request changes
  // Note: stockItems intentionally excluded to prevent infinite loops
  // availableStock will be 0 initially but updates aren't critical for form reset
  useEffect(() => {
    if (request) {
      setSectionId(request.section_id || "");
      setRequiredByDate(request.required_by_date || "");
      setPriority(request.priority);
      setNotes(request.notes || "");

      // Map existing items
      const existingItems: RequestItemRow[] =
        request.items?.map((item) => ({
          id: item.id,
          material_id: item.material_id,
          brand_id: item.brand_id || undefined,
          requested_qty: item.requested_qty,
          notes: item.notes || undefined,
          materialName: item.material?.name,
          unit: item.material?.unit,
          availableStock: getAvailableStock(item.material_id),
        })) || [];
      setItems(existingItems);
    } else {
      setSectionId("");
      setRequiredByDate("");
      setPriority("normal");
      setNotes("");
      setItems([]);
    }
    setError("");
    setSelectedMaterial(null);
    setNewItemQty("");
    setNewItemNotes("");
    setRemovedItemIds([]);
    // Reset submission guard when dialog opens/closes
    isSubmittingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, open]);

  const handleAddItem = () => {
    if (!selectedMaterial) {
      setError("Please select a material");
      return;
    }
    if (!newItemQty || parseFloat(newItemQty) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    // Check if material already added
    if (items.some((item) => item.material_id === selectedMaterial.id)) {
      setError("This material is already in the request");
      return;
    }

    const availableStock = getAvailableStock(selectedMaterial.id);

    const newItem: RequestItemRow = {
      material_id: selectedMaterial.id,
      requested_qty: parseFloat(newItemQty),
      notes: newItemNotes || undefined,
      materialName: selectedMaterial.name,
      unit: selectedMaterial.unit,
      availableStock,
    };

    setItems([...items, newItem]);
    setSelectedMaterial(null);
    setNewItemQty("");
    setNewItemNotes("");
    setError("");
  };

  const handleRemoveItem = (index: number) => {
    const item = items[index];
    // Track existing item removal for backend cascade in edit mode
    if (isEdit && item.id) {
      setRemovedItemIds((prev) => [...prev, item.id!]);
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Prevent double submissions using ref (synchronous check)
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;

    if (!userProfile?.id) {
      setError("User not authenticated");
      isSubmittingRef.current = false;
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one item");
      isSubmittingRef.current = false;
      return;
    }

    try {
      if (isEdit) {
        // Update request-level fields
        await updateRequest.mutateAsync({
          id: request.id,
          data: {
            section_id: sectionId || undefined,
            required_by_date: requiredByDate || undefined,
            priority,
            notes: notes || undefined,
          },
        });

        // Determine new items (items without an id are new)
        const newItems = items.filter((item) => !item.id);

        if (removedItemIds.length > 0 || newItems.length > 0) {
          // Use the edit items RPC for add/remove with cascade
          await editItems.mutateAsync({
            requestId: request.id,
            siteId,
            itemsToRemove: removedItemIds,
            itemsToAdd: newItems.map((item) => ({
              material_id: item.material_id,
              brand_id: item.brand_id,
              requested_qty: item.requested_qty,
              notes: item.notes,
            })),
          });
        } else if (linkedPOsCount > 0) {
          // Only revert POs if no item changes but request fields changed
          try {
            await revertPOsToDraft.mutateAsync({ requestId: request.id, siteId });
          } catch (revertError) {
            console.warn("Failed to revert linked POs to draft:", revertError);
          }
        }
      } else {
        await createRequest.mutateAsync({
          site_id: siteId,
          section_id: sectionId || undefined,
          requested_by: userProfile.id,
          required_by_date: requiredByDate || undefined,
          priority,
          notes: notes || undefined,
          items: items.map((item) => ({
            material_id: item.material_id,
            brand_id: item.brand_id,
            requested_qty: item.requested_qty,
            notes: item.notes,
          })),
        });
      }
      onClose();
    } catch (err: unknown) {
      console.error("[MaterialRequestDialog] Submit error:", err);
      // Extract error details
      let message = "Failed to save request";
      if (err instanceof Error) {
        message = err.message;
      }
      // Check for 409 Conflict (duplicate/already exists)
      const errObj = err as Record<string, unknown>;
      if (errObj?.code === "23505" || errObj?.status === 409 || message.includes("409")) {
        message = "A request with this number already exists. Please try again.";
      }
      // Check for timeout errors
      if (message.includes("timed out")) {
        showToastError("Request timed out. Please check your connection and try again.", 8000);
      }
      setError(message);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const isSubmitting = createRequest.isPending || updateRequest.isPending || revertPOsToDraft.isPending || editItems.isPending;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {isEdit
          ? `Edit Request ${request.request_number}`
          : "New Material Request"}
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Warning for edit mode with linked POs */}
        {isEdit && linkedPOsCount > 0 && (
          <Alert
            severity="warning"
            icon={<WarningIcon />}
            sx={{ mb: 2 }}
          >
            This request has <strong>{linkedPOsCount}</strong> linked Purchase Order
            {linkedPOsCount !== 1 ? "s" : ""}.
            {removedItemIds.length > 0 ? (
              <> Removing <strong>{removedItemIds.length}</strong> item
              {removedItemIds.length !== 1 ? "s" : ""} may affect linked POs.
              POs that lose all linked items will be deleted. Remaining POs will be
              reverted to <strong>draft</strong> status.</>
            ) : (
              <> Saving changes will revert non-delivered POs
              back to <strong>draft</strong> status for re-processing.</>
            )}
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Section Selection */}
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel>Section (Optional)</InputLabel>
              <Select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                label="Section (Optional)"
              >
                <MenuItem value="">No Section</MenuItem>
                {sections.map((section) => (
                  <MenuItem key={section.id} value={section.id}>
                    {section.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 6, md: 4 }}>
            <TextField
              fullWidth
              type="date"
              label="Required By"
              value={requiredByDate}
              onChange={(e) => setRequiredByDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          <Grid size={{ xs: 6, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as RequestPriority)}
                label="Priority"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Add Item Section */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="subtitle2">Add Items</Typography>
            </Divider>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Autocomplete
              options={materials}
              getOptionLabel={(option) =>
                `${option.name}${option.code ? ` (${option.code})` : ""}`
              }
              value={selectedMaterial}
              onChange={(_, value) => setSelectedMaterial(value)}
              renderInput={(params) => (
                <TextField {...params} label="Material" size="small" />
              )}
              renderOption={(props, option) => {
                const stock = getAvailableStock(option.id);
                return (
                  <li {...props} key={option.id}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.code} • {option.unit}
                        {stock > 0 && (
                          <span style={{ color: "green" }}>
                            {" "}
                            • In Stock: {stock}
                          </span>
                        )}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
            />
          </Grid>

          <Grid size={{ xs: 4, md: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Quantity"
              value={newItemQty}
              onChange={(e) => setNewItemQty(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
            />
          </Grid>

          <Grid size={{ xs: 8, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Notes"
              value={newItemNotes}
              onChange={(e) => setNewItemNotes(e.target.value)}
              placeholder="Optional"
            />
          </Grid>

          <Grid size={{ xs: 12, md: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
              sx={{ height: 40 }}
            >
              Add
            </Button>
          </Grid>

          {/* Items Table */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Requested</TableCell>
                    <TableCell align="right">In Stock</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell width={50}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 2 }}
                        >
                          No items added yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="body2">
                            {item.materialName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.unit}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{item.requested_qty}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={
                              (item.availableStock || 0) >= item.requested_qty
                                ? "success.main"
                                : "warning.main"
                            }
                          >
                            {item.availableStock || 0}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {item.notes || "-"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {isEdit && item.id && itemDeliveryStatus[item.id] ? (
                            <Tooltip title="Cannot remove — has delivery records">
                              <span>
                                <IconButton size="small" disabled>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : (
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveItem(index)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Request Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              placeholder="Additional notes for this request..."
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || items.length === 0}
        >
          {isSubmitting
            ? "Submitting..."
            : isEdit
            ? "Update Request"
            : "Submit Request"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
