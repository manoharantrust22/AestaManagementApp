"use client";

/**
 * One row per thread in the Material Hub's cards layout.
 *
 * Grid: 4px · 1.4fr · 2fr · 1.2fr · 160px (5 columns desktop).
 *   1. Left color band (full-height) — primary for own, pink for group.
 *   2. Material block — id chip, badges, title, subline.
 *   3. Pipeline — 6-stage mini timeline (or 2-3 for spot).
 *   4. Money block — amount, vendor, advance progress bar, spot wallet line.
 *   5. Action button — Next-action verb or "All clear".
 *
 * Click the row (except the action button) to toggle inline expand.
 *
 * Mirrors `ProtoThreadRow` in docs/MaterialHub_Redesign/proto-screens.jsx.
 */

import { Box, Typography, useMediaQuery } from "@mui/material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { hubTokens, HUB_BREAKPOINT_PX } from "@/lib/material-hub/tokens";
import { inr, fmtDateShort } from "@/lib/material-hub/formatters";
import { threadVariantCategory } from "@/lib/material-hub/threadTitle";
import { fmtQty } from "@/lib/formatters";
import { M_STAGES, VISIBLE_STAGES, stageIndex, stageLabel, type VisibleStageKey } from "@/lib/material-hub/stageHelpers";
import MaterialThreadPipeline from "./MaterialThreadPipeline";
import MaterialThreadExpanded from "./MaterialThreadExpanded";
import ThreadActionButton from "./ThreadActionButton";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export interface MaterialThreadRowProps {
  thread: MaterialThread;
  selected: boolean;
  onSelect: () => void;
  onAction?: (thread: MaterialThread) => void;
}

