"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Typography,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Paper,
  Stack,
  Rating,
  Divider,
  Grid,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  Email as EmailIcon,
  LocationOn as LocationIcon,
  Store as StoreIcon,
  LocalShipping as ShippingIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Storefront as StorefrontIcon,
  OpenInNew as OpenInNewIcon,
  TravelExplore as TravelExploreIcon,
} from "@mui/icons-material";
import { googleBusinessHref, googleMapsSearchHref } from "@/lib/utils/contact";
import PageHeader from "@/components/layout/PageHeader";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import { useVendor, useDeleteVendor } from "@/hooks/queries/useVendors";
import { useMaterialCategories } from "@/hooks/queries/useMaterials";
import { useMaterialCountForVendor } from "@/hooks/queries/useVendorInventory";
import VendorDialog from "@/components/materials/VendorDialog";
import VendorMaterialsTab from "@/components/materials/VendorMaterialsTab";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { RentalStoreInventoryTab } from "@/components/rentals";
import { VENDOR_TYPE_LABELS } from "@/types/material.types";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`vendor-tabpanel-${index}`}
      aria-labelledby={`vendor-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

export default function VendorDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const vendorId = params?.id as string;

  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const [tabValue, setTabValue] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: vendor, isLoading, error } = useVendor(vendorId);
  const { data: categories = [] } = useMaterialCategories();
  const { data: materialCount = 0 } = useMaterialCountForVendor(vendorId);
  const deleteVendor = useDeleteVendor();

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDeleteConfirm = async () => {
    if (!vendor) return;

    try {
      await deleteVendor.mutateAsync(vendor.id);
      router.push("/company/vendors");
    } catch (err) {
      console.error("Failed to delete vendor:", err);
    }
  };

  // Service badges — not applicable to individuals (a person, not a business)
  const serviceBadges = useMemo(() => {
    if (!vendor || vendor.vendor_type === "individual") return [];
    const badges = [];
    if (vendor.provides_transport) badges.push({ label: "Transport", icon: <ShippingIcon fontSize="small" /> });
    if (vendor.provides_loading) badges.push({ label: "Loading", icon: <CheckIcon fontSize="small" /> });
    if (vendor.provides_unloading) badges.push({ label: "Unloading", icon: <CheckIcon fontSize="small" /> });
    return badges;
  }, [vendor]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !vendor) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          {error ? (error as Error).message : "Vendor not found"}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push("/company/vendors")}
          sx={{ mt: 2 }}
        >
          Back to Vendors
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title=""
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => router.push("/company/vendors")}
              size="small"
            >
              Back
            </Button>
            {(vendor.has_physical_store || vendor.vendor_type === "shop") && (
              <Button
                variant="contained"
                startIcon={<StorefrontIcon />}
                onClick={() => router.push(`/company/vendors/${vendorId}/store`)}
                size="small"
                color="primary"
              >
                View Store {materialCount > 0 && `(${materialCount})`}
              </Button>
            )}
            {canEdit && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => setEditDialogOpen(true)}
                  size="small"
                >
                  Edit
                </Button>
                <IconButton
                  color="error"
                  onClick={() => setDeleteDialogOpen(true)}
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              </>
            )}
          </Stack>
        }
      />

      {/* Vendor Header */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          {/* Shop Photo */}
          {vendor.shop_photo_url && (
            <Grid size={{ xs: 12, md: 3 }}>
              <Box
                component="img"
                src={vendor.shop_photo_url}
                alt={`${vendor.shop_name || vendor.name} shop photo`}
                sx={{
                  width: "100%",
                  maxWidth: 200,
                  height: "auto",
                  maxHeight: 150,
                  objectFit: "cover",
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              />
            </Grid>
          )}
          <Grid size={{ xs: 12, md: vendor.shop_photo_url ? 5 : 8 }}>
            <Stack spacing={1}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h5" fontWeight={600}>
                  {vendor.shop_name || vendor.name}
                </Typography>
                {vendor.vendor_type && (
                  <Chip
                    label={VENDOR_TYPE_LABELS[vendor.vendor_type] || vendor.vendor_type}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
              </Box>

              {vendor.shop_name && vendor.name !== vendor.shop_name && (
                <Typography variant="body2" color="text.secondary">
                  {vendor.name}
                </Typography>
              )}

              {vendor.code && (
                <Typography variant="caption" color="text.secondary">
                  Code: {vendor.code}
                </Typography>
              )}

              {vendor.rating && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Rating value={vendor.rating} precision={0.5} size="small" readOnly />
                  <Typography variant="body2" color="text.secondary">
                    ({vendor.rating})
                  </Typography>
                </Box>
              )}

              {/* Categories */}
              {vendor.categories && vendor.categories.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                  {vendor.categories.map((cat) => (
                    <Chip
                      key={cat?.id}
                      label={cat?.name}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}

              {/* Services */}
              {serviceBadges.length > 0 && (
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  {serviceBadges.map((badge) => (
                    <Chip
                      key={badge.label}
                      icon={badge.icon}
                      label={badge.label}
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={1}>
              {/* Contact Info */}
              {vendor.contact_person && (
                <Typography variant="body2">
                  <strong>Contact:</strong> {vendor.contact_person}
                </Typography>
              )}

              {vendor.phone && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography
                    variant="body2"
                    component="a"
                    href={`tel:${vendor.phone}`}
                    sx={{ textDecoration: "none", color: "inherit" }}
                  >
                    {vendor.phone}
                  </Typography>
                  {vendor.whatsapp_number && (
                    <Tooltip title={`WhatsApp: ${vendor.whatsapp_number}`}>
                      <IconButton
                        size="small"
                        href={`https://wa.me/${vendor.whatsapp_number.replace(/\D/g, "")}`}
                        target="_blank"
                      >
                        <WhatsAppIcon fontSize="small" color="success" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )}

              {vendor.email && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <EmailIcon fontSize="small" color="action" />
                  <Typography
                    variant="body2"
                    component="a"
                    href={`mailto:${vendor.email}`}
                    sx={{ textDecoration: "none", color: "inherit" }}
                  >
                    {vendor.email}
                  </Typography>
                </Box>
              )}

              {/* Google Business / Maps listing — open the saved link, or fall back to a search. */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TravelExploreIcon fontSize="small" color="action" />
                {googleBusinessHref(vendor.google_business_url) ? (
                  <Typography
                    variant="body2"
                    component="a"
                    href={googleBusinessHref(vendor.google_business_url)!}
                    target="_blank"
                    rel="noopener"
                    sx={{
                      textDecoration: "none",
                      color: "primary.main",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    View on Google
                    <OpenInNewIcon sx={{ fontSize: 13 }} />
                  </Typography>
                ) : (
                  <Typography
                    variant="body2"
                    component="a"
                    href={googleMapsSearchHref([
                      vendor.name,
                      vendor.shop_name,
                      vendor.city,
                      vendor.state,
                    ])}
                    target="_blank"
                    rel="noopener"
                    sx={{
                      textDecoration: "none",
                      color: "text.secondary",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    Find on Google
                  </Typography>
                )}
              </Box>

              {(vendor.city || vendor.address) && (
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                  <LocationIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                  <Typography variant="body2">
                    {vendor.address && <>{vendor.address}<br /></>}
                    {vendor.city}
                    {vendor.state && `, ${vendor.state}`}
                    {vendor.pincode && ` - ${vendor.pincode}`}
                  </Typography>
                </Box>
              )}

              {vendor.gst_number && vendor.vendor_type !== "individual" && (
                <Typography variant="body2">
                  <strong>GST:</strong> {vendor.gst_number}
                </Typography>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Overview" />
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                Materials Supplied
                {materialCount > 0 && (
                  <Chip label={materialCount} size="small" color="primary" />
                )}
              </Box>
            }
          />
          {vendor.vendor_type === "rental_store" && (
            <Tab label="Rental Inventory" />
          )}
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={2}>
          {/* Payment Info — terms/credit don't apply to an individual person */}
          {vendor.vendor_type !== "individual" && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Payment Information
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <Stack spacing={1}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Payment Terms
                  </Typography>
                  <Typography variant="body2">
                    {vendor.payment_terms_days || 0} days
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Credit Limit
                  </Typography>
                  <Typography variant="body2">
                    {vendor.credit_limit
                      ? `₹${vendor.credit_limit.toLocaleString("en-IN")}`
                      : "N/A"}
                  </Typography>
                </Box>
                {vendor.min_order_amount && (
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body2" color="text.secondary">
                      Min Order Amount
                    </Typography>
                    <Typography variant="body2">
                      ₹{vendor.min_order_amount.toLocaleString("en-IN")}
                    </Typography>
                  </Box>
                )}

                {/* Payment Methods */}
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Accepts:
                  </Typography>
                  <Stack direction="row" spacing={0.5}>
                    {vendor.accepts_cash && (
                      <Chip label="Cash" size="small" variant="outlined" />
                    )}
                    {vendor.accepts_upi && (
                      <Chip label="UPI" size="small" variant="outlined" />
                    )}
                    {vendor.accepts_credit && (
                      <Chip
                        label={`Credit (${vendor.credit_days || 0} days)`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          </Grid>
          )}

          {/* Bank Details */}
          {vendor.bank_name && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Bank Details
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <Stack spacing={1}>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body2" color="text.secondary">
                      Bank Name
                    </Typography>
                    <Typography variant="body2">{vendor.bank_name}</Typography>
                  </Box>
                  {vendor.bank_account_number && (
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2" color="text.secondary">
                        Account Number
                      </Typography>
                      <Typography variant="body2">
                        {vendor.bank_account_number}
                      </Typography>
                    </Box>
                  )}
                  {vendor.bank_ifsc && (
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2" color="text.secondary">
                        IFSC Code
                      </Typography>
                      <Typography variant="body2">{vendor.bank_ifsc}</Typography>
                    </Box>
                  )}
                </Stack>
              </Paper>
            </Grid>
          )}

          {/* Store/Warehouse Info */}
          {vendor.has_physical_store && vendor.store_address && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  <StoreIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle" }} />
                  Store/Warehouse Location
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="body2">
                  {vendor.store_address}
                  {vendor.store_city && (
                    <>
                      <br />
                      {vendor.store_city}
                      {vendor.store_pincode && ` - ${vendor.store_pincode}`}
                    </>
                  )}
                </Typography>
                {vendor.delivery_radius_km && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                    Delivery radius: {vendor.delivery_radius_km} km
                  </Typography>
                )}
              </Paper>
            </Grid>
          )}

          {/* Notes */}
          {vendor.notes && (
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Notes
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="body2">{vendor.notes}</Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <VendorMaterialsTab vendor={vendor} />
      </TabPanel>

      {vendor.vendor_type === "rental_store" && (
        <TabPanel value={tabValue} index={2}>
          <RentalStoreInventoryTab
            vendorId={vendor.id}
            vendorName={vendor.shop_name || vendor.name}
          />
        </TabPanel>
      )}

      {/* Edit Dialog */}
      <VendorDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        vendor={vendor}
        categories={categories}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Vendor"
        message={`Are you sure you want to delete "${vendor?.name}"? This vendor will be removed from the active list.`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteVendor.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </Box>
  );
}
