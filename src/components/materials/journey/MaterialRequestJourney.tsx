"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Chip,
  alpha,
  useTheme,
  Skeleton,
} from "@mui/material";
import { useRequestJourney } from "@/hooks/queries/useRequestJourney";
import type { JourneyPhaseStatus, RequestJourney } from "@/types/journey.types";
import { JourneyHeader } from "./JourneyHeader";
import { JourneyStatusStrip } from "./JourneyStatusStrip";
import { JourneyPhaseBar, type PhaseBarStep } from "./JourneyPhaseBar";
import { JourneyPhaseCard } from "./JourneyPhaseCard";
import { JourneyBlockerBanner } from "./JourneyBlockerBanner";
import { JourneyGroupSiteSplit } from "./JourneyGroupSiteSplit";
import { JourneyExpenseSection } from "./JourneyExpenseSection";
import { formatCurrency } from "@/lib/formatters";
import dayjs from "dayjs";
import { useJourneyWatch } from "@/contexts/JourneyWatchContext";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";
import type { WorkPhoto } from "@/types/work-updates.types";

interface MaterialRequestJourneyProps {
  requestId: string | null | undefined;
  isFullPage: boolean;
}

// ── Phase derivation helpers ──────────────────────────────────────────────────

function deriveRequestPhaseStatus(journey: RequestJourney): JourneyPhaseStatus {
  const s = journey.request.status;
  if (s === "approved" || s === "ordered" || s === "fulfilled" || s === "partial_fulfilled") return "done";
  if (s === "rejected") return "blocked";
  return "active";
}

function derivePOPhaseStatus(journey: RequestJourney): JourneyPhaseStatus {
  if (!journey.po) return "pending";
  const s = journey.po.status;
  if (s === "delivered") return "done";
  return "active";
}

function deriveDeliveryPhaseStatus(journey: RequestJourney): JourneyPhaseStatus {
  if (journey.deliveries.length === 0) return "pending";
  const anyNotVerified = journey.deliveries.some(
    (d) => d.verification_status !== "verified"
  );
  if (anyNotVerified) return "active";
  return "done";
}

function deriveVendorPaymentPhaseStatus(journey: RequestJourney): JourneyPhaseStatus {
  const deliveriesVerified = journey.deliveries.length > 0 &&
    journey.deliveries.every((d) => d.verification_status === "verified");
  if (!journey.expense) {
    return deliveriesVerified ? "active" : "pending";
  }
  if (!deliveriesVerified) return "blocked";
  return journey.expense.is_paid ? "done" : "active";
}

function deriveSettlementPhaseStatus(journey: RequestJourney): JourneyPhaseStatus {
  if (!journey.expense?.is_paid) return "blocked";
  if (!journey.settlement) return "pending";
  if (journey.settlement.status === "settled") return "done";
  return "active";
}

// ── Phase bar derivation ──────────────────────────────────────────────────────

function derivePhases(journey: RequestJourney): PhaseBarStep[] {
  const base: PhaseBarStep[] = [
    { name: "Request", status: deriveRequestPhaseStatus(journey) },
    { name: "PO Created", status: derivePOPhaseStatus(journey) },
    { name: "Delivery", status: deriveDeliveryPhaseStatus(journey) },
    { name: "Vendor Paid", status: deriveVendorPaymentPhaseStatus(journey) },
  ];

  if (journey.isGroupPO) {
    base.push({ name: "Settlement", status: deriveSettlementPhaseStatus(journey) });
  }

  return base;
}

// ── Phase card field helpers ──────────────────────────────────────────────────

function fmt(v: string | null | undefined, fallback = "—"): string {
  return (v !== null && v !== undefined && v !== "") ? v : fallback;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return dayjs(d).format("DD MMM YYYY");
}

function fmtNum(n: number | null | undefined, fallback = "—"): string {
  if (n == null) return fallback;
  return n.toFixed(2);
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return formatCurrency(n);
}

