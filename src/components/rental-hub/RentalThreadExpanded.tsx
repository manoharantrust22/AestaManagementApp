"use client";

/**
 * Inline expanded thread for the Rental Hub v2 (5 detail blocks in a 3-column
 * grid, mirroring MaterialThreadExpanded). Renders below a thread row when it
 * is selected.
 *
 * Block completion follows the 5-stage pipeline:
 *   1. Request    — always complete (the row exists because a request was made)
 *   2. Confirm    — complete once status reaches confirmed or beyond
 *   3. Active     — complete once cost meter has actually started (active+)
 *   4. Returned   — complete once status is completed or settled
 *   5. Settlement — complete only when effective_status === 'settled'
 *
 * Mirrors `MaterialThreadExpanded` in src/components/material-hub/.
 */

import { useState } from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ImageIcon from "@mui/icons-material/Image";
import DescriptionIcon from "@mui/icons-material/Description";
import EditIcon from "@mui/icons-material/Edit";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import HistoricalRentalDialog from "@/components/rentals/HistoricalRentalDialog";
import { SettlementSyncDialog } from "@/components/rentals/SettlementSyncDialog";
import { RentalSettlementEditDialog } from "@/components/rentals/RentalSettlementEditDialog";
import type { RentalSettlement } from "@/types/rental.types";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr, fmtDateShort } from "@/lib/material-hub/formatters";
import { stageIndex, visibleStageForThread } from "@/lib/rental-hub/stageHelpers";
import { dailyBurn, vendorSavings } from "@/lib/rental-hub/costMeter";
import type {
  RentalSettlementSlot,
  RentalThread,
  RentalThreadSettlement,
  RentalThreadTransport,
} from "@/lib/rental-hub/threadTypes";

interface BlockHeaderProps {
  title: string;
  complete: boolean;
  action?: React.ReactNode;
}

