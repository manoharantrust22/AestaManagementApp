"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Button,
  Divider,
  Card,
  CardContent,
  Collapse,
  Skeleton,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Link,
  Tooltip,
  Stack,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Close as CloseIcon,
  Phone as PhoneIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ShoppingCart as CartIcon,
  Star as StarIcon,
  CreditCard as CreditIcon,
  LocalShipping as ShippingIcon,
  Add as AddIcon,
  TrendingUp as TrendUpIcon,
  TrendingDown as TrendDownIcon,
  TrendingFlat as TrendFlatIcon,
  Receipt as ReceiptIcon,
  CheckCircle as VerifiedIcon,
  History as HistoryIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useDeleteVendorInventory, useVendorsByVariants } from "@/hooks/queries/useVendorInventory";
import { useMaterialVariants } from "@/hooks/queries/useMaterials";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { calculatePieceWeight } from "@/lib/weightCalculation";
import AddVendorToMaterialDialog from "./AddVendorToMaterialDialog";
import VendorVariantPrices from "./VendorVariantPrices";
import type { MaterialWithDetails, Vendor, VendorInventory } from "@/types/material.types";

interface VariantPrice {
  variantId: string;
  variantName: string;
  price: number | null;
  priceIncludesGst: boolean;
  pricingMode?: 'per_piece' | 'per_kg' | null;
  unit?: string;
  // TMT-specific fields for price calculations
  weightPerUnit?: number | null; // kg per meter
  lengthPerPiece?: number | null;
  lengthUnit?: string | null;
  rodsPerBundle?: number | null;
  pieceWeight?: number | null; // calculated kg per piece
}

interface VendorWithPricing extends Vendor {
  current_price: number | null;
  price_includes_gst: boolean;
  min_order_qty: number | null;
  last_price_update: string | null;
  order_count: number;
  total_purchased_qty: number;
  total_purchased_value: number;
  last_order_date: string | null;
  price_history: Array<{
    price: number;
    recorded_date: string;
  }>;
  recent_orders: Array<{
    id: string;
    order_date: string;
    quantity: number;
    unit_price: number;
    po_number: string;
    status: string;
    has_invoice: boolean;
    is_verified: boolean;
  }>;
  // Brand info at vendor level (for grouping)
  brandId?: string | null;
  brandName?: string | null;
  // Variant prices when material has variants
  variantPrices?: VariantPrice[];
  lowestVariantPrice?: number | null;
}

interface VendorDrawerProps {
  open: boolean;
  onClose: () => void;
  material: MaterialWithDetails | null;
  onCreatePO?: (vendorId: string, materialId: string) => void;
  onAddVendor?: (materialId: string) => void;
  /** Filter vendors by specific brand_id (for materials with brands) */
  filteredBrandId?: string;
  /** Label to display for the filtered brand (e.g., "Ultratech Premium") */
  filterBrandLabel?: string;
}

type SortOption = "best_price" | "most_orders" | "credit_first" | "nearest";