function deliveryPhotos(delivery: RequestJourney["deliveries"][0]): WorkPhoto[] {
  const photos: WorkPhoto[] = [];
  const raw = delivery.delivery_photos as string[] | null;
  const verif = delivery.verification_photos as string[] | null;
  (raw ?? []).forEach((url, i) =>
    photos.push({ id: `dp-${i}`, url, description: "Delivery photo", uploadedAt: "" })
  );
  (verif ?? []).forEach((url, i) =>
    photos.push({ id: `vp-${i}`, url, description: "Verification photo", uploadedAt: "" })
  );
  if (delivery.invoice_url) {
    photos.push({ id: "invoice", url: delivery.invoice_url, description: "Invoice / Bill", uploadedAt: "" });
  }
  if (delivery.challan_url) {
    photos.push({ id: "challan", url: delivery.challan_url, description: "Delivery Challan", uploadedAt: "" });
  }
  return photos;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function JourneySkeleton() {
  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 1.5 }} />
      <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1.5 }} />
      <Skeleton variant="rectangular" height={30} sx={{ borderRadius: 1.5 }} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 1.5 }} />
      ))}
    </Box>
  );
}

// ── GroupStockChip helper ─────────────────────────────────────────────────────

function GroupStockChip() {
  return (
    <Chip
      label="GROUP STOCK"
      size="small"
      sx={{
        height: 18,
        fontSize: "0.65rem",
        fontWeight: 700,
        bgcolor: "purple",
        color: "white",
        mt: 0.5,
        "& .MuiChip-label": { px: 0.75 },
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MaterialRequestJourney({
  requestId,
  isFullPage,
}: MaterialRequestJourneyProps) {
  const theme = useTheme();
  const { journey, isLoading, error } = useRequestJourney(requestId);
  const { activateJourney } = useJourneyWatch();
  const [lightbox, setLightbox] = useState<{ photos: WorkPhoto[]; startIndex: number } | null>(null);

  useEffect(() => {
    if (requestId) activateJourney(requestId);
  }, [requestId, activateJourney]);

  if (!requestId) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Select a request to view its journey.
        </Typography>
      </Box>
    );
  }

  if (isLoading) return <JourneySkeleton />;

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="error">
          Failed to load journey: {error.message}
        </Typography>
      </Box>
    );
  }

  if (!journey) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No journey found.
        </Typography>
      </Box>
    );
  }

  const { request, po, deliveries, expense, settlement, isGroupPO } = journey;

  const phases = derivePhases(journey);

  // ── Blocker logic ────────────────────────────────────────────────────────
  const isAllDeliveriesVerified =
    deliveries.length > 0 &&
    deliveries.every((d) => d.verification_status === "verified");
  const showBlocker =
    isGroupPO &&
    journey.overallStatus === "delivery_verified" &&
    !expense?.is_paid;

  // ── Request phase card ────────────────────────────────────────────────────
  const requestStatus = deriveRequestPhaseStatus(journey);
  const requestFields = [
    { label: "Request #", value: request.request_number, variant: "mono" as const },
    { label: "Priority", value: request.priority ?? "—" },
    {
      label: "Approved by",
      value: fmt(
        request.approved_by_user?.name ??
        request.approved_by_user?.display_name ??
        request.approved_by
      ),
    },
    { label: "Date", value: fmtDate(request.request_date) },
    {
      label: "Qty Requested",
      value: fmtNum(request.items?.[0]?.requested_qty),
    },
    {
      label: "Qty Approved",
      value: fmtNum(request.items?.[0]?.approved_qty),
    },
    {
      label: "Est. Cost",
      value:
        journey.brandAvgPrice != null
          ? `~${fmtMoney(journey.brandAvgPrice)}/unit`
          : fmtMoney(request.items?.[0]?.estimated_cost),
      variant: "amount" as const,
    },
    {
      label: "Order Type",
      value: isGroupPO ? "Group PO" : "Own Site",
      variant: isGroupPO ? ("blue" as const) : ("default" as const),
    },
  ];
  const requestStatusLabel =
    requestStatus === "done"
      ? `✓ ${request.status}`
      : requestStatus === "blocked"
      ? `✗ Rejected`
      : `Pending · ${request.status}`;

  // ── PO phase card ─────────────────────────────────────────────────────────
  const poStatus = derivePOPhaseStatus(journey);
  const poFields = po
    ? [
        { label: "PO #", value: po.po_number, variant: "mono" as const },
        { label: "Status", value: po.status.replace(/_/g, " ") },
        {
          label: "Qty Ordered",
          value: fmtNum(po.items?.[0]?.quantity),
        },
        {
          label: "Unit Price",
          value: fmtMoney(po.items?.[0]?.unit_price),
          variant: "amount" as const,
        },
        {
          label: "Total Amount",
          value: fmtMoney(po.total_amount),
          variant: "amount" as const,
        },
        {
          label: "Exp. Delivery",
          value: fmtDate(po.expected_delivery_date),
        },
        { label: "Payment Terms", value: fmt(po.payment_terms) },
        { label: "Bill Verified", value: po.bill_verified ? "Yes" : "No" },
      ]
    : [];
  const poStatusLabel = !po
    ? "Waiting for PO"
    : poStatus === "done"
    ? `✓ Delivered`
    : `Active · ${po.status.replace(/_/g, " ")}`;
  const poActions = po
    ? [
        {
          label: "→ Open PO",
          href: `/site/purchase-orders?highlight=${po.po_number}`,
        },
      ]
    : [];

  // ── Delivery phase card ───────────────────────────────────────────────────
  const deliveryStatus = deriveDeliveryPhaseStatus(journey);
  const firstDelivery = deliveries[0];
  const deliveryFields = firstDelivery
    ? [
        {
          label: "GRN #",
          value: firstDelivery.grn_number,
          variant: "mono" as const,
        },
        { label: "Delivery Date", value: fmtDate(firstDelivery.delivery_date) },
        {
          label: "Received Qty",
          value: fmtNum(firstDelivery.items?.[0]?.received_qty),
        },
        {
          label: "Verification",
          value: firstDelivery.verification_status?.replace(/_/g, " ") ?? "—",
          variant:
            firstDelivery.verification_status === "verified"
              ? ("green" as const)
              : firstDelivery.verification_status === "rejected"
              ? ("red" as const)
              : ("default" as const),
        },
        {
          label: "Deliveries",
          value: String(deliveries.length),
        },
      ]
    : [];
  const hasPendingVerification = deliveries.some(
    (d) => d.verification_status !== "verified"
  );
  const deliveryActions = po
    ? [
        ...(hasPendingVerification
          ? [
              {
                label: "→ Verify Delivery",
                href: `/site/delivery-verification?grn=${firstDelivery?.grn_number ?? ""}`,
                variant: "primary" as const,
              },
            ]
          : []),
        ...(firstDelivery
          ? [
              {
                label: "→ Open GRN",
                href: `/site/delivery-verification?grn=${firstDelivery.grn_number}`,
                variant: "secondary" as const,
              },
            ]
          : []),
      ]
    : [];
  const deliveryStatusLabel =
    deliveries.length === 0
      ? "Awaiting Delivery"
      : deliveryStatus === "done"
      ? `✓ ${deliveries.length} delivery verified`
      : `${deliveries.length} delivery · pending verification`;

  // ── Vendor payment phase card ─────────────────────────────────────────────
  const vendorPaymentStatus = deriveVendorPaymentPhaseStatus(journey);
  const vendorPaymentFields = expense
    ? [
        {
          label: "Total Due",
          value: fmtMoney(expense.total_amount),
          variant: "amount" as const,
        },
        {
          label: "Amount Paid",
          value: fmtMoney(expense.amount_paid),
          variant: expense.is_paid ? ("green" as const) : ("default" as const),
        },
        {
          label: "Pending",
          value: fmtMoney(
            expense.total_amount - (expense.amount_paid ?? 0)
          ),
          variant: expense.is_paid ? ("muted" as const) : ("red" as const),
        },
        { label: "Payment Terms", value: fmt(po?.payment_terms) },
        {
          label: "Bill Verified",
          value: po?.bill_verified ? "Yes" : "No",
          variant: po?.bill_verified ? ("green" as const) : ("default" as const),
        },
        {
          label: "Payment Mode",
          value: expense.payment_mode?.replace(/_/g, " ") ?? "—",
        },
      ]
    : [];
  const vendorPaymentActions = po
    ? [
        ...(!expense?.is_paid
          ? [
              {
                label: "→ Record Payment",
                href: `/site/material-expenses?po=${po.po_number}`,
                variant: "warn" as const,
              },
            ]
          : []),
        ...(expense
          ? [
              {
                label: "→ Open Expense",
                href: `/site/material-expenses?po=${po.po_number}`,
                variant: "secondary" as const,
              },
            ]
          : []),
      ]
    : [];
  const vendorPaymentStatusLabel = !expense
    ? "Awaiting Payment Record"
    : expense.is_paid
    ? `✓ Paid ${fmtDate(expense.paid_date)}`
    : vendorPaymentStatus === "blocked"
    ? "Blocked · Delivery pending"
    : "Unpaid";

  // ── Settlement phase card (group PO only) ─────────────────────────────────
  const settlementStatus = deriveSettlementPhaseStatus(journey);
  const settlementFields = settlement
    ? [
        {
          label: "Code",
          value: settlement.settlement_code,
          variant: "mono" as const,
        },
        {
          label: "Period",
          value: `${fmtDate(settlement.period_start)} – ${fmtDate(settlement.period_end)}`,
        },
        {
          label: "Total",
          value: fmtMoney(settlement.total_amount),
          variant: "amount" as const,
        },
        {
          label: "Paid",
          value: fmtMoney(settlement.paid_amount),
          variant: ("green" as const),
        },
        {
          label: "Pending",
          value: fmtMoney(settlement.pending_amount),
          variant: settlement.pending_amount > 0 ? ("red" as const) : ("muted" as const),
        },
        {
          label: "Status",
          value: settlement.status.replace(/_/g, " "),
          variant:
            settlement.status === "settled"
              ? ("green" as const)
              : ("default" as const),
        },
      ]
    : [];
  const settlementActions = settlement
    ? [
        {
          label: "→ Open Settlement",
          href: `/site/inter-site-settlement?code=${settlement.settlement_code}`,
          variant: "secondary" as const,
        },
      ]
    : [];
  const settlementStatusLabel =
    settlementStatus === "blocked"
      ? "Blocked · Vendor unpaid"
      : !settlement
      ? "Pending"
      : settlement.status === "settled"
      ? "✓ Settled"
      : `Active · ${settlement.status.replace(/_/g, " ")}`;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
        bgcolor: "background.paper",
      }}
    >
      {/* 1. Header */}
      <JourneyHeader journey={journey} isFullPage={isFullPage} />

      {/* 2. Status strip */}
      <JourneyStatusStrip journey={journey} />

      {/* 3. Phase bar */}
      <JourneyPhaseBar phases={phases} />

      {/* 4. Phase cards */}
      <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {/* Request */}
        <JourneyPhaseCard
          status={requestStatus}
          title="Material Request"
          icon="📋"
          statusLabel={requestStatusLabel}
          fields={requestFields}
          actions={[
            {
              label: "→ Open Request",
              href: `/site/material-requests?highlight=${request.request_number}`,
              variant: "secondary",
            },
          ]}
        />

        {/* PO */}
        <JourneyPhaseCard
          status={poStatus}
          title="Purchase Order"
          icon="🛒"
          statusLabel={poStatusLabel}
          fields={poFields}
          actions={poActions}
        >
          {/* Brand + variant thumbnail */}
          {(() => {
            const brand = po?.items?.[0]?.brand ?? null;
            if (!brand) return isGroupPO ? <GroupStockChip /> : null;
            return (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                {brand.image_url ? (
                  <Box
                    component="img"
                    src={brand.image_url}
                    alt={brand.brand_name}
                    sx={{ width: 40, height: 40, objectFit: "cover", borderRadius: 1, flexShrink: 0 }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 40, height: 40, borderRadius: 1, flexShrink: 0,
                      bgcolor: "action.hover",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Typography variant="caption" color="text.disabled">IMG</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" fontWeight={600} display="block" lineHeight={1.2}>
                    {brand.brand_name}
                  </Typography>
                  {brand.variant_name && (
                    <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                      {brand.variant_name}
                    </Typography>
                  )}
                </Box>
                {isGroupPO && <GroupStockChip />}
              </Box>
            );
          })()}
        </JourneyPhaseCard>

        {/* Delivery */}
        <JourneyPhaseCard
          status={deliveryStatus}
          title="Delivery"
          icon="🚛"
          statusLabel={deliveryStatusLabel}
          fields={deliveryFields}
          actions={deliveryActions}
        >
          {firstDelivery && (() => {
            const photos = deliveryPhotos(firstDelivery);
            if (photos.length === 0) return null;
            return (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
                {photos.map((photo, idx) => (
                  <Box
                    key={photo.id}
                    onClick={() => setLightbox({ photos, startIndex: idx })}
                    sx={{
                      width: 56, height: 56, borderRadius: 1, overflow: "hidden",
                      cursor: "pointer", flexShrink: 0,
                      border: "1px solid", borderColor: "divider",
                      "&:hover": { opacity: 0.85 },
                    }}
                  >
                    <Box
                      component="img"
                      src={photo.url}
                      alt={photo.description}
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </Box>
                ))}
              </Box>
            );
          })()}
        </JourneyPhaseCard>

        {/* Vendor Payment */}
        <JourneyPhaseCard
          status={vendorPaymentStatus}
          title="Vendor Payment"
          icon="💳"
          statusLabel={vendorPaymentStatusLabel}
          fields={vendorPaymentFields}
          actions={vendorPaymentActions}
        >
          {expense?.payment_screenshot_url && (() => {
            const photos: WorkPhoto[] = [{
              id: "payment-screenshot",
              url: expense.payment_screenshot_url!,
              description: `Payment via ${expense.payment_mode ?? ""}${expense.payment_reference ? ` · ${expense.payment_reference}` : ""}`,
              uploadedAt: "",
            }];
            return (
              <Box
                onClick={() => setLightbox({ photos, startIndex: 0 })}
                sx={{
                  mt: 0.5, display: "flex", alignItems: "center", gap: 1,
                  cursor: "pointer",
                  "&:hover": { opacity: 0.85 },
                }}
              >
                <Box
                  component="img"
                  src={expense.payment_screenshot_url}
                  alt="Payment proof"
                  sx={{ width: 72, height: 56, objectFit: "cover", borderRadius: 1, border: "1px solid", borderColor: "divider" }}
                />
                <Typography variant="caption" color="text.secondary">
                  Tap to verify payment
                </Typography>
              </Box>
            );
          })()}
        </JourneyPhaseCard>

        {/* Settlement (group PO only) */}
        {isGroupPO && (
          <JourneyPhaseCard
            status={settlementStatus}
            title="Inter-Site Settlement"
            icon="⚖️"
            statusLabel={settlementStatusLabel}
            fields={settlementFields}
            actions={settlementActions}
          />
        )}

        {/* Blocker banner */}
        {showBlocker && (
          <JourneyBlockerBanner
            what="Settlement Blocked"
            why="Inter-site settlement cannot proceed until the vendor payment is recorded."
            actionLabel="→ Record Payment"
            actionHref={po ? `/site/material-expenses?po=${po.po_number}` : undefined}
          />
        )}
      </Box>

      {/* 5. Group site split */}
      {isGroupPO && <JourneyGroupSiteSplit journey={journey} />}

      {/* 6. Expense section */}
      <JourneyExpenseSection journey={journey} />

      {/* Photo lightbox */}
      {lightbox && (
        <PhotoLightbox
          open={!!lightbox}
          photos={lightbox.photos}
          startIndex={lightbox.startIndex}
          onClose={() => setLightbox(null)}
        />
      )}
    </Box>
  );
}

export default MaterialRequestJourney;
