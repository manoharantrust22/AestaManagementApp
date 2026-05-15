"use client";

import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Divider,
  Tooltip,
} from "@mui/material";
import {
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from "@mui/icons-material";
import type { RentalCostCalculation, RentalSettlement } from "@/types/rental.types";
import { getPayerSourceLabel } from "@/components/settlement/PayerSourceSelector";
import dayjs from "dayjs";

interface RentalCostBreakdownProps {
  calculation: RentalCostCalculation;
  showItemDetails?: boolean;
  compact?: boolean;
  settlement?: RentalSettlement | null;
  settledPartyTypes?: Set<string>;
  onSettleInbound?: () => void;
  onSettleOutbound?: () => void;
}

export default function RentalCostBreakdown({
  calculation,
  showItemDetails = true,
  compact = false,
  settlement = null,
  settledPartyTypes,
  onSettleInbound,
  onSettleOutbound,
}: RentalCostBreakdownProps) {
  const {
    startDate,
    currentDate,
    expectedReturnDate,
    daysElapsed,
    itemsCost,
    subtotal,
    discountAmount,
    transportCostOutward,
    transportCostReturn,
    totalTransportCost,
    damagesCost,
    grossTotal,
    advancesPaid,
    balanceDue,
    isOverdue,
    daysOverdue,
    isCompleted,
    actualReturnDate,
  } = calculation;

  return (
    <Paper variant="outlined" sx={{ p: compact ? 1.5 : 2 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="subtitle2" color="text.secondary">
          COST BREAKDOWN
        </Typography>
        <Box display="flex" alignItems="center" gap={1}>
          <Chip
            size="small"
            label={`${daysElapsed} days`}
            color="primary"
            variant="outlined"
          />
          {isOverdue && (
            <Chip
              size="small"
              icon={<WarningIcon />}
              label={`${daysOverdue} days overdue`}
              color="error"
            />
          )}
        </Box>
      </Box>

      {/* Date Info */}
      <Box display="flex" gap={3} mb={2} flexWrap="wrap">
        <Box>
          <Typography variant="caption" color="text.secondary">
            Start Date
          </Typography>
          <Typography variant="body2" fontWeight={500}>
            {dayjs(startDate).format("DD MMM YYYY")}
          </Typography>
        </Box>
        {isCompleted ? (
          actualReturnDate && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Return Date
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {dayjs(actualReturnDate).format("DD MMM YYYY")}
              </Typography>
            </Box>
          )
        ) : (
          <>
            {expectedReturnDate && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Expected Return
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={500}
                  color={isOverdue ? "error.main" : "text.primary"}
                >
                  {dayjs(expectedReturnDate).format("DD MMM YYYY")}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary">
                As of
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {dayjs(currentDate).format("DD MMM YYYY")}
              </Typography>
            </Box>
          </>
        )}
      </Box>

      {/* Item Details Table */}
      {showItemDetails && itemsCost.length > 0 && (
        <>
          <Table size="small" sx={{ mb: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", py: 1 }}>
                  Item
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontWeight: 600, fontSize: "0.75rem", py: 1 }}
                >
                  Qty
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontWeight: 600, fontSize: "0.75rem", py: 1 }}
                >
                  Rate/Day
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontWeight: 600, fontSize: "0.75rem", py: 1 }}
                >
                  Days
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontWeight: 600, fontSize: "0.75rem", py: 1 }}
                >
                  Amount
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {itemsCost.map((item) => (
                <TableRow key={item.itemId}>
                  <TableCell sx={{ py: 0.75, fontSize: "0.8rem" }}>
                    <Box>
                      <Box display="flex" alignItems="center" flexWrap="wrap" gap={0.5}>
                        <Typography variant="body2" fontSize="0.8rem">
                          {item.itemName}
                        </Typography>
                        {item.size_label_snapshot && (
                          <Chip
                            label={item.size_label_snapshot}
                            size="small"
                            variant="outlined"
                            sx={{ ml: 0.5 }}
                          />
                        )}
                      </Box>
                      {item.quantityReturned > 0 && (
                        <Typography variant="caption" color="success.main">
                          {item.quantityReturned} returned
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.75, fontSize: "0.8rem" }}>
                    {item.quantityOutstanding}
                    {item.quantity !== item.quantityOutstanding && (
                      <Typography variant="caption" color="text.secondary">
                        /{item.quantity}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.75, fontSize: "0.8rem" }}>
                    ₹{item.dailyRate}
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.75, fontSize: "0.8rem" }}>
                    {item.daysRented}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ py: 0.75, fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    ₹{item.subtotal.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Divider sx={{ my: 1.5 }} />
        </>
      )}

      {/* Cost Summary */}
      <Box display="flex" flexDirection="column" gap={0.75}>
        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Items Subtotal
          </Typography>
          <Typography variant="body2">₹{subtotal.toLocaleString()}</Typography>
        </Box>

        {discountAmount > 0 && (
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="success.main">
              Discount
            </Typography>
            <Typography variant="body2" color="success.main">
              -₹{discountAmount.toLocaleString()}
            </Typography>
          </Box>
        )}

        {transportCostOutward > 0 && (() => {
          const isSettled = settledPartyTypes?.has("transport_inbound") || settledPartyTypes?.has("transport");
          return (
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Transport (Outward)
              </Typography>
              <Box display="flex" alignItems="center" gap={0.75}>
                <Typography variant="body2">₹{transportCostOutward.toLocaleString()}</Typography>
                {isSettled ? (
                  <CheckIcon sx={{ fontSize: 16 }} color="success" />
                ) : onSettleInbound ? (
                  <Tooltip title="Settle inbound transport">
                    <Chip
                      label="Settle"
                      size="small"
                      color="info"
                      variant="outlined"
                      onClick={onSettleInbound}
                      sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer" }}
                    />
                  </Tooltip>
                ) : null}
              </Box>
            </Box>
          );
        })()}

        {transportCostReturn > 0 && (() => {
          const isSettled = settledPartyTypes?.has("transport_outbound") || settledPartyTypes?.has("transport");
          return (
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Transport (Return)
              </Typography>
              <Box display="flex" alignItems="center" gap={0.75}>
                <Typography variant="body2">₹{transportCostReturn.toLocaleString()}</Typography>
                {isSettled ? (
                  <CheckIcon sx={{ fontSize: 16 }} color="success" />
                ) : onSettleOutbound ? (
                  <Tooltip title="Settle return transport">
                    <Chip
                      label="Settle"
                      size="small"
                      color="info"
                      variant="outlined"
                      onClick={onSettleOutbound}
                      sx={{ height: 20, fontSize: "0.65rem", cursor: "pointer" }}
                    />
                  </Tooltip>
                ) : null}
              </Box>
            </Box>
          );
        })()}

        {damagesCost > 0 && (
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="error.main">
              Damages
            </Typography>
            <Typography variant="body2" color="error.main">
              ₹{damagesCost.toLocaleString()}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 0.5 }} />

        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2" fontWeight={600}>
            Gross Total
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            ₹{grossTotal.toLocaleString()}
          </Typography>
        </Box>

        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2" color="success.main">
            Advances Paid
          </Typography>
          <Typography variant="body2" color="success.main">
            -₹{advancesPaid.toLocaleString()}
          </Typography>
        </Box>

        <Divider sx={{ my: 0.5 }} />

        {settlement ? (
          <Box
            display="flex"
            flexDirection="column"
            gap={0.5}
            p={1.5}
            bgcolor="success.50"
            borderRadius={1}
            border="1px solid"
            borderColor="success.200"
          >
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box display="flex" alignItems="center" gap={1}>
                <CheckIcon color="success" fontSize="small" />
                <Typography variant="subtitle2" fontWeight={700} color="success.dark">
                  Settled · {settlement.settlement_reference}
                </Typography>
              </Box>
              <Typography variant="subtitle1" fontWeight={700} color="success.dark">
                ₹{(settlement.negotiated_final_amount ?? grossTotal).toLocaleString()}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {dayjs(settlement.settlement_date).format("DD MMM YYYY")} · {settlement.payment_mode}
              {settlement.payer_source && ` · ${getPayerSourceLabel(settlement.payer_source as any, settlement.payer_name ?? undefined)}`}
            </Typography>
          </Box>
        ) : (
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            p={1}
            bgcolor={balanceDue > 0 ? "error.50" : "success.50"}
            borderRadius={1}
          >
            <Box display="flex" alignItems="center" gap={1}>
              {balanceDue <= 0 ? (
                <CheckIcon color="success" fontSize="small" />
              ) : (
                <WarningIcon color="error" fontSize="small" />
              )}
              <Typography variant="subtitle2" fontWeight={700}>
                {balanceDue > 0 ? "Balance Due" : "Credit Balance"}
              </Typography>
            </Box>
            <Typography
              variant="subtitle1"
              fontWeight={700}
              color={balanceDue > 0 ? "error.main" : "success.main"}
            >
              ₹{Math.abs(balanceDue).toLocaleString()}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
