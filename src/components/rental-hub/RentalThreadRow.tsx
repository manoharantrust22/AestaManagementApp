"use client";

/**
 * One row per thread in the Rental Hub's cards layout.
 *
 * Grid (desktop): 4px · 1.6fr · 2fr · 1.4fr · 170px (5 columns, per spec line
 * 154).
 *   1. Left color band (full-height) — driven by bandTone(thread).
 *   2. Vendor + items block — id chip, badges, vendor name, items summary,
 *      "section · Nd elapsed · due <date>" subline.
 *   3. Pipeline — 5-stage mini timeline (overdue red-flip handled inside).
 *   4. Money block — context-aware (active live / completed / settled / pre).
 *   5. Action button — next-action verb driven by nextAction().
 *
 * Mobile (< 820px): stacks vertically with a flat-bar pipeline indicator.
 */

import { Box, Typography, useMediaQuery } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import GroupsIcon from "@mui/icons-material/Groups";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { hubTokens, HUB_BREAKPOINT_PX } from "@/lib/material-hub/tokens";
import { bandTone, VISIBLE_STAGES, stageIndex, visibleStageForThread } from "@/lib/rental-hub/stageHelpers";
import { dueLabel, elapsedLabel, overdueLabel } from "@/lib/rental-hub/formatters";
import RentalThreadPipeline from "./RentalThreadPipeline";
import RentalMoneyBlock from "./RentalMoneyBlock";
import RentalThreadActionButton from "./RentalThreadActionButton";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

const BAND_COLORS = {
  success: { color: hubTokens.success, opacity: 1 },
  danger: { color: hubTokens.danger, opacity: 1 },
  warn: { color: hubTokens.warn, opacity: 1 },
  pink: { color: hubTokens.pink, opacity: 1 },
  primary: { color: hubTokens.primary, opacity: 0.35 },
  muted: { color: hubTokens.subtle, opacity: 0.4 },
} as const;

export interface RentalThreadRowProps {
  thread: RentalThread;
  selected: boolean;
  onSelect: () => void;
  onAction?: (thread: RentalThread) => void;
}

