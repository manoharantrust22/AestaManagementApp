"use client";

import {
  Box,
  Drawer,
  Typography,
  IconButton,
  Divider,
  Paper,
  Tooltip,
  Button,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Description as BillIcon,
  Receipt as ReceiptIcon,
  Screenshot as UpiIcon,
  Build as RentalIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { useRentalOrder } from "@/hooks/queries/useRentals";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getPayerSourceLabel } from "@/components/settlement/PayerSourceSelector";
import dayjs from "dayjs";

interface Props {
  orderId: string | null;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" textAlign="right">
        {value || "—"}
      </Typography>
    </Box>
  );
}

export default function RentalExpenseInspectPane({ orderId, onClose }: Props) {
  const router = useRouter();
  const { data: order, isLoading } = useRentalOrder(orderId ?? "");

  const settlement = order?.settlements?.[0] as any ?? null;
  const items = order?.items ?? [];
  const firstItem = items[0];

  const grossTotal = settlement
    ? ((settlement.total_rental_amount || 0) + (settlement.total_transport_amount || 0) + (settlement.total_damage_amount || 0))
    : 0;
  const finalAmount = settlement?.negotiated_final_amount ?? grossTotal;

  const durationLabel = (() => {
    if (!order) return "—";
    const hasHourly = items.some((i: any) => i.rate_type === "hourly");
    if (hasHourly) {
      const hrs = items.reduce((s: number, i: any) => s + (i.hours_used || 0), 0);
      return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
    }
    const end = order.actual_return_date || order.expected_return_date || order.start_date;
    const days = Math.max(1, dayjs(end).diff(dayjs(order.start_date), "day") + 1);
    return `${days} day${days !== 1 ? "s" : ""}`;
  })();

  return (
    <Drawer
      anchor="right"
      open={!!orderId}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 360 } } }}
    >
      <Box sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <RentalIcon color="action" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={600}>
              {isLoading ? "Loading…" : (firstItem?.rental_item?.name ? `${firstItem.rental_item.name} Rental` : "Rental")}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="caption" color="text.secondary" mb={2} display="block">
          {order?.rental_order_number ?? "—"}
        </Typography>

        {isLoading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!isLoading && order && (
          <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Vendor & Item */}
            <Box display="flex" flexDirection="column" gap={0.75}>
              <Row label="Vendor" value={order.vendor?.shop_name || order.vendor?.name} />
              <Row label="Phone" value={order.vendor?.phone} />
              {firstItem && (
                <Row
                  label="Item"
                  value={`${firstItem.rental_item?.name ?? "—"}${firstItem.rental_item?.code ? ` (${firstItem.rental_item.code})` : ""}`}
                />
              )}
              <Row label="Duration" value={`${durationLabel} (${formatDate(order.start_date)})`} />
            </Box>

            <Divider />

            {/* Cost Breakdown */}
            <Box display="flex" flexDirection="column" gap={0.75}>
              {settlement && (
                <>
                  <Row label="Rental Amt" value={formatCurrency(settlement.total_rental_amount || 0)} />
                  {(settlement.total_transport_amount || 0) > 0 && (
                    <Row label="Transport" value={formatCurrency(settlement.total_transport_amount)} />
                  )}
                  {(settlement.total_damage_amount || 0) > 0 && (
                    <Row label="Damages" value={formatCurrency(settlement.total_damage_amount)} />
                  )}
                  <Divider sx={{ my: 0.5 }} />
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>Gross Total</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatCurrency(grossTotal)}</Typography>
                  </Box>
                  {settlement.negotiated_final_amount && settlement.negotiated_final_amount !== grossTotal && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="success.main">Negotiated</Typography>
                      <Typography variant="body2" color="success.main">{formatCurrency(finalAmount)}</Typography>
                    </Box>
                  )}
                </>
              )}
            </Box>

            {settlement && (
              <>
                <Divider />

                {/* Settlement Details */}
                <Box display="flex" flexDirection="column" gap={0.75}>
                  <Row label="Ref" value={settlement.settlement_reference} />
                  <Row label="Settled" value={formatDate(settlement.settlement_date)} />
                  {settlement.payer_source && (
                    <Row
                      label="Paid by"
                      value={getPayerSourceLabel(settlement.payer_source, settlement.payer_name)}
                    />
                  )}
                  <Row label="Mode" value={settlement.payment_mode} />
                  {settlement.settled_by_name && (
                    <Row label="Settled by" value={settlement.settled_by_name} />
                  )}
                </Box>

                {/* Proof Attachments */}
                {(settlement.vendor_bill_url || settlement.final_receipt_url || settlement.upi_screenshot_url) && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                        Attachments
                      </Typography>
                      <Box display="flex" gap={1}>
                        {[
                          { url: settlement.vendor_bill_url, label: "Vendor Bill", icon: <BillIcon /> },
                          { url: settlement.final_receipt_url, label: "Final Receipt", icon: <ReceiptIcon /> },
                          { url: settlement.upi_screenshot_url, label: "UPI Proof", icon: <UpiIcon /> },
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
                  </>
                )}
              </>
            )}
          </Box>
        )}

        {/* Footer */}
        {order && (
          <Box mt={2} pt={2} borderTop="1px solid" borderColor="divider">
            <Button
              fullWidth
              variant="outlined"
              endIcon={<OpenInNewIcon />}
              onClick={() => {
                router.push(`/site/rentals/${order.id}`);
                onClose();
              }}
            >
              View Rental Order
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
