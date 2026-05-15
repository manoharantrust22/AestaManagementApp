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
  Stack,
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
  Edit as EditIcon,
  DeleteOutline as DeleteIcon,
  History as HistoryIcon,
} from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { useSite } from "@/contexts/SiteContext";
import {
  useRentalOrder,
  useRentalCostCalculation,
  useUpdateRentalOrderStatus,
  useDeleteRentalAdvance,
} from "@/hooks/queries/useRentals";
import {
  RentalCostBreakdown,
  RentalReturnDialog,
  RentalAdvanceDialog,
  RentalSettlementDialog,
} from "@/components/rentals";
import { MultiPartySettlementDialog } from "@/components/rentals/MultiPartySettlementDialog";
import { RentalSettlementEditDialog } from "@/components/rentals/RentalSettlementEditDialog";
import HistoricalRentalDialog from "@/components/rentals/HistoricalRentalDialog";
import {
  RENTAL_ORDER_STATUS_LABELS,
  RENTAL_ITEM_STATUS_LABELS,
  RENTAL_SETTLEMENT_PARTY_LABELS,
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
  const [editingSettlement, setEditingSettlement] = useState<import("@/types/rental.types").RentalSettlement | null>(null);
  const [multiSettlementDialogOpen, setMultiSettlementDialogOpen] = useState(false);
  const [inboundSettleOpen, setInboundSettleOpen] = useState(false);
  const [outboundSettleOpen, setOutboundSettleOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RentalOrderItemWithDetails | undefined>();
  const [deletingAdvanceId, setDeletingAdvanceId] = useState<string | null>(null);
  const [historicalDialogOpen, setHistoricalDialogOpen] = useState(false);
  const deleteAdvance = useDeleteRentalAdvance();

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
  // First vendor settlement row (for legacy single-settlement display)
  const settlement = settlements.find((s) => (s as any).party_type === "vendor") ?? settlements[0] ?? null;

  // Determine which parties actually need settlement
  const settledPartyTypes = new Set(settlements.map((s) => (s as any).party_type as string));
  const vendorSettled = settledPartyTypes.has("vendor");
  const inboundNeeded = (order?.transport_cost_outward ?? 0) > 0;
  const outboundNeeded = (order?.transport_cost_return ?? 0) > 0;
  const inboundSettled =
    !inboundNeeded ||
    settledPartyTypes.has("transport_inbound") ||
    settledPartyTypes.has("transport");
  const outboundSettled =
    !outboundNeeded ||
    settledPartyTypes.has("transport_outbound") ||
    settledPartyTypes.has("transport");
  const isFullySettled = vendorSettled && inboundSettled && outboundSettled;

  const isSettled = order?.status === "completed" && isFullySettled;
  const showReadyToSettle = allItemsReturned && !isSettled && order?.status !== "completed" && order?.status !== "cancelled";
  // Completed orders that still have unsettled parties
  const isCompletedUnsettled = order?.status === "completed" && !isFullySettled;
  const isHistorical = order?.is_historical ?? false;

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
            {!isHistorical && order.status === "draft" && (
              <Button
                variant="contained"
                color="primary"
                onClick={handleActivateOrder}
                disabled={updateStatus.isPending}
              >
                Activate Order
              </Button>
            )}
            {isHistorical && order.status === "draft" && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<EditIcon />}
                onClick={() => setHistoricalDialogOpen(true)}
              >
                Complete Record
              </Button>
            )}
            {!isHistorical && order.status === "completed" && (
              <Button
                variant="outlined"
                startIcon={<PaymentIcon />}
                onClick={() => setAdvanceDialogOpen(true)}
              >
                Add Advance
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
            {!isHistorical && ["active", "partially_returned"].includes(order.status) && (
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
                  {isHistorical && (
                    <Chip
                      label="Historical record"
                      size="small"
                      variant="outlined"
                      icon={<HistoryIcon fontSize="small" />}
                    />
                  )}
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
                  {!isHistorical && <TableCell align="center">Action</TableCell>}
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
                      {!isHistorical && (
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
                      )}
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
                    <TableCell />
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
                      <TableCell align="right">
                        {deletingAdvanceId === adv.id ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Typography variant="caption" color="error">Delete?</Typography>
                            <Button
                              size="small"
                              color="error"
                              variant="contained"
                              sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: "0.65rem" }}
                              disabled={deleteAdvance.isPending}
                              onClick={async () => {
                                await deleteAdvance.mutateAsync({ id: adv.id, rental_order_id: order.id });
                                setDeletingAdvanceId(null);
                              }}
                            >
                              Yes
                            </Button>
                            <Button
                              size="small"
                              sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: "0.65rem" }}
                              onClick={() => setDeletingAdvanceId(null)}
                            >
                              No
                            </Button>
                          </Box>
                        ) : (
                          <Tooltip title="Delete advance">
                            <IconButton size="small" color="error" onClick={() => setDeletingAdvanceId(adv.id)}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
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

          {/* Settlement Section — show each party row separately */}
          {settlements.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  SETTLEMENT
                </Typography>
                {isFullySettled && (
                  <Chip size="small" label="Fully Settled" color="success" />
                )}
              </Box>
              {settlements.map((s: any, idx: number) => (
                <Box
                  key={s.id ?? idx}
                  sx={{
                    mb: idx < settlements.length - 1 ? 1.5 : 0,
                    pb: idx < settlements.length - 1 ? 1.5 : 0,
                    borderBottom: idx < settlements.length - 1 ? "1px solid" : "none",
                    borderColor: "divider",
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      {RENTAL_SETTLEMENT_PARTY_LABELS[s.party_type as keyof typeof RENTAL_SETTLEMENT_PARTY_LABELS] ?? s.party_type}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Typography variant="caption" color="success.main" fontWeight={600}>
                        {s.settlement_reference}
                      </Typography>
                      <Tooltip title="Edit settlement">
                        <IconButton size="small" onClick={() => setEditingSettlement(s)}>
                          <EditIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  <Box display="flex" flexDirection="column" gap={0.75}>
                    {(() => {
                      const gross = (s.total_rental_amount || 0) + (s.total_transport_amount || 0);
                      // Use live advance total for vendor (stored snapshot may be stale if advance was recorded after settlement)
                      const advance = s.party_type === "vendor"
                        ? (order.total_advance_paid || s.total_advance_paid || 0)
                        : (s.total_advance_paid || 0);
                      const finalSettlement = s.negotiated_final_amount ?? (gross - advance);
                      const totalPaid = advance + finalSettlement;
                      const savings = gross - totalPaid;
                      const hasAdvance = advance > 0;
                      const hasDiscount = savings > 0.5;
                      return (
                        <>
                          {gross > 0 && (
                            <Box display="flex" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">Gross</Typography>
                              <Typography variant="body2" color="text.secondary">{formatCurrency(gross)}</Typography>
                            </Box>
                          )}
                          {hasAdvance && (
                            <Box display="flex" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">Advance paid</Typography>
                              <Typography variant="body2" color="warning.dark" fontWeight={500}>
                                −{formatCurrency(advance)}
                              </Typography>
                            </Box>
                          )}
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              {hasAdvance ? "Final settlement" : "Settled"}
                            </Typography>
                            <Typography variant="body2" fontWeight={700} color="success.main">
                              {formatCurrency(finalSettlement)}
                            </Typography>
                          </Box>
                          {hasAdvance && (
                            <>
                              <Divider sx={{ my: 0.25 }} />
                              <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2" fontWeight={600}>Total paid</Typography>
                                <Typography variant="body2" fontWeight={700} color="success.dark">
                                  {formatCurrency(totalPaid)}
                                </Typography>
                              </Box>
                            </>
                          )}
                          {hasDiscount && (
                            <Box display="flex" justifyContent="space-between">
                              <Typography variant="caption" color="warning.dark">Discount saved</Typography>
                              <Typography variant="caption" fontWeight={600} color="warning.dark">
                                {formatCurrency(savings)} off
                              </Typography>
                            </Box>
                          )}
                        </>
                      );
                    })()}
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Date</Typography>
                      <Typography variant="body2">{formatDate(s.settlement_date)}</Typography>
                    </Box>
                    {s.payment_mode && (
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">Mode</Typography>
                        <Typography variant="body2">{s.payment_mode}</Typography>
                      </Box>
                    )}
                    {s.payer_source && (
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">Paid by</Typography>
                        <Typography variant="body2">
                          {getPayerSourceLabel(s.payer_source, s.payer_name)}
                        </Typography>
                      </Box>
                    )}
                    {(s.vendor_bill_url || s.final_receipt_url || s.upi_screenshot_url) && (
                      <Box display="flex" gap={1} mt={0.5}>
                        {[
                          { url: s.vendor_bill_url, label: "Vendor Bill", icon: <BillIcon /> },
                          { url: s.final_receipt_url, label: "Receipt", icon: <ReceiptIcon /> },
                          { url: s.upi_screenshot_url, label: "UPI Proof", icon: <UpiIcon /> },
                        ]
                          .filter((a) => a.url)
                          .map(({ url, label, icon }) => (
                            <Tooltip key={label} title={`View ${label}`}>
                              <Paper
                                variant="outlined"
                                sx={{
                                  width: 64,
                                  height: 64,
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 0.5,
                                  cursor: "pointer",
                                  "&:hover": { boxShadow: 3 },
                                }}
                                onClick={() => window.open(url, "_blank")}
                              >
                                {icon}
                                <Typography variant="caption" textAlign="center" fontSize="0.6rem" lineHeight={1.2}>
                                  {label}
                                </Typography>
                              </Paper>
                            </Tooltip>
                          ))}
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
              {/* Settle remaining button if not fully settled */}
              {!isFullySettled && (
                <Box mt={1.5}>
                  <Button
                    variant="outlined"
                    color="success"
                    size="small"
                    startIcon={<SettleIcon />}
                    onClick={() => setMultiSettlementDialogOpen(true)}
                    fullWidth
                  >
                    Settle Remaining Transport
                  </Button>
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
              settledPartyTypes={settledPartyTypes}
              onSettleInbound={
                order.status === "completed" && !inboundSettled
                  ? () => setInboundSettleOpen(true)
                  : undefined
              }
              onSettleOutbound={
                order.status === "completed" && !outboundSettled
                  ? () => setOutboundSettleOpen(true)
                  : undefined
              }
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

      <MultiPartySettlementDialog
        open={inboundSettleOpen}
        onClose={() => setInboundSettleOpen(false)}
        order={order}
        focusedPartyType="transport_inbound"
      />

      <MultiPartySettlementDialog
        open={outboundSettleOpen}
        onClose={() => setOutboundSettleOpen(false)}
        order={order}
        focusedPartyType="transport_outbound"
      />

      {editingSettlement && (
        <RentalSettlementEditDialog
          open={!!editingSettlement}
          onClose={() => setEditingSettlement(null)}
          settlement={editingSettlement}
          siteId={order.site_id}
          orderId={order.id}
        />
      )}

      <HistoricalRentalDialog
        open={historicalDialogOpen}
        onClose={() => setHistoricalDialogOpen(false)}
        siteId={order.site_id}
        orderId={order.id}
      />
    </Box>
  );
}
