"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Stack,
  Typography,
  Chip,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  Close as CloseIcon,
  CheckCircle as VerifiedIcon,
  Warning as DisputedIcon,
  Cancel as RejectedIcon,
  ReceiptLong as ReceiptIcon,
  ShoppingCart as POIcon,
  Assignment as RequestIcon,
  Schedule as ClockIcon,
  Event as EventIcon,
  Store as VendorIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/formatters";

interface DeliveryAuditDialogProps {
  open: boolean;
  onClose: () => void;
  deliveryId: string | null;
}

interface AuditItem {
  received_qty: number | null;
  accepted_qty: number | null;
  rejected_qty: number | null;
  unit_price: number | null;
  material: { name: string | null; unit: string | null } | null;
}

interface AuditDelivery {
  id: string;
  grn_number: string | null;
  delivery_date: string | null;
  recorded_at: string | null;
  created_at: string | null;
  verification_status: string | null;
  verification_notes: string | null;
  delivery_photos: string[] | null;
  verification_photos: string[] | null;
  challan_number: string | null;
  challan_url: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  vendor: { name: string | null } | null;
  po: {
    po_number: string | null;
    request: { request_number: string | null } | null;
  } | null;
  items: AuditItem[];
}

const statusChip: Record<
  string,
  { icon: React.ReactElement; color: "success" | "warning" | "error" | "default"; label: string }
> = {
  verified: { icon: <VerifiedIcon fontSize="small" />, color: "success", label: "Verified" },
  disputed: { icon: <DisputedIcon fontSize="small" />, color: "warning", label: "Disputed" },
  rejected: { icon: <RejectedIcon fontSize="small" />, color: "error", label: "Rejected" },
  pending: { icon: <DisputedIcon fontSize="small" />, color: "default", label: "Pending" },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A single labelled fact row in the audit trail. */
function FactRow({
  icon,
  label,
  value,
  emphasize,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography
          variant="body2"
          fontWeight={emphasize ? 700 : 500}
          color={emphasize ? "warning.main" : "text.primary"}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

export default function DeliveryAuditDialog({
  open,
  onClose,
  deliveryId,
}: DeliveryAuditDialogProps) {
  const supabase = createClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["delivery-audit", deliveryId],
    enabled: open && !!deliveryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select(
          `
          id, grn_number, delivery_date, recorded_at, created_at,
          verification_status, verification_notes,
          delivery_photos, verification_photos,
          challan_number, challan_url, vehicle_number, driver_name,
          vendor:vendors(name),
          po:purchase_orders!po_id(
            po_number,
            request:material_requests!source_request_id(request_number)
          ),
          items:delivery_items(
            received_qty, accepted_qty, rejected_qty, unit_price,
            material:materials(name, unit)
          )
        `
        )
        .eq("id", deliveryId as string)
        .single();
      if (error) throw error;
      return data as unknown as AuditDelivery;
    },
  });

  // Photos: delivery photos first, then any extra verification photos, de-duped
  const photos = Array.from(
    new Set([...(data?.delivery_photos || []), ...(data?.verification_photos || [])])
  ).filter(Boolean);

  const status = (data?.verification_status || "verified").toLowerCase();
  const chip = statusChip[status] || statusChip.verified;

  // Was the delivery back-dated? (delivery_date earlier than the day it was recorded)
  const recordedDay = data?.recorded_at || data?.created_at;
  const backDated =
    data?.delivery_date &&
    recordedDay &&
    new Date(recordedDay).toDateString() !== new Date(data.delivery_date).toDateString();

  const itemsTotal = (data?.items || []).reduce(
    (sum, it) => sum + (it.accepted_qty ?? it.received_qty ?? 0) * (it.unit_price ?? 0),
    0
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ReceiptIcon color="primary" />
          <Box>
            <Typography variant="h6" component="span">
              Delivery Audit
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data?.grn_number || "—"}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : isError || !data ? (
          <Alert severity="error">Could not load this delivery&apos;s audit details.</Alert>
        ) : (
          <Stack spacing={2}>
            {/* Status + back-dated warning */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Chip icon={chip.icon} label={chip.label} size="small" color={chip.color} />
              {backDated && (
                <Chip
                  size="small"
                  variant="outlined"
                  color="warning"
                  label="Delivery date is back-dated"
                />
              )}
            </Box>

            {/* Order trail */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                Order trail
              </Typography>
              <Stack spacing={1.5}>
                <FactRow
                  icon={<RequestIcon fontSize="small" />}
                  label="Material Request"
                  value={data.po?.request?.request_number || "— (direct / no request)"}
                />
                <FactRow
                  icon={<POIcon fontSize="small" />}
                  label="Purchase Order"
                  value={data.po?.po_number || "— (direct delivery)"}
                />
                <FactRow
                  icon={<VendorIcon fontSize="small" />}
                  label="Vendor"
                  value={data.vendor?.name || "—"}
                />
              </Stack>
            </Paper>

            {/* Timeline — delivery date vs when it was actually recorded */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                When
              </Typography>
              <Stack spacing={1.5}>
                <FactRow
                  icon={<EventIcon fontSize="small" />}
                  label="Delivery date (as entered)"
                  value={fmtDate(data.delivery_date)}
                  emphasize={!!backDated}
                />
                <FactRow
                  icon={<ClockIcon fontSize="small" />}
                  label="Recorded in app"
                  value={fmtDateTime(data.recorded_at || data.created_at)}
                  emphasize={!!backDated}
                />
                {(data.vehicle_number || data.driver_name || data.challan_number) && (
                  <FactRow
                    icon={<ReceiptIcon fontSize="small" />}
                    label="Transport / challan"
                    value={[data.challan_number, data.vehicle_number, data.driver_name]
                      .filter(Boolean)
                      .join(" • ")}
                  />
                )}
              </Stack>
            </Paper>

            {/* Items delivered */}
            <Paper variant="outlined">
              <Box sx={{ px: 2, pt: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Items delivered
                </Typography>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Received</TableCell>
                    <TableCell align="right">Accepted</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.items || []).map((it, idx) => {
                    const accepted = it.accepted_qty ?? it.received_qty ?? 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Typography variant="body2">
                            {it.material?.name || "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {it.material?.unit}
                            {it.unit_price ? ` • ${formatCurrency(it.unit_price)}/unit` : ""}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{it.received_qty ?? 0}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="success.main">
                            {accepted}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(accepted * (it.unit_price ?? 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell colSpan={3} align="right">
                      <Typography variant="body2" fontWeight={600}>
                        Total
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(itemsTotal)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>

            {data.verification_notes && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                  Notes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.verification_notes}
                </Typography>
              </Paper>
            )}

            {/* Photos */}
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Delivery photos ({photos.length})
              </Typography>
              {photos.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No photos were attached to this delivery.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {photos.map((url, idx) => (
                    <Box
                      key={idx}
                      component="a"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        width: 88,
                        height: 88,
                        borderRadius: 1,
                        overflow: "hidden",
                        border: "1px solid",
                        borderColor: "divider",
                        display: "block",
                      }}
                    >
                      <img
                        src={url}
                        alt={`Delivery photo ${idx + 1}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
