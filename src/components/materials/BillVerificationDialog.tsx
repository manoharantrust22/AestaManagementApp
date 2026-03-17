"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Alert,
  useTheme,
  useMediaQuery,
  alpha,
  Paper,
  IconButton,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitScreenIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { PurchaseOrderWithDetails } from "@/types/material.types";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { usePurchaseOrder } from "@/hooks/queries/usePurchaseOrders";

interface BillVerificationDialogProps {
  open: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrderWithDetails | null;
  onVerified: (notes?: string) => void;
  isVerifying?: boolean;
  /** Override bill URL (use when PO object may not have vendor_bill_url) */
  billUrl?: string | null;
}

/**
 * Get file extension from a URL, handling query parameters
 */
function getUrlExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const lastDot = pathname.lastIndexOf(".");
    return lastDot !== -1 ? pathname.substring(lastDot) : "";
  } catch {
    const cleanUrl = url.split("?")[0].toLowerCase();
    const lastDot = cleanUrl.lastIndexOf(".");
    return lastDot !== -1 ? cleanUrl.substring(lastDot) : "";
  }
}

/**
 * Side-by-side bill verification dialog
 * Shows the vendor bill on one side and PO details on the other
 * Desktop: 50/50 split | Mobile: Stacked view
 */
export default function BillVerificationDialog({
  open,
  onClose,
  purchaseOrder: purchaseOrderProp,
  onVerified,
  isVerifying = false,
  billUrl: billUrlOverride,
}: BillVerificationDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [notes, setNotes] = useState("");

  // Fetch full PO data using the ID from the prop (the prop may be partial)
  const { data: fullPO, isLoading: isLoadingPO } = usePurchaseOrder(
    open && purchaseOrderProp?.id ? purchaseOrderProp.id : undefined
  );

  // Use full PO data when available, otherwise fall back to the prop
  const purchaseOrder = fullPO || purchaseOrderProp;

  // Use override billUrl if provided, otherwise fallback to PO's vendor_bill_url
  const billUrl = billUrlOverride || purchaseOrder?.vendor_bill_url;

  if (!purchaseOrder || !billUrl) {
    return null;
  }

  const ext = getUrlExtension(billUrl);
  const isPdf = ext === ".pdf";
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext) || (!isPdf && ext === "");

  const handleVerify = () => {
    onVerified(notes || undefined);
  };

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      fullScreen={isMobile}
      maxWidth={false}
      PaperProps={{
        sx: {
          ...(isMobile
            ? {}
            : {
                width: "95vw",
                height: "90vh",
                maxWidth: "1400px",
              }),
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1.5,
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="h6" component="span" fontWeight={600}>
            Verify Bill - {purchaseOrder.po_number}
          </Typography>
          {purchaseOrder.bill_verified && (
            <Chip
              icon={<CheckCircleIcon />}
              label="Already Verified"
              color="success"
              size="small"
            />
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 0,
          overflow: "hidden",
        }}
      >
        {/* Left side: Bill Preview */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            borderRight: isMobile ? 0 : 1,
            borderBottom: isMobile ? 1 : 0,
            borderColor: "divider",
            height: isMobile ? "50%" : "100%",
            minHeight: isMobile ? 300 : undefined,
            bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.200",
          }}
        >
          <Box
            sx={{
              p: 1,
              bgcolor: "background.paper",
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              Vendor Bill
            </Typography>
            <Tooltip title="Open in new tab">
              <IconButton
                size="small"
                onClick={() => window.open(billUrl, "_blank")}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* PDF Viewer */}
          {isPdf && (
            <Box sx={{ flex: 1, width: "100%", height: "100%" }}>
              <iframe
                src={`${billUrl}#toolbar=1&navpanes=0`}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                title="Bill PDF"
              />
            </Box>
          )}

          {/* Image Viewer with zoom */}
          {isImage && (
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit
              wheel={{ step: 0.1 }}
              pinch={{ step: 5 }}
              doubleClick={{ mode: "reset" }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <Box sx={{ flex: 1, position: "relative" }}>
                  {/* Zoom controls */}
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: 8,
                      left: "50%",
                      transform: "translateX(-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      bgcolor: alpha(theme.palette.common.black, 0.7),
                      borderRadius: 2,
                      px: 1,
                      py: 0.5,
                      zIndex: 10,
                    }}
                  >
                    <IconButton
                      onClick={() => zoomOut()}
                      size="small"
                      sx={{ color: "white" }}
                    >
                      <ZoomOutIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      onClick={() => resetTransform()}
                      size="small"
                      sx={{ color: "white" }}
                    >
                      <FitScreenIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      onClick={() => zoomIn()}
                      size="small"
                      sx={{ color: "white" }}
                    >
                      <ZoomInIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  <TransformComponent
                    wrapperStyle={{
                      width: "100%",
                      height: "100%",
                    }}
                    contentStyle={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Box
                      component="img"
                      src={billUrl}
                      alt="Vendor Bill"
                      sx={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </TransformComponent>
                </Box>
              )}
            </TransformWrapper>
          )}

          {/* Fallback */}
          {!isPdf && !isImage && (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Button
                variant="contained"
                onClick={() => window.open(billUrl, "_blank")}
              >
                Open Bill in New Tab
              </Button>
            </Box>
          )}
        </Box>

        {/* Right side: PO Details */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            height: isMobile ? "50%" : "100%",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              p: 1,
              bgcolor: "background.paper",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              Purchase Order Details
            </Typography>
          </Box>

          <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
            {isLoadingPO && !fullPO && (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
                <CircularProgress size={24} sx={{ mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Loading PO details...
                </Typography>
              </Box>
            )}
            {/* PO Header Info */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1.5,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    PO Number
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {purchaseOrder.po_number}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Order Date
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(purchaseOrder.order_date)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Vendor
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {purchaseOrder.vendor?.name || "Unknown"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Amount
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="primary">
                    {formatCurrency(purchaseOrder.total_amount || 0)}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Items Table */}
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Items ({purchaseOrder.items?.length || 0})
            </Typography>
            <Paper variant="outlined" sx={{ mb: 2, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.50" }}>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {purchaseOrder.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {item.material?.name || "Unknown"}
                        </Typography>
                        {item.brand && (
                          <Typography variant="caption" color="text.secondary">
                            {item.brand.brand_name}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {item.pricing_mode === "per_kg" && (item.actual_weight ?? item.calculated_weight) ? (
                          <>
                            <Typography variant="body2" fontWeight={500}>
                              {((item.actual_weight ?? item.calculated_weight) || 0).toFixed(1)} kg
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              ({item.quantity} pcs)
                            </Typography>
                          </>
                        ) : (
                          <>
                            <Typography variant="body2">{item.quantity} pcs</Typography>
                            {item.actual_weight && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {item.actual_weight.toFixed(2)} kg
                              </Typography>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {formatCurrency(item.unit_price)}
                        </Typography>
                        {item.pricing_mode === "per_kg" && (
                          <Typography variant="caption" color="text.secondary">
                            /kg
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(item.total_amount)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            {/* Totals */}
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Subtotal
                  </Typography>
                  <Typography variant="body2">
                    {formatCurrency(purchaseOrder.subtotal || 0)}
                  </Typography>
                </Box>
                {(purchaseOrder.tax_amount || 0) > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Tax
                    </Typography>
                    <Typography variant="body2">
                      {formatCurrency(purchaseOrder.tax_amount || 0)}
                    </Typography>
                  </Box>
                )}
                {(purchaseOrder.transport_cost || 0) > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Transport
                    </Typography>
                    <Typography variant="body2">
                      {formatCurrency(purchaseOrder.transport_cost || 0)}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ my: 0.5 }} />
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="body1" fontWeight={600}>
                    Total
                  </Typography>
                  <Typography variant="body1" fontWeight={600} color="primary">
                    {formatCurrency(purchaseOrder.total_amount || 0)}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Verification Notes */}
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Verification Notes (Optional)
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="Add any notes about discrepancies or observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              size="small"
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
        <Alert severity="info" sx={{ flex: 1, mr: 2 }}>
          Compare the bill with PO details above. Click &quot;Confirm Verified&quot; once you&apos;ve checked.
        </Alert>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        <Button
          onClick={handleVerify}
          variant="contained"
          color="success"
          startIcon={<CheckCircleIcon />}
          disabled={isVerifying}
        >
          {isVerifying ? "Verifying..." : "Confirm Verified"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
