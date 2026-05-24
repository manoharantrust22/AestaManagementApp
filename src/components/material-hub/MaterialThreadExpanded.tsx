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

import { Box, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import { fmtDateShort } from "@/lib/material-hub/formatters";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

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

export interface MaterialThreadExpandedProps {
  thread: MaterialThread;
}

export default function MaterialThreadExpanded({ thread }: MaterialThreadExpandedProps) {
  const t = thread;
  const isOwn = t.kind === "own";
  const isSpot = t.purchase_type === "spot";

  // Block completion flags
  const hasRequest = true;
  const hasPO = !!t.po || isSpot;
  const hasDelivery = !!t.delivery || isSpot;
  const hasSettlement = t.settlement?.status === "settled" || isSpot;
  const hasInventory = !!t.inventory;
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
        <BlockHeader title="Purchase order" complete={hasPO} />
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
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              Pending delivery.
            </Typography>
          )}
        </Box>
      </Box>

      {/* 4. Settlement */}
      <Box>
        <BlockHeader title="Settlement" complete={hasSettlement} />
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
              <DetailRow label="Batch" value={t.inventory.batch} />
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
                        ? (t.inventory.used / t.inventory.received) * 100
                        : 0
                    }%`,
                    height: "100%",
                    background: hubTokens.primary,
                  }}
                />
              </Box>
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
              <Typography sx={{ fontSize: 12, color: hubTokens.success, fontWeight: 600 }}>
                Posted to {t.site_id} material expenses · {inr(t.settlement?.amount ?? t.spot?.amount ?? 0)}
              </Typography>
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