function BlockHeader({ title, complete, action }: BlockHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "10px",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Box
          sx={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: complete ? hubTokens.success : "#fff",
            border: complete ? "none" : `2px solid ${hubTokens.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {complete && <CheckIcon sx={{ fontSize: 9, color: "#fff" }} />}
        </Box>
        <Box
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: complete ? hubTokens.text : hubTokens.subtle,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}
        >
          {title}
        </Box>
      </Box>
      {action}
    </Box>
  );
}

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  tone?: "success" | "warn" | "danger" | "muted" | "default";
}

function DetailRow({ label, value, emphasis, tone = "default" }: DetailRowProps) {
  const valueColor =
    tone === "success"
      ? hubTokens.success
      : tone === "warn"
        ? hubTokens.warn
        : tone === "danger"
          ? hubTokens.danger
          : tone === "muted"
            ? hubTokens.muted
            : hubTokens.text;
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "10px",
        padding: "4px 0",
      }}
    >
      <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>{label}</Typography>
      <Typography
        sx={{
          fontSize: emphasis ? 13 : 12,
          fontWeight: emphasis ? 700 : 500,
          color: valueColor,
          fontFamily: emphasis ? hubTokens.mono : hubTokens.font,
          textAlign: "right",
        }}
      >
        {value ?? "—"}
      </Typography>
    </Box>
  );
}

function AttachmentIconLink({
  url,
  label,
  icon,
  tone = "primary",
}: {
  url: string | null | undefined;
  label: string;
  icon: "bill" | "screenshot" | "doc";
  tone?: "primary" | "success" | "warn" | "muted";
}) {
  if (!url) return null;
  const color =
    tone === "success"
      ? hubTokens.success
      : tone === "warn"
        ? hubTokens.warn
        : tone === "muted"
          ? hubTokens.muted
          : hubTokens.primary;
  const Icon =
    icon === "screenshot"
      ? ImageIcon
      : icon === "doc"
        ? DescriptionIcon
        : ReceiptLongIcon;
  return (
    <Tooltip title={label} arrow>
      <Box
        component="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "6px",
          background: hubTokens.chip,
          color,
          textDecoration: "none",
          transition: "background 0.15s ease",
          "&:hover": { background: hubTokens.hairline },
        }}
      >
        <Icon sx={{ fontSize: 14 }} />
      </Box>
    </Tooltip>
  );
}

function transportLabel(t: RentalThreadTransport, fallback: string): string {
  if (!t.by) return fallback;
  switch (t.by) {
    case "vendor":
      return "Vendor (bundled)";
    case "company":
      return "Company truck";
    case "laborer":
      return "On-site laborer";
    default:
      return String(t.by);
  }
}

function SettlementSlotCard({
  title,
  s,
  expectedCost,
  tone = "success",
}: {
  title: string;
  s: RentalThreadSettlement | undefined;
  expectedCost?: number;
  tone?: "success" | "warn" | "muted";
}) {
  const isPending = !s;
  const bg = isPending
    ? hubTokens.chip
    : tone === "warn"
      ? hubTokens.warnSoft
      : hubTokens.successSoft;
  const fg = isPending
    ? hubTokens.muted
    : tone === "warn"
      ? hubTokens.warn
      : hubTokens.success;
  return (
    <Box
      sx={{
        background: bg,
        border: `1px solid ${isPending ? hubTokens.hairline : "transparent"}`,
        borderRadius: "8px",
        padding: "8px 10px",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: isPending ? 0 : "4px",
        }}
      >
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: fg,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.4px",
            color: fg,
          }}
        >
          {isPending ? "PENDING" : "✓ SETTLED"}
        </Typography>
      </Box>
      {isPending ? (
        expectedCost && expectedCost > 0 ? (
          <Typography sx={{ fontSize: 10.5, color: hubTokens.subtle, fontStyle: "italic" }}>
            Expected ≈ {inr(expectedCost)}
          </Typography>
        ) : null
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: hubTokens.text,
            }}
          >
            <Box component="span" sx={{ color: hubTokens.muted }}>
              Final
            </Box>
            <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 700 }}>
              {inr(s.negotiatedFinalAmount ?? s.balanceAmount)}
            </Box>
          </Box>
          {s.paymentMode && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10.5,
                color: hubTokens.muted,
              }}
            >
              <Box component="span">Mode</Box>
              <Box component="span">{s.paymentMode.toUpperCase()}</Box>
            </Box>
          )}
          {s.settledAt && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10.5,
                color: hubTokens.muted,
              }}
            >
              <Box component="span">On</Box>
              <Box component="span">{fmtDateShort(s.settledAt)}</Box>
            </Box>
          )}
          {s.reference && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: 10.5,
                color: hubTokens.muted,
              }}
            >
              <Box component="span">Expense</Box>
              <Box
                component="a"
                href={`/site/expenses?q=${encodeURIComponent(s.reference)}`}
                sx={{
                  fontFamily: hubTokens.mono,
                  color: hubTokens.primary,
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {s.reference}
              </Box>
            </Box>
          )}
          {(s.vendorBillUrl || s.finalReceiptUrl || s.upiScreenshotUrl) && (
            <Box sx={{ display: "flex", gap: "4px", marginTop: "4px" }}>
              <AttachmentIconLink
                url={s.vendorBillUrl}
                label="Vendor bill"
                icon="bill"
                tone="success"
              />
              <AttachmentIconLink
                url={s.finalReceiptUrl}
                label="Final receipt"
                icon="doc"
                tone="success"
              />
              <AttachmentIconLink
                url={s.upiScreenshotUrl}
                label="Payment screenshot"
                icon="screenshot"
                tone="success"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export interface RentalThreadExpandedProps {
  thread: RentalThread;
}

export default function RentalThreadExpanded({ thread }: RentalThreadExpandedProps) {
  const t = thread;
  const stage = visibleStageForThread(t);
  const idx = stageIndex(stage);

  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [correctedTotal, setCorrectedTotal] = useState(0);
  const [editingSettlement, setEditingSettlement] = useState<RentalSettlement | null>(null);

  // Shape the hub settlement type into the full RentalSettlement shape needed by edit dialog
  function vendorSettlementForEdit(): RentalSettlement | null {
    const s = t.settlements.vendor;
    if (!s) return null;
    return {
      id: s.id,
      rental_order_id: t.source_row_id,
      party_type: "vendor" as any,
      party_name: null,
      settlement_date: s.settledAt,
      settlement_reference: s.reference ?? null,
      total_rental_amount: s.rentalAmount,
      total_transport_amount: s.transportAmount,
      total_damage_amount: s.damageAmount,
      negotiated_final_amount: s.negotiatedFinalAmount,
      total_advance_paid: s.totalAdvancePaid,
      balance_amount: s.balanceAmount,
      payment_mode: s.paymentMode,
      payment_channel: null,
      payer_source: s.payerSource as any,
      payer_name: null,
      payer_source_split: null,
      vendor_bill_url: s.vendorBillUrl,
      final_receipt_url: s.finalReceiptUrl,
      upi_screenshot_url: s.upiScreenshotUrl,
      subcontract_id: null,
      engineer_transaction_id: null,
      settlement_group_id: null,
      notes: null,
      settled_by: s.settledBy,
      settled_by_name: null,
      created_at: s.settledAt,
      updated_at: s.settledAt,
    } as RentalSettlement;
  }

  const isCompletedHistorical = t.isHistorical && t.status === "completed";
  const isCompletedLive = !t.isHistorical && t.status === "completed";

  // For terminal orders, show actual rental duration (start → return date).
  // daysSinceStart counts to today, which bloats the display for old completed orders.
  const isTerminalOrder = t.status === "completed" || t.status === "cancelled";
  const displayDays = (() => {
    if (isTerminalOrder) {
      const endRef = t.actualEnd ?? t.expectedEnd;
      if (!endRef || !t.expectedStart) return t.daysSinceStart;
      const diffDays = Math.ceil(
        (new Date(endRef).getTime() - new Date(t.expectedStart).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return Math.max(1, t.excludeStartDate ? diffDays : diffDays + 1);
    }
    return t.daysSinceStart;
  })();

  // Block completion flags (per 5-stage pipeline)
  const hasRequest = true;
  const hasConfirm = idx >= 1 || t.effective_status === "settled";
  const hasActive =
    idx >= 2 ||
    t.status === "active" ||
    t.status === "partially_returned" ||
    t.status === "completed" ||
    t.effective_status === "settled";
  const hasReturned =
    t.status === "completed" || t.effective_status === "settled";
  const hasSettlement = t.effective_status === "settled";

  const burn = dailyBurn(t);
  const savings = vendorSavings(t);
  const balance = Math.max(0, t.accruedCost - t.totalAdvancePaid);

  // order_date stamped after start_date means data-entry day was recorded,
  // not the real transaction date. Display the start date instead so the
  // row doesn't appear to be "ordered in the future".
  const orderDateClampedFromFuture =
    !!t.expectedStart &&
    !!t.orderDate &&
    new Date(t.orderDate).getTime() > new Date(t.expectedStart).getTime();
  const displayOrderDate = orderDateClampedFromFuture
    ? t.expectedStart
    : t.orderDate;

  const transportInPending =
    t.requiresTransportInSettlement && !t.settlements.transportIn;
  const transportOutPending =
    t.requiresTransportOutSettlement && !t.settlements.transportOut;

  // Returns log grouped by item (so we can show "5 of 10 × Steel rod returned 2 Oct")
  const itemById = new Map(t.items.map((i) => [i.id, i]));
  const returnsByItem = new Map<string, typeof t.returns>();
  for (const r of t.returns) {
    const arr = returnsByItem.get(r.rentalOrderItemId) ?? [];
    arr.push(r);
    returnsByItem.set(r.rentalOrderItemId, arr);
  }

  return (
    <Box
      sx={{
        background: "#fafbfc",
        padding: "18px 22px",
        borderTop: `1px solid ${hubTokens.hairline}`,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
        gap: "16px",
      }}
    >
      {/* 1. Request */}
      <Box>
        <BlockHeader
          title="Request"
          complete={hasRequest}
          action={
            isCompletedHistorical ? (
              <Tooltip title="Fix mistakes in items, rates, or dates for this historical record">
                <Button
                  size="small"
                  startIcon={<EditIcon sx={{ fontSize: 11 }} />}
                  onClick={() => setCorrectionOpen(true)}
                  sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#b45309",
                    background: "#fef3c7",
                    border: "1px solid #fcd34d",
                    borderRadius: "6px",
                    px: 1,
                    py: 0.25,
                    minHeight: 0,
                    lineHeight: 1.4,
                    "&:hover": { background: "#fde68a" },
                  }}
                >
                  Correct Entry
                </Button>
              </Tooltip>
            ) : isCompletedLive ? (
              <Tooltip title="Add missed items via a linked amendment order">
                <Button
                  size="small"
                  startIcon={<AddCircleOutlineIcon sx={{ fontSize: 11 }} />}
                  onClick={() => setAmendmentOpen(true)}
                  sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#1d4ed8",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "6px",
                    px: 1,
                    py: 0.25,
                    minHeight: 0,
                    lineHeight: 1.4,
                    "&:hover": { background: "#dbeafe" },
                  }}
                >
                  Create Amendment
                </Button>
              </Tooltip>
            ) : undefined
          }
        />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <DetailRow label="Vendor" value={t.vendor?.name ?? "—"} />
          {t.vendor?.shop_name && (
            <DetailRow label="Shop" value={t.vendor.shop_name} tone="muted" />
          )}
          {/* Clamp order_date to start_date when it's stamped in the future —
              historical/backfill rentals get the data-entry day in order_date,
              which can land after the real start. Show the older of the two so
              the row reads as "ordered on or before it started". */}
          <DetailRow
            label="Order date"
            value={fmtDateShort(displayOrderDate)}
          />
          {orderDateClampedFromFuture && (
            <Typography
              sx={{
                fontSize: 10,
                color: hubTokens.subtle,
                fontStyle: "italic",
                textAlign: "right",
                marginTop: "-2px",
              }}
            >
              Captured {fmtDateShort(t.orderDate)} · using start date for display
            </Typography>
          )}
          <DetailRow
            label="Start"
            value={
              t.expectedStart
                ? fmtDateShort(t.expectedStart) +
                  (t.excludeStartDate ? " (excl.)" : "")
                : "—"
            }
          />
          <DetailRow
            label="Expected return"
            value={t.expectedEnd ? fmtDateShort(t.expectedEnd) : "—"}
            tone={t.isOverdue ? "danger" : "default"}
          />
          {t.kind === "group" && (
            <DetailRow label="Type" value="Group · cluster" tone="warn" />
          )}
          {t.isHistorical && (
            <DetailRow label="Type" value="Backfilled" tone="muted" />
          )}
          {/* Items table */}
          <Box
            sx={{
              marginTop: "10px",
              paddingTop: "10px",
              borderTop: `1px dashed ${hubTokens.border}`,
            }}
          >
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.4px",
                color: hubTokens.muted,
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Items ({t.items.length})
            </Typography>
            {t.items.length === 0 ? (
              <Typography sx={{ fontSize: 11, color: hubTokens.subtle, fontStyle: "italic" }}>
                No items.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {t.items.map((it) => (
                  <Box
                    key={it.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "4px 6px",
                      background: hubTokens.hairline,
                      borderRadius: "6px",
                      fontSize: 11,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        fontFamily: hubTokens.mono,
                        fontWeight: 700,
                        minWidth: 40,
                      }}
                    >
                      {it.qty} {it.unit}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.name}
                      {it.sizeLabelSnapshot ? ` · ${it.sizeLabelSnapshot}` : ""}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        fontFamily: hubTokens.mono,
                        color: hubTokens.muted,
                        fontSize: 10.5,
                      }}
                    >
                      {inr(it.dailyRate)}/{it.rateType === "hourly" ? "hr" : "d"}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          {t.notes && <DetailRow label="Notes" value={t.notes} />}
        </Box>
      </Box>

      {/* 2. Confirm / PO */}
      <Box>
        <BlockHeader title="Confirm · PO" complete={hasConfirm} />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          {hasConfirm ? (
            <>
              <DetailRow
                label="Approved"
                value={t.approvedAt ? fmtDateShort(t.approvedAt) : "—"}
              />
              <DetailRow
                label="Transport (in)"
                value={transportLabel(t.transportIn, "—")}
              />
              {t.transportIn.cost > 0 && (
                <DetailRow label="In cost" value={inr(t.transportIn.cost)} />
              )}
              {t.transportIn.loadingCost > 0 && (
                <DetailRow label="Loading" value={inr(t.transportIn.loadingCost)} />
              )}
              <DetailRow
                label="Transport (out)"
                value={transportLabel(t.transportOut, "—")}
              />
              {t.transportOut.cost > 0 && (
                <DetailRow label="Out cost" value={inr(t.transportOut.cost)} />
              )}
              {t.transportOut.unloadingCost > 0 && (
                <DetailRow
                  label="Unloading"
                  value={inr(t.transportOut.unloadingCost)}
                />
              )}
              {t.discountPct > 0 && (
                <DetailRow
                  label="Discount"
                  value={`${t.discountPct}% (${inr(t.discountAmount)})`}
                  tone="success"
                />
              )}
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              Awaiting admin approval.
            </Typography>
          )}
        </Box>
      </Box>

      {/* 3. Active · cost meter */}
      <Box>
        <BlockHeader title="Active · cost meter" complete={hasActive} />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          {hasActive ? (
            <>
              <DetailRow
                label={isTerminalOrder ? "Rental days" : "Days elapsed"}
                value={`${displayDays}d`}
                emphasis
              />
              {burn > 0 &&
                (t.status === "active" ||
                  t.status === "partially_returned") && (
                  <DetailRow label="Daily burn" value={`${inr(burn)}/d`} tone="warn" />
                )}
              <DetailRow
                label="Accrued"
                value={inr(t.accruedCost)}
                emphasis
                tone={t.isOverdue ? "danger" : "default"}
              />
              <DetailRow
                label="Advances paid"
                value={inr(t.totalAdvancePaid)}
                tone={t.totalAdvancePaid > 0 ? "success" : "muted"}
              />
              {t.effective_status !== "settled" && (
                <DetailRow
                  label="Balance (est.)"
                  value={inr(balance)}
                  emphasis
                  tone={balance > 0 ? "warn" : "muted"}
                />
              )}
              {/* Advances log */}
              {t.advances.length > 0 && (
                <Box
                  sx={{
                    marginTop: "10px",
                    paddingTop: "10px",
                    borderTop: `1px dashed ${hubTokens.border}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.4px",
                      color: hubTokens.muted,
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Advances ({t.advances.length})
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {t.advances.map((a) => (
                      <Box
                        key={a.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "4px 6px",
                          background: hubTokens.hairline,
                          borderRadius: "6px",
                          fontSize: 11,
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            fontFamily: hubTokens.mono,
                            color: hubTokens.muted,
                            minWidth: 64,
                          }}
                        >
                          {fmtDateShort(a.date)}
                        </Box>
                        <Box
                          component="span"
                          sx={{
                            fontFamily: hubTokens.mono,
                            fontWeight: 700,
                            minWidth: 70,
                          }}
                        >
                          {inr(a.amount)}
                        </Box>
                        <Box
                          component="span"
                          sx={{
                            color: hubTokens.subtle,
                            flex: 1,
                            fontSize: 10.5,
                          }}
                        >
                          {a.mode?.toUpperCase() ?? "—"}
                          {a.payerSource ? ` · ${a.payerSource}` : ""}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              Cost meter starts after delivery is verified.
            </Typography>
          )}
        </Box>
      </Box>

      {/* 4. Returned */}
      <Box>
        <BlockHeader title="Returned" complete={hasReturned} />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          {t.returns.length > 0 ? (
            <>
              <DetailRow
                label="Final return"
                value={t.actualEnd ? fmtDateShort(t.actualEnd) : "—"}
                tone={t.actualEnd ? "success" : "muted"}
              />
              {/* Per-item return progress */}
              <Box
                sx={{
                  marginTop: "10px",
                  paddingTop: "10px",
                  borderTop: `1px dashed ${hubTokens.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "5px",
                }}
              >
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.4px",
                    color: hubTokens.muted,
                    textTransform: "uppercase",
                  }}
                >
                  Return events ({t.returns.length})
                </Typography>
                {t.returns.map((r) => {
                  const item = itemById.get(r.rentalOrderItemId);
                  const isDamaged =
                    r.condition === "damaged" || r.condition === "lost";
                  return (
                    <Box
                      key={r.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "4px 6px",
                        background: hubTokens.hairline,
                        borderRadius: "6px",
                        fontSize: 11,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          fontFamily: hubTokens.mono,
                          color: hubTokens.muted,
                          minWidth: 64,
                        }}
                      >
                        {fmtDateShort(r.date)}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          fontFamily: hubTokens.mono,
                          fontWeight: 700,
                          minWidth: 40,
                        }}
                      >
                        {r.qty}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 10.5,
                        }}
                      >
                        {item?.name ?? "—"}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          padding: "1px 5px",
                          borderRadius: "3px",
                          background: isDamaged
                            ? hubTokens.dangerSoft
                            : hubTokens.successSoft,
                          color: isDamaged ? hubTokens.danger : hubTokens.success,
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: "0.3px",
                          textTransform: "uppercase",
                        }}
                      >
                        {r.condition}
                      </Box>
                      {r.damageCost > 0 && (
                        <Box
                          component="span"
                          sx={{
                            fontFamily: hubTokens.mono,
                            fontWeight: 700,
                            color: hubTokens.danger,
                            fontSize: 10.5,
                          }}
                        >
                          {inr(r.damageCost)}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
              {/* Outstanding lines (returns not yet recorded) */}
              {t.items.some((i) => i.qtyOutstanding > 0) && (
                <Box sx={{ marginTop: "8px" }}>
                  <Typography
                    sx={{
                      fontSize: 10.5,
                      color: hubTokens.warn,
                      fontWeight: 700,
                    }}
                  >
                    Still outstanding:{" "}
                    {t.items
                      .filter((i) => i.qtyOutstanding > 0)
                      .map((i) => `${i.qtyOutstanding} × ${i.name}`)
                      .join(", ")}
                  </Typography>
                </Box>
              )}
            </>
          ) : hasReturned ? (
            <Typography sx={{ fontSize: 12, color: hubTokens.muted, fontStyle: "italic" }}>
              Returned, no per-event log recorded.
            </Typography>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              No returns recorded yet.
            </Typography>
          )}
        </Box>
      </Box>

      {/* Correction / Amendment dialogs */}
      <HistoricalRentalDialog
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        siteId={t.site_id}
        orderId={t.source_row_id}
        correctionMode
        onSaveSuccess={(newTotal) => {
          const oldTotal = t.settlements.vendor?.rentalAmount ?? 0;
          setCorrectedTotal(newTotal);
          if (Math.abs(newTotal - oldTotal) > 1 && t.settlements.vendor) {
            setSyncOpen(true);
          }
        }}
      />

      <HistoricalRentalDialog
        open={amendmentOpen}
        onClose={() => setAmendmentOpen(false)}
        siteId={t.site_id}
        amendmentOfOrderId={t.source_row_id}
      />

      {syncOpen && (
        <SettlementSyncDialog
          open={syncOpen}
          onClose={() => setSyncOpen(false)}
          settlement={{ ...(vendorSettlementForEdit()!), total_rental_amount: t.settlements.vendor?.rentalAmount ?? 0 }}
          newTotal={correctedTotal}
          onUpdateSettlement={() => {
            const shaped = vendorSettlementForEdit();
            if (shaped) setEditingSettlement(shaped);
          }}
        />
      )}

      {editingSettlement && (
        <RentalSettlementEditDialog
          open={!!editingSettlement}
          onClose={() => setEditingSettlement(null)}
          settlement={editingSettlement}
          siteId={t.site_id}
          orderId={t.source_row_id}
        />
      )}

      {/* 5. Settlement */}
      <Box sx={{ gridColumn: { xs: "auto", md: "span 2" } }}>
        <BlockHeader
          title="Settlement"
          complete={hasSettlement}
          action={
            hasSettlement && savings > 0 ? (
              <Box
                component="span"
                sx={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.3px",
                  color: hubTokens.success,
                  background: hubTokens.successSoft,
                  padding: "2px 6px",
                  borderRadius: "8px",
                }}
              >
                BARGAINED · saved {inr(savings)}
              </Box>
            ) : undefined
          }
        />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          {/* Settlement parties grid */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: "8px",
            }}
          >
            <SettlementSlotCard
              title="Vendor"
              s={t.settlements.vendor}
              expectedCost={Math.max(0, t.accruedCost - t.totalAdvancePaid)}
              tone={
                t.status === "completed" && !t.settlements.vendor
                  ? "warn"
                  : "success"
              }
            />
            {t.requiresTransportInSettlement && (
              <SettlementSlotCard
                title="Transport in"
                s={t.settlements.transportIn}
                expectedCost={t.transportIn.cost}
                tone={transportInPending ? "warn" : "success"}
              />
            )}
            {t.requiresTransportOutSettlement && (
              <SettlementSlotCard
                title="Transport out"
                s={t.settlements.transportOut}
                expectedCost={t.transportOut.cost}
                tone={transportOutPending ? "warn" : "success"}
              />
            )}
            {(t.settlements.loadingUnloading ||
              t.transportIn.loadingCost > 0 ||
              t.transportOut.unloadingCost > 0) &&
              (slotApplicable("loadingUnloading", t) ? (
                <SettlementSlotCard
                  title="Loading / unloading"
                  s={t.settlements.loadingUnloading}
                  expectedCost={
                    t.transportIn.loadingCost + t.transportOut.unloadingCost
                  }
                  tone={t.settlements.loadingUnloading ? "success" : "muted"}
                />
              ) : null)}
          </Box>

          {/* Summary footer */}
          {hasSettlement ? (
            <Box
              sx={{
                marginTop: "10px",
                paddingTop: "10px",
                borderTop: `1px dashed ${hubTokens.border}`,
              }}
            >
              <DetailRow
                label="Total accrued"
                value={inr(t.accruedCost)}
                tone="muted"
              />
              <DetailRow
                label="Total advances"
                value={inr(t.totalAdvancePaid)}
                tone="muted"
              />
              <DetailRow
                label="Vendor settled at"
                value={inr(
                  t.settlements.vendor?.negotiatedFinalAmount ?? 0,
                )}
                emphasis
                tone="success"
              />
            </Box>
          ) : t.status === "completed" ? (
            <Typography
              sx={{
                marginTop: "10px",
                fontSize: 11,
                color: hubTokens.warn,
                fontStyle: "italic",
              }}
            >
              Returns done. Office to settle the vendor (and transport, if
              separate) to close out this order.
            </Typography>
          ) : (
            <Typography
              sx={{
                marginTop: "10px",
                fontSize: 11,
                color: hubTokens.subtle,
                fontStyle: "italic",
              }}
            >
              Settlement opens after all items are returned.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function slotApplicable(slot: RentalSettlementSlot, t: RentalThread): boolean {
  if (slot === "loadingUnloading") {
    return (
      t.transportIn.loadingCost + t.transportOut.unloadingCost > 0 ||
      !!t.settlements.loadingUnloading
    );
  }
  return false;
}