export default function MaterialThreadRow({
  thread,
  selected,
  onSelect,
  onAction,
}: MaterialThreadRowProps) {
  const isMobile = useMediaQuery(`(max-width:${HUB_BREAKPOINT_PX - 1}px)`);
  const isGroup = thread.kind === "group";
  const isAdvance = thread.advance;
  const isSpot = thread.purchase_type === "spot";
  const accent = isGroup ? hubTokens.pink : hubTokens.primary;
  // Mirror threads (cluster-mate's group POs surfaced on this site) get a
  // dimmed band so the visual hierarchy makes ownership obvious at a glance.
  const bandOpacity = thread.is_mirror ? 0.22 : isGroup ? 1 : 0.35;
  const idx = stageIndex(thread.stage);

  // Mobile compact pipeline: same steps as the desktop pipeline, appending the
  // synthetic INTER-SITE bar for group threads with cross-site usage.
  const mobileStages: { key: VisibleStageKey; label: string }[] =
    thread.inter_site_applicable
      ? [...VISIBLE_STAGES, { key: "inter-site", label: "INTER-SITE" }]
      : VISIBLE_STAGES;

  const handleAction = (t: MaterialThread) => {
    if (onAction) onAction(t);
  };

  // Money block contents
  const moneyAmount = isSpot ? thread.spot?.amount ?? 0 : thread.po?.amount ?? 0;
  const vendorName = isSpot ? thread.spot?.vendor_name : thread.po?.vendor_name;
  // Show a delivery-progress bar for ANY non-spot PO that has partial delivery,
  // not just legacy "advance batches" arrays. This drives the visible "80/200"
  // hint in the money block.
  const orderedQty = thread.po?.qty ?? 0;
  const receivedQty = thread.po?.received_qty ?? 0;
  const showDeliveryBar =
    !isSpot && thread.po != null && receivedQty > 0 && receivedQty < orderedQty;
  const advancePct = orderedQty > 0 ? (receivedQty / orderedQty) * 100 : 0;
  const isAdvancePaid =
    !isSpot &&
    thread.po?.payment_timing === "advance" &&
    (thread.po?.advance_paid ?? 0) > 0;

  return (
    <Box
      sx={{
        background: hubTokens.card,
        borderRadius: "12px",
        border: `1px solid ${selected ? accent : hubTokens.border}`,
        transition: "all .12s",
        overflow: "hidden",
        boxShadow: selected
          ? `0 1px 0 ${accent}, 0 8px 24px rgba(15,23,42,.06)`
          : "none",
      }}
    >
      <Box
        onClick={onSelect}
        sx={{
          display: isMobile ? "flex" : "grid",
          flexDirection: isMobile ? "column" : undefined,
          gridTemplateColumns: isMobile ? undefined : "4px 1.4fr 2fr 1.2fr 160px",
          gap: isMobile ? "10px" : "14px",
          alignItems: isMobile ? "stretch" : "center",
          padding: isMobile ? "14px" : "16px 18px 16px 0",
          cursor: "pointer",
          borderLeft: isMobile ? `4px solid ${accent}` : undefined,
        }}
      >
        {!isMobile && (
          <Box
            sx={{
              alignSelf: "stretch",
              background: accent,
              opacity: bandOpacity,
            }}
          />
        )}

        {/* Material block */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <Typography
              component="span"
              sx={{
                fontSize: 10.5,
                fontFamily: hubTokens.mono,
                fontWeight: 600,
                color: hubTokens.subtle,
                letterSpacing: "0.2px",
              }}
            >
              {thread.id}
            </Typography>
            {thread.is_historical && (
              <ThreadChip tone="warn">
                <Dot color={hubTokens.warn} /> Backfilled
              </ThreadChip>
            )}
            {isSpot && (
              <ThreadChip tone="warn">
                <Dot color={hubTokens.warn} /> Spot · wallet
              </ThreadChip>
            )}
            {isGroup && (
              <ThreadChip tone="pink">
                <Dot color={hubTokens.pink} />{" "}
                {thread.po?.payer_site_name &&
                thread.po.payer_site_id !== thread.po.debtor_site_id
                  ? `Group · Paid by ${thread.po.payer_site_name}`
                  : "Group · cluster"}
              </ThreadChip>
            )}
            {isGroup && thread.is_group_self_used && (
              <ThreadChip tone="success">
                <Dot color={hubTokens.success} /> Used fully by own site
              </ThreadChip>
            )}
            {thread.is_mirror && (
              <ThreadChip tone="neutral">
                Shared from {thread.mirrored_from_site_name ?? "other site"}
              </ThreadChip>
            )}
            {isAdvance && (
              <ThreadChip tone="warn">
                <Dot color={hubTokens.warn} /> Advance
              </ThreadChip>
            )}
            {(thread.priority === "high" || thread.priority === "urgent") && (
              <ThreadChip tone="danger">HIGH</ThreadChip>
            )}
            {thread.vendor_is_draft && <DraftTag label="+V" title="New vendor — saved as draft" />}
            {thread.material_is_draft && <DraftTag label="+M" title="New material — saved as draft" />}
          </Box>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              color: hubTokens.text,
              letterSpacing: "-0.1px",
            }}
          >
            <Box component="span" sx={{ fontFamily: hubTokens.mono }}>
              {thread.qty}
            </Box>
            <Box component="span" sx={{ color: hubTokens.muted, fontWeight: 500 }}>
              {" "}
              {thread.material_unit} ·{" "}
            </Box>
            {thread.variants && thread.variants.length > 1
              ? `${threadVariantCategory(thread.variants, thread.material_name)} · ${thread.variants.length} sizes`
              : thread.material_name}
          </Typography>
          {thread.variants && thread.variants.length > 1 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px", mt: "2px" }}>
              {/* Index in the key: one request can carry several line items for
                  the same (material_id, brand_id) — e.g. "Teak wood · 5 sizes"
                  with no brand — so material_id::brand_id alone collides. */}
              {thread.variants.map((v, i) => (
                <ThreadChip key={`${v.material_id}::${v.brand_id ?? ""}::${i}`} tone="neutral">
                  {variantShortLabel(v.material_name, threadVariantCategory(thread.variants ?? [], thread.material_name))} · {v.requested_qty}
                  {v.unit ? ` ${v.unit}` : ""}
                </ThreadChip>
              ))}
            </Box>
          )}
          <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
            {thread.section || "—"}
            {thread.floor && thread.floor !== "—" ? ` · ${thread.floor}` : ""}
            {" · "}requested {fmtDateShort(thread.requested_at)}
          </Typography>
        </Box>

        {/* Pipeline (desktop only) */}
        {!isMobile && (
          <Box>
            <MaterialThreadPipeline thread={thread} />
          </Box>
        )}

        {/* Money block (desktop) */}
        {!isMobile ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
            {isSpot ? (
              <>
                <Typography
                  sx={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    fontFamily: hubTokens.mono,
                  }}
                >
                  {inr(moneyAmount)}
                </Typography>
                <Box
                  sx={{
                    fontSize: 11.5,
                    color: hubTokens.muted,
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <PersonOutlineIcon sx={{ fontSize: 12, color: hubTokens.subtle }} />
                  <Box
                    component="span"
                    sx={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {vendorName}
                  </Box>
                </Box>
                <Typography
                  sx={{
                    fontSize: 10.5,
                    color: hubTokens.warn,
                    fontWeight: 700,
                  }}
                >
                  Wallet · {thread.spot?.payment_mode?.toUpperCase() ?? "CASH"}
                </Typography>
              </>
            ) : thread.po ? (
              <>
                <Typography
                  sx={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    fontFamily: hubTokens.mono,
                  }}
                >
                  {inr(moneyAmount)}
                </Typography>
                <Box
                  sx={{
                    fontSize: 11.5,
                    color: hubTokens.muted,
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <PersonOutlineIcon sx={{ fontSize: 12, color: hubTokens.subtle }} />
                  <Box
                    component="span"
                    sx={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {vendorName || "—"}
                  </Box>
                </Box>
                {isAdvancePaid && (
                  <Typography
                    sx={{
                      fontSize: 10.5,
                      color: hubTokens.success,
                      fontWeight: 700,
                    }}
                  >
                    ✓ Advance paid · vendor settled
                  </Typography>
                )}
                {showDeliveryBar && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      marginTop: "2px",
                    }}
                  >
                    <Box
                      sx={{
                        flex: 1,
                        height: 4,
                        borderRadius: "2px",
                        background: hubTokens.warnSoft,
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          width: `${Math.min(advancePct, 100)}%`,
                          height: "100%",
                          background: hubTokens.warn,
                        }}
                      />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: 10.5,
                        color: hubTokens.warn,
                        fontWeight: 700,
                        fontFamily: hubTokens.mono,
                      }}
                    >
                      {fmtQty(receivedQty)}/{fmtQty(orderedQty)} {thread.material_unit}
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              <Typography
                sx={{
                  fontSize: 11.5,
                  color: hubTokens.subtle,
                  fontStyle: "italic",
                }}
              >
                No PO yet
              </Typography>
            )}
          </Box>
        ) : (
          /* Mobile compact: flat-bar pipeline + price inline */
          <>
            <Box sx={{ display: "flex", gap: "3px", marginTop: "4px" }}>
              {mobileStages.map((s) => {
                let done: boolean;
                let barColor: string = accent;
                if (s.key === "inventory") {
                  done = !!thread.inventory && thread.inventory.received > 0;
                } else if (s.key === "inter-site") {
                  // Always a colored bar — amber while owed, green once settled.
                  done = true;
                  barColor = thread.inter_site_pending
                    ? hubTokens.warn
                    : hubTokens.success;
                } else {
                  done = M_STAGES.indexOf(s.key) <= idx;
                }
                return (
                  <Box
                    key={s.key}
                    sx={{
                      flex: 1,
                      height: 4,
                      borderRadius: "2px",
                      background: done ? barColor : hubTokens.hairline,
                    }}
                  />
                );
              })}
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "6px",
              }}
            >
              <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
                {isSpot
                  ? `${thread.spot?.vendor_name} · `
                  : thread.po
                    ? `${thread.po.vendor_name || "—"} · `
                    : ""}
                <Box component="b" sx={{ color: hubTokens.text }}>
                  {moneyAmount ? inr(moneyAmount) : ""}
                </Box>
                {!moneyAmount && (
                  <Box component="span" sx={{ fontStyle: "italic" }}>
                    No PO yet
                  </Box>
                )}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Box
                  component="span"
                  sx={{
                    padding: "2px 7px",
                    borderRadius: "5px",
                    background: hubTokens.bg,
                    color: hubTokens.muted,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.4px",
                    textTransform: "uppercase",
                  }}
                >
                  {stageLabel(thread.stage)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "1px",
                    color: hubTokens.primary,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  Details
                  <KeyboardArrowRightIcon sx={{ fontSize: 14 }} />
                </Box>
              </Box>
            </Box>
          </>
        )}

        {/* Action button (desktop) */}
        {!isMobile && (
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <ThreadActionButton
              thread={thread}
              accent={accent}
              onAction={handleAction}
            />
          </Box>
        )}
      </Box>

      {/* Action button (mobile, full-width below) */}
      {isMobile && (
        <Box sx={{ padding: "0 14px 14px" }}>
          <ThreadActionButton
            thread={thread}
            accent={accent}
            fullWidth
            onAction={handleAction}
          />
        </Box>
      )}

      {/* Inline expanded thread (desktop only — mobile uses tap-through) */}
      {selected && !isMobile && <MaterialThreadExpanded thread={thread} />}
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Variant title helpers
// ----------------------------------------------------------------------------

