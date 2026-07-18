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
import { useDraftSnapshot } from "@/hooks/useDraftSnapshot";
import { useVendors, useVendorsForMaterials, VendorForMaterials } from "@/hooks/queries/useVendors";
import { useMaterialSearchOptions, filterMaterialSearchOptions, useBrandVariantLinks } from "@/hooks/queries/useMaterials";
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
import { graniteSizeNote, graniteQuantityAllocated } from "@/lib/materials/granite";
import { graniteSqft, isAreaUnit } from "@/lib/spaces/measurements";
import type { GraniteLine } from "@/types/spaces.types";
import {
  calculatePieceWeight,
  computeLineAmount,
  extractGstFromGross,
  addGstToNet,
} from "@/lib/weightCalculation";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types/material.types";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { StaleStateError } from "@/lib/utils/staleState";
import FileUploader from "@/components/common/FileUploader";
import DraftRestoreBanner from "@/components/common/DraftRestoreBanner";
import { BillPreviewButton } from "@/components/common/BillViewerDialog";
import { createClient } from "@/lib/supabase/client";
import RequestItemRow from "./RequestItemRow";
import QuickAddVendorDialog from "./QuickAddVendorDialog";
import VendorDialog from "./VendorDialog";

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

// De-duplicate a vendor list by id, keeping the first occurrence (so richer
// VendorForMaterials entries with badges win over plain Vendor duplicates).
function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// ============================================================================
// Component
// ============================================================================

