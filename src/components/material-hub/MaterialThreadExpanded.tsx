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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Collapse, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ImageIcon from "@mui/icons-material/Image";
import DescriptionIcon from "@mui/icons-material/Description";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { hubTokens } from "@/lib/material-hub/tokens";
import { formatPayerSource } from "@/lib/settlement/payerSource";
import { inr } from "@/lib/material-hub/formatters";
import { fmtDateShort } from "@/lib/material-hub/formatters";
import { fmtQty } from "@/lib/formatters";
import { M_STAGES, stageIndex } from "@/lib/material-hub/stageHelpers";
import {
  useBatchSettlementSummary,
  useBatchVariantSummary,
  usePushSelfUseExpense,
} from "@/hooks/queries/useBatchUsage";
import { useInterSiteBalances } from "@/hooks/queries/useInterSiteSettlements";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { hasEditPermission } from "@/lib/permissions";
import UsageLogList from "@/components/inventory/UsageLogList";
import type { UsageLogItem } from "@/hooks/queries/useUsageLog";
import ThreadCorrectionMenu from "@/components/material-hub/ThreadCorrectionMenu";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";
import type { WorkPhoto } from "@/types/work-updates.types";
import { normalizeImageUrl } from "@/lib/utils/storageUrl";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

const DELIVERED_IDX = M_STAGES.indexOf("delivered");
const SETTLED_IDX = M_STAGES.indexOf("settled");
const IN_USE_IDX = M_STAGES.indexOf("in-use");

interface BlockHeaderProps {
  title: string;
  complete: boolean;
  action?: React.ReactNode;
  /** Secondary control (e.g. the "Correct" menu) rendered left of `action`. */
  correct?: React.ReactNode;
}

function BlockHeader({ title, complete, action, correct }: BlockHeaderProps) {
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
      {(correct || action) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {correct}
          {action}
        </Box>
      )}
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

type AttachmentTone = "primary" | "success" | "warn" | "muted";
type AttachmentIcon = "bill" | "screenshot" | "doc";

/** Small clickable icon for an attached scan / screenshot / bill. Opens the
 *  image INSIDE the app (via PhotoLightbox) rather than a raw new browser tab —
 *  historical URLs are normalized through {@link normalizeImageUrl} so they
 *  load on blocked ISPs and repair the doubled-bucket 404. Tooltip describes
 *  what's attached. Used in the PO, Delivery, and Settlement blocks. */
function AttachmentIconLink({
  label,
  icon,
  tone = "primary",
  onOpen,
}: {
  label: string;
  icon: AttachmentIcon;
  tone?: AttachmentTone;
  onOpen: () => void;
}) {
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
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "6px",
          background: hubTokens.chip,
          color,
          cursor: "pointer",
          transition: "background 0.15s ease",
          "&:hover": { background: hubTokens.hairline },
        }}
      >
        <Icon sx={{ fontSize: 14 }} />
      </Box>
    </Tooltip>
  );
}

interface AttachmentItem {
  url: string | null | undefined;
  label: string;
  icon: AttachmentIcon;
  tone?: AttachmentTone;
}

/** Renders a row of attachment icons for one block. Builds a single normalized
 *  photo list from the present attachments and opens the shared lightbox at the
 *  clicked image (so bill/screenshot navigate with prev/next). Returns null when
 *  nothing is attached. */
function AttachmentGroup({
  items,
  onOpen,
  gap = "4px",
  marginRight,
}: {
  items: AttachmentItem[];
  onOpen: (photos: WorkPhoto[], index: number) => void;
  gap?: string;
  marginRight?: string;
}) {
  const present = items.filter((it) => !!it.url);
  if (present.length === 0) return null;
  const photos: WorkPhoto[] = present.map((it, i) => ({
    id: `att-${i}`,
    url: normalizeImageUrl(it.url),
    description: it.label,
    uploadedAt: "",
  }));
  return (
    <Box sx={{ display: "flex", gap, ...(marginRight ? { marginRight } : {}) }}>
      {present.map((it, i) => (
        <AttachmentIconLink
          key={it.label}
          label={it.label}
          icon={it.icon}
          tone={it.tone}
          onOpen={() => onOpen(photos, i)}
        />
      ))}
    </Box>
  );
}

