"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Drawer,
  IconButton,
  Tabs,
  Tab,
  Typography,
  Divider,
  Chip,
  Stack,
  Button,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Close as CloseIcon,
  Payment as PaymentIcon,
  Receipt as BillIcon,
  Edit as EditIcon,
  Groups as GroupIcon,
  History as HistoryIcon,
} from "@mui/icons-material";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { BillPreviewButton } from "@/components/common/BillViewerDialog";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";
import { usePoLifecyclePhotos, type LifecyclePhoto } from "@/hooks/queries/usePoLifecyclePhotos";
import { usePoLifecycleActivity, type LifecycleEvent } from "@/hooks/queries/usePoLifecycleActivity";
import { useBatchSettlementSummary } from "@/hooks/queries/useBatchUsage";
import type { WorkPhoto } from "@/types/work-updates.types";
import type {
  MaterialPurchaseExpenseWithDetails,
  PurchaseOrderWithDetails,
} from "@/types/material.types";
import SourceChip from "./SourceChip";
import {
  getAgeInDays,
  getItemAmount,
  getItemDate,
  getItemRefCode,
  getItemVendorName,
  getSettlementType,
  isItemSettled,
  type SettlementItem,
} from "./settlementClassifiers";

interface Props {
  item: SettlementItem | null;
  open: boolean;
  onClose: () => void;
  currentSiteId: string | undefined;
  canEdit: boolean;
  onSettle: (item: SettlementItem) => void;
  onEdit: (purchase: MaterialPurchaseExpenseWithDetails) => void;
}

type TabKey = "bill" | "items" | "group" | "activity";

