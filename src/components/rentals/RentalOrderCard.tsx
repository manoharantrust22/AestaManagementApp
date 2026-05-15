"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardActions,
  Box,
  Typography,
  Chip,
  Button,
  Divider,
  Tooltip,
} from "@mui/material";
import {
  Store as StoreIcon,
  CalendarMonth as CalendarIcon,
  Warning as WarningIcon,
  ArrowForward as ArrowIcon,
  Undo as ReturnIcon,
  Payment as PaymentIcon,
  LocalShipping as DeliveryIcon,
  Receipt as SettleIcon,
} from "@mui/icons-material";
import type { RentalOrderWithDetails } from "@/types/rental.types";
import {
  RENTAL_ORDER_STATUS_LABELS,
  RENTAL_ORDER_STATUS_COLORS,
} from "@/types/rental.types";
import dayjs from "dayjs";
import { ActiveOrderCostMeter } from "./ActiveOrderCostMeter";
import { DateExtensionDialog } from "./DateExtensionDialog";
import { DeliveryVerificationForm } from "./DeliveryVerificationForm";
import { MultiPartySettlementDialog } from "./MultiPartySettlementDialog";

interface RentalOrderCardProps {
  order: RentalOrderWithDetails;
  onClick?: () => void;
  onRecordReturn?: () => void;
  onRecordAdvance?: () => void;
  compact?: boolean;
}