export default function RentalThreadRow({
  thread,
  selected,
  onSelect,
  onAction,
}: RentalThreadRowProps) {
  const isMobile = useMediaQuery(`(max-width:${HUB_BREAKPOINT_PX - 1}px)`);
  const tone = bandTone(thread);
  const band = BAND_COLORS[tone];
  const isGroup = thread.kind === "group";
  const hasHourlyLine = thread.items.some((i) => i.rateType === "hourly");
  const startedCostMeter = thread.daysSinceStart > 0 &&
    (thread.status === "active" || thread.status === "partially_returned" ||
     thread.status === "completed" || thread.effective_status === "settled");

  // Compute "Nd overdue" badge
  const daysOverdue = thread.isOverdue && thread.expectedEnd
    ? Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(thread.expectedEnd).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  const itemsSummary = formatItemsSummary(thread.items);

  const handleAction = (t: RentalThread) => {
    if (onAction) onAction(t);
  };

  // Mobile flat-bar pipeline data
  const stage = visibleStageForThread(thread);
  const idx = stageIndex(stage);

  return (
    <Box
      sx={{
        background: hubTokens.card,
        borderRadius: "12px",
        border: `1px solid ${selected ? band.color : hubTokens.border}`,
        transition: "all .12s",
        overflow: "hidden",
        boxShadow: selected
          ? `0 1px 0 ${band.color}, 0 8px 24px rgba(15,23,42,.06)`
          : "none",
      }}
    >
      <Box
        onClick={onSelect}
        sx={{
          display: isMobile ? "flex" : "grid",
          flexDirection: isMobile ? "column" : undefined,
          gridTemplateColumns: isMobile ? undefined : "4px 1.6fr 2fr 1.4fr 170px",
          gap: isMobile ? "10px" : "14px",
          alignItems: isMobile ? "stretch" : "center",
          padding: isMobile ? "14px" : "16px 18px 16px 0",
          cursor: "pointer",
          borderLeft: isMobile ? `4px solid ${band.color}` : undefined,
        }}
      >
        {!isMobile && (
          <Box
            sx={{
              alignSelf: "stretch",
              background: band.color,
              opacity: band.opacity,
            }}
          />
        )}

        {/* Vendor + items block */}
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
            {isGroup && (
              <ThreadChip tone="pink">
                <Dot color={hubTokens.pink} /> Group
              </ThreadChip>
            )}
            {hasHourlyLine && (
              <ThreadChip tone="warn">
                <AccessTimeIcon sx={{ fontSize: 10 }} /> Hourly
              </ThreadChip>
            )}
            {thread.isHistorical && (
              <ThreadChip tone="neutral">
                <HistoryIcon sx={{ fontSize: 10 }} /> Backfill
              </ThreadChip>
            )}
            {daysOverdue > 0 && (
              <ThreadChip tone="danger">
                <WarningAmberIcon sx={{ fontSize: 10 }} /> {overdueLabel(daysOverdue)}
              </ThreadChip>
            )}
          </Box>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              color: hubTokens.text,
              letterSpacing: "-0.1px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {thread.vendor?.name ?? "—"}
          </Typography>
          <Typography
            sx={{
              fontSize: 11.5,
              color: hubTokens.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {itemsSummary}
          </Typography>
          <Typography sx={{ fontSize: 11, color: hubTokens.subtle }}>
            {elapsedLabel(thread.daysSinceStart, startedCostMeter)}
            {" · "}
            {dueLabel(thread.expectedEnd)}
          </Typography>
        </Box>

        {/* Pipeline (desktop) */}
        {!isMobile && (
          <Box>
            <RentalThreadPipeline thread={thread} />
          </Box>
        )}

        {/* Money block (desktop) */}
        {!isMobile ? (
          <RentalMoneyBlock thread={thread} />
        ) : (
          /* Mobile: flat-bar pipeline */
          <Box sx={{ display: "flex", gap: "3px", marginTop: "4px" }}>
            {VISIBLE_STAGES.map((s, i) => {
              const done = idx >= 0 && i <= idx;
              return (
                <Box
                  key={s.key}
                  sx={{
                    flex: 1,
                    height: 4,
                    borderRadius: "2px",
                    background: done ? band.color : hubTokens.hairline,
                  }}
                />
              );
            })}
          </Box>
        )}

        {/* Action button (desktop) */}
        {!isMobile && (
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <RentalThreadActionButton thread={thread} onAction={handleAction} />
          </Box>
        )}
      </Box>

      {/* Action button (mobile, full-width below) */}
      {isMobile && (
        <Box sx={{ padding: "0 14px 14px" }}>
          <RentalThreadActionButton thread={thread} fullWidth onAction={handleAction} />
        </Box>
      )}
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Local helpers
// ----------------------------------------------------------------------------

function formatItemsSummary(items: RentalThread["items"]): string {
  if (items.length === 0) return "—";
  const top = items.slice(0, 2).map((i) => {
    const label = i.sizeLabelSnapshot ? ` ${i.sizeLabelSnapshot}` : "";
    return `${i.qty} ${i.name}${label}`;
  });
  const more = items.length > 2 ? ` · +${items.length - 2} more` : "";
  return top.join(" · ") + more;
}

function Dot({ color }: { color: string }) {
  return (
    <Box
      component="span"
      sx={{ width: 6, height: 6, borderRadius: "50%", background: color }}
    />
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
        gap: "5px",
        padding: "2px 7px",
        borderRadius: "6px",
        background: colors.bg,
        color: colors.fg,
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: "16px",
        letterSpacing: "0.1px",
      }}
    >
      {children}
    </Box>
  );
}