export default function SettlementInspectDrawer({
  item,
  open,
  onClose,
  currentSiteId,
  canEdit,
  onSettle,
  onEdit,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [tab, setTab] = useState<TabKey>("bill");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (open) setTab("bill");
  }, [open, item?.id]);

  useEffect(() => {
    if (!open) setLightboxOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Resolve PO id for lifecycle photos — works for both itemType=po and
  // itemType=expense (where PO is joined via purchase_order)
  const lifecyclePoId =
    item?.itemType === "po"
      ? (item as PurchaseOrderWithDetails).id
      : (item as MaterialPurchaseExpenseWithDetails | null)?.purchase_order?.id ?? null;
  const photosQuery = usePoLifecyclePhotos(open ? lifecyclePoId : null);
  const lifecyclePhotos: LifecyclePhoto[] = photosQuery.data ?? [];

  // Activity timeline — lazy-loaded when the user opens the Activity tab
  const expenseIdForActivity =
    item?.itemType === "expense" ? (item as MaterialPurchaseExpenseWithDetails).id : null;
  const activityQuery = usePoLifecycleActivity({
    poId: open && tab === "activity" ? lifecyclePoId : null,
    expenseId: open && tab === "activity" ? expenseIdForActivity : null,
  });
  const activityEvents: LifecycleEvent[] = activityQuery.data ?? [];
  const lightboxPhotos: WorkPhoto[] = lifecyclePhotos.map((p, i) => ({
    id: `lp-${i}`,
    url: p.url,
    description: p.caption,
    uploadedAt: p.recordedAt ?? "",
  }));

  // Originating group batch this expense was carved out of (self-use / from-
  // group allocations) — fetch its total value to show alongside "Source batch".
  const sourceBatchCode =
    item?.itemType === "expense"
      ? (item as MaterialPurchaseExpenseWithDetails).original_batch_code ?? undefined
      : undefined;
  const sourceBatchSummary = useBatchSettlementSummary(sourceBatchCode);

  if (!item) return null;

  const purchase = item.itemType === "expense" ? (item as MaterialPurchaseExpenseWithDetails) : null;
  const po = item.itemType === "po" ? (item as PurchaseOrderWithDetails) : null;
  const kind = getSettlementType(item);
  const settled = isItemSettled(item);
  const billUrl = po?.vendor_bill_url || purchase?.purchase_order?.vendor_bill_url || purchase?.bill_url || null;
  const billVerified = po?.bill_verified || purchase?.purchase_order?.bill_verified || false;
  const isCrossSiteRow = !!purchase && purchase.site_id !== currentSiteId;
  const showGroupTab = kind === "group_po";

  // Cost breakdown — prefer PO snapshot, fall back to summing line items
  const poData = po || purchase?.purchase_order || null;
  const itemsLineSum = (item.items || []).reduce((sum: number, li: any) => {
    const lineTotal = Number(li.total_price ?? li.total_amount ?? 0);
    return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);
  const breakdownSubtotal = Number(poData?.subtotal ?? 0) || itemsLineSum;
  const breakdownTax = Number(poData?.tax_amount ?? 0);
  const breakdownDiscount = Number(poData?.discount_amount ?? 0);
  const breakdownTransport = Number(poData?.transport_cost ?? 0);
  const breakdownOther = Number(poData?.other_charges ?? 0);
  const breakdownComputed =
    breakdownSubtotal + breakdownTax + breakdownTransport + breakdownOther - breakdownDiscount;
  const breakdownStored = getItemAmount(item);
  const breakdownMismatch = Math.abs(breakdownComputed - breakdownStored);
  const hasMismatch = breakdownMismatch >= 1; // ignore sub-rupee rounding

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant={isMobile ? "temporary" : "persistent"}
      ModalProps={{ keepMounted: false }}
      PaperProps={{
        sx: {
          width: isMobile ? "100%" : 480,
          border: 0,
          borderLeft: `1px solid ${theme.palette.divider}`,
          boxShadow: isMobile ? undefined : 8,
        },
      }}
      sx={{ ...(isMobile ? {} : { "& .MuiBackdrop-root": { display: "none" } }) }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ fontFamily: "monospace" }} noWrap>
              {getItemRefCode(item)}
            </Typography>
            <SourceChip item={item} />
          </Box>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {getItemVendorName(item)} · {formatDate(getItemDate(item))} · {getAgeInDays(item)}d ago
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close pane">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: `1px solid ${theme.palette.divider}`, minHeight: 40 }}
      >
        <Tab value="bill" label="Bill" sx={{ minHeight: 40, fontSize: "0.8rem" }} />
        <Tab value="items" label={`Items (${item.items?.length || 0})`} sx={{ minHeight: 40, fontSize: "0.8rem" }} />
        {showGroupTab && <Tab value="group" label="Group" sx={{ minHeight: 40, fontSize: "0.8rem" }} />}
        {lifecyclePoId && (
          <Tab value="activity" label="Activity" sx={{ minHeight: 40, fontSize: "0.8rem" }} />
        )}
      </Tabs>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {tab === "bill" && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Amount
              </Typography>
              <Typography variant="h5" fontWeight={700} color={settled ? "success.main" : "warning.main"}>
                {formatCurrency(getItemAmount(item))}
              </Typography>
              {purchase?.amount_paid && Number(purchase.amount_paid) !== Number(purchase.total_amount) && (
                <Typography variant="caption" color="success.main">
                  Paid {formatCurrency(Number(purchase.amount_paid))} · saved {formatCurrency(getItemAmount(item) - Number(purchase.amount_paid))}
                </Typography>
              )}
            </Box>

            {/* Cost breakdown — explains how the grand total was built */}
            {(breakdownSubtotal > 0 || breakdownTax > 0 || breakdownTransport > 0 || breakdownOther > 0 || breakdownDiscount > 0) && (
              <Box
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                  p: 1.5,
                  bgcolor: "background.default",
                }}
              >
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                  Cost breakdown
                </Typography>
                <Stack spacing={0.5}>
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body2" color="text.secondary">
                      Items subtotal
                    </Typography>
                    <Typography variant="body2">{formatCurrency(breakdownSubtotal)}</Typography>
                  </Box>
                  {breakdownTax > 0 && (
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2" color="text.secondary">
                        GST / Tax
                      </Typography>
                      <Typography variant="body2">+ {formatCurrency(breakdownTax)}</Typography>
                    </Box>
                  )}
                  {breakdownTransport > 0 && (
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2" color="text.secondary">
                        Transport
                      </Typography>
                      <Typography variant="body2">+ {formatCurrency(breakdownTransport)}</Typography>
                    </Box>
                  )}
                  {breakdownOther > 0 && (
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2" color="text.secondary">
                        Other charges
                      </Typography>
                      <Typography variant="body2">+ {formatCurrency(breakdownOther)}</Typography>
                    </Box>
                  )}
                  {breakdownDiscount > 0 && (
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2" color="text.secondary">
                        Discount
                      </Typography>
                      <Typography variant="body2" color="success.main">
                        − {formatCurrency(breakdownDiscount)}
                      </Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body2" fontWeight={700}>
                      Grand total
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {formatCurrency(breakdownComputed)}
                    </Typography>
                  </Box>
                </Stack>
                {hasMismatch && (
                  <Alert severity="warning" sx={{ mt: 1, py: 0.5, "& .MuiAlert-message": { py: 0.5 } }}>
                    <Typography variant="caption" sx={{ display: "block", fontWeight: 600 }}>
                      Stored total {formatCurrency(breakdownStored)} differs by{" "}
                      {formatCurrency(breakdownMismatch)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block" }}>
                      The saved amount on this purchase order doesn&apos;t match the line items + charges shown above. Re-open the PO and save again to recompute.
                    </Typography>
                  </Alert>
                )}
              </Box>
            )}

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Status
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                {settled ? (
                  <Chip
                    label={kind === "advance" ? "Advance paid" : kind === "group_po" ? "Vendor paid" : "Settled"}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                ) : (
                  <Chip label="Pending" size="small" color="warning" variant="outlined" />
                )}
              </Box>
            </Box>

            {purchase?.purchase_order?.po_number && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Purchase Order
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace", mt: 0.5 }}>
                  {purchase.purchase_order.po_number}
                </Typography>
              </Box>
            )}

            {purchase?.original_batch_code && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Source batch
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace", mt: 0.5 }}>
                  {purchase.original_batch_code}
                </Typography>
                {sourceBatchSummary.data && (
                  <Typography variant="caption" color="text.secondary">
                    Batch total {formatCurrency(sourceBatchSummary.data.total_amount)}
                    {sourceBatchSummary.data.paying_site_name
                      ? ` · paid by ${sourceBatchSummary.data.paying_site_name}`
                      : ""}
                  </Typography>
                )}
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Payer site
              </Typography>
              <Typography
                variant="body2"
                color={isCrossSiteRow ? "info.main" : "text.primary"}
                sx={{ mt: 0.5, fontWeight: isCrossSiteRow ? 600 : 400 }}
              >
                {purchase?.paying_site?.name || (purchase ? "This site" : "—")}
                {isCrossSiteRow && " (cross-site)"}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Vendor bill
              </Typography>
              {billUrl ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    icon={<BillIcon sx={{ fontSize: 14 }} />}
                    label={billVerified ? "Verified" : "Unverified"}
                    size="small"
                    color={billVerified ? "success" : "warning"}
                    variant="outlined"
                  />
                  <BillPreviewButton billUrl={billUrl} label="View bill" size="small" />
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No bill attached
                </Typography>
              )}
            </Box>

            {/* Lifecycle photos — every artefact attached along the PO's journey */}
            {lifecyclePoId && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Photos & attachments
                </Typography>
                {photosQuery.isLoading ? (
                  <Typography variant="body2" color="text.secondary">
                    Loading attachments…
                  </Typography>
                ) : lifecyclePhotos.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No photos attached for this purchase yet.
                  </Typography>
                ) : (
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                    {lifecyclePhotos.map((p, i) => (
                      <PhotoThumb
                        key={`${p.url}-${i}`}
                        photo={p}
                        onClick={() => {
                          setLightboxIndex(i);
                          setLightboxOpen(true);
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {purchase?.notes && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Notes
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {purchase.notes}
                </Typography>
              </Box>
            )}
          </Stack>
        )}

        {tab === "items" && (
          <Box>
            {item.items && item.items.length > 0 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell>Brand</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {item.items.map((lineItem: any, idx: number) => (
                    <TableRow key={lineItem.id || idx}>
                      <TableCell>
                        <Typography variant="body2">{lineItem.material?.name || "Unknown"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {lineItem.brand?.brand_name || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {lineItem.quantity} {lineItem.material?.unit || ""}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{formatCurrency(lineItem.unit_price || 0)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(lineItem.total_price || 0)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} align="right" sx={{ border: 0, pt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Items subtotal
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ border: 0, pt: 1 }}>
                      <Typography variant="body2">{formatCurrency(breakdownSubtotal)}</Typography>
                    </TableCell>
                  </TableRow>
                  {breakdownTax > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">
                          + GST / Tax
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="body2">{formatCurrency(breakdownTax)}</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {breakdownTransport > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">
                          + Transport
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="body2">{formatCurrency(breakdownTransport)}</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {breakdownOther > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">
                          + Other charges
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="body2">{formatCurrency(breakdownOther)}</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {breakdownDiscount > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">
                          − Discount
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ border: 0, py: 0.25 }}>
                        <Typography variant="body2" color="success.main">
                          − {formatCurrency(breakdownDiscount)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={4} align="right" sx={{ borderTop: `1px solid ${theme.palette.divider}`, pt: 1 }}>
                      <Typography variant="body2" fontWeight={700}>
                        Grand total
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderTop: `1px solid ${theme.palette.divider}`, pt: 1 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {formatCurrency(breakdownComputed)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  {hasMismatch && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ border: 0, pt: 1 }}>
                        <Typography variant="caption" color="warning.main">
                          ⚠ Stored amount {formatCurrency(breakdownStored)} differs from computed by {formatCurrency(breakdownMismatch)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableFooter>
              </Table>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No line items recorded for this purchase.
              </Typography>
            )}
          </Box>
        )}

        {tab === "activity" && lifecyclePoId && (
          <Stack spacing={1.5}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <HistoryIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" fontWeight={700}>
                Lifecycle activity
              </Typography>
            </Box>

            {activityQuery.isLoading ? (
              <Typography variant="body2" color="text.secondary">
                Loading activity…
              </Typography>
            ) : activityEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No activity recorded yet.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {activityEvents.map((ev, i) => (
                  <ActivityRow key={`${ev.at ?? "noat"}-${i}`} event={ev} />
                ))}
              </Stack>
            )}

            <Alert severity="info" sx={{ mt: 1, py: 0.5, "& .MuiAlert-message": { py: 0.5 } }}>
              <Typography variant="caption">
                Edit history (e.g. who added transport cost after the PO was created) isn&apos;t
                captured yet — only creation, approval, delivery, verification, and settlement
                actors are shown.
              </Typography>
            </Alert>
          </Stack>
        )}

        {tab === "group" && showGroupTab && purchase && (
          <Stack spacing={2}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <GroupIcon color="secondary" />
              <Typography variant="subtitle2" fontWeight={700}>
                Group Purchase
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              This vendor bill is owned by a site group. Any member site can record the vendor payment
              and (re)assign the paying site at the moment of settlement.
            </Typography>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Currently assigned payer
              </Typography>
              <Chip
                icon={<GroupIcon sx={{ fontSize: 14 }} />}
                label={purchase.paying_site?.name || "Original site"}
                size="small"
                color="secondary"
                variant="outlined"
                sx={{ mt: 0.5 }}
              />
            </Box>
            {isCrossSiteRow && (
              <Typography variant="caption" color="info.main">
                You can settle this on behalf of {purchase.paying_site?.name || "the original site"}, or
                reassign the payer to your current site in the Settle dialog.
              </Typography>
            )}
          </Stack>
        )}
      </Box>

      {/* Footer actions */}
      <Box
        sx={{
          borderTop: `1px solid ${theme.palette.divider}`,
          p: 1.5,
          display: "flex",
          gap: 1,
          justifyContent: "flex-end",
        }}
      >
        {canEdit && purchase && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => onEdit(purchase)}
          >
            Edit
          </Button>
        )}
        {canEdit && !settled && (
          <Button
            size="small"
            variant="contained"
            startIcon={<PaymentIcon />}
            onClick={() => onSettle(item)}
          >
            Settle
          </Button>
        )}
      </Box>

      <PhotoLightbox
        open={lightboxOpen}
        photos={lightboxPhotos}
        startIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────
// One row in the Activity timeline — phase chip + actor + relative time

function ActivityRow({ event }: { event: LifecycleEvent }) {
  const theme = useTheme();
  const phasePalette: Record<LifecycleEvent["phase"], string> = {
    request: theme.palette.primary.main,
    po: theme.palette.info.main,
    delivery: theme.palette.warning.main,
    bill: theme.palette.secondary.main,
    settlement: theme.palette.success.main,
  };
  const dotColor = phasePalette[event.phase];

  return (
    <Box sx={{ display: "flex", gap: 1.25 }}>
      <Box
        sx={{
          flexShrink: 0,
          width: 10,
          height: 10,
          mt: 0.75,
          borderRadius: "50%",
          bgcolor: dotColor,
          boxShadow: `0 0 0 3px ${theme.palette.background.paper}, 0 0 0 4px ${dotColor}33`,
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {event.action}
        </Typography>
        {event.detail && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", fontFamily: event.detail.match(/^[A-Z0-9-]+$/) ? "monospace" : undefined }}
          >
            {event.detail}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {event.by} · {event.at ? formatDate(event.at) : "no timestamp"}
        </Typography>
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Thumbnail used inside the lifecycle photo grid. Pulls source-coloured
// border + a stage label so engineers can tell delivery photos from
// verification photos at a glance.

function PhotoThumb({
  photo,
  onClick,
}: {
  photo: LifecyclePhoto;
  onClick: () => void;
}) {
  const theme = useTheme();
  const palette: Record<LifecyclePhoto["source"], { border: string; label: string }> = {
    delivery: { border: theme.palette.info.main, label: "Delivery" },
    verification: { border: theme.palette.success.main, label: "Verified" },
    invoice: { border: theme.palette.warning.main, label: "Invoice" },
    challan: { border: theme.palette.secondary.main, label: "Challan" },
    vendor_bill: { border: theme.palette.warning.dark, label: "Bill" },
    request: { border: theme.palette.primary.main, label: "Request" },
  };
  const { border, label } = palette[photo.source];
  const isPdf = /\.pdf($|\?)/i.test(photo.url);

  return (
    <Box
      onClick={onClick}
      sx={{
        position: "relative",
        cursor: "pointer",
        borderRadius: 1,
        overflow: "hidden",
        border: `2px solid ${border}`,
        aspectRatio: "1 / 1",
        bgcolor: "grey.100",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        "&:hover": { opacity: 0.85 },
      }}
    >
      {isPdf ? (
        <Stack alignItems="center" spacing={0.25}>
          <BillIcon sx={{ color: border, fontSize: 28 }} />
          <Typography variant="caption" color="text.secondary">
            PDF
          </Typography>
        </Stack>
      ) : (
        <Box
          component="img"
          src={photo.url}
          alt={photo.caption}
          loading="lazy"
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      <Chip
        label={label}
        size="small"
        sx={{
          position: "absolute",
          bottom: 4,
          left: 4,
          height: 18,
          fontSize: "0.65rem",
          bgcolor: "rgba(0,0,0,0.65)",
          color: "white",
          "& .MuiChip-label": { px: 0.75 },
        }}
      />
    </Box>
  );
}