export default function RentalOrderCard({
  order,
  onClick,
  onRecordReturn,
  onRecordAdvance,
  compact = false,
}: RentalOrderCardProps) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);

  const accruedCost = order.accrued_rental_cost || 0;
  const advancesPaid = order.total_advance_paid || 0;
  const balanceDue = accruedCost - advancesPaid;

  const totalItems = (order.items || []).reduce((sum, item) => sum + item.quantity, 0);
  const returnedItems = (order.items || []).reduce(
    (sum, item) => sum + item.quantity_returned,
    0
  );
  const outstandingItems = totalItems - returnedItems;

  const hasMoreItems = (order.items || []).length > 2;

  const getChipColor = (
    status: keyof typeof RENTAL_ORDER_STATUS_COLORS
  ): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    const colorMap: Record<string, "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"> = {
      default: "primary",
      secondary: "secondary",
      destructive: "error",
      outline: "default",
    };
    return colorMap[RENTAL_ORDER_STATUS_COLORS[status]] || "default";
  };

  const isActive = order.status === "active";
  const isConfirmed = order.status === "confirmed";
  const needsSettlement = order.status === "partially_returned" || order.status === "completed";

  return (
    <>
      <Card
        variant="outlined"
        sx={{
          cursor: onClick ? "pointer" : "default",
          transition: "box-shadow 0.2s",
          "&:hover": onClick ? { boxShadow: 2 } : {},
        }}
        onClick={onClick}
      >
        <CardContent sx={{ pb: compact ? 1 : 2 }}>
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Box>
              <Typography variant="body2" color="text.secondary" fontSize="0.75rem">
                {order.rental_order_number}
              </Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                <StoreIcon fontSize="small" color="action" />
                <Typography variant="subtitle1" fontWeight={600}>
                  {order.vendor?.shop_name || order.vendor?.name}
                </Typography>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              {order.is_overdue && (
                <Chip size="small" icon={<WarningIcon />} label="Overdue" color="error" />
              )}
              <Chip
                size="small"
                label={RENTAL_ORDER_STATUS_LABELS[order.status] ?? order.status}
                color={getChipColor(order.status)}
                variant={isActive ? "filled" : "outlined"}
              />
            </Box>
          </Box>

          {/* Items Summary */}
          <Box display="flex" flexWrap="wrap" alignItems="center" gap={0.5} mb={1}>
            {(order.items || []).slice(0, 2).map((item) => (
              <Box key={item.id} display="flex" alignItems="center" gap={0.5}>
                <Typography variant="body2" color="text.secondary">
                  {item.rental_item?.name || "Unknown"}
                </Typography>
                {item.size_label_snapshot && (
                  <Chip
                    label={item.size_label_snapshot}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: "0.65rem" }}
                  />
                )}
              </Box>
            ))}
            {hasMoreItems && (
              <Typography variant="body2" color="text.secondary">
                +{(order.items || []).length - 2} more
              </Typography>
            )}
          </Box>

          {/* Dates */}
          <Box display="flex" alignItems="center" gap={2} mb={1.5}>
            <Box display="flex" alignItems="center" gap={0.5}>
              <CalendarIcon fontSize="small" color="action" />
              <Typography variant="body2">
                {dayjs(order.start_date).format("DD MMM")}
              </Typography>
            </Box>
            {order.expected_return_date && (
              <>
                <ArrowIcon fontSize="small" color="disabled" />
                <Typography
                  variant="body2"
                  color={order.is_overdue ? "error.main" : "text.secondary"}
                >
                  {dayjs(order.expected_return_date).format("DD MMM")}
                </Typography>
              </>
            )}
            <Typography variant="caption" color="text.secondary">
              ({order.days_since_start || 0} days)
            </Typography>
          </Box>

          {/* Active order cost meter */}
          {isActive && order.start_date && (
            <Box onClick={(e) => e.stopPropagation()}>
              <ActiveOrderCostMeter order={order} onExtendDate={() => setExtendOpen(true)} />
            </Box>
          )}

          {/* Items Progress (non-compact, non-active) */}
          {!compact && !isActive && (
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={1.5}
              p={1}
              bgcolor="grey.50"
              borderRadius={1}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Items
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {outstandingItems} outstanding / {totalItems} total
                </Typography>
              </Box>
              {returnedItems > 0 && (
                <Chip
                  size="small"
                  label={`${returnedItems} returned`}
                  color="success"
                  variant="outlined"
                />
              )}
            </Box>
          )}

          <Divider sx={{ my: 1 }} />

          {/* Financial Summary */}
          <Box display="flex" justifyContent="space-between" alignItems="flex-end">
            <Box>
              <Typography variant="caption" color="text.secondary">
                Accrued Cost
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                ₹{accruedCost.toLocaleString()}
              </Typography>
            </Box>
            <Box textAlign="center">
              <Typography variant="caption" color="success.main">
                Advances
              </Typography>
              <Typography variant="body2" color="success.main">
                ₹{advancesPaid.toLocaleString()}
              </Typography>
            </Box>
            <Box textAlign="right">
              <Typography variant="caption" color="text.secondary">
                Balance
              </Typography>
              <Typography
                variant="body1"
                fontWeight={700}
                color={balanceDue > 0 ? "error.main" : "success.main"}
              >
                ₹{balanceDue.toLocaleString()}
              </Typography>
            </Box>
          </Box>

          {/* Lifecycle action buttons */}
          <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
            {isConfirmed && (
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<DeliveryIcon />}
                onClick={() => setDeliveryOpen(true)}
              >
                Verify Delivery
              </Button>
            )}
            {isActive && onRecordReturn && outstandingItems > 0 && (
              <Tooltip title="Record Return">
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<ReturnIcon />}
                  onClick={onRecordReturn}
                >
                  Return Items
                </Button>
              </Tooltip>
            )}
            {needsSettlement && (
              <Button
                size="small"
                variant="outlined"
                color="primary"
                startIcon={<SettleIcon />}
                onClick={() => setSettlementOpen(true)}
              >
                Settle
              </Button>
            )}
          </Box>
        </CardContent>

        {/* Legacy advance action */}
        {onRecordAdvance && (
          <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
            <Tooltip title="Record Advance">
              <Button
                size="small"
                startIcon={<PaymentIcon />}
                onClick={(e) => {
                  e.stopPropagation();
                  onRecordAdvance();
                }}
              >
                Advance
              </Button>
            </Tooltip>
          </CardActions>
        )}
      </Card>

      {/* Dialogs — rendered outside Card to avoid nested click propagation */}
      {order.expected_return_date && (
        <DateExtensionDialog
          open={extendOpen}
          onClose={() => setExtendOpen(false)}
          orderId={order.id}
          orderNumber={order.rental_order_number}
          currentExpectedReturnDate={order.expected_return_date}
        />
      )}

      <DeliveryVerificationForm
        open={deliveryOpen}
        onClose={() => setDeliveryOpen(false)}
        order={order}
      />

      <MultiPartySettlementDialog
        open={settlementOpen}
        onClose={() => setSettlementOpen(false)}
        order={order}
      />
    </>
  );
}
