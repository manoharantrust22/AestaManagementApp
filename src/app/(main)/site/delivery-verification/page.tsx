"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  Grid,
  Skeleton,
  Alert,
  Button,
  Divider,
  Stack,
  Badge,
  Avatar,
  AvatarGroup,
} from "@mui/material";
import {
  LocalShipping as DeliveryIcon,
  CheckCircle as VerifiedIcon,
  Warning as DisputedIcon,
  Cancel as RejectedIcon,
  ShoppingCart as POIcon,
  Groups as GroupStockIcon,
  Inventory2 as MaterialIcon,
} from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import MaterialWorkflowBar from "@/components/materials/MaterialWorkflowBar";
import { useSite } from "@/contexts/SiteContext";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import {
  useDeliveriesWithVerification,
  usePOsAwaitingDelivery,
  type POAwaitingDelivery,
} from "@/hooks/queries/useDeliveryVerification";
import RecordAndVerifyDeliveryDialog from "@/components/materials/RecordAndVerifyDeliveryDialog";
import DeliveryAuditDialog from "@/components/materials/DeliveryAuditDialog";
import type { DeliveryVerificationStatus, PurchaseOrderWithDetails } from "@/types/material.types";

// Format currency
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format date
const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Status icons and colors
const statusConfig: Record<
  DeliveryVerificationStatus,
  { icon: React.ReactNode; color: "default" | "success" | "warning" | "error"; label: string }
> = {
  pending: {
    icon: <DisputedIcon fontSize="small" />,
    color: "default",
    label: "Pending",
  },
  verified: {
    icon: <VerifiedIcon fontSize="small" />,
    color: "success",
    label: "Verified",
  },
  disputed: {
    icon: <DisputedIcon fontSize="small" />,
    color: "warning",
    label: "Disputed",
  },
  rejected: {
    icon: <RejectedIcon fontSize="small" />,
    color: "error",
    label: "Rejected",
  },
};

// Type for delivery data from hooks
interface DeliveryData {
  id: string;
  grn_number: string | null;
  po_number: string | null;
  vendor_name: string | null;
  site_id: string;
  delivery_date: string;
  total_value: number | null;
  item_count: number;
  vehicle_number: string | null;
  driver_name: string | null;
  verification_status?: string;
  material_images?: Array<{
    material_image_url: string | null;
    brand_image_url: string | null;
    material_name: string | null;
  }>;
}

/** Get the best available image: brand image > material image > null */
function getBestImage(item: {
  brand_image_url?: string | null;
  material_image_url?: string | null;
}): string | null {
  return item.brand_image_url || item.material_image_url || null;
}

/** Material avatar with fallback icon */
function MaterialAvatar({
  src,
  name,
  size = 36,
}: {
  src: string | null;
  name?: string | null;
  size?: number;
}) {
  return (
    <Avatar
      src={src || undefined}
      alt={name || "Material"}
      variant="rounded"
      sx={{
        width: size,
        height: size,
        bgcolor: src ? "transparent" : "grey.200",
      }}
    >
      {!src && <MaterialIcon sx={{ fontSize: size * 0.6, color: "grey.500" }} />}
    </Avatar>
  );
}

