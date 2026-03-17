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
  FormControlLabel,
  Switch,
  InputAdornment,
  Collapse,
  MenuItem,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Groups as GroupsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useVendors } from "@/hooks/queries/useVendors";
import { useMaterialSearchOptions, filterMaterialSearchOptions } from "@/hooks/queries/useMaterials";
import { useLatestPrice, useVendorMaterialPrice, useVendorMaterialBrands } from "@/hooks/queries/useVendorInventory";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import {
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useAddPOItem,
  useRemovePOItem,
} from "@/hooks/queries/usePurchaseOrders";
import type {
  PurchaseOrderWithDetails,
  PurchaseOrderItemFormData,
  Vendor,
  MaterialWithDetails,
  MaterialBrand,
  MaterialSearchOption,
} from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";
import { calculatePieceWeight } from "@/lib/weightCalculation";
import WeightCalculationDisplay from "./WeightCalculationDisplay";
import { useToast } from "@/contexts/ToastContext";
import FileUploader from "@/components/common/FileUploader";
import { BillPreviewButton } from "@/components/common/BillViewerDialog";
import { createClient } from "@/lib/supabase/client";

interface PurchaseOrderDialogProps {
  open: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrderWithDetails | null;
  siteId: string;
  // Prefilled data from navigation (e.g., from material-search)
  prefilledVendorId?: string;
  prefilledMaterialId?: string;
  prefilledMaterialName?: string;
  prefilledUnit?: string;
}

interface POItemRow extends PurchaseOrderItemFormData {
  id?: string;
  materialName?: string;
  brandName?: string;
  unit?: string;
  // Note: weight_per_unit is weight per METER (industry standard), not per piece
  weight_per_unit?: number | null;
  weight_unit?: string | null;
  length_per_piece?: number | null;
  length_unit?: string | null;
  // Standard piece weight for comparison (calculated from weight_per_unit × length)
  standard_piece_weight?: number | null;
}

