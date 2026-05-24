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
import { hubTokens, HUB_BREAKPOINT_PX } from "@/lib/material-hub/tokens";
import { inr, fmtDateShort } from "@/lib/material-hub/formatters";
import { M_STAGES, VISIBLE_STAGES, stageIndex, stageLabel } from "@/lib/material-hub/stageHelpers";
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
  const bandOpacity = isGroup ? 1 : 0.35;
  const idx = stageIndex(thread.stage);

  const handleAction = (t: MaterialThread) => {
    if (onAction) onAction(t);
  };

  // Money block contents
  const moneyAmount = isSpot ? thread.spot?.amount ?? 0 : thread.po?.amount ?? 0;
  const vendorName = isSpot ? thread.spot?.vendor_name : thread.po?.vendor_name;
  const showAdvanceBar =
    !isSpot &&
    isAdvance &&
    thread.po?.advance &&
    thread.po.advance.batches.length > 0;
  const advanceReceived = thread.po?.advance?.batches.reduce((sum, b) => sum + b.qty, 0) ?? 0;
  const advancePct = thread.qty > 0 ? (advanceReceived / thread.qty) * 100 : 0;

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
                <Dot color={hubTokens.pink} /> Group · cluster
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
            {thread.material_name}
          </Typography>
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
                {showAdvanceBar && (
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
                      {advanceReceived}/{thread.qty}
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
              {VISIBLE_STAGES.map((s) => {
                const done = M_STAGES.indexOf(s.key) <= idx;
                return (
                  <Box
                    key={s.key}
                    sx={{
                      flex: 1,
                      height: 4,
                      borderRadius: "2px",
                      background: done ? accent : hubTokens.hairline,
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
              <Box
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

type ChipTone = "warn" | "pink" | "danger" | "primary" | "neutral";

function ThreadChip({ children, tone }: { children: React.ReactNode; tone: ChipTone }) {
  const colors = {
    warn: { bg: hubTokens.warnSoft, fg: hubTokens.warn },
    pink: { bg: hubTokens.pinkSoft, fg: hubTokens.pink },
    danger: { bg: hubTokens.dangerSoft, fg: hubTokens.danger },
    primary: { bg: hubTokens.primarySoft, fg: hubTokens.primary },
    neutral: { bg: hubTokens.chip, fg: hubTokens.muted },
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