export default function DeliveryVerificationPage() {
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<POAwaitingDelivery | null>(null);
  const [activeTab, setActiveTab] = useState<"awaiting" | "disputed" | "all">("awaiting");
  const [highlightedGrn, setHighlightedGrn] = useState<string | null>(null);
  const [auditDeliveryId, setAuditDeliveryId] = useState<string | null>(null);
  const hasProcessedGrn = useRef(false);

  const { selectedSite } = useSite();
  const searchParams = useSearchParams();
  const grnParam = searchParams.get("grn");

  const { data: groupMembership } = useSiteGroupMembership(selectedSite?.id);
  const siteGroupId = groupMembership?.groupId ?? null;

  // Fetch POs awaiting delivery (own + sibling group POs)
  const { data: posAwaitingDelivery = [], isLoading: posLoading } =
    usePOsAwaitingDelivery(selectedSite?.id, { siteGroupId });

  // Fetch all deliveries with verification status (own + sibling group)
  const { data: allDeliveries = [], isLoading: allLoading } =
    useDeliveriesWithVerification(selectedSite?.id, { siteGroupId });

  const handleRecordDelivery = useCallback((po: POAwaitingDelivery) => {
    setSelectedPO(po);
    setDeliveryDialogOpen(true);
  }, []);

  const handleCloseDeliveryDialog = useCallback(() => {
    setDeliveryDialogOpen(false);
    setSelectedPO(null);
  }, []);

  // Deep-link: switch to "Recent Deliveries" tab and highlight the GRN row when ?grn=GRN-xxx is present
  useEffect(() => {
    if (!grnParam || hasProcessedGrn.current) return;
    if (allLoading || allDeliveries.length === 0) return;
    const match = allDeliveries.find(
      (d: DeliveryData) =>
        d.grn_number?.toLowerCase() === grnParam.toLowerCase()
    );
    if (match) {
      hasProcessedGrn.current = true;
      setActiveTab("all");
      setHighlightedGrn(match.grn_number);
    }
  }, [grnParam, allLoading, allDeliveries]);

  // Filter deliveries by status
  const recentDeliveries = useMemo(() => {
    return allDeliveries.slice(0, 20);
  }, [allDeliveries]);

  const disputedDeliveries = useMemo(() => {
    return allDeliveries.filter(
      (d: DeliveryData) => d.verification_status === "disputed"
    );
  }, [allDeliveries]);

  return (
    <Box>
      <PageHeader
        title="Delivery Management"
        subtitle="Record deliveries and add materials to stock"
      />

      <MaterialWorkflowBar currentStep="deliveries" />

      {/* Disputed Alert */}
      {disputedDeliveries.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <strong>{disputedDeliveries.length} deliveries</strong> have issues
          flagged and need review.
        </Alert>
      )}

      {/* Tab Buttons */}
      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        <Button
          variant={activeTab === "awaiting" ? "contained" : "outlined"}
          onClick={() => setActiveTab("awaiting")}
          startIcon={
            <Badge badgeContent={posAwaitingDelivery.length} color="primary">
              <POIcon />
            </Badge>
          }
        >
          Awaiting Delivery
        </Button>
        {disputedDeliveries.length > 0 && (
          <Button
            variant={activeTab === "disputed" ? "contained" : "outlined"}
            onClick={() => setActiveTab("disputed")}
            startIcon={
              <Badge badgeContent={disputedDeliveries.length} color="error">
                <DisputedIcon />
              </Badge>
            }
          >
            Disputed
          </Button>
        )}
        <Button
          variant={activeTab === "all" ? "contained" : "outlined"}
          onClick={() => setActiveTab("all")}
          startIcon={<DeliveryIcon />}
        >
          Recent Deliveries
        </Button>
      </Box>

      {/* Content */}
      {activeTab === "awaiting" ? (
        // POs Awaiting Delivery
        posLoading ? (
          <Grid container spacing={2}>
            {[1, 2, 3].map((i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton height={280} variant="rounded" />
              </Grid>
            ))}
          </Grid>
        ) : posAwaitingDelivery.length === 0 ? (
          <Card>
            <CardContent>
              <Box sx={{ textAlign: "center", py: 4 }}>
                <POIcon sx={{ fontSize: 64, mb: 2, color: "text.secondary" }} />
                <Typography variant="h6" gutterBottom>
                  No Orders Awaiting Delivery
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  All purchase orders have been delivered or are not yet
                  ordered.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {posAwaitingDelivery.map((po) => (
              <Grid key={po.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  variant="outlined"
                  sx={{
                    cursor: "pointer",
                    "&:hover": { borderColor: "primary.main", boxShadow: 1 },
                    transition: "all 0.2s",
                  }}
                  onClick={() => handleRecordDelivery(po)}
                >
                  <CardContent>
                    <Stack spacing={1.5}>
                      {/* Header */}
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <Box>
                          <Typography variant="subtitle1" fontWeight="medium">
                            {po.po_number}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Ordered: {formatDate(po.order_date)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          {po.is_group_stock && (
                            <Chip
                              icon={<GroupStockIcon fontSize="small" />}
                              label="Group"
                              size="small"
                              color="secondary"
                            />
                          )}
                          <Chip
                            label={po.status === "partial_delivered" ? "Partial" : "Ordered"}
                            size="small"
                            color={po.status === "partial_delivered" ? "warning" : "info"}
                          />
                        </Stack>
                      </Box>

                      {/* Material Avatars */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <AvatarGroup
                          max={4}
                          sx={{
                            "& .MuiAvatar-root": {
                              width: 36,
                              height: 36,
                              fontSize: "0.75rem",
                              borderColor: "background.paper",
                            },
                          }}
                        >
                          {po.items.map((item) => (
                            <MaterialAvatar
                              key={item.id}
                              src={getBestImage(item)}
                              name={item.material_name}
                            />
                          ))}
                        </AvatarGroup>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight="medium" noWrap>
                            {po.vendor_name || "-"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {po.items.map((i) => i.material_name).join(", ")}
                          </Typography>
                        </Box>
                      </Box>

                      <Divider />

                      {/* Items Summary */}
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Items
                          </Typography>
                          <Typography variant="body2">
                            {po.item_count} item{po.item_count !== 1 ? "s" : ""}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography variant="caption" color="text.secondary">
                            Total Value
                          </Typography>
                          <Typography variant="body2" fontWeight="medium" color="primary">
                            {formatCurrency(po.total_amount)}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Expected Delivery */}
                      {po.expected_delivery_date && (
                        <Chip
                          label={`Expected: ${formatDate(po.expected_delivery_date)}`}
                          size="small"
                          variant="outlined"
                        />
                      )}

                      {/* Action Button */}
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<DeliveryIcon />}
                        fullWidth
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecordDelivery(po);
                        }}
                      >
                        Record & Verify
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )
      ) : activeTab === "disputed" ? (
        // Disputed Deliveries
        allLoading ? (
          <Grid container spacing={2}>
            {[1, 2, 3].map((i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton height={200} variant="rounded" />
              </Grid>
            ))}
          </Grid>
        ) : disputedDeliveries.length === 0 ? (
          <Card>
            <CardContent>
              <Box sx={{ textAlign: "center", py: 4 }}>
                <VerifiedIcon
                  sx={{ fontSize: 64, mb: 2, color: "success.main" }}
                />
                <Typography variant="h6" gutterBottom>
                  No Disputed Deliveries
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  All deliveries have been verified without issues.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {(disputedDeliveries as DeliveryData[]).map((delivery) => {
              const config = statusConfig.disputed;
              return (
                <Grid key={delivery.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card
                    variant="outlined"
                    onClick={() => setAuditDeliveryId(delivery.id)}
                    sx={{
                      borderColor: "warning.main",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      "&:hover": { boxShadow: 2 },
                    }}
                  >
                    <CardContent>
                      <Stack spacing={1}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography variant="subtitle2">
                            {delivery.grn_number || "GRN"}
                          </Typography>
                          <Chip
                            icon={config.icon as React.ReactElement}
                            label={config.label}
                            size="small"
                            color={config.color}
                          />
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          {delivery.material_images && delivery.material_images.length > 0 ? (
                            <AvatarGroup
                              max={3}
                              sx={{
                                "& .MuiAvatar-root": {
                                  width: 32,
                                  height: 32,
                                  fontSize: "0.7rem",
                                  borderColor: "background.paper",
                                },
                              }}
                            >
                              {delivery.material_images.map((img, idx) => (
                                <MaterialAvatar
                                  key={idx}
                                  src={img.brand_image_url || img.material_image_url}
                                  name={img.material_name}
                                  size={32}
                                />
                              ))}
                            </AvatarGroup>
                          ) : (
                            <MaterialAvatar src={null} size={32} />
                          )}
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2">
                              {delivery.vendor_name || "-"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(delivery.delivery_date)}
                            </Typography>
                          </Box>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )
      ) : (
        // Recent Deliveries
        allLoading ? (
          <Grid container spacing={2}>
            {[1, 2, 3].map((i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton height={200} variant="rounded" />
              </Grid>
            ))}
          </Grid>
        ) : recentDeliveries.length === 0 ? (
          <Alert severity="info">No deliveries found for this site.</Alert>
        ) : (
          <Grid container spacing={2}>
            {(recentDeliveries as DeliveryData[]).map((delivery) => {
              const status = (delivery.verification_status ||
                "verified") as DeliveryVerificationStatus;
              const config = statusConfig[status];

              const isHighlighted = highlightedGrn != null &&
                delivery.grn_number?.toLowerCase() === highlightedGrn.toLowerCase();

              return (
                <Grid key={delivery.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card
                    variant="outlined"
                    onClick={() => setAuditDeliveryId(delivery.id)}
                    sx={{
                      cursor: "pointer",
                      transition: "all 0.2s",
                      "&:hover": { borderColor: "primary.main", boxShadow: 1 },
                      ...(isHighlighted
                        ? { borderColor: "primary.main", boxShadow: 3 }
                        : {}),
                    }}
                  >
                    <CardContent>
                      <Stack spacing={1}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap>
                              {delivery.grn_number || "GRN"}
                            </Typography>
                            {delivery.po_number && (
                              <Typography variant="caption" color="text.secondary">
                                {delivery.po_number}
                              </Typography>
                            )}
                          </Box>
                          <Chip
                            icon={config.icon as React.ReactElement}
                            label={config.label}
                            size="small"
                            color={config.color}
                          />
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          {delivery.material_images && delivery.material_images.length > 0 ? (
                            <AvatarGroup
                              max={3}
                              sx={{
                                "& .MuiAvatar-root": {
                                  width: 32,
                                  height: 32,
                                  fontSize: "0.7rem",
                                  borderColor: "background.paper",
                                },
                              }}
                            >
                              {delivery.material_images.map((img, idx) => (
                                <MaterialAvatar
                                  key={idx}
                                  src={img.brand_image_url || img.material_image_url}
                                  name={img.material_name}
                                  size={32}
                                />
                              ))}
                            </AvatarGroup>
                          ) : (
                            <MaterialAvatar src={null} size={32} />
                          )}
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" noWrap>
                              {delivery.vendor_name || "-"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(delivery.delivery_date)}
                            </Typography>
                          </Box>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )
      )}

      {/* Record & Verify Delivery Dialog - combines recording and verification */}
      {selectedPO && (
        <RecordAndVerifyDeliveryDialog
          open={deliveryDialogOpen}
          onClose={handleCloseDeliveryDialog}
          purchaseOrder={transformPOForDialog(selectedPO)}
          siteId={selectedSite?.id || ""}
        />
      )}

      {/* Delivery Audit Dialog - full trail (PO#, MR#, recorded time, photos, items) */}
      <DeliveryAuditDialog
        open={auditDeliveryId != null}
        onClose={() => setAuditDeliveryId(null)}
        deliveryId={auditDeliveryId}
      />
    </Box>
  );
}

// Helper function to transform POAwaitingDelivery to PurchaseOrderWithDetails format
function transformPOForDialog(po: POAwaitingDelivery): PurchaseOrderWithDetails {
  // Create a partial object with the fields DeliveryDialog actually uses
  // and cast to PurchaseOrderWithDetails
  return {
    id: po.id,
    po_number: po.po_number,
    site_id: po.site_id,
    vendor_id: po.vendor_id || "",
    status: po.status,
    order_date: po.order_date,
    expected_delivery_date: po.expected_delivery_date,
    total_amount: po.total_amount,
    internal_notes: po.is_group_stock
      ? JSON.stringify({ is_group_stock: true, site_group_id: po.site_group_id })
      : null,
    vendor: po.vendor_name
      ? { id: po.vendor_id || "", name: po.vendor_name }
      : undefined,
    items: po.items.map((item) => ({
      id: item.id,
      po_id: po.id,
      material_id: item.material_id,
      brand_id: item.brand_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      received_qty: item.received_qty,
      pending_qty: item.quantity - item.received_qty,
      // Calculate total based on pricing mode
      total_amount: item.pricing_mode === "per_kg"
        ? (item.actual_weight ?? item.calculated_weight ?? item.quantity) * item.unit_price
        : item.quantity * item.unit_price,
      pricing_mode: item.pricing_mode || "per_piece",
      calculated_weight: item.calculated_weight,
      actual_weight: item.actual_weight,
      tax_rate: item.tax_rate,
      material: {
        id: item.material_id,
        name: item.material_name || "",
        code: "",
        unit: item.unit || "nos",
      },
      brand: item.brand_id
        ? { id: item.brand_id, brand_name: item.brand_name || "" }
        : null,
    })),
  } as unknown as PurchaseOrderWithDetails;
}