/**
 * Short label for a variant chip — the bit AFTER the common category prefix.
 * "TMT Rods 16mm" with category "TMT Rods" → "16mm".
 */
function variantShortLabel(materialName: string, category: string): string {
  if (!materialName) return "—";
  if (!category) return materialName;
  if (materialName.toLowerCase().startsWith(category.toLowerCase())) {
    const tail = materialName.slice(category.length).replace(/^[\s\-_/]+/, "").trim();
    return tail || materialName;
  }
  return materialName;
}

// ----------------------------------------------------------------------------
// Local primitives
// ----------------------------------------------------------------------------

function Dot({ color }: { color: string }) {
  return (
    <Box
      component="span"
      sx={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
      }}
    />
  );
}

function DraftTag({ label, title }: { label: string; title: string }) {
  return (
    <Box
      component="span"
      title={title}
      sx={{
        padding: "1px 5px",
        borderRadius: "3px",
        background: hubTokens.warnSoft,
        color: hubTokens.warn,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.3px",
        lineHeight: "13px",
      }}
    >
      {label}
    </Box>
  );
}

type ChipTone = "warn" | "pink" | "danger" | "primary" | "neutral" | "success";

function ThreadChip({ children, tone }: { children: React.ReactNode; tone: ChipTone }) {
  const colors = {
    warn: { bg: hubTokens.warnSoft, fg: hubTokens.warn },
    pink: { bg: hubTokens.pinkSoft, fg: hubTokens.pink },
    danger: { bg: hubTokens.dangerSoft, fg: hubTokens.danger },
    primary: { bg: hubTokens.primarySoft, fg: hubTokens.primary },
    neutral: { bg: hubTokens.chip, fg: hubTokens.muted },
    success: { bg: hubTokens.successSoft, fg: hubTokens.success },
  }[tone];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 8px",
        borderRadius: "6px",
        background: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "16px",
        letterSpacing: "0.1px",
      }}
    >
      {children}
    </Box>
  );
}