export default function PurchaseOrderDialog({
  open,
  onClose,
  purchaseOrder,
  siteId,
  prefilledVendorId,
  prefilledMaterialId,
  prefilledMaterialName,
  prefilledUnit,
}: PurchaseOrderDialogProps) {
  const isMobile = useIsMobile();
  const isEdit = !!purchaseOrder;
  const { showSuccess, showError } = useToast();

  const { data: vendors = [] } = useVendors();
  // Use flattened search options for the autocomplete (supports material/variant/brand search)
  const { data: materialSearchOptions = [], groupedMaterials = [] } = useMaterialSearchOptions();

  const createPO = useCreatePurchaseOrder();
  const updatePO = useUpdatePurchaseOrder();
  const addItem = useAddPOItem();
  const removeItem = useRemovePOItem();

  // Check if site belongs to a group
  const { data: groupMembership } = useSiteGroupMembership(siteId);

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split("T")[0];

  const [error, setError] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentTiming, setPaymentTiming] = useState<"advance" | "on_delivery">("on_delivery");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItemRow[]>([]);

  // Group stock fields - initialize payingSiteId with siteId
  const [isGroupStock, setIsGroupStock] = useState(false);
  const [payingSiteId, setPayingSiteId] = useState<string>(siteId);
  const [transportCost, setTransportCost] = useState("");

  // Vendor bill upload
  const [vendorBillUrl, setVendorBillUrl] = useState<string>("");
  const supabase = createClient();

  // New item form - unified search option for smart auto-fill
  const [selectedSearchOption, setSelectedSearchOption] = useState<MaterialSearchOption | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithDetails | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MaterialWithDetails | null>(null);
  // Brand selection is now split into two steps: brand name, then brand variant
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(null);
  const [selectedBrandVariant, setSelectedBrandVariant] = useState<MaterialBrand | null>(null);
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemTaxRate, setNewItemTaxRate] = useState("");
  const [newItemPricingMode, setNewItemPricingMode] = useState<'per_piece' | 'per_kg'>('per_piece');

  // Track if we've auto-filled the price to prevent infinite loops
  const hasAutofilledPrice = useRef(false);

  // Get available variants for selected parent material
  const availableVariants = useMemo(() => {
    if (!selectedMaterial?.variants) return [];
    return selectedMaterial.variants.filter((v: MaterialWithDetails) => v.is_active !== false);
  }, [selectedMaterial]);

  const hasVariants = availableVariants.length > 0;

  // The effective material for price lookup and brand selection (variant if selected, otherwise parent)
  const effectiveMaterial = selectedVariant || selectedMaterial;
  const effectiveMaterialId = effectiveMaterial?.id;

  // Fetch vendor-specific brands for the selected material
  const { data: vendorBrands = [], isLoading: isLoadingVendorBrands } = useVendorMaterialBrands(
    selectedVendor?.id,
    effectiveMaterialId
  );

  // Get unique brand names from vendor inventory (vendor-specific brands)
  // Falls back to material catalog brands if no vendor is selected
  const uniqueBrandNames = useMemo(() => {
    // If vendor is selected, use vendor-specific brands from vendor_inventory
    if (selectedVendor && vendorBrands.length > 0) {
      const brandNames = new Set<string>();
      vendorBrands.forEach((b) => brandNames.add(b.brand_name));
      return Array.from(brandNames).sort();
    }

    // Fallback: If no vendor selected or vendor has no brands, show catalog brands
    if (!effectiveMaterial?.brands) return [];
    const brandNames = new Set<string>();
    effectiveMaterial.brands
      .filter((b) => b.is_active)
      .forEach((b) => brandNames.add(b.brand_name));
    return Array.from(brandNames).sort();
  }, [selectedVendor, vendorBrands, effectiveMaterial]);

  // Get brand variants for the selected brand name
  // Uses vendor-specific brands if vendor is selected, otherwise falls back to catalog brands
  const brandVariantsForSelectedBrand = useMemo(() => {
    if (!selectedBrandName) return [];

    // If vendor is selected and has brands, filter from vendor brands
    if (selectedVendor && vendorBrands.length > 0) {
      return vendorBrands.filter((b) => b.brand_name === selectedBrandName);
    }

    // Fallback to material catalog brands
    if (!effectiveMaterial?.brands) return [];
    return effectiveMaterial.brands.filter(
      (b) => b.is_active && b.brand_name === selectedBrandName
    );
  }, [selectedBrandName, selectedVendor, vendorBrands, effectiveMaterial]);

  // Determine if we need to show the brand variant dropdown
  // Show if: multiple variants exist OR single variant has a variant_name
  const hasBrandVariants = brandVariantsForSelectedBrand.length > 1 ||
    (brandVariantsForSelectedBrand.length === 1 && brandVariantsForSelectedBrand[0].variant_name);

  // The effective brand ID for price lookup
  // If brand variant is selected, use it; otherwise if brand has no variants, use the single brand record
  const effectiveBrandId = useMemo(() => {
    if (selectedBrandVariant) {
      return selectedBrandVariant.id;
    }
    // If brand is selected but has no variants, use the brand record directly
    if (selectedBrandName && !hasBrandVariants && brandVariantsForSelectedBrand.length === 1) {
      return brandVariantsForSelectedBrand[0].id;
    }
    return null;
  }, [selectedBrandVariant, selectedBrandName, hasBrandVariants, brandVariantsForSelectedBrand]);

  // Fetch price from vendor_inventory (primary source - catalog prices)
  const { data: vendorInventoryPrice } = useVendorMaterialPrice(
    selectedVendor?.id,
    effectiveMaterialId,
    effectiveBrandId
  );

  // Fetch price from price_history (fallback - historical prices)
  const { data: priceHistoryPrice } = useLatestPrice(
    selectedVendor?.id,
    effectiveMaterialId,
    effectiveBrandId
  );

  // Use vendor_inventory price first (catalog), fallback to price_history
  const latestPrice = vendorInventoryPrice || priceHistoryPrice;

  // Calculate price change info
  const priceChangeInfo = useMemo(() => {
    if (!latestPrice || !newItemPrice) return null;
    const currentPrice = parseFloat(newItemPrice);
    if (isNaN(currentPrice) || currentPrice <= 0) return null;

    const lastPrice = latestPrice.total_landed_cost || latestPrice.price;
    const changeAmount = currentPrice - lastPrice;
    const changePercent = ((changeAmount) / lastPrice) * 100;

    return {
      lastPrice,
      changeAmount,
      changePercent,
      recordedDate: latestPrice.recorded_date,
      isIncrease: changePercent > 1,
      isDecrease: changePercent < -1,
      isFlat: changePercent >= -1 && changePercent <= 1,
    };
  }, [latestPrice, newItemPrice]);

  // Calculate price including GST for display
  const priceIncludingGst = useMemo(() => {
    const price = parseFloat(newItemPrice) || 0;
    const gst = parseFloat(newItemTaxRate) || 0;
    if (price <= 0) return null;
    return price * (1 + gst / 100);
  }, [newItemPrice, newItemTaxRate]);

  // Calculate standard piece weight for the selected material
  const standardPieceWeight = useMemo(() => {
    if (!effectiveMaterial?.weight_per_unit || !effectiveMaterial?.length_per_piece) return null;
    return calculatePieceWeight(
      effectiveMaterial.weight_per_unit,
      effectiveMaterial.length_per_piece,
      effectiveMaterial.length_unit || 'meter'
    );
  }, [effectiveMaterial]);

  // Calculate converted price (per-piece if per-kg selected, and vice versa)
  const convertedPrice = useMemo(() => {
    const price = parseFloat(newItemPrice) || 0;
    if (price <= 0 || !standardPieceWeight) return null;

    if (newItemPricingMode === 'per_kg') {
      // User entered per-kg price, calculate per-piece price
      return {
        value: price * standardPieceWeight,
        label: `~₹${(price * standardPieceWeight).toFixed(2)}/pc`,
        description: `(${standardPieceWeight.toFixed(2)} kg × ₹${price}/kg)`
      };
    } else {
      // User entered per-piece price, calculate per-kg price
      return {
        value: price / standardPieceWeight,
        label: `~₹${(price / standardPieceWeight).toFixed(2)}/kg`,
        description: `(₹${price} ÷ ${standardPieceWeight.toFixed(2)} kg)`
      };
    }
  }, [newItemPrice, newItemPricingMode, standardPieceWeight]);

  // Reset form when PO changes (only when dialog is open)
  useEffect(() => {
    // Skip if dialog is closed to prevent unnecessary state updates
    if (!open) return;

    if (purchaseOrder) {
      const vendor = vendors.find((v) => v.id === purchaseOrder.vendor_id);
      setSelectedVendor(vendor || null);
      setExpectedDeliveryDate(purchaseOrder.expected_delivery_date || "");
      setDeliveryAddress(purchaseOrder.delivery_address || "");
      setPaymentTerms(purchaseOrder.payment_terms || "");
      setTransportCost(purchaseOrder.transport_cost?.toString() || "");
      setNotes(purchaseOrder.notes || "");
      setVendorBillUrl(purchaseOrder.vendor_bill_url || "");

      // Map existing items with all display fields
      const existingItems: POItemRow[] =
        purchaseOrder.items?.map((item) => {
          // Calculate standard piece weight for display
          let standardPieceWeight: number | null = null;
          if (item.material?.weight_per_unit && item.material?.length_per_piece) {
            standardPieceWeight = calculatePieceWeight(
              item.material.weight_per_unit,
              item.material.length_per_piece,
              item.material.length_unit || "ft"
            );
          }

          return {
            id: item.id,
            material_id: item.material_id,
            brand_id: item.brand_id || undefined,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate || undefined,
            materialName: item.material?.name,
            brandName: item.brand
              ? item.brand.variant_name
                ? `${item.brand.brand_name} ${item.brand.variant_name}`
                : item.brand.brand_name
              : undefined,
            unit: item.material?.unit,
            // Weight data from material
            weight_per_unit: item.material?.weight_per_unit,
            weight_unit: item.material?.weight_unit,
            length_per_piece: item.material?.length_per_piece,
            length_unit: item.material?.length_unit,
            standard_piece_weight: standardPieceWeight,
            // Map pricing mode and weight data from existing items
            pricing_mode: item.pricing_mode || 'per_piece',
            calculated_weight: item.calculated_weight || undefined,
            actual_weight: item.actual_weight || undefined,
          };
        }) || [];
      setItems(existingItems);
    } else {
      // Handle prefilled data from navigation (e.g., material-search)
      if (prefilledVendorId) {
        const prefillVendor = vendors.find((v) => v.id === prefilledVendorId);
        setSelectedVendor(prefillVendor || null);
      } else {
        setSelectedVendor(null);
      }

      // Pre-select material for adding (not add to items yet)
      if (prefilledMaterialId && groupedMaterials.length > 0) {
        const prefillMaterial = groupedMaterials.find((m) => m.id === prefilledMaterialId);
        if (prefillMaterial) {
          setSelectedMaterial(prefillMaterial);
          // Also set the search option so the autocomplete shows the selection
          const searchOption = materialSearchOptions.find(
            (opt) => opt.type === "material" && opt.material.id === prefilledMaterialId
          );
          if (searchOption) {
            setSelectedSearchOption(searchOption);
          }
        }
      }

      setPurchaseDate(new Date().toISOString().split("T")[0]);
      setExpectedDeliveryDate("");
      setDeliveryAddress("");
      setPaymentTerms("");
      setNotes("");
      setItems([]);
      // Reset group stock fields
      setIsGroupStock(false);
      setTransportCost("");
      setVendorBillUrl("");
    }
    setError("");
    // Only reset these if no prefilled material
    if (!prefilledMaterialId) {
      setSelectedSearchOption(null);
      setSelectedMaterial(null);
      setSelectedVariant(null);
      setSelectedBrandName(null);
      setSelectedBrandVariant(null);
      setNewItemTaxRate("");
    }
    setNewItemQty("");
    setNewItemPrice("");
  }, [purchaseOrder, vendors, groupedMaterials, materialSearchOptions, open, prefilledVendorId, prefilledMaterialId]);

  // Reset brand variant when brand name changes
  useEffect(() => {
    setSelectedBrandVariant(null);
  }, [selectedBrandName]);

  // Auto-fill price when latest price is found (only once per vendor/material/variant/brand selection)
  useEffect(() => {
    if (latestPrice && !hasAutofilledPrice.current && !newItemPrice) {
      hasAutofilledPrice.current = true;
      setNewItemPrice(latestPrice.price.toString());
      // Auto-select pricing mode from vendor inventory (only if pricing_mode exists)
      if ('pricing_mode' in latestPrice && latestPrice.pricing_mode) {
        setNewItemPricingMode(latestPrice.pricing_mode as 'per_piece' | 'per_kg');
      }
      // Also auto-fill transport cost if available and not already set
      if (latestPrice.transport_cost && !transportCost) {
        setTransportCost(latestPrice.transport_cost.toString());
      }
    }
  }, [latestPrice, selectedVendor, selectedMaterial, selectedVariant, selectedBrandName, selectedBrandVariant, newItemPrice, transportCost]);

  // Reset auto-fill flag when vendor, material, variant, or brand changes
  useEffect(() => {
    hasAutofilledPrice.current = false;
  }, [selectedVendor, selectedMaterial, selectedVariant, selectedBrandName, selectedBrandVariant]);

  // Update payingSiteId when siteId changes (separate effect to avoid loops)
  useEffect(() => {
    if (!purchaseOrder && siteId) {
      setPayingSiteId(siteId);
    }
  }, [siteId, purchaseOrder]);

  // Calculate totals - supports both per_piece and per_kg pricing
  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item) => {
      let itemTotal: number;

      if (item.pricing_mode === 'per_kg') {
        // Per kg pricing: use actual_weight if available, fallback to calculated_weight
        const weight = item.actual_weight ?? item.calculated_weight ?? 0;
        itemTotal = weight * item.unit_price;
      } else {
        // Per piece pricing: quantity × unit_price (default)
        itemTotal = item.quantity * item.unit_price;
      }

      const itemTax = item.tax_rate ? (itemTotal * item.tax_rate) / 100 : 0;
      subtotal += itemTotal;
      taxAmount += itemTax;
    });

    const transport = parseFloat(transportCost) || 0;

    return {
      subtotal: Math.round(subtotal),
      taxAmount: Math.round(taxAmount),
      transport: Math.round(transport),
      total: Math.round(subtotal + taxAmount + transport),
    };
  }, [items, transportCost]);

  const handleAddItem = () => {
    if (!selectedMaterial) {
      setError("Please select a material");
      return;
    }
    // Require variant selection if material has variants
    if (hasVariants && !selectedVariant) {
      setError("Please select a variant");
      return;
    }
    if (!newItemQty || parseFloat(newItemQty) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }
    if (!newItemPrice || parseFloat(newItemPrice) <= 0) {
      setError("Please enter a valid unit price");
      return;
    }

    // Use variant for item data if selected, otherwise parent material
    const materialToAdd = selectedVariant || selectedMaterial;

    // Determine the brand to use: selectedBrandVariant if brand variants exist,
    // otherwise find the brand record by brand name (for brands without variants)
    let brandToUse: MaterialBrand | null = null;
    if (selectedBrandVariant) {
      brandToUse = selectedBrandVariant;
    } else if (selectedBrandName) {
      // First check vendor brands, then fall back to material catalog brands
      if (selectedVendor && vendorBrands.length > 0) {
        const vendorBrand = vendorBrands.find(
          (b) => b.brand_name === selectedBrandName && !b.variant_name
        );
        if (vendorBrand) {
          brandToUse = vendorBrand as MaterialBrand;
        }
      }
      // Fallback to material catalog brands
      if (!brandToUse && effectiveMaterial?.brands) {
        brandToUse = effectiveMaterial.brands.find(
          (b) => b.is_active && b.brand_name === selectedBrandName && !b.variant_name
        ) || null;
      }
    }

    // Calculate piece weight if material has weight data
    let calculatedWeight: number | null = null;
    let standardPieceWeight: number | null = null;
    if (materialToAdd.weight_per_unit && materialToAdd.length_per_piece) {
      standardPieceWeight = calculatePieceWeight(
        materialToAdd.weight_per_unit,
        materialToAdd.length_per_piece,
        materialToAdd.length_unit || "ft"
      );
      if (standardPieceWeight) {
        calculatedWeight = standardPieceWeight * parseFloat(newItemQty);
      }
    }

    const newItem: POItemRow = {
      material_id: materialToAdd.id,
      brand_id: brandToUse?.id,
      quantity: parseFloat(newItemQty),
      unit_price: parseFloat(newItemPrice),
      tax_rate: newItemTaxRate ? parseFloat(newItemTaxRate) : undefined,
      materialName: materialToAdd.name,
      brandName: brandToUse
        ? brandToUse.variant_name
          ? `${brandToUse.brand_name} ${brandToUse.variant_name}`
          : brandToUse.brand_name
        : undefined,
      unit: materialToAdd.unit,
      weight_per_unit: materialToAdd.weight_per_unit,
      weight_unit: materialToAdd.weight_unit,
      length_per_piece: materialToAdd.length_per_piece,
      length_unit: materialToAdd.length_unit,
      standard_piece_weight: standardPieceWeight,
      pricing_mode: newItemPricingMode,
      calculated_weight: calculatedWeight,
      actual_weight: calculatedWeight, // Default to calculated, user can edit
    };

    setItems([...items, newItem]);
    setSelectedSearchOption(null);
    setSelectedMaterial(null);
    setSelectedVariant(null);
    setSelectedBrandName(null);
    setSelectedBrandVariant(null);
    setNewItemQty("");
    setNewItemPrice("");
    setNewItemTaxRate("");
    setNewItemPricingMode('per_piece');
    setError("");
  };

  const handleRemoveItem = (index: number) => {
    const item = items[index];
    if (item.id && purchaseOrder) {
      // Remove from database
      removeItem.mutate({ id: item.id, poId: purchaseOrder.id });
    }
    setItems(items.filter((_, i) => i !== index));
  };

  // Create PO with specified status (ordered or draft)
  const handleCreatePO = async (status: "ordered" | "draft") => {
    if (!selectedVendor) {
      setError("Please select a vendor");
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one item");
      return;
    }

    try {
      if (isEdit) {
        await updatePO.mutateAsync({
          id: purchaseOrder.id,
          data: {
            vendor_id: selectedVendor.id,
            expected_delivery_date: expectedDeliveryDate || undefined,
            delivery_address: deliveryAddress || undefined,
            payment_terms: paymentTerms || undefined,
            payment_timing: paymentTiming,
            transport_cost: transportCost ? parseFloat(transportCost) : undefined,
            notes: notes || undefined,
            vendor_bill_url: vendorBillUrl || undefined,
          },
          siteId, // Added for optimistic update
        });

        // Add new items (items without id)
        const newItems = items.filter((item) => !item.id);
        for (const item of newItems) {
          await addItem.mutateAsync({
            poId: purchaseOrder.id,
            item: {
              material_id: item.material_id,
              brand_id: item.brand_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate: item.tax_rate,
            },
          });
        }

        // Close dialog FIRST for edit mode
        onClose();
        showSuccess(`Purchase Order ${purchaseOrder.po_number} updated successfully!`);
        return;
      } else {
        // Build notes with group stock info if applicable
        let finalNotes = notes || "";
        if (isGroupStock && groupMembership?.isInGroup) {
          const payingSite = groupMembership.allSites?.find((s) => s.id === payingSiteId);
          const groupNote = `[GROUP STOCK] Paying Site: ${payingSite?.name || "Unknown"}`;
          finalNotes = finalNotes ? `${groupNote}\n${finalNotes}` : groupNote;
        }

        const result = await createPO.mutateAsync({
          site_id: siteId,
          vendor_id: selectedVendor.id,
          status, // Use the passed status (ordered or draft)
          order_date: purchaseDate,
          expected_delivery_date: expectedDeliveryDate || undefined,
          delivery_address: deliveryAddress || undefined,
          payment_terms: paymentTerms || undefined,
          payment_timing: paymentTiming,
          transport_cost: transportCost ? parseFloat(transportCost) : undefined,
          notes: finalNotes || undefined,
          vendor_bill_url: vendorBillUrl || undefined,
          // Pass group stock info via internal_notes for processing on delivery
          internal_notes: isGroupStock
            ? JSON.stringify({
              is_group_stock: true,
              site_group_id: groupMembership?.groupId, // Used by delivery recording
              payment_source_site_id: payingSiteId,
            })
            : undefined,
          items: items.map((item) => ({
            material_id: item.material_id,
            brand_id: item.brand_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            // Include pricing mode and weight data for per-kg pricing
            pricing_mode: item.pricing_mode || 'per_piece',
            calculated_weight: item.calculated_weight || null,
            actual_weight: item.actual_weight || null,
          })),
        });

        // Close dialog FIRST to prevent duplicate submissions
        onClose();

        // Show success toast with PO details (use correct calculation based on pricing mode)
        const totalAmount = items.reduce((sum, item) => {
          if (item.pricing_mode === 'per_kg') {
            const weight = item.actual_weight ?? item.calculated_weight ?? 0;
            return sum + weight * item.unit_price;
          }
          return sum + item.quantity * item.unit_price;
        }, 0);
        showSuccess(
          `Purchase Order ${result?.po_number || ""} created successfully! Total: ₹${totalAmount.toLocaleString()}`,
          5000
        );
        return; // Early return after success
      }

      // For edit mode
      onClose();
      showSuccess(isEdit ? "Purchase Order updated successfully!" : "Purchase Order saved!");
    } catch (err: unknown) {
      console.error("[PurchaseOrderDialog] Error:", err);
      const message = err instanceof Error ? err.message : "Failed to save purchase order";
      setError(message);
      showError(message);
    }
  };

  // Main submit creates as "ordered" directly (no approval needed)
  const handleSubmit = () => handleCreatePO("ordered");

  // Save as draft option
  const handleSaveAsDraft = () => handleCreatePO("draft");

  const isSubmitting =
    createPO.isPending || updatePO.isPending || addItem.isPending;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="lg"
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
        <Typography component="span" variant="h6">
          {isEdit ? `Edit PO ${purchaseOrder.po_number}` : "Create Purchase Order"}
        </Typography>
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

        <Grid container spacing={2}>
          {/* Vendor Selection */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Autocomplete
              options={vendors}
              getOptionLabel={(option) => option.name}
              value={selectedVendor}
              onChange={(_, value) => setSelectedVendor(value)}
              renderInput={(params) => (
                <TextField {...params} label="Vendor" required />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box>
                    <Typography variant="body2">{option.name}</Typography>
                    {option.phone && (
                      <Typography variant="caption" color="text.secondary">
                        {option.phone}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
            />
          </Grid>

          {/* Purchase Date */}
          {!isEdit && (
            <Grid size={{ xs: 12, md: 2.5 }}>
              <TextField
                fullWidth
                type="date"
                label="Purchase Date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
          )}

          <Grid size={{ xs: 12, md: isEdit ? 3 : 2.5 }}>
            <TextField
              fullWidth
              type="date"
              label="Expected Delivery"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              label="Payment Terms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g., Net 30"
            />
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              select
              label="Payment Timing"
              value={paymentTiming}
              onChange={(e) => setPaymentTiming(e.target.value as "advance" | "on_delivery")}
              helperText="When should payment be made?"
            >
              <MenuItem value="on_delivery">Pay on Delivery</MenuItem>
              <MenuItem value="advance">Pay in Advance</MenuItem>
            </TextField>
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              label="Delivery Address"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              multiline
              rows={2}
            />
          </Grid>

          {/* Vendor Bill Upload Section */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Vendor Bill
              </Typography>
            </Divider>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FileUploader
              supabase={supabase}
              bucketName="documents"
              folderPath={`${siteId}/po-bills`}
              fileNamePrefix={purchaseOrder?.po_number || "new-po"}
              accept="all"
              label="Vendor Bill/Invoice"
              helperText="Upload original bill from vendor (PDF or image)"
              uploadOnSelect
              value={vendorBillUrl ? { name: "vendor-bill", size: 0, url: vendorBillUrl } : null}
              onUpload={(file) => setVendorBillUrl(file.url)}
              onRemove={() => setVendorBillUrl("")}
              compact
            />
          </Grid>
          {vendorBillUrl && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, pt: 2 }}>
                <BillPreviewButton
                  billUrl={vendorBillUrl}
                  title={purchaseOrder?.po_number ? `Bill - ${purchaseOrder.po_number}` : "Vendor Bill"}
                  variant="outlined"
                />
                {purchaseOrder?.bill_verified && (
                  <Alert severity="success" sx={{ py: 0, flex: 1 }}>
                    Bill verified
                  </Alert>
                )}
              </Box>
            </Grid>
          )}

          {/* Group Stock Toggle - Only show if site is in a group */}
          {groupMembership?.isInGroup && !isEdit && (
            <Grid size={12}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: isGroupStock ? "primary.50" : "transparent",
                  borderColor: isGroupStock ? "primary.main" : "divider",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                  <GroupsIcon
                    color={isGroupStock ? "primary" : "action"}
                    sx={{ mt: 0.5 }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={isGroupStock}
                          onChange={(e) => {
                            setIsGroupStock(e.target.checked);
                            if (e.target.checked && !payingSiteId) {
                              setPayingSiteId(siteId);
                            }
                          }}
                        />
                      }
                      label={
                        <Typography fontWeight={500}>
                          Purchase for Group Shared Stock
                        </Typography>
                      }
                    />
                    {isGroupStock && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Materials will be shared across all sites in{" "}
                        <strong>{groupMembership.groupName}</strong>
                      </Typography>
                    )}

                    {/* Show paying site and transport cost for group stock mode */}
                    <Collapse in={isGroupStock}>
                      <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Paying Site"
                            value={payingSiteId}
                            onChange={(e) => setPayingSiteId(e.target.value)}
                            helperText="Which site's money was used"
                          >
                            {groupMembership.allSites?.map((site) => (
                              <MenuItem key={site.id} value={site.id}>
                                {site.name}
                                {site.id === siteId && " (Current)"}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label="Transport Cost"
                            value={transportCost}
                            onChange={(e) => setTransportCost(e.target.value)}
                            slotProps={{
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">₹</InputAdornment>
                                ),
                                inputProps: { min: 0, step: 0.01 },
                              },
                            }}
                            helperText="Include for accurate per-unit cost"
                          />
                        </Grid>
                      </Grid>
                    </Collapse>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Transport Cost - visible when NOT in group stock mode (group stock has its own transport field) */}
          {!isGroupStock && (
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Transport Cost"
                value={transportCost}
                onChange={(e) => setTransportCost(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">₹</InputAdornment>
                    ),
                    inputProps: { min: 0, step: 0.01 },
                  },
                }}
                helperText={
                  latestPrice?.transport_cost
                    ? `Last: ${formatCurrency(latestPrice.transport_cost)}`
                    : "Enter transport/delivery cost"
                }
              />
            </Grid>
          )}

          {/* Add Item Section */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="subtitle2">Add Items</Typography>
            </Divider>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <Autocomplete
              options={materialSearchOptions}
              filterOptions={(options, state) =>
                filterMaterialSearchOptions(options, state.inputValue)
              }
              getOptionLabel={(option) => option.displayName}
              value={selectedSearchOption}
              onChange={(_, option) => {
                setSelectedSearchOption(option);

                if (!option) {
                  // Clear all selections
                  setSelectedMaterial(null);
                  setSelectedVariant(null);
                  setSelectedBrandName(null);
                  setSelectedBrandVariant(null);
                  setNewItemPrice("");
                  return;
                }

                // Always set material
                setSelectedMaterial(option.material);

                // Auto-fill variant if the option is a variant or has a variant
                if (option.type === "variant" || option.variant) {
                  setSelectedVariant(option.variant);
                } else {
                  setSelectedVariant(null);
                }

                // Auto-fill brand if the option is a brand
                if (option.type === "brand" && option.brand) {
                  setSelectedBrandName(option.brand.brand_name);
                  // Also set brand variant if it has a variant_name
                  if (option.brand.variant_name) {
                    setSelectedBrandVariant(option.brand);
                  } else {
                    setSelectedBrandVariant(null);
                  }
                } else {
                  setSelectedBrandName(null);
                  setSelectedBrandVariant(null);
                }

                // Auto-fill GST rate from material if available
                const materialForGst = option.variant || option.material;
                if (materialForGst?.gst_rate && !newItemTaxRate) {
                  setNewItemTaxRate(materialForGst.gst_rate.toString());
                }

                // Reset price to trigger re-fetch
                setNewItemPrice("");
              }}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Material"
                  size="small"
                  placeholder="Search material, variant, or brand..."
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, width: "100%" }}>
                    {/* Type indicator dot */}
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor:
                          option.type === "brand"
                            ? "success.main"
                            : option.type === "variant"
                              ? "primary.main"
                              : "grey.400",
                        mt: 0.7,
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {option.displayName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {option.contextLabel}
                        {option.type === "material" && option.unit && ` • ${option.unit}`}
                      </Typography>
                    </Box>
                  </Box>
                </li>
              )}
            />
          </Grid>

          {/* Variant Selection - show when material has variants AND variant not auto-selected */}
          {hasVariants && !selectedVariant && (
            <Grid size={{ xs: 12, md: 2 }}>
              <Autocomplete
                options={availableVariants}
                getOptionLabel={(option) => option.name}
                value={selectedVariant}
                onChange={(_, value) => {
                  setSelectedVariant(value);
                  // Clear brand when variant changes
                  setSelectedBrandName(null);
                  setSelectedBrandVariant(null);
                  // Reset price to trigger re-fetch
                  setNewItemPrice("");
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Variant" size="small" required />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Typography variant="body2">{option.name}</Typography>
                  </li>
                )}
              />
            </Grid>
          )}

          {/* Brand Selection */}
          <Grid size={{ xs: 12, md: 2 }}>
            <Autocomplete
              options={uniqueBrandNames}
              getOptionLabel={(brandName) => brandName}
              value={selectedBrandName}
              onChange={(_, value) => {
                setSelectedBrandName(value);
                // Reset price to trigger re-fetch
                setNewItemPrice("");
              }}
              disabled={!effectiveMaterial || isLoadingVendorBrands}
              loading={isLoadingVendorBrands}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Brand"
                  size="small"
                  placeholder={
                    !selectedVendor
                      ? "Select vendor first"
                      : !effectiveMaterial
                        ? hasVariants ? "Select variant" : "Select material"
                        : isLoadingVendorBrands
                          ? "Loading..."
                          : uniqueBrandNames.length === 0
                            ? "No brands from vendor"
                            : "Optional"
                  }
                />
              )}
              renderOption={(props, brandName) => (
                <li {...props} key={brandName}>
                  <Typography variant="body2">{brandName}</Typography>
                </li>
              )}
            />
          </Grid>

          {/* Brand Variant Selection - show when brand has variants */}
          {hasBrandVariants && (
            <Grid size={{ xs: 12, md: 2 }}>
              <Autocomplete
                options={brandVariantsForSelectedBrand}
                getOptionLabel={(brand) => brand.variant_name || "Standard"}
                value={selectedBrandVariant}
                onChange={(_, value) => {
                  setSelectedBrandVariant(value);
                  // Reset price to trigger re-fetch
                  setNewItemPrice("");
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Variant" size="small" required />
                )}
                renderOption={(props, brand) => (
                  <li {...props} key={brand.id}>
                    <Typography variant="body2">
                      {brand.variant_name || "Standard"}
                    </Typography>
                  </li>
                )}
              />
            </Grid>
          )}

          <Grid size={{ xs: 4, md: 1.5 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Quantity"
              value={newItemQty}
              onChange={(e) => setNewItemQty(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
              helperText={
                convertedPrice && standardPieceWeight ? (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ color: "info.main", fontWeight: 500 }}
                  >
                    {convertedPrice.label}
                  </Typography>
                ) : standardPieceWeight ? (
                  <Typography component="span" variant="caption" color="text.secondary">
                    ~{standardPieceWeight.toFixed(2)} kg/pc
                  </Typography>
                ) : undefined
              }
            />
          </Grid>

          <Grid size={{ xs: 4, md: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label={`Unit Price (₹/${newItemPricingMode === 'per_kg' ? 'kg' : 'pc'})`}
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
              helperText={
                <Box component="span">
                  {priceChangeInfo ? (
                    <Box
                      component="span"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        color: priceChangeInfo.isIncrease
                          ? "error.main"
                          : priceChangeInfo.isDecrease
                            ? "success.main"
                            : "text.secondary",
                      }}
                    >
                      {priceChangeInfo.isIncrease && <TrendingUpIcon sx={{ fontSize: 14 }} />}
                      {priceChangeInfo.isDecrease && <TrendingDownIcon sx={{ fontSize: 14 }} />}
                      {priceChangeInfo.isFlat && <TrendingFlatIcon sx={{ fontSize: 14 }} />}
                      <span>
                        Last: {formatCurrency(priceChangeInfo.lastPrice)}
                        {!priceChangeInfo.isFlat && (
                          <> ({priceChangeInfo.changePercent > 0 ? "+" : ""}
                            {priceChangeInfo.changePercent.toFixed(1)}%)</>
                        )}
                      </span>
                    </Box>
                  ) : latestPrice ? (
                    <span>Last: {formatCurrency(latestPrice.price)}</span>
                  ) : null}
                  {priceIncludingGst && newItemTaxRate && (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ display: "block", color: "success.main", fontWeight: 500 }}
                    >
                      Incl. {newItemTaxRate}% GST: {formatCurrency(priceIncludingGst)}
                    </Typography>
                  )}
                </Box>
              }
            />
          </Grid>

          <Grid size={{ xs: 4, md: 1.5 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="GST %"
              value={newItemTaxRate}
              onChange={(e) => setNewItemTaxRate(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, max: 100 } } }}
            />
          </Grid>

          {/* Pricing Mode Toggle - only show for weight-based materials */}
          {effectiveMaterial?.weight_per_unit && (
            <Grid size={{ xs: 4, md: 1.5 }}>
              <TextField
                fullWidth
                select
                size="small"
                label="Price Per"
                value={newItemPricingMode}
                onChange={(e) => setNewItemPricingMode(e.target.value as 'per_piece' | 'per_kg')}
              >
                <MenuItem value="per_piece">Per Piece</MenuItem>
                <MenuItem value="per_kg">Per Kg</MenuItem>
              </TextField>
            </Grid>
          )}

          <Grid size={{ xs: 12, md: effectiveMaterial?.weight_per_unit ? 1.5 : 2 }}>
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
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">GST %</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell width={50}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
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
                    items.map((item, index) => {
                      // Calculate item total based on pricing mode
                      let itemTotal: number;
                      if (item.pricing_mode === 'per_kg') {
                        // Use actual_weight if available, fallback to calculated_weight
                        const weight = item.actual_weight ?? item.calculated_weight ?? 0;
                        itemTotal = weight * item.unit_price;
                      } else {
                        itemTotal = item.quantity * item.unit_price;
                      }
                      const itemTax = item.tax_rate
                        ? (itemTotal * item.tax_rate) / 100
                        : 0;
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <Typography variant="body2">
                              {item.materialName}
                            </Typography>
                            {item.brandName && (
                              <Typography variant="caption" color="primary.main" sx={{ fontWeight: 500 }}>
                                {item.brandName}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                              {item.unit}
                              {item.pricing_mode === 'per_kg' && ' (priced per kg)'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box>
                              <Typography variant="body2" fontWeight={500}>
                                {item.quantity} pcs
                                {item.pricing_mode === 'per_kg' && item.calculated_weight && (
                                  <Typography component="span" variant="caption" color="text.secondary">
                                    {` (~${(item.actual_weight ?? item.calculated_weight).toFixed(1)} kg)`}
                                  </Typography>
                                )}
                              </Typography>
                              {/* Weight section for weight-based materials */}
                              {item.calculated_weight && item.standard_piece_weight && (
                                <Box sx={{ mt: 0.5, p: 1, bgcolor: "grey.50", borderRadius: 1 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                    Std: ~{item.standard_piece_weight.toFixed(2)} kg/pc × {item.quantity} = ~{item.calculated_weight.toFixed(2)} kg
                                  </Typography>
                                  <TextField
                                    size="small"
                                    type="number"
                                    label="Actual kg (from bill)"
                                    value={item.actual_weight ?? item.calculated_weight}
                                    onChange={(e) => {
                                      const newItems = [...items];
                                      newItems[index].actual_weight = e.target.value ? parseFloat(e.target.value) : null;
                                      setItems(newItems);
                                    }}
                                    slotProps={{
                                      input: { inputProps: { min: 0, step: 0.01 } },
                                    }}
                                    sx={{ mt: 0.5, width: 130 }}
                                  />
                                  {item.actual_weight && item.quantity > 0 && (() => {
                                    const actualKgPerPiece = item.actual_weight / item.quantity;
                                    const deviation = item.standard_piece_weight
                                      ? ((actualKgPerPiece - item.standard_piece_weight) / item.standard_piece_weight) * 100
                                      : 0;
                                    const isLargeDeviation = Math.abs(deviation) > 10;

                                    return (
                                      <Box sx={{ mt: 0.5 }}>
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            display: "block",
                                            fontWeight: 600,
                                            color: isLargeDeviation ? "warning.main" : "text.primary"
                                          }}
                                        >
                                          Actual: {actualKgPerPiece.toFixed(2)} kg/pc
                                        </Typography>
                                        {deviation !== 0 && (
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              display: "block",
                                              color: isLargeDeviation
                                                ? "error.main"
                                                : deviation > 0
                                                  ? "warning.main"
                                                  : "success.main",
                                              fontWeight: isLargeDeviation ? 600 : 400,
                                            }}
                                          >
                                            {isLargeDeviation && "⚠️ "}
                                            {deviation > 0 ? "+" : ""}{deviation.toFixed(1)}% from std
                                          </Typography>
                                        )}
                                      </Box>
                                    );
                                  })()}
                                </Box>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(item.unit_price)}
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                              /{item.pricing_mode === 'per_kg' ? 'kg' : item.unit}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {item.tax_rate ? `${item.tax_rate}%` : "-"}
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(itemTotal)}
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(itemTotal + itemTax)}
                          </TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveItem(index)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* Totals */}
          {items.length > 0 && (
            <Grid size={12}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  mt: 2,
                }}
              >
                <Box sx={{ minWidth: 200 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2">Subtotal:</Typography>
                    <Typography variant="body2">
                      {formatCurrency(totals.subtotal)}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2">Tax:</Typography>
                    <Typography variant="body2">
                      {formatCurrency(totals.taxAmount)}
                    </Typography>
                  </Box>
                  {totals.transport > 0 && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="body2">Transport:</Typography>
                      <Typography variant="body2">
                        {formatCurrency(totals.transport)}
                      </Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 1 }} />
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={600}>
                      Total:
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {formatCurrency(totals.total)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>
          )}

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              placeholder="Additional notes..."
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        {!isEdit && (
          <Button
            variant="outlined"
            onClick={handleSaveAsDraft}
            disabled={isSubmitting || !selectedVendor || items.length === 0}
          >
            {isSubmitting ? "Saving..." : "Save as Draft"}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedVendor || items.length === 0}
        >
          {isSubmitting
            ? "Saving..."
            : isEdit
              ? "Update"
              : "Create Order"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
