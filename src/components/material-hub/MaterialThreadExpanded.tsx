"use client";

/**
 * Inline expanded thread (6 detail blocks in a 3-column grid).
 *
 * Renders below a thread row when selected. Each block has a header with a
 * 14px completion circle (success check when complete, hairline border when
 * not), uppercase title, and optional CTA button on the right when action
 * pending.
 *
 * Blocks:
 *   1. Request
 *   2. Purchase order
 *   3. Delivery & quality
 *   4. Settlement
 *   5. Inventory · stock
 *   6. Inter-site usage (group) OR Expenses (own)
 *
 * Mirrors `ThreadExpanded` block in docs/MaterialHub_Redesign/proto-screens.jsx.
 */

import { Box, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ImageIcon from "@mui/icons-material/Image";
import DescriptionIcon from "@mui/icons-material/Description";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import { fmtDateShort } from "@/lib/material-hub/formatters";
import { M_STAGES, stageIndex } from "@/lib/material-hub/stageHelpers";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

const DELIVERED_IDX = M_STAGES.indexOf("delivered");
const SETTLED_IDX = M_STAGES.indexOf("settled");
const IN_USE_IDX = M_STAGES.indexOf("in-use");

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

/** Small clickable icon link for an attached scan / screenshot / bill. Opens
 *  in a new tab. Tooltip describes what's attached. Used in the PO, Delivery,
 *  and Settlement blocks to surface paperwork without leaving the Hub. */
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

/** Compact "View on inventory →" link rendered at the bottom of the
 *  Inventory block. Passes a `?focus=<term>` query param so the inventory
 *  page can auto-populate its search input and scroll the matching card
 *  into view. */
function InventoryLink({ target }: { target: string | null | undefined }) {
  if (!target) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
      <Box
        component="a"
        href={`/site/materials/inventory?focus=${encodeURIComponent(target)}`}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: 11,
          fontWeight: 600,
          color: hubTokens.primary,
          textDecoration: "none",
          "&:hover": { textDecoration: "underline" },
        }}
      >
        View on inventory
        <ArrowForwardIcon sx={{ fontSize: 12 }} />
      </Box>
    </Box>
  );
}

export interface MaterialThreadExpandedProps {
  thread: MaterialThread;
}

