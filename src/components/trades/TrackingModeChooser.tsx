"use client";

import { Box, Stack, Typography, Radio } from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";
import Payments from "@mui/icons-material/Payments";
import FactCheck from "@mui/icons-material/FactCheck";
import type { LaborTrackingMode } from "@/types/trade.types";

/**
 * A labour-tracking mode. New contracts/sections/tasks are always payments-only
 * ("mesthri_only") — daily labour is logged on /site/attendance, not per-node.
 * `headcount`/`mid` remain valid DB values on grandfathered rows, but are no
 * longer offered as targets here, so the chooser is effectively a one-way exit
 * out of those modes.
 */
export type TrackingChoice = LaborTrackingMode;

interface OptionDef {
  key: TrackingChoice;
  icon: SvgIconComponent;
  title: string;
  /** Small recognizer badge (e.g. "Most used", "Like Barun's"). */
  badge?: string;
  /** What the supervisor does each day. */
  daily: string;
  /** A concrete sample of the daily entry (monospace). */
  sample: string;
  /** What the app computes / tells the owner back. */
  tells: string;
  /** Plain "best for" line. */
  bestFor: string;
}

const OPTIONS: OptionDef[] = [
  {
    key: "mesthri_only",
    icon: Payments,
    title: "Just record payments",
    daily: "Nothing daily — log a payment whenever you pay him.",
    sample: "Paid ₹20,000 · advance · 12 Jun",
    tells: "Quoted vs Paid only (won't flag if the price was unfair).",
    bestFor: "A fixed price you trust.",
  },
  {
    key: "detailed",
    icon: FactCheck,
    badge: "Like Civil",
    title: "Full workspace (attendance + salary)",
    daily: "Mark each labourer's day, then run salary settlements, holidays & tea — the full Civil flow.",
    sample: "Ravi 9:00–17:30 · settle wages weekly",
    tells: "Exact labour cost, and you pay & settle wages right here.",
    bestFor: "Any trade you run day-to-day on your own books.",
  },
];

/**
 * "How will you handle this work?" — selectable cards (lightest → fullest), each showing
 * a concrete SAMPLE of the daily entry + what the app tells you back, so the choice is obvious.
 *
 * The "Full workspace (attendance + salary)" / `detailed` card is a property of the TRADE,
 * not of an individual contract/section/task — so it is OFF by default here. Node-level
 * create/change pickers leave `allowDetailed` false (only "record payments" + "count by
 * role"); only a trade-level surface that genuinely runs detailed passes `allowDetailed`.
 */
export function TrackingModeChooser({
  value,
  onChange,
  allowDetailed = false,
}: {
  value: TrackingChoice | null;
  onChange: (v: TrackingChoice) => void;
  /** Show the "Full workspace (attendance + salary)" card. Default false (trade-level only). */
  allowDetailed?: boolean;
}) {
  const options = allowDetailed ? OPTIONS : OPTIONS.filter((o) => o.key !== "detailed");
  return (
    <Stack spacing={1}>
      {options.map((o) => {
        const Icon = o.icon;
        const selected = value === o.key;
        return (
          <Box
            key={o.key}
            tabIndex={0}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(o.key);
              }
            }}
            sx={{
              display: "flex",
              gap: 1.25,
              p: 1.25,
              borderRadius: 2,
              cursor: "pointer",
              border: "1px solid",
              borderColor: selected ? "primary.main" : "divider",
              bgcolor: selected ? "action.selected" : "background.paper",
              transition: "border-color .12s, background-color .12s",
              outline: "none",
              "&:hover": { borderColor: selected ? "primary.main" : "text.disabled" },
              "&:focus-visible": { borderColor: "primary.main" },
            }}
          >
            <Box sx={{ pt: 0.25 }}>
              <Icon fontSize="small" color={selected ? "primary" : "action"} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                <Typography variant="body2" fontWeight={700}>
                  {o.title}
                </Typography>
                {o.badge && (
                  <Box
                    component="span"
                    sx={{
                      fontSize: 10,
                      fontWeight: 800,
                      px: 0.7,
                      py: 0.1,
                      borderRadius: 999,
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.badge}
                  </Box>
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                <strong>Each day:</strong> {o.daily}
              </Typography>
              <Box
                sx={{
                  my: 0.5,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  fontFamily: "monospace",
                  fontSize: 11.5,
                  color: "text.primary",
                  whiteSpace: "pre-wrap",
                }}
              >
                {o.sample}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                <strong>The app tells you:</strong> {o.tells}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                <strong>Best for:</strong> {o.bestFor}
              </Typography>
            </Box>
            <Radio
              checked={selected}
              tabIndex={-1}
              size="small"
              sx={{ alignSelf: "flex-start", mt: -0.5, mr: -0.5 }}
            />
          </Box>
        );
      })}
    </Stack>
  );
}