export default function VendorDrawer({
  open,
  onClose,
  material,
  onCreatePO,
  onAddVendor,
  filteredBrandId,
  filterBrandLabel,
}: VendorDrawerProps) {
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("best_price");
  const [removingVendorId, setRemovingVendorId] = useState<string | null>(null);
  const [addVendorDialogOpen, setAddVendorDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const supabase = createClient();
  const deleteVendorInventory = useDeleteVendorInventory();

  // Check if material has variants
  const hasVariants = (material?.variant_count || 0) > 0;

  // Fetch variants if material has variants
  const { data: variants = [] } = useMaterialVariants(hasVariants ? material?.id : undefined);
  const variantIds = useMemo(() => variants.map(v => v.id), [variants]);

  // Fetch vendor inventory for all variants
  const { data: variantInventory = [], isLoading: isLoadingVariants } = useVendorsByVariants(variantIds);

  // Group variant inventory by vendor
  // Group variant inventory by vendor + brand (same vendor can appear for different brands)
  const variantVendorsMap = useMemo(() => {
    if (!hasVariants || variantInventory.length === 0) return new Map<string, VendorWithPricing>();

    const vendorMap = new Map<string, VendorWithPricing>();

    for (const inv of variantInventory) {
      if (!inv.vendor) continue;

      // Key by vendor + brand (so same vendor appears separately for each brand)
      const brandId = inv.brand_id || "no-brand";
      const mapKey = `${inv.vendor.id}-${brandId}`;
      const existingVendor = vendorMap.get(mapKey);
      const variantInfo = inv.material;

      // Calculate piece weight for TMT materials
      const pieceWeight = variantInfo?.weight_per_unit && variantInfo?.length_per_piece
        ? calculatePieceWeight(
            variantInfo.weight_per_unit,
            variantInfo.length_per_piece,
            variantInfo.length_unit || "ft"
          )
        : null;

      const variantPrice: VariantPrice = {
        variantId: inv.material_id,
        variantName: variantInfo?.name || "Unknown",
        price: inv.current_price,
        priceIncludesGst: inv.price_includes_gst,
        pricingMode: inv.pricing_mode,
        unit: inv.unit || variantInfo?.unit,
        // TMT-specific data
        weightPerUnit: variantInfo?.weight_per_unit,
        lengthPerPiece: variantInfo?.length_per_piece,
        lengthUnit: variantInfo?.length_unit,
        rodsPerBundle: variantInfo?.rods_per_bundle,
        pieceWeight,
      };

      if (existingVendor) {
        existingVendor.variantPrices = existingVendor.variantPrices || [];
        // Avoid duplicates - check if this variant is already in the list
        const alreadyExists = existingVendor.variantPrices.some(
          (vp) => vp.variantId === variantPrice.variantId
        );
        if (!alreadyExists) {
          existingVendor.variantPrices.push(variantPrice);
        }
        // Update lowest variant price
        if (inv.current_price && (!existingVendor.lowestVariantPrice || inv.current_price < existingVendor.lowestVariantPrice)) {
          existingVendor.lowestVariantPrice = inv.current_price;
        }
      } else {
        // Create new vendor entry (with brand info)
        vendorMap.set(mapKey, {
          id: inv.vendor.id,
          name: inv.vendor.name,
          vendor_type: inv.vendor.vendor_type,
          shop_name: inv.vendor.shop_name,
          phone: inv.vendor.phone,
          whatsapp_number: inv.vendor.whatsapp_number,
          city: inv.vendor.city,
          accepts_credit: inv.vendor.accepts_credit,
          provides_transport: inv.vendor.provides_transport,
          current_price: null,
          price_includes_gst: false,
          min_order_qty: inv.min_order_qty,
          last_price_update: null,
          order_count: 0,
          total_purchased_qty: 0,
          total_purchased_value: 0,
          last_order_date: null,
          price_history: [],
          recent_orders: [],
          // Brand info at vendor level
          brandId: inv.brand_id,
          brandName: inv.brand?.brand_name || null,
          variantPrices: [variantPrice],
          lowestVariantPrice: inv.current_price,
        } as unknown as VendorWithPricing);
      }
    }

    return vendorMap;
  }, [hasVariants, variantInventory]);

  // Fetch vendors for this material with pricing and order history
  const { data: vendors = [], isLoading, refetch } = useQuery({
    queryKey: ["material-vendors", material?.id, filteredBrandId],
    queryFn: async () => {
      if (!material?.id) return [];

      // Build query for vendor inventory
      let query = supabase
        .from("vendor_inventory")
        .select(`
          vendor_id,
          current_price,
          price_includes_gst,
          min_order_qty,
          last_price_update,
          brand_id,
          vendors(*)
        `)
        .eq("material_id", material.id)
        .eq("is_available", true);

      // Filter by brand if specified
      if (filteredBrandId) {
        query = query.eq("brand_id", filteredBrandId);
      }

      const { data: inventory, error: invError } = await query;

      if (invError) {
        console.error("Error fetching vendor inventory:", invError);
        return [];
      }

      // Get purchase history for this material from purchase_order_items
      const { data: orders } = await supabase
        .from("purchase_order_items")
        .select(`
          quantity,
          unit_price,
          purchase_orders(
            id,
            po_number,
            vendor_id,
            status,
            order_date,
            deliveries(
              id,
              invoice_url,
              verified
            )
          )
        `)
        .eq("material_id", material.id);

      // Get price history
      const { data: priceHistory } = await supabase
        .from("price_history")
        .select("vendor_id, price, recorded_date")
        .eq("material_id", material.id)
        .order("recorded_date", { ascending: false })
        .limit(100);

      // Build vendor data with stats
      const vendorMap = new Map<string, VendorWithPricing>();

      for (const inv of inventory || []) {
        const vendorData = inv.vendors as Vendor;
        if (!vendorData) continue;

        vendorMap.set(vendorData.id, {
          ...vendorData,
          current_price: inv.current_price,
          price_includes_gst: inv.price_includes_gst || false,
          min_order_qty: inv.min_order_qty,
          last_price_update: inv.last_price_update,
          order_count: 0,
          total_purchased_qty: 0,
          total_purchased_value: 0,
          last_order_date: null,
          price_history: [],
          recent_orders: [],
        });
      }

      // Add order history
      for (const order of orders || []) {
        const po = order.purchase_orders as {
          id: string;
          po_number: string;
          vendor_id: string;
          status: string;
          order_date: string;
          deliveries: Array<{ id: string; invoice_url: string | null; verified: boolean }>;
        };
        if (!po) continue;

        const vendor = vendorMap.get(po.vendor_id);
        if (vendor) {
          vendor.order_count += 1;
          vendor.total_purchased_qty += order.quantity || 0;
          vendor.total_purchased_value += (order.quantity || 0) * (order.unit_price || 0);

          if (!vendor.last_order_date || po.order_date > vendor.last_order_date) {
            vendor.last_order_date = po.order_date;
          }

          // Add to recent orders (limit to 5)
          if (vendor.recent_orders.length < 5) {
            vendor.recent_orders.push({
              id: po.id,
              order_date: po.order_date,
              quantity: order.quantity || 0,
              unit_price: order.unit_price || 0,
              po_number: po.po_number,
              status: po.status,
              has_invoice: (po.deliveries || []).some((d) => !!d.invoice_url),
              is_verified: (po.deliveries || []).some((d) => d.verified),
            });
          }
        }
      }

      // Add price history
      for (const ph of priceHistory || []) {
        const vendor = vendorMap.get(ph.vendor_id);
        if (vendor && vendor.price_history.length < 6) {
          vendor.price_history.push({
            price: ph.price,
            recorded_date: ph.recorded_date,
          });
        }
      }

      return Array.from(vendorMap.values());
    },
    enabled: !!material?.id && open,
  });

  // Get the vendor list based on whether material has variants
  const vendorList = useMemo(() => {
    if (hasVariants) {
      return Array.from(variantVendorsMap.values());
    }
    return vendors;
  }, [hasVariants, variantVendorsMap, vendors]);

  // Sort vendors based on selected option
  const sortedVendors = useMemo(() => {
    const sorted = [...vendorList];

    // Helper to get price for sorting (use lowestVariantPrice for variant materials)
    const getPrice = (v: VendorWithPricing) => v.lowestVariantPrice ?? v.current_price ?? 999999;

    switch (sortBy) {
      case "best_price":
        return sorted.sort((a, b) => getPrice(a) - getPrice(b));
      case "most_orders":
        return sorted.sort((a, b) => b.order_count - a.order_count);
      case "credit_first":
        return sorted.sort((a, b) => {
          if (a.accepts_credit && !b.accepts_credit) return -1;
          if (!a.accepts_credit && b.accepts_credit) return 1;
          return getPrice(a) - getPrice(b);
        });
      case "nearest":
        // Would need geolocation - for now just sort by price
        return sorted.sort((a, b) => getPrice(a) - getPrice(b));
      default:
        return sorted;
    }
  }, [vendorList, sortBy]);

  // Find best price vendor
  const bestPriceVendorId = useMemo(() => {
    if (vendorList.length === 0) return null;
    const getPrice = (v: VendorWithPricing) => v.lowestVariantPrice ?? v.current_price ?? 999999;
    const sorted = [...vendorList].sort((a, b) => getPrice(a) - getPrice(b));
    return sorted[0]?.id;
  }, [vendorList]);

  // Get price trend indicator
  const getPriceTrend = (vendor: VendorWithPricing) => {
    if (vendor.price_history.length < 2) return null;
    const current = vendor.current_price || 0;
    const previous = vendor.price_history[0]?.price || current;

    if (current > previous) return "up";
    if (current < previous) return "down";
    return "flat";
  };

  const handlePhoneClick = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  const handleWhatsAppClick = (phone: string, vendorName: string) => {
    const message = encodeURIComponent(
      `Hi ${vendorName}, I would like to enquire about ${material?.name}.`
    );
    window.open(`https://wa.me/91${phone.replace(/\D/g, "")}?text=${message}`, "_blank");
  };

  // Remove vendor from this material
  const handleRemoveVendorClick = (vendorId: string, vendorName: string) => {
    setDeleteConfirm({ id: vendorId, name: vendorName });
  };

  const handleRemoveVendorConfirm = async () => {
    if (!material?.id || !deleteConfirm) return;

    setRemovingVendorId(deleteConfirm.id);
    setDeleteConfirm(null);
    try {
      const { data: inventory } = await supabase
        .from("vendor_inventory")
        .select("id")
        .eq("vendor_id", deleteConfirm.id)
        .eq("material_id", material.id)
        .single();

      if (inventory) {
        await deleteVendorInventory.mutateAsync({
          id: inventory.id,
          vendorId: deleteConfirm.id,
        });
        refetch();
      }
    } catch (err) {
      console.error("Failed to remove vendor:", err);
    } finally {
      setRemovingVendorId(null);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      PaperProps={{
        sx: { width: { xs: "100%", sm: 480 }, maxWidth: "100%" },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: "grey.50",
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Vendors for: {material?.name}
            {filterBrandLabel && (
              <Typography component="span" variant="body2" color="primary.main" sx={{ ml: 1 }}>
                ({filterBrandLabel})
              </Typography>
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {hasVariants && `${variants.length} variant${variants.length !== 1 ? "s" : ""}, `}
            {vendorList.length} vendor{vendorList.length !== 1 ? "s" : ""} available
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddVendorDialogOpen(true)}
          >
            Add Vendor
          </Button>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Sort Options */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Sort by</InputLabel>
          <Select
            value={sortBy}
            label="Sort by"
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <MenuItem value="best_price">Best Price</MenuItem>
            <MenuItem value="most_orders">Most Orders</MenuItem>
            <MenuItem value="credit_first">Credit Vendors First</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Vendor List */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {(isLoading || (hasVariants && isLoadingVariants)) ? (
          <Stack spacing={2}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))}
          </Stack>
        ) : vendorList.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No vendors found for this material. Add a vendor to get started.
          </Alert>
        ) : (
          <Stack spacing={2}>
            {sortedVendors.map((vendor, index) => {
              const isExpanded = expandedVendor === vendor.id;
              const isBestPrice = vendor.id === bestPriceVendorId;
              const priceTrend = getPriceTrend(vendor);

              return (
                <Card
                  key={vendor.id}
                  variant="outlined"
                  sx={{
                    borderColor: isBestPrice ? "success.main" : undefined,
                    borderWidth: isBestPrice ? 2 : 1,
                  }}
                >
                  <CardContent sx={{ pb: 1, "&:last-child": { pb: 2 } }}>
                    {/* Vendor Header */}
                    <Box
                      sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {index + 1}. {vendor.name}
                          </Typography>
                          {isBestPrice && (
                            <Chip
                              icon={<StarIcon />}
                              label="Best Price"
                              size="small"
                              color="success"
                              variant="filled"
                            />
                          )}
                          {vendor.accepts_credit && (
                            <Chip
                              icon={<CreditIcon />}
                              label="Credit"
                              size="small"
                              color="info"
                              variant="outlined"
                            />
                          )}
                        </Box>
                        {/* Brand Name - prominent display */}
                        {vendor.brandName && (
                          <Typography variant="body2" color="primary.main" fontWeight={500} sx={{ mt: 0.25 }}>
                            Brand: {vendor.brandName}
                          </Typography>
                        )}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                          {vendor.phone && (
                            <Link
                              component="button"
                              variant="caption"
                              onClick={() => handlePhoneClick(vendor.phone!)}
                              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                            >
                              <PhoneIcon fontSize="inherit" />
                              {vendor.phone}
                            </Link>
                          )}
                          {vendor.provides_transport && (
                            <Tooltip title="Provides transport">
                              <ShippingIcon fontSize="small" color="action" />
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                    </Box>

                    {/* Price & Stats Summary */}
                    <Box
                      sx={{
                        bgcolor: "grey.50",
                        p: 1,
                        borderRadius: 1,
                        mb: 1,
                      }}
                    >
                      {/* Show variant prices if material has variants */}
                      {hasVariants && vendor.variantPrices && vendor.variantPrices.length > 0 ? (
                        <VendorVariantPrices variantPrices={vendor.variantPrices} />
                      ) : (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Current Price
                            </Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <Typography variant="h6" fontWeight={600} color="primary">
                                {vendor.current_price
                                  ? formatCurrency(vendor.current_price)
                                  : "N/A"}
                              </Typography>
                              {priceTrend === "up" && (
                                <TrendUpIcon fontSize="small" color="error" />
                              )}
                              {priceTrend === "down" && (
                                <TrendDownIcon fontSize="small" color="success" />
                              )}
                              {priceTrend === "flat" && (
                                <TrendFlatIcon fontSize="small" color="action" />
                              )}
                            </Box>
                            {vendor.price_includes_gst && (
                              <Typography variant="caption" color="text.secondary">
                                (incl. GST)
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ textAlign: "right" }}>
                            <Typography variant="caption" color="text.secondary">
                              Total Purchased
                            </Typography>
                            <Typography variant="body2" fontWeight={500}>
                              {vendor.order_count} orders
                            </Typography>
                            {vendor.total_purchased_value > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                {formatCurrency(vendor.total_purchased_value)}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      )}
                    </Box>

                    {/* Last Order */}
                    {vendor.last_order_date && (
                      <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                        Last order: {formatDate(vendor.last_order_date)}
                      </Typography>
                    )}

                    {/* Expand/Collapse Button - only show if there's content to display */}
                    {(vendor.recent_orders.length > 0 || vendor.price_history.length > 0) && (
                      <Button
                        size="small"
                        onClick={() => setExpandedVendor(isExpanded ? null : vendor.id)}
                        endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={{ mb: 1 }}
                      >
                        {isExpanded ? "Hide Details" : "Show Details"}
                      </Button>
                    )}

                    {/* Expanded Details */}
                    <Collapse in={isExpanded}>
                      <Divider sx={{ my: 1 }} />

                      {/* Recent Orders */}
                      {vendor.recent_orders.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}
                          >
                            <HistoryIcon fontSize="small" />
                            Recent Orders
                          </Typography>
                          <Stack spacing={1}>
                            {vendor.recent_orders.map((order) => (
                              <Box
                                key={order.id}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  p: 1,
                                  bgcolor: "grey.50",
                                  borderRadius: 1,
                                }}
                              >
                                <Box>
                                  <Typography variant="body2">
                                    {formatDate(order.order_date)} - {order.quantity}{" "}
                                    {material?.unit} @ {formatCurrency(order.unit_price)}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {order.po_number}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: "flex", gap: 0.5 }}>
                                  {order.has_invoice && (
                                    <Tooltip title="Bill attached">
                                      <ReceiptIcon fontSize="small" color="action" />
                                    </Tooltip>
                                  )}
                                  {order.is_verified && (
                                    <Tooltip title="Verified">
                                      <VerifiedIcon fontSize="small" color="success" />
                                    </Tooltip>
                                  )}
                                </Box>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Price History (Simple List) */}
                      {vendor.price_history.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Price History
                          </Typography>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                            {vendor.price_history.map((ph, idx) => (
                              <Chip
                                key={idx}
                                label={`${formatCurrency(ph.price)} (${formatDate(
                                  ph.recorded_date
                                )})`}
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Collapse>

                    {/* Action Buttons */}
                    <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                      {vendor.phone && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PhoneIcon />}
                          onClick={() => handlePhoneClick(vendor.phone!)}
                        >
                          Call
                        </Button>
                      )}
                      {vendor.whatsapp_number && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          onClick={() =>
                            handleWhatsAppClick(vendor.whatsapp_number!, vendor.name)
                          }
                        >
                          WhatsApp
                        </Button>
                      )}
                      {onCreatePO && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<CartIcon />}
                          onClick={() => onCreatePO(vendor.id, material?.id || "")}
                        >
                          Place Order
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleRemoveVendorClick(vendor.id, vendor.name)}
                        disabled={removingVendorId === vendor.id}
                      >
                        {removingVendorId === vendor.id ? "Removing..." : "Remove"}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* Remove Vendor Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onClose={(_event, reason) => { if (reason !== "backdropClick") setDeleteConfirm(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Remove Vendor</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove <strong>{deleteConfirm?.name || "this vendor"}</strong> from <strong>{material?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This vendor will no longer appear in the pricing list for this material.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleRemoveVendorConfirm} color="error" variant="contained">
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Vendor Dialog */}
      <AddVendorToMaterialDialog
        open={addVendorDialogOpen}
        onClose={() => setAddVendorDialogOpen(false)}
        material={material}
        existingVendorIds={vendors.map((v) => v.id)}
        onSuccess={() => refetch()}
      />
    </Drawer>
  );
}
