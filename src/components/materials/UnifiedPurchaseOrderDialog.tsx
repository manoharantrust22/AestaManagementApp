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
  Checkbox,
  Chip,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Groups as GroupsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  ShoppingCart as ShoppingCartIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useVendors, useVendorsForMaterials, VendorForMaterials } from "@/hooks/queries/useVendors";
import { useMaterialSearchOptions, filterMaterialSearchOptions } from "@/hooks/queries/useMaterials";
import { useLatestPrice, useVendorMaterialPrice, useVendorMaterialBrands } from "@/hooks/queries/useVendorInventory";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import {
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useAddPOItem,
  useRemovePOItem,
  useUpdatePOItem,
} from "@/hooks/queries/usePurchaseOrders";
import {
  useRequestItemsForConversion,
  useApproveMaterialRequest,
} from "@/hooks/queries/useMaterialRequests";
import type {
  PurchaseOrderWithDetails,
  PurchaseOrderItemFormData,
  Vendor,
  MaterialWithDetails,
  MaterialBrand,
  MaterialSearchOption,
  MaterialRequestWithDetails,
  RequestItemForConversion,
} from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";
import { calculatePieceWeight } from "@/lib/weightCalculation";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types/material.types";
import { useToast } from "@/contexts/ToastContext";
import FileUploader from "@/components/common/FileUploader";
import { BillPreviewButton } from "@/components/common/BillViewerDialog";
import { createClient } from "@/lib/supabase/client";
import RequestItemRow from "./RequestItemRow";

// ============================================================================
// Types
// ============================================================================

type DialogMode = "direct" | "from_request" | "partial";

interface UnifiedPurchaseOrderDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;

  // Mode 1: Edit existing PO
  purchaseOrder?: PurchaseOrderWithDetails | null;

  // Mode 2 & 3: From request (approval + PO) or partial (additional PO)
  request?: MaterialRequestWithDetails | null;

  // Prefilled data from navigation
  prefilledVendorId?: string;
  prefilledMaterialId?: string;
  prefilledMaterialName?: string;
  prefilledUnit?: string;

  // Callbacks
  onSuccess?: (poId: string) => void;
}

interface POItemRow extends PurchaseOrderItemFormData {
  id?: string;
  materialName?: string;
  brandName?: string;
  unit?: string;
  weight_per_unit?: number | null;
  weight_unit?: string | null;
  length_per_piece?: number | null;
  length_unit?: string | null;
  standard_piece_weight?: number | null;
  // For request items
  isFromRequest?: boolean;
  requestItemId?: string;
  approvedQty?: number;
  alreadyOrderedQty?: number;
  remainingQty?: number;
}

// ============================================================================
// Component
// ============================================================================