export default function MaterialThreadExpanded({ thread }: MaterialThreadExpandedProps) {
  const t = thread;
  const isOwn = t.kind === "own";
  const isSpot = t.purchase_type === "spot";

  // Block completion flags. Detailed records (t.delivery / t.settlement /
  // t.inventory) aren't always joined into the thread, so we fall back to
  // thread.stage AND PO progress to mark a block "done" when the lifecycle
  // has clearly advanced past it.
  const sIdx = stageIndex(t.stage);
  const deliveredOrBeyond = sIdx >= DELIVERED_IDX;
  const settledOrBeyond = sIdx >= SETTLED_IDX;
  const inUseOrBeyond = sIdx >= IN_USE_IDX;

  // Partial delivery state from PO data.
  const orderedQty = t.po?.qty ?? 0;
  const receivedQty = t.po?.received_qty ?? 0;
  const isPartialDelivered = receivedQty > 0 && receivedQty < orderedQty;
  const isFullyDelivered = receivedQty > 0 && receivedQty >= orderedQty;

  // Advance-paid implicit settlement: advance POs settle the vendor at PO time.
  const isAdvancePaid =
    !!t.po && t.po.payment_timing === "advance" && t.po.advance_paid > 0;

  const hasRequest = true;
  const hasPO = !!t.po || isSpot;
  const hasDelivery =
    !!t.delivery ||
    isSpot ||
    deliveredOrBeyond ||
    isPartialDelivered ||
    isFullyDelivered;
  const hasSettlement =
    t.settlement?.status === "settled" || isSpot || settledOrBeyond || isAdvancePaid;
  const hasInventory = !!t.inventory || inUseOrBeyond || receivedQty > 0;
  const hasUsage =
    (t.inter_site_usage && t.inter_site_usage.length > 0) ||
    (isOwn && hasSettlement);

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
        <BlockHeader title="Request" complete={hasRequest} />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <DetailRow label="Material" value={t.material_name} />
          <DetailRow label="Quantity" value={`${t.qty} ${t.material_unit}`} emphasis />
          <DetailRow label="Section" value={t.section} />
          <DetailRow
            label="Requested"
            value={`${t.requested_by_name ?? "—"} · ${fmtDateShort(t.requested_at)}`}
          />
          <DetailRow
            label="Need by"
            value={t.need_by ? fmtDateShort(t.need_by) : "—"}
            tone={t.priority === "high" || t.priority === "urgent" ? "danger" : "default"}
          />
          {t.note && <DetailRow label="Note" value={t.note} />}
        </Box>
      </Box>

      {/* 2. Purchase order */}
      <Box>
        <BlockHeader
          title="Purchase order"
          complete={hasPO}
          action={
            t.po && (t.po.vendor_bill_url || t.po.quotation_url) ? (
              <Box sx={{ display: "flex", gap: "4px" }}>
                <AttachmentIconLink
                  url={t.po.vendor_bill_url}
                  label="Vendor bill"
                  icon="bill"
                />
                <AttachmentIconLink
                  url={t.po.quotation_url}
                  label="Quotation"
                  icon="doc"
                />
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
          {isSpot ? (
            <>
              <DetailRow label="Vendor" value={t.spot?.vendor_name ?? "—"} />
              <DetailRow label="Type" value="Spot · wallet" tone="warn" />
              <DetailRow label="Amount" value={inr(t.spot?.amount ?? 0)} emphasis />
              <DetailRow
                label="Payment"
                value={`Wallet · ${t.spot?.payment_mode?.toUpperCase() ?? "CASH"}`}
                tone="warn"
              />
            </>
          ) : t.po ? (
            <>
              <DetailRow label="PO #" value={t.po.po_number} />
              <DetailRow label="Vendor" value={t.po.vendor_name ?? "—"} />
              <DetailRow
                label="Type"
                value={`${t.kind === "group" ? "Group" : "Own"}${t.advance ? " · Advance" : ""}`}
                tone={t.kind === "group" ? "warn" : "default"}
              />
              <DetailRow label="Amount" value={inr(t.po.amount)} emphasis />
              {t.po.expected && (
                <DetailRow label="Expected" value={fmtDateShort(t.po.expected)} />
              )}
              {t.advance && t.po.advance && t.po.advance.batches.length > 0 && (
                <Box
                  sx={{
                    marginTop: "10px",
                    padding: "10px 12px",
                    background: hubTokens.warnSoft,
                    borderRadius: "8px",
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: hubTokens.warn, mb: 0.5 }}>
                    Advance · paid upfront
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: hubTokens.text }}>
                    {t.po.advance.batches.reduce((s, b) => s + b.qty, 0)} of {t.po.qty} received in{" "}
                    {t.po.advance.batches.length} batch
                    {t.po.advance.batches.length !== 1 ? "es" : ""}
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              No PO yet.
            </Typography>
          )}
        </Box>
      </Box>

      {/* 3. Delivery & quality */}
      <Box>
        <BlockHeader title="Delivery & quality" complete={hasDelivery} />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          {isSpot ? (
            <>
              <DetailRow label="Bought" value={fmtDateShort(t.bought_at)} />
              <DetailRow label="Bill image" value={t.spot?.bill_attached ? "Attached" : "—"} />
              <DetailRow
                label="UPI screenshot"
                value={t.spot?.screenshot_attached ? "Attached" : "—"}
              />
            </>
          ) : t.delivery ? (
            <>
              <DetailRow label="Received" value={fmtDateShort(t.delivery.date)} />
              <DetailRow label="By" value={t.delivery.recorded_by ?? "—"} />
              <DetailRow
                label="Quality"
                value={t.delivery.quality.toUpperCase()}
                tone={
                  t.delivery.quality === "good"
                    ? "success"
                    : t.delivery.quality === "fair"
                      ? "warn"
                      : "danger"
                }
              />
              {t.delivery.notes && <DetailRow label="Notes" value={t.delivery.notes} />}
            </>
          ) : isPartialDelivered || isFullyDelivered || deliveredOrBeyond ? (
            <>
              <DetailRow
                label="Status"
                value={isFullyDelivered ? "DELIVERED" : "PARTIAL"}
                tone={isFullyDelivered ? "success" : "warn"}
              />
              {receivedQty > 0 && (
                <>
                  <DetailRow
                    label="Received"
                    value={`${Math.round(receivedQty)} of ${Math.round(orderedQty)} ${t.material_unit}`}
                    emphasis
                  />
                  <DetailRow
                    label="Pending"
                    value={`${Math.max(0, Math.round(orderedQty - receivedQty))} ${t.material_unit}`}
                    tone={orderedQty - receivedQty > 0 ? "warn" : "muted"}
                  />
                  {/* Progress bar */}
                  <Box
                    sx={{
                      marginTop: "8px",
                      height: 6,
                      borderRadius: "3px",
                      background: hubTokens.hairline,
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        width: `${Math.min((receivedQty / Math.max(orderedQty, 1)) * 100, 100)}%`,
                        height: "100%",
                        background: isFullyDelivered ? hubTokens.success : hubTokens.warn,
                      }}
                    />
                  </Box>
                </>
              )}
              {t.po?.expected && (
                <Box sx={{ marginTop: "6px" }}>
                  <DetailRow label="Expected" value={fmtDateShort(t.po.expected)} />
                </Box>
              )}

              {/* Per-batch GRN log — one row per `deliveries` record */}
              {t.po && t.po.delivery_batches.length > 0 && (
                <Box
                  sx={{
                    marginTop: "10px",
                    paddingTop: "10px",
                    borderTop: `1px dashed ${hubTokens.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
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
                    Batches ({t.po.delivery_batches.length})
                  </Typography>
                  {t.po.delivery_batches.map((b) => (
                    <Box
                      key={b.id}
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
                        {fmtDateShort(b.delivery_date)}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          fontFamily: hubTokens.mono,
                          color: hubTokens.text,
                          fontWeight: 700,
                          minWidth: 70,
                        }}
                      >
                        {Math.round(b.accepted_qty || b.received_qty)} {t.material_unit}
                      </Box>
                      <Box
                        component="span"
                        sx={{ color: hubTokens.subtle, flex: 1, fontSize: 10.5 }}
                      >
                        {b.grn_number}
                      </Box>
                      {/* Per-batch attachments (challan / invoice scan) */}
                      {(b.challan_url || b.invoice_url) && (
                        <Box sx={{ display: "flex", gap: "3px", marginRight: "2px" }}>
                          <AttachmentIconLink
                            url={b.challan_url}
                            label="Challan"
                            icon="doc"
                            tone="muted"
                          />
                          <AttachmentIconLink
                            url={b.invoice_url}
                            label="Invoice"
                            icon="bill"
                            tone="muted"
                          />
                        </Box>
                      )}
                      {b.verified || inUseOrBeyond ? (
                        // Once the material is in-use / exhausted, the
                        // GRN's verification flag is moot — the engineer
                        // is consuming the stock, which is itself proof
                        // it arrived. Treat consumption as implicit
                        // verification rather than nagging "PENDING".
                        <Box
                          component="span"
                          sx={{
                            padding: "1px 5px",
                            borderRadius: "3px",
                            background: hubTokens.successSoft,
                            color: hubTokens.success,
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.3px",
                          }}
                        >
                          {b.verified ? "✓ VERIFIED" : "✓ ACCEPTED"}
                        </Box>
                      ) : (
                        <Box
                          component="span"
                          sx={{
                            padding: "1px 5px",
                            borderRadius: "3px",
                            background: hubTokens.warnSoft,
                            color: hubTokens.warn,
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.3px",
                          }}
                        >
                          PENDING
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              {t.po && t.po.delivery_batches.length === 0 && receivedQty > 0 && (
                <Typography
                  sx={{
                    fontSize: 10.5,
                    color: hubTokens.subtle,
                    fontStyle: "italic",
                    marginTop: "6px",
                  }}
                >
                  Batch-by-batch GRN log on /site/delivery-verification.
                </Typography>
              )}
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              Pending delivery.
            </Typography>
          )}
        </Box>
      </Box>

      {/* 4. Settlement */}
      <Box>
        <BlockHeader
          title="Settlement"
          complete={hasSettlement}
          action={
            t.settlement &&
            (t.settlement.payment_screenshot_url || t.settlement.bill_url) ? (
              <Box sx={{ display: "flex", gap: "4px" }}>
                <AttachmentIconLink
                  url={t.settlement.payment_screenshot_url}
                  label="Payment screenshot"
                  icon="screenshot"
                  tone="success"
                />
                <AttachmentIconLink
                  url={t.settlement.bill_url}
                  label="Vendor bill"
                  icon="bill"
                  tone="success"
                />
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
          {isSpot ? (
            <>
              <DetailRow label="Amount" value={inr(t.spot?.amount ?? 0)} emphasis />
              <DetailRow label="Status" value="SETTLED" tone="success" />
              <DetailRow label="Paid by" value="Wallet" tone="muted" />
            </>
          ) : t.settlement ? (
            <>
              <DetailRow label="Amount" value={inr(t.settlement.amount)} emphasis />
              <DetailRow
                label="Status"
                value={t.settlement.status.toUpperCase()}
                tone={t.settlement.status === "settled" ? "success" : "warn"}
              />
              {t.settlement.paid_by && (
                <DetailRow label="Paid by" value={t.settlement.paid_by} />
              )}
              {t.settlement.settled_at && (
                <DetailRow label="On" value={fmtDateShort(t.settlement.settled_at)} />
              )}
            </>
          ) : isAdvancePaid ? (
            <>
              <DetailRow label="Status" value="ADVANCE PAID" tone="success" />
              <DetailRow
                label="Paid upfront"
                value={inr(t.po!.advance_paid)}
                emphasis
              />
              {t.po && t.po.amount !== t.po.advance_paid && (
                <DetailRow
                  label="PO total"
                  value={inr(t.po.amount)}
                  tone="muted"
                />
              )}
              <Typography
                sx={{
                  fontSize: 10.5,
                  color: hubTokens.subtle,
                  fontStyle: "italic",
                  marginTop: "6px",
                }}
              >
                Vendor was settled at PO creation — no post-delivery payment due.
              </Typography>
            </>
          ) : settledOrBeyond ? (
            <>
              <DetailRow label="Status" value="SETTLED" tone="success" />
              {t.po && <DetailRow label="Amount" value={inr(t.po.amount)} emphasis />}
              <Typography
                sx={{
                  fontSize: 10.5,
                  color: hubTokens.subtle,
                  fontStyle: "italic",
                  marginTop: "6px",
                }}
              >
                Vendor bill on /site/material-settlements.
              </Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              Not settled yet.
            </Typography>
          )}
        </Box>
      </Box>

      {/* 5. Inventory · stock */}
      <Box>
        <BlockHeader title="Inventory · stock" complete={hasInventory} />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          {t.inventory ? (
            <>
              <DetailRow
                label="Batch"
                value={
                  <Box
                    component="a"
                    href={`/site/materials/inventory?focus=${encodeURIComponent(t.inventory.batch)}`}
                    sx={{
                      fontFamily: hubTokens.mono,
                      color: hubTokens.primary,
                      textDecoration: "none",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    {t.inventory.batch}
                  </Box>
                }
              />
              <DetailRow label="Received" value={`${t.inventory.received} ${t.material_unit}`} />
              <DetailRow label="Used" value={`${t.inventory.used} ${t.material_unit}`} />
              <DetailRow
                label="Remaining"
                value={`${t.inventory.remaining} ${t.material_unit}`}
                emphasis
                tone="success"
              />
              <Box
                sx={{
                  marginTop: "8px",
                  height: 6,
                  borderRadius: "3px",
                  background: hubTokens.hairline,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    width: `${
                      t.inventory.received > 0
                        ? Math.min(100, (t.inventory.used / t.inventory.received) * 100)
                        : 0
                    }%`,
                    height: "100%",
                    background: hubTokens.primary,
                  }}
                />
              </Box>
              <InventoryLink
                target={t.settlement?.expense_ref ?? t.inventory.batch}
              />
            </>
          ) : receivedQty > 0 ? (
            <>
              <Typography
                sx={{
                  fontSize: 11,
                  color: hubTokens.subtle,
                  fontStyle: "italic",
                  marginBottom: "6px",
                }}
              >
                Merged into the site&apos;s {t.material_name} stock pool
                (own-site POs don&apos;t separate batches).
              </Typography>
              <DetailRow
                label="Added to stock"
                value={`${Math.round(receivedQty)} ${t.material_unit}`}
                emphasis
              />
              {orderedQty > receivedQty && (
                <DetailRow
                  label="Awaiting"
                  value={`${Math.round(orderedQty - receivedQty)} ${t.material_unit}`}
                  tone="warn"
                />
              )}
              {t.pool && (t.pool.used > 0 || t.pool.remaining > 0) && (
                <>
                  <Box sx={{ marginTop: "8px" }}>
                    <DetailRow
                      label="Pool used"
                      value={`${Math.round(t.pool.used)} ${t.material_unit}`}
                    />
                    <DetailRow
                      label="Pool remaining"
                      value={`${Math.round(t.pool.remaining)} ${t.material_unit}`}
                      tone={t.pool.remaining <= 0 ? "muted" : "success"}
                      emphasis
                    />
                  </Box>
                  {/* Pool progress bar — visually mirrors batch-scoped bar so
                      the engineer reads it the same way, but explicitly labeled
                      as pool-wide rather than per-PO. */}
                  <Box
                    sx={{
                      marginTop: "6px",
                      height: 6,
                      borderRadius: "3px",
                      background: hubTokens.hairline,
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        width: `${
                          t.pool.used + t.pool.remaining > 0
                            ? Math.min(
                                100,
                                (t.pool.used / (t.pool.used + t.pool.remaining)) * 100
                              )
                            : 0
                        }%`,
                        height: "100%",
                        background:
                          t.pool.remaining <= 0
                            ? hubTokens.success
                            : hubTokens.primary,
                      }}
                    />
                  </Box>
                  {/* Completion chip — at-a-glance state without forcing the
                      engineer to do the (used / used+remaining) math. */}
                  <Box
                    sx={{
                      marginTop: "6px",
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.4px",
                        textTransform: "uppercase",
                        background:
                          t.pool.remaining <= 0
                            ? hubTokens.successSoft
                            : t.pool.used > 0
                              ? hubTokens.warnSoft
                              : hubTokens.chip,
                        color:
                          t.pool.remaining <= 0
                            ? hubTokens.success
                            : t.pool.used > 0
                              ? hubTokens.warn
                              : hubTokens.muted,
                      }}
                    >
                      {t.pool.remaining <= 0
                        ? "✓ Pool exhausted"
                        : t.pool.used > 0
                          ? "Pool in use"
                          : "Pool untouched"}
                    </Box>
                  </Box>
                </>
              )}
              <InventoryLink
                target={t.settlement?.expense_ref ?? t.material_name}
              />
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              No inventory yet.
            </Typography>
          )}
        </Box>
      </Box>

      {/* 6. Inter-site usage (group) OR Expenses (own) */}
      <Box>
        <BlockHeader title={isOwn ? "Expenses" : "Inter-site usage"} complete={hasUsage} />
        <Box
          sx={{
            background: hubTokens.card,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          {isOwn ? (
            hasSettlement ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <Typography sx={{ fontSize: 12, color: hubTokens.success, fontWeight: 600 }}>
                  Posted to site expenses · {inr(t.settlement?.amount ?? t.spot?.amount ?? 0)}
                </Typography>
                {t.settlement?.expense_ref && (
                  <>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: 11,
                        color: hubTokens.muted,
                      }}
                    >
                      <Box component="span">Ref:</Box>
                      <Box
                        component="a"
                        href={`/site/expenses?q=${encodeURIComponent(
                          t.settlement.expense_ref
                        )}&fromHub=${encodeURIComponent(t.id)}`}
                        sx={{
                          fontFamily: hubTokens.mono,
                          color: hubTokens.primary,
                          textDecoration: "none",
                          "&:hover": { textDecoration: "underline" },
                        }}
                      >
                        {t.settlement.expense_ref}
                      </Box>
                    </Box>
                    {t.settlement.settled_at && (
                      <Typography
                        sx={{
                          fontSize: 10.5,
                          color: hubTokens.subtle,
                          fontStyle: "italic",
                        }}
                      >
                        Note: /site/expenses sorts by settlement date (
                        {fmtDateShort(t.settlement.settled_at)}), not the
                        delivery date.
                      </Typography>
                    )}
                  </>
                )}
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
                Will post after settlement.
              </Typography>
            )
          ) : t.inter_site_usage && t.inter_site_usage.length > 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {t.inter_site_usage.map((u, i) => (
                <Box
                  key={i}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 6px",
                    background: hubTokens.hairline,
                    borderRadius: "6px",
                    fontSize: 11.5,
                  }}
                >
                  <Box sx={{ fontFamily: hubTokens.mono }}>{u.site_id.slice(0, 8)}…</Box>
                  <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Box sx={{ color: hubTokens.muted }}>
                      {u.used.toFixed(1)} {t.material_unit}
                    </Box>
                    <Box sx={{ fontFamily: hubTokens.mono, color: hubTokens.text, fontWeight: 600 }}>
                      {inr(u.value)}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              No usage logged yet.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
