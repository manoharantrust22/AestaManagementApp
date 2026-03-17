"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Divider,
  Chip,
  IconButton,
  ImageList,
  ImageListItem,
  Skeleton,
} from "@mui/material";
import {
  Close as CloseIcon,
  CheckCircle as VerifiedIcon,
  LocalShipping as TruckIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  Receipt as ReceiptIcon,
  ZoomIn as ZoomIcon,
} from "@mui/icons-material";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/formatters";
import type { DeliveryWithDetails } from "@/types/material.types";
import { useIsMobile } from "@/hooks/useIsMobile";

interface DeliveryDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  delivery: DeliveryWithDetails | null;
}

export default function DeliveryDetailsDialog({
  open,
  onClose,
  delivery,
}: DeliveryDetailsDialogProps) {
  const isMobile = useIsMobile();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  if (!delivery) return null;

  // Parse delivery photos from JSONB
  const deliveryPhotos: string[] = (() => {
    if (!delivery.delivery_photos) return [];
    if (Array.isArray(delivery.delivery_photos)) return delivery.delivery_photos;
    if (typeof delivery.delivery_photos === 'string') {
      try {
        return JSON.parse(delivery.delivery_photos);
      } catch {
        return [];
      }
    }
    return [];
  })();

  const hasPhotos = deliveryPhotos.length > 0;
  const hasAdditionalDetails = delivery.challan_number || delivery.vehicle_number || delivery.driver_name;

  return (
    <>
      <Dialog
        open={open}
        onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
          <Box>
            <Typography variant="h6" component="span">
              Delivery Details
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {delivery.grn_number}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          {/* Basic Info */}
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Delivery Date
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <CalendarIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="body2" fontWeight={500}>
                    {formatDate(delivery.delivery_date)}
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">
                  Status
                </Typography>
                <Box>
                  <Chip
                    icon={<VerifiedIcon />}
                    label={delivery.delivery_status === "delivered" ? "Delivered" : delivery.delivery_status}
                    size="small"
                    color={delivery.delivery_status === "delivered" ? "success" : "default"}
                  />
                </Box>
              </Grid>

              {delivery.vendor?.name && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    Vendor
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {delivery.vendor.name}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Box>

          {/* Recorded By Info */}
          {(delivery.recorded_by || delivery.recorded_at) && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Recording Information
                </Typography>
                <Grid container spacing={2}>
                  {delivery.recorded_at && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Recorded At
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(delivery.recorded_at)}
                      </Typography>
                    </Grid>
                  )}
                  {delivery.recorded_by && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Recorded By
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <PersonIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                        <Typography variant="body2">
                          User ID: {delivery.recorded_by.substring(0, 8)}...
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>
            </>
          )}

          {/* Additional Details (Challan, Vehicle, Driver) */}
          {hasAdditionalDetails && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <TruckIcon fontSize="small" />
                  Transport Details
                </Typography>
                <Grid container spacing={2}>
                  {delivery.challan_number && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Challan Number
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <ReceiptIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                        <Typography variant="body2" fontWeight={500} fontFamily="monospace">
                          {delivery.challan_number}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  {delivery.challan_date && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Challan Date
                      </Typography>
                      <Typography variant="body2">
                        {formatDate(delivery.challan_date)}
                      </Typography>
                    </Grid>
                  )}
                  {delivery.vehicle_number && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Vehicle Number
                      </Typography>
                      <Typography variant="body2" fontWeight={500} fontFamily="monospace">
                        {delivery.vehicle_number}
                      </Typography>
                    </Grid>
                  )}
                  {delivery.driver_name && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Driver Name
                      </Typography>
                      <Typography variant="body2">
                        {delivery.driver_name}
                      </Typography>
                    </Grid>
                  )}
                  {delivery.driver_phone && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Driver Phone
                      </Typography>
                      <Typography variant="body2" fontFamily="monospace">
                        {delivery.driver_phone}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </Box>
            </>
          )}

          {/* Delivery Photos */}
          {hasPhotos && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Delivery Photos ({deliveryPhotos.length})
                </Typography>
                <ImageList cols={isMobile ? 2 : 3} gap={8} sx={{ mt: 1 }}>
                  {deliveryPhotos.map((photoUrl, index) => (
                    <ImageListItem key={index}>
                      <Box
                        sx={{
                          position: "relative",
                          width: "100%",
                          paddingTop: "100%", // 1:1 Aspect Ratio
                          overflow: "hidden",
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          cursor: "pointer",
                          "&:hover .zoom-icon": {
                            opacity: 1,
                          },
                        }}
                        onClick={() => setSelectedPhoto(photoUrl)}
                      >
                        <img
                          src={photoUrl}
                          alt={`Delivery photo ${index + 1}`}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        <Box
                          className="zoom-icon"
                          sx={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            opacity: 0,
                            transition: "opacity 0.2s",
                            bgcolor: "rgba(0,0,0,0.6)",
                            borderRadius: "50%",
                            p: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <ZoomIcon sx={{ color: "white" }} />
                        </Box>
                      </Box>
                    </ImageListItem>
                  ))}
                </ImageList>
              </Box>
            </>
          )}

          {/* Delivered Items */}
          {delivery.items && delivery.items.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Delivered Items ({delivery.items.length})
                </Typography>
                <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                  {delivery.items.map((item, index) => (
                    <Box
                      key={index}
                      sx={{
                        p: 1.5,
                        bgcolor: "grey.50",
                        borderRadius: 1,
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 0.5 }}>
                        <Typography variant="body2" fontWeight={500}>
                          {item.material?.name || "Unknown Material"}
                        </Typography>
                        <Chip label={`${item.received_qty} ${item.material?.unit || "units"}`} size="small" />
                      </Box>
                      {item.brand?.brand_name && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Brand: {item.brand.brand_name}
                        </Typography>
                      )}
                      {item.unit_price && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Price: {formatCurrency(item.unit_price)} per unit
                        </Typography>
                      )}
                      {item.rejected_qty && item.rejected_qty > 0 && (
                        <Typography variant="caption" color="error.main" display="block">
                          Rejected: {item.rejected_qty} {item.rejection_reason ? `(${item.rejection_reason})` : ""}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            </>
          )}

          {/* Notes */}
          {delivery.notes && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Notes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {delivery.notes}
                </Typography>
              </Box>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Photo Zoom Dialog */}
      {selectedPhoto && (
        <Dialog
          open={!!selectedPhoto}
          onClose={(_event, reason) => { if (reason !== "backdropClick") setSelectedPhoto(null); }}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography>Delivery Photo</Typography>
            <IconButton onClick={() => setSelectedPhoto(null)} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img
                src={selectedPhoto}
                alt="Delivery photo full view"
                style={{
                  maxWidth: "100%",
                  maxHeight: "80vh",
                  objectFit: "contain",
                }}
              />
            </Box>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