/** Compact "View on inventory →" link rendered at the bottom of the
 *  Inventory block.
 *
 *  Two routing modes:
 *    - `search`     → `?focus=<term>` populates the inventory search box
 *                     (visible to the user). Use this for human-readable refs
 *                     like a batch/expense ref_code.
 *    - `materialId` → `?focusMaterialId=<uuid>` silently filters to that
 *                     material. Use this when there's no human-readable batch
 *                     handle (own-PO pooled threads where stock merges into
 *                     the material bucket) — a UUID in the visible search box
 *                     would look like noise to the engineer.
 *
 *  `search` wins when both are provided. */
function InventoryLink({
  search,
  materialId,
  materialName,
}: {
  search?: string | null;
  materialId?: string | null;
  /** Display name carried alongside materialId so the inventory page can label
   *  the "Focused on …" chip and empty state without needing to resolve the
   *  UUID against fetched rows (a row may not exist yet if delivery hasn't
   *  been verified). */
  materialName?: string | null;
}) {
  let href: string | null = null;
  if (search) {
    href = `/site/materials/inventory?focus=${encodeURIComponent(search)}`;
  } else if (materialId) {
    const parts = [`focusMaterialId=${encodeURIComponent(materialId)}`];
    if (materialName) {
      parts.push(`focusMaterialName=${encodeURIComponent(materialName)}`);
    }
    href = `/site/materials/inventory?${parts.join("&")}`;
  }
  if (!href) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
      <Box
        component="a"
        href={href}
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
  const router = useRouter();
  const isOwn = t.kind === "own";
  const isSpot = t.purchase_type === "spot";

  const { userProfile } = useAuth();
  // All roles may correct/edit (subject to per-row settled locks); mirror
  // threads stay read-only — corrections belong to the originating site.
  const canEdit = !t.is_mirror && hasEditPermission(userProfile?.role);

  // The site being viewed. On a cluster group thread t.site_id is the
  // REQUESTING site, so per-site gates (usage-log edit/delete) must compare
  // against the viewer's site, not the thread's.
  const { selectedSite } = useSelectedSite();

  const [showUsageLog, setShowUsageLog] = useState(false);

  // In-app image viewer for attached bills / screenshots / scans. Replaces the
  // old "open in a new browser tab" anchors (which also 404'd on historically
  // doubled storage paths — now repaired by normalizeImageUrl at display time).
  const [lightbox, setLightbox] = useState<{
    photos: WorkPhoto[];
    index: number;
  } | null>(null);
  const openLightbox = (photos: WorkPhoto[], index: number) =>
    setLightbox({ photos, index });

  // Group batch with a real ref code → fetch per-site + per-variant breakdown.
  // The "—" sentinel from formatters means "no batch yet" — skip the RPC then.
  const groupBatchRefCode =
    !isOwn && t.inventory?.batch && t.inventory.batch !== "—"
      ? t.inventory.batch
      : undefined;
  const { data: batchSummary } = useBatchSettlementSummary(groupBatchRefCode);
  const { data: variantSummary = [] } = useBatchVariantSummary(groupBatchRefCode);

  // Manual "push self-use to material expense" for a fully-own-used group batch
  // (the silent auto-trigger was dropped — see migration 20260601130000).
  const pushSelfUse = usePushSelfUseExpense();

  // Group-wide pairwise net between the batch's paying site and each site that
  // still owes on THIS batch — so the card explains that the per-row figures
  // are per-batch while the real balance is netted across all shared batches.
  const membership = useSiteGroupMembership(t.site_id);
  const { data: interSiteBalances = [] } = useInterSiteBalances(
    membership.data?.groupId ?? undefined
  );
  const payerSiteId = batchSummary?.paying_site_id ?? null;
  const pendingDebtors = (batchSummary?.site_allocations ?? []).filter(
    (a) => !a.is_payer && a.settlement_status === "pending"
  );
  /** Net ₹ between payer and debtor across ALL unsettled batches. Positive →
   *  debtor owes payer net; negative → payer owes debtor net. */
  const pairwiseNet = (debtorId: string): number => {
    if (!payerSiteId) return 0;
    let debtorOwesPayer = 0;
    let payerOwesDebtor = 0;
    for (const b of interSiteBalances) {
      if (b.is_settled) continue;
      if (b.creditor_site_id === payerSiteId && b.debtor_site_id === debtorId)
        debtorOwesPayer += Number(b.total_amount_owed ?? 0);
      if (b.creditor_site_id === debtorId && b.debtor_site_id === payerSiteId)
        payerOwesDebtor += Number(b.total_amount_owed ?? 0);
    }
    return debtorOwesPayer - payerOwesDebtor;
  };

  // Usage-log item: a group thread keys on its batch ref_code (one row per
  // event); an own/pooled thread keys on (site, material) — brand is left null
  // so merged variants of the same material all surface.
  const usageLogItem: UsageLogItem = {
    material_id: t.material_id,
    brand_id: null,
    material_name: t.material_name,
    material_unit: t.material_unit,
    batch_code: groupBatchRefCode ?? null,
    kind: isOwn ? "own" : "group",
  };

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
    (isOwn && hasSettlement) ||
    // A self-used group batch's "Expenses" step is complete only once its cost
    // has actually been posted to all-site expenses (pending push → incomplete).
    !!t.self_use_expense;

  return (
    <>
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
      {t.is_mirror && (
        <Box
          sx={{
            gridColumn: { xs: "1", md: "1 / -1" },
            background: hubTokens.chip,
            border: `1px dashed ${hubTokens.border}`,
            borderRadius: "8px",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: 11.5,
            color: hubTokens.muted,
          }}
        >
          <Box component="span" sx={{ fontWeight: 700, color: hubTokens.text }}>
            Shared from {t.mirrored_from_site_name ?? "another site"}
          </Box>
          <Box component="span">
            · This thread is read-only here. Approvals, deliveries, and
            settlement are managed on the originating site. Inventory · Stock
            for this PO lives there too.
          </Box>
        </Box>
      )}
      {t.kind === "group" && !t.is_mirror && (
        <Box
          sx={{
            gridColumn: { xs: "1", md: "1 / -1" },
            background: hubTokens.pinkSoft ?? hubTokens.chip,
            border: `1px solid ${hubTokens.pink ?? hubTokens.border}`,
            borderRadius: "8px",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            fontSize: 11.5,
            color: hubTokens.muted,
          }}
        >
          <Box component="span" sx={{ fontWeight: 700, color: hubTokens.text }}>
            Group purchase
          </Box>
          {t.po?.payer_site_name &&
          t.po?.debtor_site_name &&
          t.po.payer_site_id !== t.po.debtor_site_id ? (
            <Box component="span">
              · Paid by{" "}
              <Box component="span" sx={{ fontWeight: 700, color: hubTokens.pink ?? hubTokens.text }}>
                {t.po.payer_site_name}
              </Box>{" "}
              · For{" "}
              <Box component="span" sx={{ fontWeight: 700, color: hubTokens.text }}>
                {t.po.debtor_site_name}
              </Box>
            </Box>
          ) : (
            <Box component="span">· Shared across the cluster — any site can act</Box>
          )}
          {t.is_sibling_request && t.mirrored_from_site_name && (
            <Box component="span">· Requested by {t.mirrored_from_site_name}</Box>
          )}
        </Box>
      )}
      {/* 1. Request */}
      <Box>
        <BlockHeader
          title="Request"
          complete={hasRequest}
          correct={<ThreadCorrectionMenu thread={t} section="request" canEdit={canEdit} />}
        />
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
          correct={<ThreadCorrectionMenu thread={t} section="po" canEdit={canEdit} />}
          action={
            t.po && (t.po.vendor_bill_url || t.po.quotation_url) ? (
              <AttachmentGroup
                onOpen={openLightbox}
                items={[
                  { url: t.po.vendor_bill_url, label: "Vendor bill", icon: "bill" },
                  { url: t.po.quotation_url, label: "Quotation", icon: "doc" },
                ]}
              />
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
        <BlockHeader
          title="Delivery & quality"
          complete={hasDelivery}
          correct={<ThreadCorrectionMenu thread={t} section="delivery" canEdit={canEdit} />}
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
                    value={`${fmtQty(receivedQty)} of ${fmtQty(orderedQty)} ${t.material_unit}`}
                    emphasis
                  />
                  <DetailRow
                    label="Pending"
                    value={`${fmtQty(Math.max(0, orderedQty - receivedQty))} ${t.material_unit}`}
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
                        {fmtQty(b.accepted_qty || b.received_qty)} {t.material_unit}
                      </Box>
                      <Box
                        component="span"
                        sx={{ color: hubTokens.subtle, flex: 1, fontSize: 10.5 }}
                      >
                        {b.grn_number}
                      </Box>
                      {/* Per-batch attachments (challan / invoice scan) */}
                      <AttachmentGroup
                        onOpen={openLightbox}
                        gap="3px"
                        marginRight="2px"
                        items={[
                          { url: b.challan_url, label: "Challan", icon: "doc", tone: "muted" },
                          { url: b.invoice_url, label: "Invoice", icon: "bill", tone: "muted" },
                        ]}
                      />
                      {b.verified || settledOrBeyond ? (
                        // Once the vendor has been paid (or the material
                        // is in-use / exhausted), the GRN's verification
                        // flag is moot — paying for the delivery is itself
                        // acceptance. Verification "PENDING" only makes
                        // sense in the window between delivery and
                        // settlement, where the engineer's next action is
                        // actually to verify before settling.
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
          correct={<ThreadCorrectionMenu thread={t} section="settlement" canEdit={canEdit} />}
          action={
            t.settlement &&
            (t.settlement.payment_screenshot_url || t.settlement.bill_url) ? (
              <AttachmentGroup
                onOpen={openLightbox}
                items={[
                  {
                    url: t.settlement.payment_screenshot_url,
                    label: "Payment screenshot",
                    icon: "screenshot",
                    tone: "success",
                  },
                  { url: t.settlement.bill_url, label: "Vendor bill", icon: "bill", tone: "success" },
                ]}
              />
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
              {/* Bargain indication: when the actual settled amount is lower
                  than the PO total (vendor accepted a discount), show the PO
                  amount struck through next to the paid amount. Surfaces the
                  savings without forcing the engineer to cross-reference the
                  PO block. Threshold of ₹1 ignores cosmetic rounding. */}
              {t.po && t.po.amount - t.settlement.amount > 1 ? (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "4px 0",
                    gap: "10px",
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
                    Amount
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: hubTokens.muted,
                        textDecoration: "line-through",
                        fontFamily: hubTokens.mono,
                      }}
                    >
                      {inr(t.po.amount)}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: hubTokens.success,
                        fontFamily: hubTokens.mono,
                      }}
                    >
                      {inr(t.settlement.amount)}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <DetailRow label="Amount" value={inr(t.settlement.amount)} emphasis />
              )}
              {t.po && t.po.amount - t.settlement.amount > 1 && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "-2px",
                    marginBottom: "4px",
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.3px",
                      color: hubTokens.success,
                      background: hubTokens.successSoft,
                      padding: "2px 6px",
                      borderRadius: "8px",
                    }}
                  >
                    BARGAINED · saved {inr(t.po.amount - t.settlement.amount)}
                  </Box>
                </Box>
              )}
              <DetailRow
                label="Status"
                value={t.settlement.status.toUpperCase()}
                tone={t.settlement.status === "settled" ? "success" : "warn"}
              />
              {t.settlement.payment_mode && (
                <DetailRow
                  label="Mode"
                  value={t.settlement.payment_mode.toUpperCase()}
                />
              )}
              {t.settlement.paid_by && (
                <DetailRow label="Paid by" value={t.settlement.paid_by} />
              )}
              {/* Payment source (which fund paid the vendor). Only rendered when
                  actually recorded — an unset source must read as absent, not
                  silently default to "Own Money". Split payments show the summary. */}
              {(() => {
                const split = t.settlement.payer_source_split;
                const hasSplit = Array.isArray(split) && split.length > 0;
                if (!t.settlement.payer_source && !hasSplit) return null;
                const ps = formatPayerSource({
                  payer_source: t.settlement.payer_source ?? null,
                  payer_name: t.settlement.payer_name ?? null,
                  payer_source_split: split ?? null,
                });
                return (
                  <DetailRow
                    label="Source"
                    value={ps.kind === "split" ? ps.summary : ps.label}
                  />
                );
              })()}
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
              {/* Per-site usage chips for shared group batches.
                  Only renders when the batch has been consumed across more than
                  one site (or a single non-payer site) so the line stays quiet
                  for pure self-use batches. */}
              {batchSummary && batchSummary.site_allocations.length > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px",
                    marginLeft: "12px",
                    marginTop: "-2px",
                    marginBottom: "6px",
                  }}
                >
                  {batchSummary.site_allocations.map((a) => (
                    <Box
                      key={a.site_id}
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "1px 7px",
                        borderRadius: "5px",
                        background: a.is_payer ? hubTokens.successSoft : hubTokens.chip,
                        color: a.is_payer ? hubTokens.success : hubTokens.muted,
                        fontSize: 10.5,
                        fontWeight: 600,
                        lineHeight: "15px",
                      }}
                    >
                      {a.site_name}: {Number(a.quantity_used)} {t.material_unit}
                    </Box>
                  ))}
                </Box>
              )}
              <DetailRow
                label="Remaining"
                value={`${t.inventory.remaining} ${t.material_unit}`}
                emphasis
                tone="success"
              />
              {/* Per-variant breakdown for multi-line group batches.
                  Renders a compact table beneath the totals so engineers can
                  see used/remaining per size without leaving the row. */}
              {variantSummary.length > 1 && (
                <Box
                  sx={{
                    marginTop: "8px",
                    paddingTop: "8px",
                    borderTop: `1px dashed ${hubTokens.hairline}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: hubTokens.subtle,
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      fontWeight: 600,
                    }}
                  >
                    By variant
                  </Typography>
                  {/* Index guards against duplicate (material_id, brand_id)
                      rows — same reason as the variant chips in
                      MaterialThreadRow. */}
                  {variantSummary.map((v, i) => (
                    <Box
                      key={`${v.material_id}::${v.brand_id ?? ""}::${i}`}
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 11.5,
                      }}
                    >
                      <Box component="span" sx={{ color: hubTokens.text, fontWeight: 500 }}>
                        {v.material_name}
                        {v.brand_name ? (
                          <Box
                            component="span"
                            sx={{
                              color: hubTokens.subtle,
                              fontWeight: 400,
                              marginLeft: "4px",
                            }}
                          >
                            · {v.brand_name}
                          </Box>
                        ) : null}
                      </Box>
                      <Box component="span" sx={{ color: hubTokens.muted, fontFamily: hubTokens.mono }}>
                        <Box component="span" sx={{ color: hubTokens.text }}>
                          {v.used_qty}
                        </Box>
                        {" used · "}
                        <Box
                          component="span"
                          sx={{
                            color: v.remaining_qty > 0 ? hubTokens.success : hubTokens.subtle,
                            fontWeight: 600,
                          }}
                        >
                          {v.remaining_qty}
                        </Box>
                        {` left · ${v.original_qty} ${v.unit}`}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
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
                search={t.settlement?.expense_ref ?? t.inventory.batch}
                materialId={t.material_id}
                materialName={t.material_name}
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
                value={`${fmtQty(receivedQty)} ${t.material_unit}`}
                emphasis
              />
              {orderedQty > receivedQty && (
                <DetailRow
                  label="Awaiting"
                  value={`${fmtQty(orderedQty - receivedQty)} ${t.material_unit}`}
                  tone="warn"
                />
              )}
              {/* NOTE: site-wide pool stats intentionally NOT rendered here.
                  Own-site POs merge into a shared bucket where per-PO
                  used/remaining cannot be derived honestly — pool-level state
                  (exhaustion, totals) belongs on the Inventory page where it
                  is scoped to the material, not to one PO. */}
              {/* Own-PO pool: the per-batch handle ("—") is meaningless and
                  the variant-group display name often doesn't substring-match
                  the inventory card names (e.g. "Chips Jalli / Thool Jalli"
                  vs. individual variant rows). Use settlement ref if settled,
                  else fall through to the silent material_id filter. */}
              <InventoryLink
                search={t.settlement?.expense_ref}
                materialId={t.material_id}
                materialName={t.material_name}
              />
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              No inventory yet.
            </Typography>
          )}

          {/* Usage log — who recorded what, when, how much, for which work.
              Collapsed by default; an admin/role-gated edit pencil + delete sit
              on each event once expanded. Only meaningful once stock exists. */}
          {(t.inventory || receivedQty > 0) && (
            <Box sx={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px dashed ${hubTokens.hairline}` }}>
              <Box
                role="button"
                tabIndex={0}
                onClick={() => setShowUsageLog((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setShowUsageLog((v) => !v);
                  }
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  userSelect: "none",
                  color: hubTokens.primary,
                  fontSize: 11,
                  fontWeight: 600,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {showUsageLog ? (
                  <ExpandLessIcon sx={{ fontSize: 15 }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 15 }} />
                )}
                {showUsageLog ? "Hide usage log" : "Show usage log"}
              </Box>
              <Collapse in={showUsageLog} unmountOnExit>
                <Box sx={{ marginTop: "6px" }}>
                  <UsageLogList
                    item={usageLogItem}
                    siteId={t.site_id}
                    currentSiteId={selectedSite?.id}
                    canEdit={canEdit}
                    showHeader
                    enabled={showUsageLog}
                  />
                </Box>
              </Collapse>
            </Box>
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
                        href={`/site/expenses?c_ref=${encodeURIComponent(
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
          ) : batchSummary && batchSummary.site_allocations.length > 0 ? (
            // Prefer the settlement summary: it carries real site names, the
            // payer flag, and per-site amounts. The legacy t.inter_site_usage
            // only had truncated UUIDs, so we render from batchSummary whenever
            // it's available (it is, once the batch has any logged usage).
            <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {batchSummary.site_allocations.map((a) => {
                const settled = a.settlement_status === "settled";
                return (
                  <Box
                    key={a.site_id}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "5px 8px",
                      background: a.is_payer ? hubTokens.successSoft : hubTokens.hairline,
                      borderRadius: "6px",
                      fontSize: 11.5,
                    }}
                  >
                    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <Box sx={{ fontWeight: 600, color: hubTokens.text }}>{a.site_name}</Box>
                      <Box sx={{ fontSize: 10, color: hubTokens.subtle }}>
                        {a.is_payer
                          ? "self-use (paid for batch)"
                          : settled
                            ? `settled with ${batchSummary.paying_site_name}`
                            : `owes ${batchSummary.paying_site_name}`}
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                      <Box sx={{ color: hubTokens.muted }}>
                        {fmtQty(Number(a.quantity_used))} {t.material_unit}
                      </Box>
                      <Box sx={{ fontFamily: hubTokens.mono, color: hubTokens.text, fontWeight: 600 }}>
                        {inr(Number(a.amount))}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
              </Box>

              {t.is_group_self_used ? (
                t.self_use_expense ? (
                  // Already posted → show a clickable ref that deep-links into
                  // all-site expenses filtered to exactly this one expense.
                  <Box
                    sx={{
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: hubTokens.successSoft,
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                    }}
                  >
                    <Typography
                      sx={{ fontSize: 11, color: hubTokens.success, fontWeight: 600 }}
                    >
                      Recorded as material expense · {inr(t.self_use_expense.amount)}
                    </Typography>
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
                        href={`/site/expenses?c_ref=${encodeURIComponent(
                          t.self_use_expense.ref_code
                        )}&fromHub=${encodeURIComponent(t.id)}`}
                        sx={{
                          fontFamily: hubTokens.mono,
                          color: hubTokens.primary,
                          textDecoration: "none",
                          "&:hover": { textDecoration: "underline" },
                        }}
                      >
                        {t.self_use_expense.ref_code}
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  // Not posted yet → amber pending + the manual push action. The
                  // spend isn't in all-site expenses until this is clicked.
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <Box
                      sx={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        background: hubTokens.warnSoft,
                        color: hubTokens.warn,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Used fully by own site — not yet posted to material expenses.
                    </Box>
                    <Box
                      component="button"
                      type="button"
                      disabled={pushSelfUse.isPending || !groupBatchRefCode}
                      onClick={() => {
                        if (!groupBatchRefCode) return;
                        pushSelfUse.mutate({
                          batchRefCode: groupBatchRefCode,
                          siteId: t.site_id,
                        });
                      }}
                      sx={{
                        alignSelf: "flex-start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 12px",
                        border: "none",
                        cursor: pushSelfUse.isPending ? "default" : "pointer",
                        borderRadius: "6px",
                        background: hubTokens.primary,
                        color: "#fff",
                        fontSize: 11.5,
                        fontWeight: 600,
                        opacity: pushSelfUse.isPending ? 0.7 : 1,
                      }}
                    >
                      {pushSelfUse.isPending
                        ? "Posting…"
                        : "Push to material expense"}
                      {!pushSelfUse.isPending && (
                        <ArrowForwardIcon sx={{ fontSize: 13 }} />
                      )}
                    </Box>
                    {pushSelfUse.isError && (
                      <Typography sx={{ fontSize: 10.5, color: hubTokens.danger }}>
                        {(pushSelfUse.error as Error)?.message ??
                          "Couldn't post — try again."}
                      </Typography>
                    )}
                  </Box>
                )
              ) : pendingDebtors.length > 0 ? (
                <Box
                  sx={{
                    borderTop: `1px solid ${hubTokens.hairline}`,
                    paddingTop: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <Typography sx={{ fontSize: 10, color: hubTokens.subtle, fontStyle: "italic" }}>
                    Amounts above are for this batch only. Net balance is reconciled across all
                    shared batches:
                  </Typography>
                  {pendingDebtors.map((d) => {
                    const net = pairwiseNet(d.site_id);
                    const payerName = batchSummary?.paying_site_name ?? "payer";
                    const ower = net >= 0 ? d.site_name : payerName;
                    const owed = net >= 0 ? payerName : d.site_name;
                    return (
                      <Box
                        key={d.site_id}
                        sx={{ fontSize: 11.5, color: hubTokens.text }}
                      >
                        Net with <strong>{d.site_name}</strong>:{" "}
                        {Math.abs(net) < 1 ? (
                          "settled up"
                        ) : (
                          <>
                            {ower} owes {owed}{" "}
                            <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 700 }}>
                              {inr(Math.abs(net))}
                            </Box>
                          </>
                        )}
                      </Box>
                    );
                  })}
                  {groupBatchRefCode && (
                    <Box
                      component="button"
                      type="button"
                      onClick={() =>
                        router.push(
                          `/site/inter-site-settlement?batch=${encodeURIComponent(
                            groupBatchRefCode
                          )}`
                        )
                      }
                      sx={{
                        alignSelf: "flex-start",
                        marginTop: "2px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "5px 10px",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: "6px",
                        background: hubTokens.primary,
                        color: "#fff",
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      Settle this batch
                      <ArrowForwardIcon sx={{ fontSize: 13 }} />
                    </Box>
                  )}
                </Box>
              ) : null}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 12, color: hubTokens.subtle, fontStyle: "italic" }}>
              No usage logged yet.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
      <PhotoLightbox
        open={!!lightbox}
        photos={lightbox?.photos ?? []}
        startIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}
