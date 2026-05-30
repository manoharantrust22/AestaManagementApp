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
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Stack,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  LocalShipping as LocalShippingIcon,
  Inventory2 as InventoryIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useMaterials, useMaterialBrands } from "@/hooks/queries/useMaterials";
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
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import type {
  MaterialRequestWithDetails,
  MaterialRequestItemFormData,
  MaterialWithDetails,
  RequestPriority,
} from "@/types/material.types";

export type MRInitialItem = {
  materialId: string;
  qty: number;
  notes?: string;
  /** Composite brand row (e.g. teak `Log · 1st Quality`) — preserved when converting from basket. */
  brandId?: string | null;
  /** Display unit override — needed when the brand's price unit (e.g. cft, ft) differs from material.unit. */
  unit?: string;
  /** Vendor the requester picked at calculator time — pre-fills PO approval dialog. */
  vendorId?: string | null;
  /** Unit price (excl. GST) captured at calculator time — pre-fills PO approval dialog when vendor matches. */
  unitPrice?: number | null;
};

interface MaterialRequestDialogProps {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestWithDetails | null;
  siteId: string;
  initialItems?: MRInitialItem[];
}

interface RequestItemRow extends MaterialRequestItemFormData {
  id?: string;
  materialName?: string;
  unit?: string;
  availableStock?: number;
  first_batch_qty?: number;
  // `suggested_vendor_id` + `suggested_unit_price` are inherited from
  // MaterialRequestItemFormData and only set when the row was prefilled
  // from the cost calculator (so `useCreateMaterialRequest` can persist them).
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
  initialItems,
}: MaterialRequestDialogProps) {
  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const { showError: showToastError } = useToast();
  const isEdit = !!request;

  const { data: materials = [] } = useMaterials();
  const { data: stockItems = [] } = useSiteStock(siteId);
  const { data: groupMembership } = useSiteGroupMembership(siteId);

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
  const today = new Date().toISOString().split("T")[0];
  const [requestDate, setRequestDate] = useState(today);

  // Add N days to a YYYY-MM-DD string, returning a YYYY-MM-DD string.
  const addDaysToDate = (isoDate: string, days: number) => {
    if (!isoDate) return "";
    const d = new Date(isoDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };
  const [requiredByDate, setRequiredByDate] = useState("");
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [purchaseType, setPurchaseType] = useState<'own_site' | 'group_stock'>('own_site');
  const [deliveryType, setDeliveryType] = useState<'one_time' | 'bulk'>('one_time');
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RequestItemRow[]>([]);

  // New item form
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithDetails | null>(null);
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemFirstBatchQty, setNewItemFirstBatchQty] = useState("");
  const [newItemNotes, setNewItemNotes] = useState("");

  // Teak-specific entry — only used when selected material is TEA-0001.
  // Log: priced per cft, free width input.
  // Palagai: priced per running foot, width chosen from discrete chips (5"–12"),
  //          thickness defaults to 1.5" (rate stored at that thickness, scales
  //          linearly until real vendor rates for other thicknesses are entered).
  const TEAK_CODE = "TEA-0001";
  const PALAGAI_WIDTHS_IN = [5, 6, 7, 8, 9, 10, 12] as const;
  type PalagaiWidthIn = (typeof PALAGAI_WIDTHS_IN)[number];
  const PALAGAI_REFERENCE_THICKNESS_IN = 1.5;
  type TeakType = "Log" | "Palagai";
  type TeakQuality = "1st Quality" | "2nd Quality";
  const [teakType, setTeakType] = useState<TeakType>("Log");
  const [teakQuality, setTeakQuality] = useState<TeakQuality>("1st Quality");
  const [palagaiWidthIn, setPalagaiWidthIn] = useState<PalagaiWidthIn>(7);
  const [teakLengthFt, setTeakLengthFt] = useState("");
  const [teakWidthIn, setTeakWidthIn] = useState(""); // Log only
  const [teakThicknessIn, setTeakThicknessIn] = useState(""); // Log: required. Palagai: default 1.5".
  const [teakPieces, setTeakPieces] = useState("");

  const isTeak = selectedMaterial?.code === TEAK_CODE;
  const teakUnit: "cft" | "ft" = teakType === "Log" ? "cft" : "ft";

  const { data: teakBrands = [] } = useMaterialBrands(
    isTeak ? selectedMaterial?.id : undefined,
  );

  const resolvedTeakBrand = useMemo(() => {
    if (!isTeak) return null;
    const name =
      teakType === "Log"
        ? `Log · ${teakQuality}`
        : `Palagai ${palagaiWidthIn}" · ${teakQuality}`;
    return teakBrands.find((b) => b.brand_name === name) ?? null;
  }, [isTeak, teakBrands, teakType, teakQuality, palagaiWidthIn]);

  // Effective Palagai thickness for scaling vendor rates + populating notes.
  const palagaiThicknessIn =
    parseFloat(teakThicknessIn) > 0
      ? parseFloat(teakThicknessIn)
      : PALAGAI_REFERENCE_THICKNESS_IN;
  const palagaiNeedsScaleNote =
    isTeak &&
    teakType === "Palagai" &&
    Math.abs(palagaiThicknessIn - PALAGAI_REFERENCE_THICKNESS_IN) > 0.001;

  const teakComputedQty = useMemo(() => {
    if (!isTeak) return 0;
    const L = parseFloat(teakLengthFt) || 0;
    const Q = parseFloat(teakPieces) || 0;
    if (teakType === "Log") {
      const W = parseFloat(teakWidthIn) || 0;
      const T = parseFloat(teakThicknessIn) || 0;
      if (!L || !W || !T || !Q) return 0;
      return (W / 12) * (T / 12) * L * Q;
    }
    // Palagai: running feet = length × pieces (width × thickness affect price, not qty)
    if (!L || !Q) return 0;
    return L * Q;
  }, [
    isTeak,
    teakType,
    teakLengthFt,
    teakWidthIn,
    teakThicknessIn,
    teakPieces,
  ]);

  const resetTeakEntry = () => {
    setTeakType("Log");
    setTeakQuality("1st Quality");
    setPalagaiWidthIn(7);
    setTeakLengthFt("");
    setTeakWidthIn("");
    setTeakThicknessIn("");
    setTeakPieces("");
  };

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
      setRequestDate(request.request_date || today);
      setRequiredByDate(request.required_by_date || "");
      setPriority(request.priority);
      setPurchaseType(request.purchase_type ?? 'own_site');
      setDeliveryType(request.delivery_type ?? 'one_time');
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
      setRequestDate(today);
      setRequiredByDate("");
      setPriority("normal");
      setPurchaseType('own_site');
      setDeliveryType('one_time');
      setNotes("");
      if (initialItems && initialItems.length > 0) {
        const prefilled: RequestItemRow[] = initialItems.map((item) => {
          const mat = materials.find((m) => m.id === item.materialId);
          return {
            material_id: item.materialId,
            brand_id: item.brandId ?? undefined,
            requested_qty: item.qty,
            notes: item.notes,
            materialName: mat?.name,
            // Honour the basket's pricing unit (cft / ft) over the catalog default (piece).
            unit: item.unit ?? mat?.unit,
            availableStock: getAvailableStock(item.materialId),
            suggested_vendor_id: item.vendorId ?? null,
            suggested_unit_price: item.unitPrice ?? null,
          };
        });
        setItems(prefilled);
      } else {
        setItems([]);
      }
    }
    setError("");
    setSelectedMaterial(null);
    setNewItemQty("");
    setNewItemFirstBatchQty("");
    setNewItemNotes("");
    resetTeakEntry();
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

    if (isTeak) {
      if (!resolvedTeakBrand) {
        setError(
          `Could not find brand for ${teakType} · ${teakQuality}${
            teakType === "Palagai" ? ` (${palagaiWidthIn}")` : ""
          } — check the teak catalog.`,
        );
        return;
      }
      const L = parseFloat(teakLengthFt) || 0;
      const Q = parseFloat(teakPieces) || 0;
      const W =
        teakType === "Log" ? parseFloat(teakWidthIn) || 0 : palagaiWidthIn;
      const T =
        teakType === "Log"
          ? parseFloat(teakThicknessIn) || 0
          : palagaiThicknessIn;
      if (teakType === "Log" && (!L || !W || !T || !Q)) {
        setError("Enter length, width, thickness and number of pieces.");
        return;
      }
      if (teakType === "Palagai" && (!L || !Q)) {
        setError("Enter length and number of pieces.");
        return;
      }
      if (teakComputedQty <= 0) {
        setError("Computed quantity must be greater than zero.");
        return;
      }
      // Allow the same teak material to be added more than once under different
      // brands — duplicate-guard by (material, brand) instead of material alone.
      if (
        items.some(
          (item) =>
            item.material_id === selectedMaterial.id &&
            item.brand_id === resolvedTeakBrand.id,
        )
      ) {
        setError(`${resolvedTeakBrand.brand_name} is already in this request.`);
        return;
      }

      const dimsLabel =
        teakType === "Log"
          ? `${W}\" × ${T}\" × ${L}ft × ${Q}pcs`
          : `${palagaiWidthIn}\" × ${T}\" × ${L}ft × ${Q}pcs`;
      const baseNotes = `${resolvedTeakBrand.brand_name} — ${dimsLabel}`;
      const finalNotes = newItemNotes
        ? `${baseNotes} | ${newItemNotes}`
        : baseNotes;

      const firstBatch = deliveryType === "bulk" && newItemFirstBatchQty
        ? parseFloat(newItemFirstBatchQty)
        : undefined;

      const newItem: RequestItemRow = {
        material_id: selectedMaterial.id,
        brand_id: resolvedTeakBrand.id,
        requested_qty: parseFloat(teakComputedQty.toFixed(3)),
        first_batch_qty: firstBatch,
        notes: finalNotes,
        materialName: `${selectedMaterial.name} — ${resolvedTeakBrand.brand_name}`,
        unit: teakUnit,
        availableStock: getAvailableStock(selectedMaterial.id),
      };

      setItems([...items, newItem]);
      setSelectedMaterial(null);
      resetTeakEntry();
      setNewItemFirstBatchQty("");
      setNewItemNotes("");
      setError("");
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

    const firstBatch = deliveryType === 'bulk' && newItemFirstBatchQty
      ? parseFloat(newItemFirstBatchQty)
      : undefined;

    const newItem: RequestItemRow = {
      material_id: selectedMaterial.id,
      requested_qty: parseFloat(newItemQty),
      first_batch_qty: firstBatch,
      notes: newItemNotes || undefined,
      materialName: selectedMaterial.name,
      unit: selectedMaterial.unit,
      availableStock,
    };

    setItems([...items, newItem]);
    setSelectedMaterial(null);
    setNewItemQty("");
    setNewItemFirstBatchQty("");
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

  const handleSave = async (targetStatus: 'pending' | 'draft') => {
    if (isSubmittingRef.current) return;
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
        const isDraftBeingSubmitted = request.status === 'draft' && targetStatus === 'pending';
        await updateRequest.mutateAsync({
          id: request.id,
          data: {
            section_id: sectionId || undefined,
            request_date: requestDate || undefined,
            required_by_date: requiredByDate || undefined,
            priority,
            notes: notes || undefined,
            ...(isDraftBeingSubmitted ? { status: 'pending' } : {}),
          },
        });

        const newItems = items.filter((item) => !item.id);
        if (removedItemIds.length > 0 || newItems.length > 0) {
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
        } else if (linkedPOsCount > 0 && !isDraftBeingSubmitted) {
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
          request_date: requestDate || undefined,
          required_by_date: deliveryType === 'one_time' ? (requiredByDate || undefined) : undefined,
          priority: deliveryType === 'one_time' ? priority : 'normal',
          status: targetStatus,
          purchase_type: purchaseType,
          delivery_type: deliveryType,
          notes: notes || undefined,
          items: items.map((item) => {
            const baseNotes = item.notes || '';
            const batchNote = item.first_batch_qty
              ? `First batch: ${item.first_batch_qty}${baseNotes ? ` | ${baseNotes}` : ''}`
              : baseNotes;
            return {
              material_id: item.material_id,
              brand_id: item.brand_id,
              requested_qty: item.requested_qty,
              notes: batchNote || undefined,
              suggested_vendor_id: item.suggested_vendor_id ?? null,
              suggested_unit_price: item.suggested_unit_price ?? null,
            };
          }),
        });
      }
      onClose();
    } catch (err: unknown) {
      console.error("[MaterialRequestDialog] Submit error:", err);
      let message = "Failed to save request";
      if (err instanceof Error) message = err.message;
      const errObj = err as Record<string, unknown>;
      if (errObj?.code === "23505" || errObj?.status === 409 || message.includes("409")) {
        message = "A request with this number already exists. Please try again.";
      }
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

          {/* Request Date — defaults to today; allow backdating for historical entries */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="date"
              label="Request Date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: today },
              }}
              helperText="Backdate for historical entries"
            />
          </Grid>

          {/* Delivery type toggle — always visible */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Delivery type
              </Typography>
              <ToggleButtonGroup
                value={deliveryType}
                exclusive
                onChange={(_, val) => { if (val) setDeliveryType(val); }}
                size="small"
              >
                <ToggleButton value="one_time" sx={{ gap: 0.5 }}>
                  <LocalShippingIcon fontSize="small" />
                  One-time delivery
                </ToggleButton>
                <ToggleButton value="bulk" sx={{ gap: 0.5 }}>
                  <InventoryIcon fontSize="small" />
                  Bulk / Multiple batches
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Grid>

          {/* One-time only: Required By + Priority */}
          {deliveryType === 'one_time' && (
            <>
              <Grid size={{ xs: 6, md: 4 }}>
                {/* Quick-fill chips compute off Request Date (falls back to today) so the
                    common "same as request date" case needs one tap instead of typing. */}
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, flexWrap: "wrap", gap: 0.5 }}>
                  {[
                    { label: "Same day", days: 0 },
                    { label: "+1 day", days: 1 },
                    { label: "+2 days", days: 2 },
                  ].map(({ label, days }) => {
                    const chipDate = addDaysToDate(requestDate || today, days);
                    return (
                      <Chip
                        key={label}
                        label={label}
                        size="small"
                        variant={requiredByDate === chipDate ? "filled" : "outlined"}
                        color={requiredByDate === chipDate ? "primary" : "default"}
                        onClick={() => setRequiredByDate(chipDate)}
                      />
                    );
                  })}
                </Stack>
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
            </>
          )}

          {/* Bulk mode info banner */}
          {deliveryType === 'bulk' && (
            <Grid size={12}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                Vendor will deliver in multiple batches over time. Specify total quantity needed and optionally how much is needed in the first delivery.
              </Alert>
            </Grid>
          )}

          {/* Purchase type — only shown when site is in a group */}
          {groupMembership?.isInGroup && (
            <Grid size={12}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Purchase for
                </Typography>
                <ToggleButtonGroup
                  value={purchaseType}
                  exclusive
                  onChange={(_, val) => { if (val) setPurchaseType(val); }}
                  size="small"
                >
                  <ToggleButton value="own_site">This site only</ToggleButton>
                  <ToggleButton value="group_stock">Group stock</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Grid>
          )}

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

          {!isTeak && (
            <Grid size={{ xs: deliveryType === 'bulk' ? 3 : 4, md: 2 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Total Qty"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
              />
            </Grid>
          )}

          {!isTeak && deliveryType === 'bulk' && (
            <Grid size={{ xs: 3, md: 2 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="1st Batch Qty"
                value={newItemFirstBatchQty}
                onChange={(e) => setNewItemFirstBatchQty(e.target.value)}
                slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                placeholder="Optional"
              />
            </Grid>
          )}

          {!isTeak && (
            <Grid size={{ xs: deliveryType === 'bulk' ? 6 : 8, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Notes"
                value={newItemNotes}
                onChange={(e) => setNewItemNotes(e.target.value)}
                placeholder="Optional"
              />
            </Grid>
          )}

          {!isTeak && (
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
          )}

          {isTeak && (
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Teak wood — {teakType === "Log"
                    ? "enter per-piece dimensions; total in cft"
                    : "pick plank width; total in running feet (rate × thickness ratio when ≠ 1.5″)"}
                </Typography>
                <Grid container spacing={1.5} alignItems="center">
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Type
                      </Typography>
                      <ToggleButtonGroup
                        value={teakType}
                        exclusive
                        onChange={(_, val) => { if (val) setTeakType(val as TeakType); }}
                        size="small"
                        fullWidth
                      >
                        <ToggleButton value="Log">Log</ToggleButton>
                        <ToggleButton value="Palagai">Palagai</ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Quality
                      </Typography>
                      <ToggleButtonGroup
                        value={teakQuality}
                        exclusive
                        onChange={(_, val) => { if (val) setTeakQuality(val as TeakQuality); }}
                        size="small"
                        fullWidth
                      >
                        <ToggleButton value="1st Quality">1st Quality</ToggleButton>
                        <ToggleButton value="2nd Quality">2nd Quality</ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    {!resolvedTeakBrand && (
                      <Typography variant="caption" color="warning.main">
                        Brand &ldquo;{teakType} · {teakQuality}&rdquo; not found in catalog.
                      </Typography>
                    )}
                  </Grid>

                  {teakType === "Palagai" && (
                    <Grid size={12}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Plank width
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {PALAGAI_WIDTHS_IN.map((w) => (
                          <ToggleButton
                            key={w}
                            value={w}
                            selected={palagaiWidthIn === w}
                            onClick={() => setPalagaiWidthIn(w)}
                            size="small"
                            sx={{ px: 1.5, py: 0.25 }}
                          >
                            {w}&quot;
                          </ToggleButton>
                        ))}
                      </Box>
                    </Grid>
                  )}

                  <Grid size={{ xs: 6, md: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Length (ft)"
                      value={teakLengthFt}
                      onChange={(e) => setTeakLengthFt(e.target.value)}
                      slotProps={{ input: { inputProps: { min: 0, step: 0.1 } } }}
                    />
                  </Grid>
                  {teakType === "Log" && (
                    <Grid size={{ xs: 6, md: 2 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="Width (in)"
                        value={teakWidthIn}
                        onChange={(e) => setTeakWidthIn(e.target.value)}
                        slotProps={{ input: { inputProps: { min: 0, step: 0.1 } } }}
                      />
                    </Grid>
                  )}
                  <Grid size={{ xs: 6, md: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label={
                        teakType === "Palagai"
                          ? "Thickness (in, default 1.5)"
                          : "Thickness (in)"
                      }
                      value={teakThicknessIn}
                      onChange={(e) => setTeakThicknessIn(e.target.value)}
                      placeholder={teakType === "Palagai" ? "1.5" : undefined}
                      slotProps={{ input: { inputProps: { min: 0, step: 0.1 } } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, md: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="No. of pieces"
                      value={teakPieces}
                      onChange={(e) => setTeakPieces(e.target.value)}
                      slotProps={{ input: { inputProps: { min: 1, step: 1 } } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        minHeight: 40,
                        px: 1.5,
                        py: 0.5,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <Typography variant="caption" color="text.secondary">
                          Total
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {teakComputedQty > 0
                            ? `${teakComputedQty.toFixed(3)} ${teakUnit}`
                            : `— ${teakUnit}`}
                        </Typography>
                      </Box>
                      {teakComputedQty > 0 && (parseFloat(teakPieces) || 0) > 1 && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                          {(teakComputedQty / (parseFloat(teakPieces) || 1)).toFixed(3)} {teakUnit}/pc × {teakPieces} pcs
                        </Typography>
                      )}
                      {palagaiNeedsScaleNote && (
                        <Typography variant="caption" color="warning.main" sx={{ fontSize: "0.7rem" }}>
                          Vendor rate scales by ×{(palagaiThicknessIn / PALAGAI_REFERENCE_THICKNESS_IN).toFixed(2)} for {palagaiThicknessIn.toFixed(2)}″ thickness
                        </Typography>
                      )}
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, md: deliveryType === "bulk" ? 4 : 8 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Extra notes (optional)"
                      value={newItemNotes}
                      onChange={(e) => setNewItemNotes(e.target.value)}
                      placeholder="Dimensions are auto-added; type any extra context"
                    />
                  </Grid>
                  {deliveryType === "bulk" && (
                    <Grid size={{ xs: 6, md: 2 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label={`1st batch (${teakUnit})`}
                        value={newItemFirstBatchQty}
                        onChange={(e) => setNewItemFirstBatchQty(e.target.value)}
                        slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                        placeholder="Optional"
                      />
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, md: 2 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleAddItem}
                      sx={{ height: 40 }}
                      disabled={teakComputedQty <= 0 || !resolvedTeakBrand}
                    >
                      Add
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Items Table */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Total Qty</TableCell>
                    {deliveryType === 'bulk' && (
                      <TableCell align="right">1st Batch</TableCell>
                    )}
                    <TableCell align="right">In Stock</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell width={50}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={deliveryType === 'bulk' ? 6 : 5} align="center">
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
                        {deliveryType === 'bulk' && (
                          <TableCell align="right">
                            <Typography variant="body2" color={item.first_batch_qty ? "primary" : "text.disabled"}>
                              {item.first_batch_qty ?? "—"}
                            </Typography>
                          </TableCell>
                        )}
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
        {(!isEdit || request?.status === 'draft') && (
          <Button
            variant="outlined"
            onClick={() => handleSave('draft')}
            disabled={isSubmitting || items.length === 0}
          >
            {isSubmitting ? "Saving..." : "Save Draft"}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={() => handleSave('pending')}
          disabled={isSubmitting || items.length === 0}
        >
          {isSubmitting
            ? "Submitting..."
            : isEdit && request?.status !== 'draft'
            ? "Update Request"
            : "Submit Request"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
