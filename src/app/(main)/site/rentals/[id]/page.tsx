"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Grid,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  Undo as ReturnIcon,
  Payment as PaymentIcon,
  CheckCircle as SettleIcon,
  Store as StoreIcon,
  Phone as PhoneIcon,
  CalendarMonth as CalendarIcon,
  Warning as WarningIcon,
  Description as BillIcon,
  Receipt as ReceiptIcon,
  Screenshot as UpiIcon,
} from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { useSite } from "@/contexts/SiteContext";
import {
  useRentalOrder,
  useRentalCostCalculation,
  useUpdateRentalOrderStatus,
} from "@/hooks/queries/useRentals";
import {
  RentalCostBreakdown,
  RentalReturnDialog,
  RentalAdvanceDialog,
  RentalSettlementDialog,
} from "@/components/rentals";
import { MultiPartySettlementDialog } from "@/components/rentals/MultiPartySettlementDialog";
import {
  RENTAL_ORDER_STATUS_LABELS,
  RENTAL_ITEM_STATUS_LABELS,
} from "@/types/rental.types";
import type { RentalOrderItemWithDetails } from "@/types/rental.types";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getPayerSourceLabel } from "@/components/settlement/PayerSourceSelector";
import dayjs from "dayjs";

export default function RentalOrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { selectedSite } = useSite();

  const orderId = params.id as string;

  const { data: order, isLoading, error } = useRentalOrder(orderId);
  const costCalculation = useRentalCostCalculation(orderId);
  const updateStatus = useUpdateRentalOrderStatus();

  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [multiSettlementDialogOpen, setMultiSettlementDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RentalOrderItemWithDetails | undefined>();

  const handleRecordReturn = (item?: RentalOrderItemWithDetails) => {
    setSelectedItem(item);
    setReturnDialogOpen(true);
  };

  const handleActivateOrder = async () => {
    if (!order) return;
    try {
      await updateStatus.mutateAsync({ id: order.id, status: "active" });
    } catch (err) {
      console.error("Failed to activate order:", err);
    }
  };

  // Calculate outstanding items count
  const outstandingItemsCount = (order?.items || []).filter(
    (item) => (item.quantity_outstanding || item.quantity - item.quantity_returned) > 0
  ).length;

  const allItemsReturned = outstandingItemsCount === 0;
  const settlements = order?.settlements ?? [];
  const settlement = settlements[0] ?? null;
  // A completed order is "fully settled" only when ALL parties have a settlement row.
  // For historical records with transport drivers, there may be multiple parties.
  const isSettled = order?.status === "completed" && settlements.length > 0;
  const showReadyToSettle = allItemsReturned && !isSettled && order?.status !== "completed" && order?.status !== "cancelled";
  // Completed orders saved as "Settle Later" (no settlement rows yet)
  const isCompletedUnsettled = order?.status === "completed" && settlements.length === 0;

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !order) {
    return (
      <Box p={4}>
        <Alert severity="error">
          Failed to load rental order. It may have been deleted or you don&apos;t have access.
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => router.back()} sx={{ mt: 2 }}>
          Go Back
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={`Order ${order.rental_order_number}`}
        actions={
          <Box display="flex" gap={1}>
            {order.status === "draft" && (
              <Button
                variant="contained"
                color="primary"
                onClick={handleActivateOrder}
                disabled={updateStatus.isPending}
              >
                Activate Order
              </Button>
            )}
            {isCompletedUnsettled && (
              <Button
                variant="contained"
                color="success"
                startIcon={<SettleIcon />}
                onClick={() => setMultiSettlementDialogOpen(true)}
              >
                Settle
              </Button>
            )}
            {["active", "partially_returned"].includes(order.status) && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<ReturnIcon />}
                  onClick={() => handleRecordReturn()}
                  disabled={allItemsReturned}
                >
                  Record Return
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PaymentIcon />}
                  onClick={() => setAdvanceDialogOpen(true)}
                >
                  Advance
                </Button>
                {allItemsReturned && (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<SettleIcon />}
                    onClick={() => setSettlementDialogOpen(true)}
                  >
                    Settle
                  </Button>
                )}
              </>
            )}
          </Box>
        }
      />

      <Grid container spacing={3}>
        {/* Left Column - Order Details */}
        <Grid size={{ xs: 12, md: 7 }}>
          {/* Status & Store Info */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
              <Box>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Chip
                    label={RENTAL_ORDER_STATUS_LABELS[order.status]}
                    color={
                      order.status === "active"
                        ? "primary"
                        : order.status === "completed"
                          ? "success"
                          : order.status === "cancelled"
                            ? "error"
                            : "default"
                    }
                  />
                  {order.is_overdue && (
                    <Chip
                      icon={<WarningIcon />}
                      label="Overdue"
                      color="error"
                      size="small"
                    />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Created {formatDate(order.created_at)}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Store Details */}
            <Box display="flex" alignItems="flex-start" gap={2}>
              <StoreIcon color="action" />
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {order.vendor?.shop_name || order.vendor?.name}
                </Typography>
                {order.vendor?.phone && (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <PhoneIcon fontSize="small" color="action" />
                    <Typography variant="body2">{order.vendor.phone}</Typography>
                  </Box>
                )}
                {order.vendor?.address && (
                  <Typography variant="body2" color="text.secondary">
                    {order.vendor.address}
                  </Typography>
                )}
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Dates */}
            <Box display="flex" gap={4}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Start Date
                </Typography>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <CalendarIcon fontSize="small" color="action" />
                  <Typography variant="body2" fontWeight={500}>
                    {dayjs(order.start_date).format("DD MMM YYYY")}
                  </Typography>
                </Box>
              </Box>
              {(order.actual_return_date || order.expected_return_date) && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {order.status === "completed" ? "Return Date" : "Expected Return"}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <CalendarIcon fontSize="small" color="action" />
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      color={order.is_overdue && order.status !== "completed" ? "error.main" : "text.primary"}
                    >
                      {dayjs(order.actual_return_date ?? order.expected_return_date).format("DD MMM YYYY")}
                    </Typography>
                  </Box>
                </Box>
              )}
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {order.status === "completed" ? "Duration" : "Days Elapsed"}
                </Typography>
                <Typography variant="body2" fontWeight={600} color="primary">
                  {order.status === "completed" && order.actual_return_date
                    ? Math.max(1, dayjs(order.actual_return_date).diff(dayjs(order.start_date), "day") + (order.exclude_start_date ? 0 : 1))
                    : order.days_since_start || 0} days
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Pending settlement banner for historical "Settle Later" records */}
          {isCompletedUnsettled && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                <Button color="warning" variant="contained" size="small" onClick={() => setMultiSettlementDialogOpen(true)}>
                  Settle Now
                </Button>
              }
            >
              Payment not yet recorded. Tap Settle Now to record vendor and transport payments separately.
            </Alert>
          )}

          {/* Ready to Settle Banner */}
          {showReadyToSettle && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                <Button
                  color="warning"
                  variant="contained"
                  size="small"
                  onClick={() => setSettlementDialogOpen(true)}
                >
                  Settle Now
                </Button>
              }
            >
              All items returned. Record the final payment to close this rental.
            </Alert>
          )}

          {/* Items Table */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              RENTAL ITEMS
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Returned</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell align="right">Rate/Day</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(order.items || []).map((item) => {
                  const outstanding =
                    item.quantity_outstanding || item.quantity - item.quantity_returned;
                  return (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {item.rental_item?.name || "Unknown"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.rental_item?.code}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell align="right">
                        <Typography
                          color={item.quantity_returned > 0 ? "success.main" : "text.secondary"}
                        >
                          {item.quantity_returned}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          fontWeight={600}
                          color={outstanding > 0 ? "warning.main" : "success.main"}
                        >
                          {outstanding}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography>
                          {formatCurrency(item.daily_rate_actual)}
                        </Typography>
                        {item.daily_rate_actual !== item.daily_rate_default && (
                          <Typography variant="caption" color="text.secondary">
                            (was {formatCurrency(item.daily_rate_default)})
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={RENTAL_ITEM_STATUS_LABELS[item.status]}
                          color={
                            item.status === "returned"
                              ? "success"
                              : item.status === "partially_returned"
                                ? "warning"
                                : "default"
                          }
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        {outstanding > 0 && (
                          <Tooltip title="Record Return">
                            <IconButton
                              size="small"
                              onClick={() => handleRecordReturn(item)}
                            >
                              <ReturnIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>

          {/* Advances History */}
          {(order.advances || []).length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                ADVANCE PAYMENTS ({order.advances?.length})
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Mode</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.advances?.map((adv) => (
                    <TableRow key={adv.id}>
                      <TableCell>{formatDate(adv.advance_date)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={adv.payment_mode || "Cash"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={600} color="success.main">
                          {formatCurrency(adv.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {adv.notes || "-"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {/* Returns History */}
          {(order.returns || []).length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                RETURNS HISTORY ({order.returns?.length})
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>Condition</TableCell>
                    <TableCell>Damage Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.returns?.map((ret) => (
                    <TableRow key={ret.id}>
                      <TableCell>{formatDate(ret.return_date)}</TableCell>
                      <TableCell align="right">{ret.quantity_returned}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={ret.condition}
                          color={
                            ret.condition === "good"
                              ? "success"
                              : ret.condition === "damaged"
                                ? "warning"
                                : "error"
                          }
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {ret.damage_cost ? (
                          <Typography color="error">
                            {formatCurrency(ret.damage_cost)}
                          </Typography>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {/* Settlement Section */}
          {isSettled && settlement && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  SETTLEMENT
                </Typography>
                <Typography variant="caption" fontWeight={600} color="success.main">
                  {(settlement as any).settlement_reference}
                </Typography>
              </Box>
              <Box display="flex" flexDirection="column" gap={1} mb={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Date</Typography>
                  <Typography variant="body2">{formatDate((settlement as any).settlement_date)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Amount</Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">
                    {formatCurrency((settlement as any).negotiated_final_amount ?? ((settlement as any).total_rental_amount || 0) + ((settlement as any).total_transport_amount || 0) + ((settlement as any).total_damage_amount || 0))}
                  </Typography>
                </Box>
                {(settlement as any).payer_source && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Paid by</Typography>
                    <Typography variant="body2">
                      {getPayerSourceLabel((settlement as any).payer_source, (settlement as any).payer_name)}
                    </Typography>
                  </Box>
                )}
                {(settlement as any).payment_mode && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Mode</Typography>
                    <Typography variant="body2">{(settlement as any).payment_mode}</Typography>
                  </Box>
                )}
                {(settlement as any).settled_by_name && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Settled by</Typography>
                    <Typography variant="body2">{(settlement as any).settled_by_name}</Typography>
                  </Box>
                )}
              </Box>

              {/* Proof Attachments */}
              {((settlement as any).vendor_bill_url || (settlement as any).final_receipt_url || (settlement as any).upi_screenshot_url) && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    Attachments
                  </Typography>
                  <Box display="flex" gap={1}>
                    {[
                      { url: (settlement as any).vendor_bill_url, label: "Vendor Bill", icon: <BillIcon /> },
                      { url: (settlement as any).final_receipt_url, label: "Final Receipt", icon: <ReceiptIcon /> },
                      { url: (settlement as any).upi_screenshot_url, label: "UPI Proof", icon: <UpiIcon /> },
                    ].map(({ url, label, icon }) => (
                      <Tooltip key={label} title={url ? `View ${label}` : `No ${label}`}>
                        <Paper
                          variant="outlined"
                          sx={{
                            width: 80,
                            height: 80,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 0.5,
                            cursor: url ? "pointer" : "default",
                            opacity: url ? 1 : 0.35,
                            transition: "box-shadow 0.15s",
                            "&:hover": url ? { boxShadow: 3 } : {},
                          }}
                          onClick={() => url && window.open(url, "_blank")}
                        >
                          {icon}
                          <Typography variant="caption" textAlign="center" fontSize="0.65rem" lineHeight={1.2}>
                            {label}
                          </Typography>
                        </Paper>
                      </Tooltip>
                    ))}
                  </Box>
                </Box>
              )}
            </Paper>
          )}
        </Grid>

        {/* Right Column - Cost Breakdown */}
        <Grid size={{ xs: 12, md: 5 }}>
          {costCalculation && (
            <RentalCostBreakdown
              calculation={costCalculation}
              showItemDetails
              settlement={settlement as any}
            />
          )}

          {/* Notes */}
          {order.notes && (
            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                NOTES
              </Typography>
              <Typography variant="body2">{order.notes}</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Dialogs */}
      <RentalReturnDialog
        open={returnDialogOpen}
        onClose={() => {
          setReturnDialogOpen(false);
          setSelectedItem(undefined);
        }}
        order={order}
        preselectedItem={selectedItem}
      />

      <RentalAdvanceDialog
        open={advanceDialogOpen}
        onClose={() => setAdvanceDialogOpen(false)}
        order={order}
      />

      <RentalSettlementDialog
        open={settlementDialogOpen}
        onClose={() => setSettlementDialogOpen(false)}
        order={order}
      />

      <MultiPartySettlementDialog
        open={multiSettlementDialogOpen}
        onClose={() => setMultiSettlementDialogOpen(false)}
        order={order}
      />
    </Box>
  );
}
