"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Typography,
  Tabs,
  Tab,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Paper,
  Stack,
  Divider,
  Grid,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Category as CategoryIcon,
  ShowChart as ChartIcon,
} from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useMaterialWithVariants,
  useDeleteMaterial,
  useMaterialCategories,
} from "@/hooks/queries/useMaterials";
import { useVendorCountForMaterial } from "@/hooks/queries/useVendorInventory";
const MaterialDialog = dynamic(
  () => import("@/components/materials/MaterialDialog"),
  { ssr: false }
);
import MaterialVendorsTab from "@/components/materials/MaterialVendorsTab";
import MaterialVariantsTab from "@/components/materials/MaterialVariantsTab";
import BrandsPricingTab from "@/components/materials/BrandsPricingTab";
import MaterialPriceIntelligenceTab from "@/components/materials/MaterialPriceIntelligenceTab";

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
      id={`material-tabpanel-${index}`}
      aria-labelledby={`material-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
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

export default function MaterialDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const materialId = params?.id as string;

  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const [tabValue, setTabValue] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: material, isLoading, error } = useMaterialWithVariants(materialId);
  const { data: categories = [] } = useMaterialCategories();
  const { data: vendorCount = 0 } = useVendorCountForMaterial(materialId);
  const deleteMaterial = useDeleteMaterial();

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDelete = async () => {
    if (!material) return;
    if (!confirm(`Are you sure you want to delete ${material.name}?`)) return;

    try {
      await deleteMaterial.mutateAsync(material.id);
      router.push("/company/materials");
    } catch (err) {
      console.error("Failed to delete material:", err);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !material) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          {error ? (error as Error).message : "Material not found"}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push("/company/materials")}
          sx={{ mt: 2 }}
        >
          Back to Materials
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
              onClick={() => router.push("/company/materials")}
              size="small"
            >
              Back
            </Button>
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
                <IconButton color="error" onClick={handleDelete} size="small">
                  <DeleteIcon />
                </IconButton>
              </>
            )}
          </Stack>
        }
      />

      {/* Material Header */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack spacing={1}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h5" fontWeight={600}>
                  {material.name}
                </Typography>
                {material.category && (
                  <Chip
                    icon={<CategoryIcon />}
                    label={material.category.name}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
              </Box>

              {material.local_name && (
                <Typography variant="body2" color="text.secondary">
                  Local Name: {material.local_name}
                </Typography>
              )}

              {material.code && (
                <Typography variant="caption" color="text.secondary">
                  Code: {material.code}
                </Typography>
              )}

              {/* Brands */}
              {material.brands && material.brands.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Available Brands:
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                    {material.brands.filter(b => b.is_active).map((brand) => (
                      <Chip
                        key={brand.id}
                        label={brand.brand_name}
                        size="small"
                        variant={brand.is_preferred ? "filled" : "outlined"}
                        color={brand.is_preferred ? "primary" : "default"}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={1}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body2" color="text.secondary">
                  Unit
                </Typography>
                <Typography variant="body2" fontWeight={500}>
                  {material.unit}
                </Typography>
              </Box>

              {material.hsn_code && (
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    HSN Code
                  </Typography>
                  <Typography variant="body2">{material.hsn_code}</Typography>
                </Box>
              )}

              {material.gst_rate !== null && material.gst_rate !== undefined && (
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    GST Rate
                  </Typography>
                  <Typography variant="body2">{material.gst_rate}%</Typography>
                </Box>
              )}

              {material.reorder_level !== null && (
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Reorder Level
                  </Typography>
                  <Typography variant="body2">
                    {material.reorder_level} {material.unit}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Overview" />
          {/* Brands & Pricing tab - show for materials with brands */}
          {(material.brands?.length || 0) > 0 && (
            <Tab
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Brands & Pricing
                  <Chip
                    label={material.brands?.filter(b => b.is_active).length || 0}
                    size="small"
                    color="primary"
                  />
                </Box>
              }
            />
          )}
          {/* Price Intelligence tab */}
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ChartIcon fontSize="small" />
                Price Intelligence
              </Box>
            }
          />
          {/* Variants tab - only show for parent materials (not variants) */}
          {!material.parent_id && (
            <Tab
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Variants
                  {(material.variant_count || 0) > 0 && (
                    <Chip
                      label={material.variant_count}
                      size="small"
                      color="info"
                    />
                  )}
                </Box>
              }
            />
          )}
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                All Vendors
                {vendorCount > 0 && (
                  <Chip label={vendorCount} size="small" color="default" />
                )}
              </Box>
            }
          />
        </Tabs>
      </Box>

      {/* Tab Panels - indices depend on which tabs are visible */}
      {(() => {
        const hasBrands = (material.brands?.length || 0) > 0;
        const hasVariants = !material.parent_id;

        // Calculate tab indices dynamically
        let currentIndex = 0;
        const overviewIndex = currentIndex++;
        const brandsPricingIndex = hasBrands ? currentIndex++ : -1;
        const priceIntelligenceIndex = currentIndex++; // Always visible
        const variantsIndex = hasVariants ? currentIndex++ : -1;
        const vendorsIndex = currentIndex;

        return (
          <>
            {/* Overview Tab */}
            <TabPanel value={tabValue} index={overviewIndex}>
              <Grid container spacing={2}>
                {/* Description */}
                {material.description && (
                  <Grid size={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Description
                      </Typography>
                      <Divider sx={{ mb: 1 }} />
                      <Typography variant="body2">{material.description}</Typography>
                    </Paper>
                  </Grid>
                )}

                {/* Specifications */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Material Details
                    </Typography>
                    <Divider sx={{ mb: 1 }} />
                    <Stack spacing={1}>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" color="text.secondary">
                          Category
                        </Typography>
                        <Typography variant="body2">
                          {material.category?.name || "Uncategorized"}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" color="text.secondary">
                          Unit of Measure
                        </Typography>
                        <Typography variant="body2">{material.unit}</Typography>
                      </Box>
                      {material.hsn_code && (
                        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                          <Typography variant="body2" color="text.secondary">
                            HSN Code
                          </Typography>
                          <Typography variant="body2">{material.hsn_code}</Typography>
                        </Box>
                      )}
                      {material.gst_rate !== null && material.gst_rate !== undefined && (
                        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                          <Typography variant="body2" color="text.secondary">
                            GST Rate
                          </Typography>
                          <Typography variant="body2">{material.gst_rate}%</Typography>
                        </Box>
                      )}
                    </Stack>
                  </Paper>
                </Grid>

                {/* Inventory Settings */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Inventory Settings
                    </Typography>
                    <Divider sx={{ mb: 1 }} />
                    <Stack spacing={1}>
                      {material.reorder_level !== null && (
                        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                          <Typography variant="body2" color="text.secondary">
                            Reorder Level
                          </Typography>
                          <Typography variant="body2">
                            {material.reorder_level} {material.unit}
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" color="text.secondary">
                          Vendors Available
                        </Typography>
                        <Chip label={vendorCount} size="small" color={vendorCount > 0 ? "success" : "warning"} />
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>

                {/* Brands Summary */}
                {material.brands && material.brands.length > 0 && (
                  <Grid size={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Available Brands
                      </Typography>
                      <Divider sx={{ mb: 1 }} />
                      <Stack spacing={1}>
                        {material.brands.filter(b => b.is_active).map((brand) => (
                          <Box
                            key={brand.id}
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              py: 0.5,
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Typography variant="body2">
                                {brand.brand_name}
                                {brand.variant_name && ` - ${brand.variant_name}`}
                              </Typography>
                              {brand.is_preferred && (
                                <Chip label="Preferred" size="small" color="primary" />
                              )}
                            </Box>
                            {brand.quality_rating && (
                              <Typography variant="caption" color="text.secondary">
                                Quality: {brand.quality_rating}/5
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </TabPanel>

            {/* Brands & Pricing Tab */}
            {hasBrands && (
              <TabPanel value={tabValue} index={brandsPricingIndex}>
                <BrandsPricingTab material={material} />
              </TabPanel>
            )}

            {/* Price Intelligence Tab */}
            <TabPanel value={tabValue} index={priceIntelligenceIndex}>
              <MaterialPriceIntelligenceTab material={material} />
            </TabPanel>

            {/* Variants Tab - only for parent materials */}
            {hasVariants && (
              <TabPanel value={tabValue} index={variantsIndex}>
                <MaterialVariantsTab material={material} canEdit={canEdit} />
              </TabPanel>
            )}

            {/* All Vendors Tab */}
            <TabPanel value={tabValue} index={vendorsIndex}>
              <MaterialVendorsTab material={material} />
            </TabPanel>
          </>
        );
      })()}

      {/* Edit Dialog */}
      <MaterialDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        material={material}
        categories={categories}
      />
    </Box>
  );
}