// Sentinel brand option: lets the buyer DELIBERATELY record a brandless line
// for a material that does have brands (the alternative to silently leaving it
// blank). Distinct from "not yet chosen" (null).
const UNBRANDED_OPTION = "Unbranded (no brand)";

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
  const { userProfile } = useAuth();

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
  // Inline vendor management (request mode): reveal the full directory, add new vendors.
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [showAllVendors, setShowAllVendors] = useState(false);
  const [manualVendors, setManualVendors] = useState<Vendor[]>([]);
  const [quickAddVendorOpen, setQuickAddVendorOpen] = useState(false);
  const [fullVendorFormOpen, setFullVendorFormOpen] = useState(false);
  const [prefillVendorName, setPrefillVendorName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentTiming, setPaymentTiming] = useState<"advance" | "on_delivery">("on_delivery");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItemRow[]>([]);

  // Vendor picker options: the "supplies these materials" set (`vendors`), plus
  // inline-created vendors, plus the full directory once the user expands it.
  // `selectedVendor` is appended last so it's always a valid option (no MUI warning).
  const vendorOptions = useMemo<(Vendor | VendorForMaterials)[]>(() => {
    return dedupeById<Vendor | VendorForMaterials>([
      ...manualVendors,
      ...(vendors as (Vendor | VendorForMaterials)[]),
      ...(showAllVendors ? allVendors : []),
      ...(selectedVendor ? [selectedVendor] : []),
    ]);
  }, [manualVendors, vendors, showAllVendors, allVendors, selectedVendor]);

  // Select a freshly-created (or de-duped existing) vendor and close the add flow.
  const handleVendorCreated = (vendor: Vendor) => {
    setManualVendors((prev) => dedupeById([vendor, ...prev]));
    setSelectedVendor(vendor);
    setQuickAddVendorOpen(false);
    setFullVendorFormOpen(false);
    setVendorPickerOpen(false);
  };

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
  // Tracks which request's items are currently seeded into `requestItemsState`.
  // The dialog is a single persistent instance (mounted once in HubDialogRouter,
  // toggled via `open`), so without keying the reset on the request id, switching
  // from material A to material B could leave A's rows in place (stale-rows bug).
  const seededRequestIdRef = useRef<string | null>(null);

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

  // Fetch vendor-specific brands. Brand is the PARENT of the variant, so brand
  // options come from the parent material — available before any variant is
  // picked and stable across variant changes (Material → Brand → Variant).
  const { data: vendorBrands = [], isLoading: isLoadingVendorBrands } = useVendorMaterialBrands(
    selectedVendor?.id,
    selectedMaterial?.id
  );

  // Brand → variant links for the parent material, used to filter the Variant
  // options down to the chosen brand below.
  const { data: brandLinks = [] } = useBrandVariantLinks(selectedMaterial?.id);

  const uniqueBrandNames = useMemo(() => {
    if (selectedVendor && vendorBrands.length > 0) {
      const brandNames = new Set<string>();
      vendorBrands.forEach((b) => brandNames.add(b.brand_name));
      return Array.from(brandNames).sort();
    }
    if (!selectedMaterial?.brands) return [];
    const brandNames = new Set<string>();
    selectedMaterial.brands
      .filter((b) => b.is_active)
      .forEach((b) => brandNames.add(b.brand_name));
    return Array.from(brandNames).sort();
  }, [selectedVendor, vendorBrands, selectedMaterial]);

  // A material with catalog/vendor brands must have a deliberate brand choice
  // (a real brand OR explicit "Unbranded") — that's how we stop blank brands
  // leaking into usage. Brandless materials (sand, gravel) are unaffected.
  const brandRequired = uniqueBrandNames.length > 0;
  const brandOptions = useMemo(
    () => (brandRequired ? [UNBRANDED_OPTION, ...uniqueBrandNames] : uniqueBrandNames),
    [brandRequired, uniqueBrandNames],
  );
  const brandMissing = brandRequired && !selectedBrandName;

  // Variants available under the chosen brand. Brand is the parent: filter the
  // parent's variants to those linked to the brand. Fallbacks keep the user
  // unblocked (Unbranded or a link-less brand → all variants).
  const availableVariantsForBrand = useMemo(() => {
    if (!selectedBrandName || selectedBrandName === UNBRANDED_OPTION) return availableVariants;
    const brandEntry = brandLinks.find((b) => b.brand_name === selectedBrandName);
    const linkedVariantIds = new Set(
      (brandEntry?.material_brand_variant_links ?? [])
        .filter((l) => l.is_active !== false && l.variant_id)
        .map((l) => l.variant_id)
    );
    if (linkedVariantIds.size === 0) return availableVariants;
    return availableVariants.filter((v) => linkedVariantIds.has(v.id));
  }, [selectedBrandName, brandLinks, availableVariants]);

  // Gate the Variant on Brand only when this material actually offers brands.
  const variantNeedsBrand = brandRequired && !selectedBrandName;

  const brandVariantsForSelectedBrand = useMemo(() => {
    if (!selectedBrandName || selectedBrandName === UNBRANDED_OPTION) return [];
    if (selectedVendor && vendorBrands.length > 0) {
      return vendorBrands.filter((b) => b.brand_name === selectedBrandName);
    }
    if (!selectedMaterial?.brands) return [];
    return selectedMaterial.brands.filter(
      (b) => b.is_active && b.brand_name === selectedBrandName
    );
  }, [selectedBrandName, selectedVendor, vendorBrands, selectedMaterial]);

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

    // Reset inline-vendor picker state on each open.
    setShowAllVendors(false);
    setManualVendors([]);
    setVendorPickerOpen(false);
    setQuickAddVendorOpen(false);
    setFullVendorFormOpen(false);
    setPrefillVendorName("");

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

      // Auto-fill dates based on mode. In request mode both Purchase Date and
      // Expected Delivery default to the request's created date (request_date,
      // falling back to created_at) so the PO reflects when the request was
      // made; both stay manually editable.
      if (isRequestMode && request) {
        const createdDate =
          toDateInputFormat(request.request_date) ||
          toDateInputFormat(request.created_at) ||
          today;
        setPurchaseDate(createdDate);
        setExpectedDeliveryDate(createdDate);
      } else {
        setPurchaseDate(today);
        setExpectedDeliveryDate(today);
      }

      setDeliveryAddress("");
      setPaymentTerms("");
      setNotes("");
      setItems([]);
      setIsGroupStock(request?.purchase_type === 'group_stock');
      if (request?.delivery_type === 'bulk') {
        setPaymentTiming('advance');
      }
      // Inherit the payer the engineer chose at request creation (group_stock
      // requests carry payment_source_site_id). Falls back to the current site
      // for own-site requests or when no payer was recorded.
      setPayingSiteId(
        (request?.purchase_type === 'group_stock' &&
          (request as { payment_source_site_id?: string | null })
            ?.payment_source_site_id) ||
          siteId
      );
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

  // ---- Draft persistence (fresh "direct" PO create only) ----
  // Protects a from-scratch PO (vendor, items, terms) against a network error or
  // refresh. Disabled for edit and request-conversion modes, which hydrate from
  // the server. Declared after the main reset effect so its restore wins.
  const poDraftEnabled = mode === "direct" && !isEdit;
  const poDraftDirty =
    poDraftEnabled &&
    (items.length > 0 ||
      !!selectedVendor ||
      notes.trim() !== "" ||
      deliveryAddress.trim() !== "" ||
      paymentTerms.trim() !== "" ||
      transportCost.trim() !== "" ||
      expectedDeliveryDate !== "" ||
      vendorBillUrl !== "" ||
      isGroupStock);

  const poDraftSnapshot = useMemo(
    () => ({
      selectedVendor,
      purchaseDate,
      expectedDeliveryDate,
      deliveryAddress,
      paymentTerms,
      paymentTiming,
      notes,
      items,
      isGroupStock,
      payingSiteId,
      transportCost,
      priceIncludesGst,
      vendorBillUrl,
    }),
    [
      selectedVendor,
      purchaseDate,
      expectedDeliveryDate,
      deliveryAddress,
      paymentTerms,
      paymentTiming,
      notes,
      items,
      isGroupStock,
      payingSiteId,
      transportCost,
      priceIncludesGst,
      vendorBillUrl,
    ],
  );

  const {
    hasRestoredDraft: hasRestoredPODraft,
    restoredAt: poDraftRestoredAt,
    clearDraft: clearPODraft,
    discardDraft: discardPODraft,
  } = useDraftSnapshot({
    key: "po_dialog_create",
    isOpen: open,
    enabled: poDraftEnabled,
    dirty: poDraftDirty,
    snapshot: poDraftSnapshot,
    applyDraft: (d) => {
      setSelectedVendor(d.selectedVendor ?? null);
      if (d.purchaseDate) setPurchaseDate(d.purchaseDate);
      setExpectedDeliveryDate(d.expectedDeliveryDate ?? "");
      setDeliveryAddress(d.deliveryAddress ?? "");
      setPaymentTerms(d.paymentTerms ?? "");
      setPaymentTiming(d.paymentTiming ?? "on_delivery");
      setNotes(d.notes ?? "");
      setItems(Array.isArray(d.items) ? d.items : []);
      setIsGroupStock(!!d.isGroupStock);
      setPayingSiteId(d.payingSiteId ?? siteId);
      setTransportCost(d.transportCost ?? "");
      setPriceIncludesGst(!!d.priceIncludesGst);
      setVendorBillUrl(d.vendorBillUrl ?? "");
    },
    onDiscard: () => {
      setSelectedVendor(null);
      setExpectedDeliveryDate("");
      setDeliveryAddress("");
      setPaymentTerms("");
      setPaymentTiming("on_delivery");
      setNotes("");
      setItems([]);
      setIsGroupStock(false);
      setPayingSiteId(siteId);
      setTransportCost("");
      setPriceIncludesGst(false);
      setVendorBillUrl("");
    },
  });

  // Seed request items state when the request items load, and RE-seed whenever the
  // request identity changes (not merely when the local copy is empty). Keying the
  // reset on `request.id` fixes the stale-rows bug — switching material A → B now
  // always replaces A's rows with B's — while still preserving the user's in-dialog
  // edits for the *same* request across background query refetches (same id → skip).
  useEffect(() => {
    if (!open || !isRequestMode || !request) return;
    if (seededRequestIdRef.current === request.id || requestItems.length === 0) return;
    setRequestItemsState(requestItems);
    seededRequestIdRef.current = request.id;
    // TMT/weight-based bills are gross (GST-inclusive) by default — no TMT vendor
    // sells without GST. Seed the dialog into inclusive mode so the office user
    // enters the rate exactly as the vendor quotes it.
    if (requestItems.some((it: RequestItemForConversion) => it.weight_per_unit)) {
      setPriceIncludesGst(true);
    }
  }, [open, isRequestMode, request, requestItems]);

  // Auto-pick vendor when every request line agrees on the same suggested vendor
  // (e.g. a basket built on /company/calculator where the engineer picked one vendor
  // for all lines). Only fires once per dialog opening, and only when no vendor is
  // already prefilled — keeps the office user's manual choice intact.
  const hasAppliedSuggestedVendor = useRef(false);
  useEffect(() => {
    if (!open) {
      hasAppliedSuggestedVendor.current = false;
      return;
    }
    if (
      hasAppliedSuggestedVendor.current ||
      !isRequestMode ||
      selectedVendor ||
      requestItemsState.length === 0 ||
      vendors.length === 0
    ) {
      return;
    }
    const firstId = requestItemsState[0]?.suggested_vendor_id ?? null;
    const unanimous =
      firstId !== null &&
      requestItemsState.every((it) => it.suggested_vendor_id === firstId);
    if (!unanimous) return;
    const match = vendors.find((v) => v.id === firstId);
    if (match) {
      setSelectedVendor(match);
      hasAppliedSuggestedVendor.current = true;
    }
  }, [open, isRequestMode, selectedVendor, requestItemsState, vendors]);

  // Reset per-row unit_price when the dialog's vendor changes so the row-level
  // useVendorMaterialPrice catalog auto-fill (or the suggestion seed for matching
  // vendors) can re-fire. Skip the initial render and skip when prices were just
  // seeded from a freshly fetched request — only act on genuine vendor swaps.
  const prevVendorIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isRequestMode) return;
    const currentId = selectedVendor?.id ?? null;
    const prev = prevVendorIdRef.current;
    prevVendorIdRef.current = currentId;
    if (prev === undefined) return; // first observation — nothing to reset
    if (prev === currentId) return;
    setRequestItemsState((prev2) =>
      prev2.map((item) => ({ ...item, unit_price: 0, tax_rate: 0 })),
    );
  }, [isRequestMode, selectedVendor?.id]);

  // Reset request items state when dialog closes so the next opening re-seeds
  // cleanly. Clearing the seeded-id ref alongside guarantees a genuine re-seed even
  // when the same material is reopened after edits.
  useEffect(() => {
    if (!open) {
      setRequestItemsState([]);
      seededRequestIdRef.current = null;
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
      // Weight-based (TMT) materials are always per kg — never downgrade their mode
      // from the vendor's stored default.
      if ('pricing_mode' in latestPrice && latestPrice.pricing_mode && !effectiveMaterial?.weight_per_unit) {
        setNewItemPricingMode(latestPrice.pricing_mode as 'per_piece' | 'per_kg');
      }
      if (latestPrice.transport_cost && !transportCost) {
        setTransportCost(latestPrice.transport_cost.toString());
      }
    }
  }, [latestPrice, selectedVendor, selectedMaterial, selectedVariant, selectedBrandName, selectedBrandVariant, newItemPrice, transportCost, effectiveMaterial?.weight_per_unit]);

  // Reset auto-fill flag when selection changes
  useEffect(() => {
    hasAutofilledPrice.current = false;
  }, [selectedVendor, selectedMaterial, selectedVariant, selectedBrandName, selectedBrandVariant]);

  // TMT/weight-based materials are always priced per kg and quoted GST-inclusive
  // (no vendor sells TMT without GST). Lock the add-item form accordingly so the
  // office user never has to pick the mode or flip the GST switch for steel.
  useEffect(() => {
    if (effectiveMaterial?.weight_per_unit) {
      setNewItemPricingMode("per_kg");
      setPriceIncludesGst(true);
    }
  }, [effectiveMaterial?.weight_per_unit]);

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
        // Area materials (granite/marble) may legitimately exceed the request:
        // the vendor's slabs are never the exact size, so you buy bigger and cut
        // to fit. Capping that would silently rewrite what was actually bought.
        // Everything else keeps the original cap.
        const validQty = isAreaUnit(item.unit)
          ? Math.max(0, qty)
          : Math.min(Math.max(0, qty), item.remaining_qty);

        // Recalculate weight when quantity changes
        const calculatedWeight =
          item.standard_piece_weight && validQty > 0
            ? item.standard_piece_weight * validQty
            : null;

        return {
          ...item,
          quantity_to_order: validQty,
          // PO stage carries only the ESTIMATE; the exact weight is captured at
          // delivery from the yellow bill, so actual_weight stays null here.
          calculated_weight: calculatedWeight,
          actual_weight: null,
        };
      })
    );
  };

  /**
   * Area materials: the office revised the slabs being bought. The area is
   * derived from the dimensions, never typed, so it can't drift from the sizes
   * we bill on. The request's own granite_lines are untouched — the gap between
   * the two is the offcut.
   */
  const handleRequestItemGraniteLinesChange = (itemId: string, next: GraniteLine[]) => {
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, actual_granite_lines: next, quantity_to_order: graniteSqft(next) }
          : item
      )
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
              // Clear the previous variant's pack; the new variant re-seeds its own.
              pack_id: null,
              pack_count: null,
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

  // Pack-priced variants: RequestItemRow reports the chosen can + count so the
  // PO line is stamped with them (quantity stays base-unit; unit_price per-unit).
  const handleRequestItemPackChange = (
    itemId: string,
    packId: string | null,
    packCount: number | null
  ) => {
    setRequestItemsState((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, pack_id: packId, pack_count: packCount } : item
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
    // Prevention: a brand-having material must have a deliberate choice so the
    // brand carries through to usage (an explicit "Unbranded" is allowed).
    if (brandMissing) {
      setError('Pick a brand, or choose "Unbranded (no brand)".');
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
        // Pack-priced variants: carry the can size + count (quantity stays base-unit).
        pack_id: item.pack_id ?? null,
        pack_count: item.pack_count ?? null,
        // Area materials: the slabs actually bought + their flattened summary,
        // so the PO records the sizes and not just an area.
        granite_lines: isAreaUnit(item.unit) ? (item.actual_granite_lines ?? []) : [],
        notes: isAreaUnit(item.unit)
          ? graniteSizeNote(item.actual_granite_lines ?? []) || undefined
          : undefined,
        // Buying bigger slabs than asked for must not claim more of the request
        // than it ever needed — see graniteQuantityAllocated. A no-op for
        // non-area lines, where the clamp already guarantees qty <= remaining.
        quantity_allocated: graniteQuantityAllocated(item.quantity_to_order, item.remaining_qty),
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

      // Approve + PO are one combined office step: creating a PO from a
      // still-pending request implicitly approves it. Stamp the approval
      // (approved_by / approved_at + per-item approved_qty) before the PO
      // insert so the audit trail matches the single "Create PO" click.
      if (isRequestMode && request && request.status === "pending" && userProfile?.id) {
        try {
          await approveRequest.mutateAsync({
            id: request.id,
            userId: userProfile.id,
            siteId,
            approvedItems: selectedRequestItems.map((item) => ({
              itemId: item.id,
              approved_qty: item.quantity_to_order,
            })),
          });
        } catch (approveErr) {
          // A colleague approved it moments ago — the PO can still proceed.
          if (!(approveErr instanceof StaleStateError)) throw approveErr;
        }
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
        ...(isGroupStock && groupMembership?.groupId ? { site_group_id: groupMembership.groupId } : {}),
        items: allItems,
        source_request_id: isRequestMode && request ? request.id : undefined,
        price_includes_gst: priceIncludesGst,
      });

      // If we're creating from a request, update the request items' fulfilled quantities
      if (isRequestMode && request && selectedRequestItems.length > 0) {
        // The PO creation mutation should handle linking the items
        // Additional approval logic can be added here if needed
      }

      clearPODraft();
      onClose();
      onSuccess?.(result?.id || "");

      const totalAmount = allItems.reduce((sum, item) => {
        // per-kg lines value = weight × rate, not pieces × rate
        return sum + computeLineAmount({
          pricing_mode: item.pricing_mode,
          unit_price: item.unit_price,
          quantity: item.quantity,
          actual_weight: item.actual_weight,
          calculated_weight: item.calculated_weight,
        });
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

  // Engineer's original "Purchase for" choice (request mode only), surfaced so
  // the admin isn't blindfolded. The toggle already defaults to this (see the
  // open-effect); these just make the intent visible and flag any override.
  const engineerPurchaseType = isRequestMode && request ? request.purchase_type : null; // 'own_site' | 'group_stock' | null
  const engineerWantsGroup = engineerPurchaseType === "group_stock";
  const overrodeEngineerChoice = engineerPurchaseType !== null && isGroupStock !== engineerWantsGroup;
  // Payer site name for group requests (best-effort; omitted until membership loads)
  const engineerPayerSiteName = groupMembership?.allSites?.find(
    (s) => s.id === (request as { payment_source_site_id?: string | null })?.payment_source_site_id
  )?.name;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
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
              <Typography variant="body2" color="text.secondary">
                Created: {new Date(request.request_date || request.created_at).toLocaleDateString()}
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
              {/* Engineer's original "Purchase for" choice — visible by default */}
              {engineerWantsGroup ? (
                <Chip
                  size="small"
                  color="secondary"
                  icon={<GroupsIcon />}
                  label={`Engineer requested: Group stock${engineerPayerSiteName ? ` · paid by ${engineerPayerSiteName}` : ""}`}
                />
              ) : (
                <Chip
                  size="small"
                  variant="outlined"
                  label="Engineer requested: This site only"
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
        <DraftRestoreBanner
          show={hasRestoredPODraft}
          restoredAt={poDraftRestoredAt}
          onDiscard={discardPODraft}
        />
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
              options={vendorOptions}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={selectedVendor}
              onChange={(_, value) => setSelectedVendor(value)}
              open={vendorPickerOpen}
              onOpen={() => setVendorPickerOpen(true)}
              onClose={() => setVendorPickerOpen(false)}
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
              PaperComponent={(paperProps) => (
                <Paper {...paperProps}>
                  {paperProps.children}
                  <Divider />
                  <Box sx={{ p: 0.5, display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                    {isRequestMode && !showAllVendors && allVendors.length > vendors.length && (
                      <Button
                        size="small"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowAllVendors(true)}
                        sx={{ justifyContent: "flex-start", textTransform: "none" }}
                      >
                        Show all directory vendors ({allVendors.length - vendors.length})
                      </Button>
                    )}
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setVendorPickerOpen(false);
                        setQuickAddVendorOpen(true);
                      }}
                      sx={{ justifyContent: "flex-start", textTransform: "none" }}
                    >
                      Add new vendor
                    </Button>
                  </Box>
                </Paper>
              )}
              slotProps={{
                popper: { disablePortal: false }
              }}
            />
            {isRequestMode && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                {filteredVendors.length > 0
                  ? `Showing ${filteredVendors.length} that supply these${allVendors.length > filteredVendors.length ? ` · ${allVendors.length - filteredVendors.length} more in your directory` : ""}`
                  : `No vendors linked to these materials · showing all ${allVendors.length} in your directory`}
              </Typography>
            )}
            {selectedVendor && isRequestMode && !filteredVendors.some((v) => v.id === selectedVendor.id) && (
              <Alert
                severity="info"
                icon={<InfoIcon fontSize="inherit" />}
                sx={{ mt: 1, py: 0, "& .MuiAlert-message": { py: 0.5 } }}
              >
                {selectedVendor.name} isn’t linked to these materials yet — creating this PO will link them automatically.
              </Alert>
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
                        <TableCell align="right">
                          {hasWeightBasedRequestItems ? "Approx Total" : "Total"}
                        </TableCell>
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
                          onPackChange={(packId, packCount) =>
                            handleRequestItemPackChange(item.id, packId, packCount)
                          }
                          onGraniteLinesChange={(next) =>
                            handleRequestItemGraniteLinesChange(item.id, next)
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
                    {engineerPurchaseType && !overrodeEngineerChoice && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Defaulted to the engineer&apos;s request: {engineerWantsGroup ? "Group stock" : "This site only"}
                      </Typography>
                    )}
                    {overrodeEngineerChoice && (
                      <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.5, fontWeight: 500 }}>
                        Changed from the engineer&apos;s request (was: {engineerWantsGroup ? "Group stock" : "This site only"})
                      </Typography>
                    )}
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

          {/* Brand Selection — chosen BEFORE the variant (Brand is the parent). */}
          <Grid size={{ xs: 12, md: 2 }}>
            <Autocomplete
              options={brandOptions}
              getOptionLabel={(brandName) => brandName}
              value={selectedBrandName}
              onChange={(_, value) => {
                setSelectedBrandName(value);
                // Brand is the parent — clear any variant chosen under the old brand.
                setSelectedVariant(null);
                setSelectedBrandVariant(null);
                setNewItemPrice("");
              }}
              disabled={!selectedMaterial || isLoadingVendorBrands}
              loading={isLoadingVendorBrands}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={brandRequired ? "Brand *" : "Brand"}
                  size="small"
                  error={brandMissing}
                  helperText={brandMissing ? "Pick a brand or Unbranded" : undefined}
                  placeholder={
                    !selectedVendor
                      ? "Select vendor first"
                      : !selectedMaterial
                        ? "Select material"
                        : isLoadingVendorBrands
                          ? "Loading..."
                          : uniqueBrandNames.length === 0
                            ? "No brands from vendor"
                            : "Pick a brand"
                  }
                />
              )}
              renderOption={(props, brandName) => (
                <li {...props} key={brandName}>
                  <Typography
                    variant="body2"
                    sx={brandName === UNBRANDED_OPTION ? { fontStyle: "italic", color: "text.secondary" } : undefined}
                  >
                    {brandName}
                  </Typography>
                </li>
              )}
              slotProps={{
                popper: { disablePortal: false }
              }}
            />
          </Grid>

          {/* Variant Selection — enabled once a Brand is chosen; options filtered to the brand. */}
          {hasVariants && !selectedVariant && (
            <Grid size={{ xs: 12, md: 2 }}>
              <Autocomplete
                options={availableVariantsForBrand}
                getOptionLabel={(option) => option.name}
                value={selectedVariant}
                onChange={(_, value) => {
                  setSelectedVariant(value);
                  setNewItemPrice("");
                }}
                disabled={variantNeedsBrand}
                slotProps={{
                  popper: { disablePortal: false }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Variant"
                    size="small"
                    required
                    placeholder={variantNeedsBrand ? "Select brand first" : undefined}
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Typography variant="body2">{option.name}</Typography>
                  </li>
                )}
              />
            </Grid>
          )}

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
                  {latestPrice && "last_purchase_date" in latestPrice && (latestPrice as any).last_purchase_date && (
                    <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                      Last paid on {new Date((latestPrice as any).last_purchase_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </Typography>
                  )}
                  {latestPrice && "lowest_vendor_price" in latestPrice &&
                    (latestPrice as any).lowest_vendor_price != null &&
                    (latestPrice as any).lowest_vendor_id !== selectedVendor?.id &&
                    (latestPrice as any).lowest_vendor_price < ((latestPrice as any).price ?? Infinity) && (
                      <Typography component="span" variant="caption" sx={{ display: "block", color: "warning.main" }}>
                        ↓ Lowest {formatCurrency((latestPrice as any).lowest_vendor_price)}
                        {(latestPrice as any).lowest_vendor_name ? ` · ${(latestPrice as any).lowest_vendor_name}` : ""}
                      </Typography>
                  )}
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

          {/* TMT/weight-based materials are always priced per kg — the mode is
              locked (no toggle). A small chip makes that explicit. */}
          {effectiveMaterial?.weight_per_unit && (
            <Grid size={{ xs: 4, md: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", height: 40 }}>
                <Chip label="Priced per kg" size="small" color="info" variant="outlined" />
              </Box>
            </Grid>
          )}

          <Grid size={{ xs: 12, md: effectiveMaterial?.weight_per_unit ? 1.5 : 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
              disabled={brandMissing}
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
                      // Line amount is gross when the dialog is GST-inclusive (the
                      // unit price already carries GST), else net. Split accordingly
                      // so the Total column never double-counts GST.
                      const lineAmount = computeLineAmount({
                        pricing_mode: item.pricing_mode,
                        unit_price: item.unit_price,
                        quantity: item.quantity,
                        actual_weight: item.actual_weight,
                        calculated_weight: item.calculated_weight,
                      });
                      const { net: itemNet, gross: itemGross } = priceIncludesGst
                        ? extractGstFromGross(lineAmount, item.tax_rate)
                        : addGstToNet(lineAmount, item.tax_rate);
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
                              {/* Weight section for weight-based materials — at PO time
                                  this is an ESTIMATE only. The exact weight (and the
                                  weight-variance check) happen at delivery, from the bill. */}
                              {item.calculated_weight && item.standard_piece_weight && (
                                <Box sx={{ mt: 0.5, p: 1, bgcolor: "grey.50", borderRadius: 1 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                    Std: ~{item.standard_piece_weight.toFixed(2)} kg/pc × {item.quantity} = ~{item.calculated_weight.toFixed(2)} kg
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontStyle: "italic", mt: 0.25 }}>
                                    Estimate — exact weight captured at delivery
                                  </Typography>
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
                            {formatCurrency(itemNet)}
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(itemGross)}
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

    <QuickAddVendorDialog
      open={quickAddVendorOpen}
      onClose={() => setQuickAddVendorOpen(false)}
      onCreated={handleVendorCreated}
      allVendors={allVendors}
      onOpenFullForm={(name) => {
        setPrefillVendorName(name);
        setQuickAddVendorOpen(false);
        setFullVendorFormOpen(true);
      }}
    />

    <VendorDialog
      open={fullVendorFormOpen}
      onClose={() => setFullVendorFormOpen(false)}
      vendor={null}
      onCreated={handleVendorCreated}
      prefill={prefillVendorName ? { name: prefillVendorName } : undefined}
    />
    </>
  );
}