export default function UnifiedPurchaseOrderDialog({
  open,
  onClose,
  siteId,
  purchaseOrder,
  request,
  prefilledVendorId,
  prefilledMaterialId,
  prefilledMaterialName,
  prefilledUnit,
  onSuccess,
}: UnifiedPurchaseOrderDialogProps) {
  const isMobile = useIsMobile();
  const { showSuccess, showError } = useToast();
  const supabase = createClient();

  // ============================================================================
  // Determine dialog mode
  // ============================================================================

  const isEdit = !!purchaseOrder;
  const mode: DialogMode = useMemo(() => {
    if (purchaseOrder) return "direct"; // Edit mode is always direct
    if (request) {
      // Check if request has remaining items (partial mode)
      return request.status === "partial_fulfilled" ? "partial" : "from_request";
    }
    return "direct";
  }, [purchaseOrder, request]);

  const isRequestMode = mode === "from_request" || mode === "partial";

  // ============================================================================
  // Data fetching
  // ============================================================================

  const { data: allVendors = [] } = useVendors();
  const { data: materialSearchOptions = [], groupedMaterials = [] } = useMaterialSearchOptions();
  const { data: groupMembership, isLoading: isLoadingGroupMembership } = useSiteGroupMembership(siteId);

  // Fetch request items when in request mode
  const { data: requestItems = [], isLoading: isLoadingRequestItems } = useRequestItemsForConversion(
    open && isRequestMode && request ? request.id : undefined
  );

  // Extract material IDs for vendor filtering in request mode
  const requestMaterialIds = useMemo(() => {
    if (!isRequestMode || !requestItems.length) return undefined;
    return requestItems
      .filter((item: any) => item.remaining_qty > 0)
      .map((item: any) => item.material_id);
  }, [isRequestMode, requestItems]);

  // Get filtered vendors for request mode
  const { data: filteredVendors = [], isLoading: isLoadingFilteredVendors } = useVendorsForMaterials(
    requestMaterialIds,
    siteId
  );

  // Use filtered vendors in request mode, all vendors otherwise
  const vendors = isRequestMode && filteredVendors.length > 0 ? filteredVendors : allVendors;

  // Mutations
  const createPO = useCreatePurchaseOrder();
  const updatePO = useUpdatePurchaseOrder();
  const addItem = useAddPOItem();
  const removeItem = useRemovePOItem();
  const updateItem = useUpdatePOItem();
  const approveRequest = useApproveMaterialRequest();

  // ============================================================================
  // Form state
  // ============================================================================

  const today = new Date().toISOString().split("T")[0];

  // Helper to convert date string to YYYY-MM-DD format for HTML date input
  const toDateInputFormat = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const [error, setError] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | VendorForMaterials | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentTiming, setPaymentTiming] = useState<"advance" | "on_delivery">("on_delivery");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItemRow[]>([]);

  // Inline editing state for PO items
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItemData, setEditingItemData] = useState<{
    quantity: string;
    unit_price: string;
    tax_rate: string;
  } | null>(null);

  // Group stock fields
  const [isGroupStock, setIsGroupStock] = useState(false);
  const [payingSiteId, setPayingSiteId] = useState<string>(siteId);
  const [transportCost, setTransportCost] = useState("");
  const [priceIncludesGst, setPriceIncludesGst] = useState(false);

  // Vendor bill upload
  const [vendorBillUrl, setVendorBillUrl] = useState<string>("");

  // Request items state (for request mode)
  const [requestItemsState, setRequestItemsState] = useState<RequestItemForConversion[]>([]);

  // ============================================================================
  // New item form state (for smart search)
  // ============================================================================

  const [selectedSearchOption, setSelectedSearchOption] = useState<MaterialSearchOption | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithDetails | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MaterialWithDetails | null>(null);
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(null);
  const [selectedBrandVariant, setSelectedBrandVariant] = useState<MaterialBrand | null>(null);
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemTaxRate, setNewItemTaxRate] = useState("");
  const [newItemPricingMode, setNewItemPricingMode] = useState<'per_piece' | 'per_kg'>('per_piece');

  const hasAutofilledPrice = useRef(false);

  // ============================================================================
  // Computed values for material/brand selection
  // ============================================================================

  const availableVariants = useMemo(() => {
    if (!selectedMaterial?.variants) return [];
    return selectedMaterial.variants.filter((v: MaterialWithDetails) => v.is_active !== false);
  }, [selectedMaterial]);

  const hasVariants = availableVariants.length > 0;
  const effectiveMaterial = selectedVariant || selectedMaterial;
  const effectiveMaterialId = effectiveMaterial?.id;

  // Fetch vendor-specific brands
  const { data: vendorBrands = [], isLoading: isLoadingVendorBrands } = useVendorMaterialBrands(
    selectedVendor?.id,
    effectiveMaterialId
  );

  const uniqueBrandNames = useMemo(() => {
    if (selectedVendor && vendorBrands.length > 0) {
      const brandNames = new Set<string>();
      vendorBrands.forEach((b) => brandNames.add(b.brand_name));
      return Array.from(brandNames).sort();
    }
    if (!effectiveMaterial?.brands) return [];
    const brandNames = new Set<string>();
    effectiveMaterial.brands
      .filter((b) => b.is_active)
      .forEach((b) => brandNames.add(b.brand_name));
    return Array.from(brandNames).sort();
  }, [selectedVendor, vendorBrands, effectiveMaterial]);

  const brandVariantsForSelectedBrand = useMemo(() => {
    if (!selectedBrandName) return [];
    if (selectedVendor && vendorBrands.length > 0) {
      return vendorBrands.filter((b) => b.brand_name === selectedBrandName);
    }
    if (!effectiveMaterial?.brands) return [];
    return effectiveMaterial.brands.filter(
      (b) => b.is_active && b.brand_name === selectedBrandName
    );
  }, [selectedBrandName, selectedVendor, vendorBrands, effectiveMaterial]);

  const hasBrandVariants = brandVariantsForSelectedBrand.length > 1 ||
    (brandVariantsForSelectedBrand.length === 1 && brandVariantsForSelectedBrand[0].variant_name);

  const effectiveBrandId = useMemo(() => {
    if (selectedBrandVariant) return selectedBrandVariant.id;
    if (selectedBrandName && !hasBrandVariants && brandVariantsForSelectedBrand.length === 1) {
      return brandVariantsForSelectedBrand[0].id;
    }
    return null;
  }, [selectedBrandVariant, selectedBrandName, hasBrandVariants, brandVariantsForSelectedBrand]);

  // ============================================================================
  // Price fetching and auto-fill
  // ============================================================================

  const { data: vendorInventoryPrice } = useVendorMaterialPrice(
    selectedVendor?.id,
    effectiveMaterialId,
    effectiveBrandId
  );

  const { data: priceHistoryPrice } = useLatestPrice(
    selectedVendor?.id,
    effectiveMaterialId,
    effectiveBrandId
  );

  const latestPrice = vendorInventoryPrice || priceHistoryPrice;

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

  const priceIncludingGst = useMemo(() => {
    const price = parseFloat(newItemPrice) || 0;
    const gst = parseFloat(newItemTaxRate) || 0;
    if (price <= 0) return null;
    return price * (1 + gst / 100);
  }, [newItemPrice, newItemTaxRate]);

  const standardPieceWeight = useMemo(() => {
    if (!effectiveMaterial?.weight_per_unit || !effectiveMaterial?.length_per_piece) return null;
    return calculatePieceWeight(
      effectiveMaterial.weight_per_unit,
      effectiveMaterial.length_per_piece,
      effectiveMaterial.length_unit || 'meter'
    );
  }, [effectiveMaterial]);

  const convertedPrice = useMemo(() => {
    const price = parseFloat(newItemPrice) || 0;
    if (price <= 0 || !standardPieceWeight) return null;

    if (newItemPricingMode === 'per_kg') {
      return {
        value: price * standardPieceWeight,
        label: `~₹${(price * standardPieceWeight).toFixed(2)}/pc`,
        description: `(${standardPieceWeight.toFixed(2)} kg × ₹${price}/kg)`
      };
    } else {
      return {
        value: price / standardPieceWeight,
        label: `~₹${(price / standardPieceWeight).toFixed(2)}/kg`,
        description: `(₹${price} ÷ ${standardPieceWeight.toFixed(2)} kg)`
      };
    }
  }, [newItemPrice, newItemPricingMode, standardPieceWeight]);

  // ============================================================================
  // Effects - Form initialization
  // ============================================================================

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) return;

    if (purchaseOrder) {
      // Edit mode - load existing PO data
      const vendor = allVendors.find((v) => v.id === purchaseOrder.vendor_id);
      setSelectedVendor(vendor || null);
      setExpectedDeliveryDate(purchaseOrder.expected_delivery_date || "");
      setDeliveryAddress(purchaseOrder.delivery_address || "");
      setPaymentTerms(purchaseOrder.payment_terms || "");
      setTransportCost(purchaseOrder.transport_cost?.toString() || "");
      setNotes(purchaseOrder.notes || "");
      setVendorBillUrl(purchaseOrder.vendor_bill_url || "");

      // Restore group stock state from internal_notes
      try {
        const notes = purchaseOrder.internal_notes;
        const parsed = notes
          ? typeof notes === "string" ? JSON.parse(notes) : notes
          : null;
        if (parsed?.is_group_stock) {
          setIsGroupStock(true);
          setPayingSiteId(parsed.payment_source_site_id || siteId);
        } else {
          setIsGroupStock(false);
          setPayingSiteId(siteId);
        }
      } catch {
        setIsGroupStock(false);
        setPayingSiteId(siteId);
      }

      const existingItems: POItemRow[] =
        purchaseOrder.items?.map((item) => {
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
            weight_per_unit: item.material?.weight_per_unit,
            weight_unit: item.material?.weight_unit,
            length_per_piece: item.material?.length_per_piece,
            length_unit: item.material?.length_unit,
            standard_piece_weight: standardPieceWeight,
            pricing_mode: item.pricing_mode || 'per_piece',
            calculated_weight: item.calculated_weight || undefined,
            actual_weight: item.actual_weight || undefined,
          };
        }) || [];
      setItems(existingItems);
    } else {
      // New PO - reset form
      if (prefilledVendorId) {
        const prefillVendor = allVendors.find((v) => v.id === prefilledVendorId);
        setSelectedVendor(prefillVendor || null);
      } else {
        setSelectedVendor(null);
      }

      if (prefilledMaterialId && groupedMaterials.length > 0) {
        const prefillMaterial = groupedMaterials.find((m) => m.id === prefilledMaterialId);
        if (prefillMaterial) {
          setSelectedMaterial(prefillMaterial);
          const searchOption = materialSearchOptions.find(
            (opt) => opt.type === "material" && opt.material.id === prefilledMaterialId
          );
          if (searchOption) {
            setSelectedSearchOption(searchOption);
          }
        }
      }

      // Auto-fill dates based on mode
      if (isRequestMode && request) {
        // Both Purchase Date and Expected Delivery use required_by_date from the material request
        const requiredByDate = toDateInputFormat(request.required_by_date);
        setPurchaseDate(requiredByDate || today);
        setExpectedDeliveryDate(requiredByDate);
      } else {
        setPurchaseDate(today);
        setExpectedDeliveryDate("");
      }

      setDeliveryAddress("");
      setPaymentTerms("");
      setNotes("");
      setItems([]);
      setIsGroupStock(false);
      setTransportCost("");
      setVendorBillUrl("");
    }

    setError("");
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
  }, [purchaseOrder, allVendors, groupedMaterials, materialSearchOptions, open, prefilledVendorId, prefilledMaterialId, request, isRequestMode, today]);

  // Initialize request items state when request items load
  useEffect(() => {
    if (isRequestMode && requestItems.length > 0 && requestItemsState.length === 0) {
      setRequestItemsState(requestItems);
    }
  }, [isRequestMode, requestItems, requestItemsState.length]);

  // Reset request items state when dialog closes
  useEffect(() => {
    if (!open) {
      setRequestItemsState([]);
    }
  }, [open]);

  // Reset brand variant when brand name changes
  useEffect(() => {
    setSelectedBrandVariant(null);
  }, [selectedBrandName]);

  // Auto-fill price when latest price is found
  useEffect(() => {
    if (latestPrice && !hasAutofilledPrice.current && !newItemPrice) {
      hasAutofilledPrice.current = true;
      setNewItemPrice(latestPrice.price.toString());
      if ('pricing_mode' in latestPrice && latestPrice.pricing_mode) {
        setNewItemPricingMode(latestPrice.pricing_mode as 'per_piece' | 'per_kg');
      }
      if (latestPrice.transport_cost && !transportCost) {
        setTransportCost(latestPrice.transport_cost.toString());
      }
    }
  }, [latestPrice, selectedVendor, selectedMaterial, selectedVariant, selectedBrandName, selectedBrandVariant, newItemPrice, transportCost]);

  // Reset auto-fill flag when selection changes
  useEffect(() => {
    hasAutofilledPrice.current = false;
  }, [selectedVendor, selectedMaterial, selectedVariant, selectedBrandName, selectedBrandVariant]);

  // Update payingSiteId when siteId changes
  useEffect(() => {
    if (!purchaseOrder && siteId) {
      setPayingSiteId(siteId);
    }
  }, [siteId, purchaseOrder]);

  // ============================================================================
  // Computed totals
  // ============================================================================

  // Regular items total (for both modes)
  const itemsTotals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item) => {
      let itemTotal: number;
      if (item.pricing_mode === 'per_kg') {
        const weight = item.actual_weight ?? item.calculated_weight ?? 0;
        itemTotal = weight * item.unit_price;
      } else {
        itemTotal = item.quantity * item.unit_price;
      }
      const itemTax = item.tax_rate ? (itemTotal * item.tax_rate) / 100 : 0;
      subtotal += itemTotal;
      taxAmount += itemTax;
    });

    return { subtotal, taxAmount };
  }, [items]);

  // Request items total (for request mode)
  const requestItemsTotals = useMemo(() => {
    if (!isRequestMode) return { subtotal: 0, taxAmount: 0, selectedCount: 0 };

    const selectedItems = requestItemsState.filter((item) => item.selected && item.quantity_to_order > 0);
    let subtotal = 0;
    let taxAmount = 0;

    selectedItems.forEach((item) => {
      // Calculate item total based on pricing mode
      let itemTotal: number;
      if (item.pricing_mode === "per_kg") {
        const weight = item.actual_weight ?? item.calculated_weight ?? 0;
        itemTotal = weight * item.unit_price;
      } else {
        itemTotal = item.quantity_to_order * item.unit_price;
      }
      // When priceIncludesGst: tax is already inside itemTotal, extract it
      // When not: tax is calculated on top
      const itemTax = item.tax_rate
        ? priceIncludesGst
          ? (itemTotal * item.tax_rate) / (100 + item.tax_rate)
          : (itemTotal * item.tax_rate) / 100
        : 0;
      subtotal += itemTotal;
      taxAmount += itemTax;
    });

    return { subtotal, taxAmount, selectedCount: selectedItems.length };
  }, [isRequestMode, requestItemsState, priceIncludesGst]);

  // Combined totals
  const totals = useMemo(() => {
    const transport = parseFloat(transportCost) || 0;
    const subtotal = itemsTotals.subtotal + requestItemsTotals.subtotal;
    const taxAmount = itemsTotals.taxAmount + requestItemsTotals.taxAmount;

    return {
      subtotal: Math.round(subtotal),
      taxAmount: Math.round(taxAmount),
      transport: Math.round(transport),
      // When priceIncludesGst: subtotal already contains GST, don't add taxAmount again
      total: priceIncludesGst
        ? Math.round(subtotal + transport)
        : Math.round(subtotal + taxAmount + transport),
      itemCount: items.length + requestItemsTotals.selectedCount,
    };
  }, [itemsTotals, requestItemsTotals, transportCost, items.length, priceIncludesGst]);

  // ============================================================================
  // Handlers - Request items
  // ============================================================================

  const handleToggleRequestItem = (itemId: string) => {
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const handleToggleAllRequestItems = () => {
    const selectableItems = requestItemsState.filter((item) => item.remaining_qty > 0);
    const allSelected = selectableItems.every((item) => item.selected);

    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.remaining_qty > 0 ? { ...item, selected: !allSelected } : item
      )
    );
  };

  const handleRequestItemQuantityChange = (itemId: string, value: string) => {
    const qty = parseFloat(value) || 0;
    setRequestItemsState((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const validQty = Math.min(Math.max(0, qty), item.remaining_qty);

        // Recalculate weight when quantity changes
        const calculatedWeight =
          item.standard_piece_weight && validQty > 0
            ? item.standard_piece_weight * validQty
            : null;

        return {
          ...item,
          quantity_to_order: validQty,
          calculated_weight: calculatedWeight,
          // Also update actual_weight to match (user can override later)
          actual_weight: calculatedWeight,
        };
      })
    );
  };

  const handleRequestItemPriceChange = (itemId: string, value: string) => {
    const price = parseFloat(value) || 0;
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, unit_price: price } : item
      )
    );
  };

  const handleRequestItemTaxRateChange = (itemId: string, value: string) => {
    const taxRate = parseFloat(value) || 0;
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, tax_rate: taxRate } : item
      )
    );
  };

  const handleRequestItemVariantChange = (
    itemId: string,
    variantId: string | null,
    variantName: string | null
  ) => {
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              selected_variant_id: variantId,
              selected_variant_name: variantName,
              // Clear brand when variant changes
              selected_brand_id: null,
              selected_brand_name: null,
              // Reset price when variant changes
              unit_price: 0,
            }
          : item
      )
    );
  };

  const handleRequestItemBrandChange = (
    itemId: string,
    brandId: string | null,
    brandName: string | null
  ) => {
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              selected_brand_id: brandId,
              selected_brand_name: brandName,
            }
          : item
      )
    );
  };

  const handleRequestItemPricingModeChange = (
    itemId: string,
    value: "per_piece" | "per_kg"
  ) => {
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, pricing_mode: value } : item
      )
    );
  };

  const handleRequestItemActualWeightChange = (itemId: string, value: string) => {
    const weight = parseFloat(value) || 0;
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, actual_weight: weight > 0 ? weight : null } : item
      )
    );
  };

  // ============================================================================
  // Handlers - Add/Remove items
  // ============================================================================

  const handleAddItem = () => {
    if (!selectedMaterial) {
      setError("Please select a material");
      return;
    }
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

    const materialToAdd = selectedVariant || selectedMaterial;

    let brandToUse: MaterialBrand | null = null;
    if (selectedBrandVariant) {
      brandToUse = selectedBrandVariant;
    } else if (selectedBrandName) {
      if (selectedVendor && vendorBrands.length > 0) {
        const vendorBrand = vendorBrands.find(
          (b) => b.brand_name === selectedBrandName && !b.variant_name
        );
        if (vendorBrand) {
          brandToUse = vendorBrand as MaterialBrand;
        }
      }
      if (!brandToUse && effectiveMaterial?.brands) {
        brandToUse = effectiveMaterial.brands.find(
          (b) => b.is_active && b.brand_name === selectedBrandName && !b.variant_name
        ) || null;
      }
    }

    let calculatedWeight: number | null = null;
    let stdPieceWeight: number | null = null;
    if (materialToAdd.weight_per_unit && materialToAdd.length_per_piece) {
      stdPieceWeight = calculatePieceWeight(
        materialToAdd.weight_per_unit,
        materialToAdd.length_per_piece,
        materialToAdd.length_unit || "ft"
      );
      if (stdPieceWeight) {
        calculatedWeight = stdPieceWeight * parseFloat(newItemQty);
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
      standard_piece_weight: stdPieceWeight,
      pricing_mode: newItemPricingMode,
      calculated_weight: calculatedWeight,
      actual_weight: calculatedWeight,
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
      removeItem.mutate({ id: item.id, poId: purchaseOrder.id });
    }
    setItems(items.filter((_, i) => i !== index));
  };

  // Handle starting edit mode for an item
  const handleStartEditItem = (index: number) => {
    const item = items[index];
    setEditingItemIndex(index);
    setEditingItemData({
      quantity: item.quantity.toString(),
      unit_price: item.unit_price.toString(),
      tax_rate: item.tax_rate?.toString() || "",
    });
  };

  // Handle canceling edit mode
  const handleCancelEditItem = () => {
    setEditingItemIndex(null);
    setEditingItemData(null);
  };

  // Handle saving edited item
  const handleSaveEditItem = async (index: number) => {
    if (!editingItemData) return;

    const item = items[index];
    const newQuantity = parseFloat(editingItemData.quantity) || 0;
    const newUnitPrice = parseFloat(editingItemData.unit_price) || 0;
    const newTaxRate = editingItemData.tax_rate ? parseFloat(editingItemData.tax_rate) : undefined;

    // Validate
    if (newQuantity <= 0 || newUnitPrice <= 0) {
      setError("Quantity and price must be greater than 0");
      return;
    }

    // Calculate new weight if weight-based
    const newCalculatedWeight = item.standard_piece_weight
      ? item.standard_piece_weight * newQuantity
      : null;

    // If item has an ID (existing item in DB), call the mutation
    if (item.id && purchaseOrder) {
      try {
        await updateItem.mutateAsync({
          id: item.id,
          poId: purchaseOrder.id,
          item: {
            quantity: newQuantity,
            unit_price: newUnitPrice,
            tax_rate: newTaxRate,
            pricing_mode: item.pricing_mode,
            calculated_weight: newCalculatedWeight,
            actual_weight: item.actual_weight ?? null,
          },
        });
        showSuccess("Item updated successfully");
      } catch (err) {
        console.error("Failed to update item:", err);
        showError("Failed to update item");
        return;
      }
    }

    // Update local state (for both saved and unsaved items)
    const newItems = [...items];
    newItems[index] = {
      ...item,
      quantity: newQuantity,
      unit_price: newUnitPrice,
      tax_rate: newTaxRate,
      calculated_weight: newCalculatedWeight,
    };
    setItems(newItems);

    // Reset edit state
    setEditingItemIndex(null);
    setEditingItemData(null);
  };

  // ============================================================================
  // Submit handler
  // ============================================================================

  const handleCreatePO = async (status: "ordered" | "draft") => {
    if (!selectedVendor) {
      setError("Please select a vendor");
      return;
    }

    // Combine items from both sources
    const selectedRequestItems = requestItemsState.filter(
      (item) => item.selected && item.quantity_to_order > 0
    );

    const totalItemCount = items.length + selectedRequestItems.length;

    if (totalItemCount === 0) {
      setError("Please add at least one item");
      return;
    }

    // Validate request items have prices
    if (selectedRequestItems.length > 0) {
      const itemsWithoutPrice = selectedRequestItems.filter((item) => item.unit_price <= 0);
      if (itemsWithoutPrice.length > 0) {
        setError("Please enter prices for all selected request items");
        return;
      }
    }

    try {
      // Build notes with group stock info if applicable
      let finalNotes = notes || "";
      if (isGroupStock && groupMembership?.isInGroup) {
        const payingSite = groupMembership.allSites?.find((s) => s.id === payingSiteId);
        const groupNote = `[GROUP STOCK] Paying Site: ${payingSite?.name || "Unknown"}`;
        finalNotes = finalNotes ? `${groupNote}\n${finalNotes}` : groupNote;
      }

      // Convert request items to PO item format
      // Use selected variant/brand if office staff chose them, otherwise fall back to original
      const requestItemsForPO = selectedRequestItems.map((item) => ({
        // Use selected variant if chosen, otherwise original material
        material_id: item.selected_variant_id || item.material_id,
        // Use selected brand if chosen, otherwise original brand
        brand_id: item.selected_brand_id || item.brand_id || undefined,
        quantity: item.quantity_to_order,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate || undefined,
        // Include pricing mode and weight data from the form state
        pricing_mode: item.pricing_mode || "per_piece",
        calculated_weight: item.calculated_weight || null,
        actual_weight: item.actual_weight || null,
        // Track request item linkage
        request_item_id: item.id,
      }));

      // Regular items (from search)
      const regularItems = items.map((item) => ({
        material_id: item.material_id,
        brand_id: item.brand_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        pricing_mode: item.pricing_mode || 'per_piece',
        calculated_weight: item.calculated_weight || null,
        actual_weight: item.actual_weight || null,
      }));

      // Combine all items
      const allItems = [...requestItemsForPO, ...regularItems];

      if (isEdit) {
        await updatePO.mutateAsync({
          id: purchaseOrder!.id,
          data: {
            vendor_id: selectedVendor.id,
            expected_delivery_date: expectedDeliveryDate || undefined,
            delivery_address: deliveryAddress || undefined,
            payment_terms: paymentTerms || undefined,
            payment_timing: paymentTiming,
            transport_cost: transportCost ? parseFloat(transportCost) : undefined,
            notes: notes || undefined,
            vendor_bill_url: vendorBillUrl || undefined,
            internal_notes: isGroupStock
              ? JSON.stringify({
                  is_group_stock: true,
                  site_group_id: groupMembership?.groupId,
                  payment_source_site_id: payingSiteId,
                })
              : "",
          },
          siteId, // Added for optimistic update
        });

        // Add new items (items without id)
        const newItems = items.filter((item) => !item.id);
        for (const item of newItems) {
          await addItem.mutateAsync({
            poId: purchaseOrder!.id,
            item: {
              material_id: item.material_id,
              brand_id: item.brand_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate: item.tax_rate,
            },
          });
        }

        onClose();
        showSuccess(`Purchase Order ${purchaseOrder!.po_number} updated successfully!`);
        return;
      }

      // Create new PO
      const result = await createPO.mutateAsync({
        site_id: siteId,
        vendor_id: selectedVendor.id,
        status,
        order_date: purchaseDate,
        expected_delivery_date: expectedDeliveryDate || undefined,
        delivery_address: deliveryAddress || undefined,
        payment_terms: paymentTerms || undefined,
        payment_timing: paymentTiming,
        transport_cost: transportCost ? parseFloat(transportCost) : undefined,
        notes: finalNotes || undefined,
        vendor_bill_url: vendorBillUrl || undefined,
        internal_notes: isGroupStock
          ? JSON.stringify({
            is_group_stock: true,
            site_group_id: groupMembership?.groupId,
            payment_source_site_id: payingSiteId,
          })
          : undefined,
        items: allItems,
        source_request_id: isRequestMode && request ? request.id : undefined,
        price_includes_gst: priceIncludesGst,
      });

      // If we're creating from a request, update the request items' fulfilled quantities
      if (isRequestMode && request && selectedRequestItems.length > 0) {
        // The PO creation mutation should handle linking the items
        // Additional approval logic can be added here if needed
      }

      onClose();
      onSuccess?.(result?.id || "");

      const totalAmount = allItems.reduce((sum, item) => {
        return sum + item.quantity * item.unit_price;
      }, 0);
      showSuccess(
        `Purchase Order ${result?.po_number || ""} created successfully! Total: ₹${totalAmount.toLocaleString()}`,
        5000
      );
    } catch (err: unknown) {
      console.error("[UnifiedPODialog] Error:", err);
      const message = err instanceof Error ? err.message : "Failed to save purchase order";
      setError(message);
      showError(message);
    }
  };

  const handleSubmit = () => handleCreatePO("ordered");
  const handleSaveAsDraft = () => handleCreatePO("draft");

  const isSubmitting = createPO.isPending || updatePO.isPending || addItem.isPending || approveRequest.isPending || updateItem.isPending;

  // Check if there are convertible items in request mode
  const hasConvertibleItems = !isRequestMode || requestItemsState.some((item) => item.remaining_qty > 0);

  // Check if any request items have weight-based pricing
  const hasWeightBasedRequestItems = requestItemsState.some((item) => item.weight_per_unit);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="xl"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: { minHeight: isMobile ? "100%" : "80vh", maxWidth: "1400px" },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          pb: 1,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <ShoppingCartIcon color="primary" />
            <Typography variant="h6" component="span">
              {isEdit
                ? `Edit PO ${purchaseOrder?.po_number}`
                : isRequestMode
                  ? mode === "partial"
                    ? "Create Additional Purchase Order"
                    : "Approve & Create Purchase Order"
                  : "Create Purchase Order"
              }
            </Typography>
          </Box>

          {/* Request context banner */}
          {isRequestMode && request && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                From: {request.request_number}
              </Typography>
              <Chip
                label={PRIORITY_LABELS[request.priority]}
                size="small"
                color={PRIORITY_COLORS[request.priority]}
              />
              {request.required_by_date && (
                <Typography variant="body2" color="text.secondary">
                  Required by: {new Date(request.required_by_date).toLocaleDateString()}
                </Typography>
              )}
              {mode === "partial" && (
                <Chip
                  label="Partial Order"
                  size="small"
                  color="info"
                  icon={<InfoIcon />}
                />
              )}
            </Box>
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {isRequestMode && !hasConvertibleItems && !isLoadingRequestItems && (
          <Alert severity="info" sx={{ mb: 2 }}>
            All items from this request have already been converted to purchase orders.
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* ================================================================ */}
          {/* Section 1: Vendor Selection */}
          {/* ================================================================ */}

          <Grid size={{ xs: 12, md: isRequestMode ? 6 : 4 }}>
            <Autocomplete
              options={vendors as (Vendor | VendorForMaterials)[]}
              getOptionLabel={(option) => option.name}
              value={selectedVendor}
              onChange={(_, value) => setSelectedVendor(value)}
              loading={isLoadingFilteredVendors}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Vendor *"
                  placeholder={
                    isLoadingFilteredVendors
                      ? "Loading vendors..."
                      : isRequestMode
                        ? "Click or type to search..."
                        : "Select vendor"
                  }
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {isLoadingFilteredVendors && <CircularProgress color="inherit" size={20} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => {
                const isFilteredVendor = 'suppliedMaterialCount' in option;
                return (
                  <li {...props} key={option.id}>
                    <Box sx={{ width: "100%" }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="body2" fontWeight={isFilteredVendor && (option as VendorForMaterials).isPreferred ? 600 : 400}>
                          {option.name}
                          {isFilteredVendor && (option as VendorForMaterials).isPreferred && (
                            <Chip
                              label="Preferred"
                              size="small"
                              color="success"
                              sx={{ ml: 1, height: 18, fontSize: "0.65rem" }}
                            />
                          )}
                        </Typography>
                        {isFilteredVendor && requestMaterialIds && (
                          <Typography variant="caption" color="primary.main" fontWeight={500}>
                            {(option as VendorForMaterials).suppliedMaterialCount}/{requestMaterialIds.length} materials
                          </Typography>
                        )}
                      </Box>
                      {option.phone && (
                        <Typography variant="caption" color="text.secondary">
                          {option.phone}
                        </Typography>
                      )}
                    </Box>
                  </li>
                );
              }}
              noOptionsText={
                isLoadingRequestItems
                  ? "Loading materials..."
                  : isRequestMode && requestMaterialIds?.length === 0
                    ? "No materials available to order"
                    : isRequestMode
                      ? "No vendors supply these materials"
                      : "No vendors found"
              }
              slotProps={{
                popper: { disablePortal: false }
              }}
            />
            {isRequestMode && vendors.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Showing {vendors.length} vendor{vendors.length !== 1 ? "s" : ""} that supply the selected materials
              </Typography>
            )}
          </Grid>

          {/* Purchase Date (new PO only) */}
          {!isEdit && (
            <Grid size={{ xs: 12, md: isRequestMode ? 3 : 2.5 }}>
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

          <Grid size={{ xs: 12, md: isEdit ? 3 : (isRequestMode ? 3 : 2.5) }}>
            <TextField
              fullWidth
              type="date"
              label="Expected Delivery"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          {!isRequestMode && (
            <>
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
            </>
          )}

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

          {/* ================================================================ */}
          {/* Section 2: Request Items Table (Request Mode Only) */}
          {/* ================================================================ */}

          {isRequestMode && (
            <Grid size={12}>
              <Divider sx={{ my: 1 }}>
                <Typography variant="subtitle2">
                  Request Items
                </Typography>
              </Divider>

              {isLoadingRequestItems ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Paper variant="outlined" sx={{ overflow: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "grey.50" }}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={
                              requestItemsState.filter((i) => i.remaining_qty > 0).length > 0 &&
                              requestItemsState.filter((i) => i.remaining_qty > 0).every((i) => i.selected)
                            }
                            indeterminate={
                              requestItemsState.some((i) => i.selected && i.remaining_qty > 0) &&
                              !requestItemsState.filter((i) => i.remaining_qty > 0).every((i) => i.selected)
                            }
                            onChange={handleToggleAllRequestItems}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 180 }}>Material</TableCell>
                        <TableCell sx={{ minWidth: 160 }}>Brand</TableCell>
                        <TableCell align="right">Approved</TableCell>
                        <TableCell align="right">Ordered</TableCell>
                        <TableCell align="right">Remaining</TableCell>
                        <TableCell align="right" sx={{ minWidth: 100 }}>
                          Qty to Order
                        </TableCell>
                        <TableCell align="right" sx={{ minWidth: 140 }}>
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>Unit Price (₹)</Typography>
                            <Chip
                              label={priceIncludesGst ? "Incl. GST" : "Excl. GST"}
                              size="small"
                              color={priceIncludesGst ? "success" : "default"}
                              onClick={() => setPriceIncludesGst(!priceIncludesGst)}
                              sx={{ cursor: "pointer", fontSize: "0.65rem", height: 20 }}
                            />
                          </Box>
                        </TableCell>
                        {hasWeightBasedRequestItems && (
                          <TableCell align="right" sx={{ minWidth: 130 }}>
                            Price Per / Weight
                          </TableCell>
                        )}
                        <TableCell align="right" sx={{ minWidth: 80 }}>
                          GST %
                        </TableCell>
                        <TableCell align="right">Subtotal</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {requestItemsState.map((item) => (
                        <RequestItemRow
                          key={item.id}
                          item={item}
                          vendorId={selectedVendor?.id}
                          onToggle={() => handleToggleRequestItem(item.id)}
                          onQuantityChange={(value) => handleRequestItemQuantityChange(item.id, value)}
                          onPriceChange={(value) => handleRequestItemPriceChange(item.id, value)}
                          onTaxRateChange={(value) => handleRequestItemTaxRateChange(item.id, value)}
                          onVariantChange={(variantId, variantName) =>
                            handleRequestItemVariantChange(item.id, variantId, variantName)
                          }
                          onBrandChange={(brandId, brandName) =>
                            handleRequestItemBrandChange(item.id, brandId, brandName)
                          }
                          onPricingModeChange={(value) =>
                            handleRequestItemPricingModeChange(item.id, value)
                          }
                          onActualWeightChange={(value) =>
                            handleRequestItemActualWeightChange(item.id, value)
                          }
                          showPricingModeColumn={hasWeightBasedRequestItems}
                          priceIncludesGst={priceIncludesGst}
                        />
                      ))}
                    </TableBody>
                  </Table>

                  {/* Request Items Summary */}
                  {requestItemsTotals.selectedCount > 0 && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "flex-end",
                        p: 2,
                        bgcolor: "grey.50",
                        borderTop: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Box sx={{ minWidth: 280 }}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            mb: 0.5,
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Subtotal ({requestItemsTotals.selectedCount} item
                            {requestItemsTotals.selectedCount !== 1 ? "s" : ""}):
                          </Typography>
                          <Typography variant="body2" fontWeight={500}>
                            {formatCurrency(requestItemsTotals.subtotal)}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            mb: 0.5,
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            GST{priceIncludesGst ? " (included)" : ""}:
                          </Typography>
                          <Typography variant="body2">
                            {formatCurrency(requestItemsTotals.taxAmount)}
                          </Typography>
                        </Box>
                        <Divider sx={{ my: 1 }} />
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <Typography variant="subtitle2" fontWeight={600}>
                            Request Items Total:
                          </Typography>
                          <Typography variant="subtitle2" fontWeight={600} color="primary.main">
                            {formatCurrency(
                              priceIncludesGst
                                ? requestItemsTotals.subtotal
                                : requestItemsTotals.subtotal + requestItemsTotals.taxAmount
                            )}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Paper>
              )}
            </Grid>
          )}

          {/* ================================================================ */}
          {/* Section 3: Vendor Bill Upload */}
          {/* ================================================================ */}

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

          {/* ================================================================ */}
          {/* Section 4: Group Stock Toggle */}
          {/* ================================================================ */}

          {(isLoadingGroupMembership || groupMembership?.isInGroup) && (
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
                          disabled={isLoadingGroupMembership}
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
                        <strong>{groupMembership?.groupName}</strong>
                      </Typography>
                    )}

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
                            {groupMembership?.allSites?.map((site) => (
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

          {/* Transport Cost - visible when NOT in group stock mode */}
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

          {/* ================================================================ */}
          {/* Section 5: Add Additional Items (Smart Search) */}
          {/* ================================================================ */}

          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="subtitle2">
                {isRequestMode ? "Add Additional Items" : "Add Items"}
              </Typography>
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
                  setSelectedMaterial(null);
                  setSelectedVariant(null);
                  setSelectedBrandName(null);
                  setSelectedBrandVariant(null);
                  setNewItemPrice("");
                  return;
                }

                setSelectedMaterial(option.material);

                if (option.type === "variant" || option.variant) {
                  setSelectedVariant(option.variant);
                } else {
                  setSelectedVariant(null);
                }

                if (option.type === "brand" && option.brand) {
                  setSelectedBrandName(option.brand.brand_name);
                  if (option.brand.variant_name) {
                    setSelectedBrandVariant(option.brand);
                  } else {
                    setSelectedBrandVariant(null);
                  }
                } else {
                  setSelectedBrandName(null);
                  setSelectedBrandVariant(null);
                }

                const materialForGst = option.variant || option.material;
                if (materialForGst?.gst_rate && !newItemTaxRate) {
                  setNewItemTaxRate(materialForGst.gst_rate.toString());
                }

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
              slotProps={{
                popper: { disablePortal: false }
              }}
            />
          </Grid>

          {/* Variant Selection */}
          {hasVariants && !selectedVariant && (
            <Grid size={{ xs: 12, md: 2 }}>
              <Autocomplete
                options={availableVariants}
                getOptionLabel={(option) => option.name}
                value={selectedVariant}
                onChange={(_, value) => {
                  setSelectedVariant(value);
                  setSelectedBrandName(null);
                  setSelectedBrandVariant(null);
                  setNewItemPrice("");
                }}
                slotProps={{
                  popper: { disablePortal: false }
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
              slotProps={{
                popper: { disablePortal: false }
              }}
            />
          </Grid>

          {/* Brand Variant Selection */}
          {hasBrandVariants && (
            <Grid size={{ xs: 12, md: 2 }}>
              <Autocomplete
                options={brandVariantsForSelectedBrand}
                getOptionLabel={(brand) => brand.variant_name || "Standard"}
                value={selectedBrandVariant}
                onChange={(_, value) => {
                  setSelectedBrandVariant(value);
                  setNewItemPrice("");
                }}
                slotProps={{
                  popper: { disablePortal: false }
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

          {/* Pricing Mode Toggle */}
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

          {/* ================================================================ */}
          {/* Section 6: Items Table */}
          {/* ================================================================ */}

          {items.length > 0 && (
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
                    {items.map((item, index) => {
                      let itemTotal: number;
                      if (item.pricing_mode === 'per_kg') {
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
                              {editingItemIndex === index ? (
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editingItemData?.quantity || ""}
                                  onChange={(e) => setEditingItemData(prev =>
                                    prev ? { ...prev, quantity: e.target.value } : null
                                  )}
                                  slotProps={{
                                    input: {
                                      endAdornment: <InputAdornment position="end">pcs</InputAdornment>,
                                      inputProps: { min: 0, step: 1, style: { textAlign: "right" } },
                                    },
                                  }}
                                  sx={{ width: 100 }}
                                />
                              ) : (
                                <Typography variant="body2" fontWeight={500}>
                                  {item.quantity} pcs
                                  {item.pricing_mode === 'per_kg' && item.calculated_weight && (
                                    <Typography component="span" variant="caption" color="text.secondary">
                                      {` (~${(item.actual_weight ?? item.calculated_weight).toFixed(1)} kg)`}
                                    </Typography>
                                  )}
                                </Typography>
                              )}
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
                            {editingItemIndex === index ? (
                              <TextField
                                size="small"
                                type="number"
                                value={editingItemData?.unit_price || ""}
                                onChange={(e) => setEditingItemData(prev =>
                                  prev ? { ...prev, unit_price: e.target.value } : null
                                )}
                                slotProps={{
                                  input: {
                                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                                    inputProps: { min: 0, step: 0.01, style: { textAlign: "right" } },
                                  },
                                }}
                                sx={{ width: 120 }}
                              />
                            ) : (
                              <>
                                {formatCurrency(item.unit_price)}
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  /{item.pricing_mode === 'per_kg' ? 'kg' : item.unit}
                                </Typography>
                              </>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {editingItemIndex === index ? (
                              <TextField
                                size="small"
                                type="number"
                                value={editingItemData?.tax_rate || ""}
                                onChange={(e) => setEditingItemData(prev =>
                                  prev ? { ...prev, tax_rate: e.target.value } : null
                                )}
                                slotProps={{
                                  input: {
                                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                    inputProps: { min: 0, max: 100, style: { textAlign: "right" } },
                                  },
                                }}
                                sx={{ width: 80 }}
                              />
                            ) : (
                              item.tax_rate ? `${item.tax_rate}%` : "-"
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(itemTotal)}
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(itemTotal + itemTax)}
                          </TableCell>
                          <TableCell>
                            {editingItemIndex === index ? (
                              <Box sx={{ display: "flex", gap: 0.5 }}>
                                <Tooltip title="Save">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={() => handleSaveEditItem(index)}
                                    disabled={updateItem.isPending}
                                  >
                                    {updateItem.isPending ? (
                                      <CircularProgress size={16} />
                                    ) : (
                                      <CheckIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Cancel">
                                  <IconButton
                                    size="small"
                                    onClick={handleCancelEditItem}
                                    disabled={updateItem.isPending}
                                  >
                                    <CloseIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ) : (
                              <Box sx={{ display: "flex", gap: 0.5 }}>
                                <Tooltip title="Edit">
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={() => handleStartEditItem(index)}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleRemoveItem(index)}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          )}

          {/* ================================================================ */}
          {/* Section 7: Totals */}
          {/* ================================================================ */}

          {totals.itemCount > 0 && (
            <Grid size={12}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  mt: 2,
                }}
              >
                <Box sx={{ minWidth: 250 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Subtotal ({totals.itemCount} item{totals.itemCount !== 1 ? "s" : ""}):
                    </Typography>
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
                    <Typography variant="body2" color="text.secondary">
                      GST{priceIncludesGst ? " (included)" : ""}:
                    </Typography>
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
                      <Typography variant="body2" color="text.secondary">
                        Transport:
                      </Typography>
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
                    <Typography variant="subtitle1" fontWeight={600} color="primary">
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
            disabled={isSubmitting || !selectedVendor || totals.itemCount === 0}
          >
            {isSubmitting ? "Saving..." : "Save as Draft"}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedVendor || totals.itemCount === 0}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : isRequestMode ? <CheckCircleIcon /> : <ShoppingCartIcon />}
        >
          {isSubmitting
            ? "Saving..."
            : isEdit
              ? "Update"
              : isRequestMode
                ? "Create Purchase Order"
                : "Create Order"
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
}
